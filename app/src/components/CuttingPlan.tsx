import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { loadStock } from '../lib/stock'
import { PROF_PARTS, planCuts, summarize, windowPieces, type ProfPart } from '../lib/cutting'
import type { WindowDesign } from '../lib/window'
import { uz } from '../uz'

const t = uz.cutting

export interface CutItem {
  design: WindowDesign
  qty: number
  options: { system?: string }
}
interface OffcutRow {
  id: string
  item_id: string
  part: ProfPart
  length_mm: number
  source_order_id: string | null
  used_order_id: string | null
}

const num = (v: unknown, def: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : def)

// раскрой профиля заказа: сначала подходящие обрезки, потом новые хлысты; результат записывается в реестр обрезков
export default function CuttingPlan({ orderId, items }: { orderId: string; items: CutItem[] }) {
  const [free, setFree] = useState<OffcutRow[]>([])
  const [done, setDone] = useState(false)
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [cfg, setCfg] = useState({ bar: 6000, kerf: 4, min: 300 })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [{ data: off }, { data: mine }, { data: st }, stock] = await Promise.all([
      supabase.from('offcuts').select('id, item_id, part, length_mm, source_order_id, used_order_id').is('used_at', null),
      supabase.from('offcuts').select('id').or(`source_order_id.eq.${orderId},used_order_id.eq.${orderId}`).limit(1),
      supabase.from('app_settings').select('key, value').in('key', ['bar_length_m', 'saw_kerf_mm', 'offcut_min_mm']),
      loadStock(),
    ])
    setFree((off as OffcutRow[]) ?? [])
    setDone(((mine as unknown[]) ?? []).length > 0)
    const s = new Map(((st as { key: string; value: unknown }[]) ?? []).map((r) => [r.key, r.value]))
    setCfg({ bar: Math.round(num(s.get('bar_length_m'), 6) * 1000), kerf: Number(s.get('saw_kerf_mm') ?? 4) || 0, min: num(s.get('offcut_min_mm'), 300) })
    setNames(new Map(stock.filter((r) => r.kind === 'system').map((r) => [`${r.item_id}|${r.part}`, r.name])))
  }, [orderId])
  useEffect(() => {
    load()
  }, [load])

  // детали заказа по (система, часть)
  const groups = useMemo(() => {
    const m = new Map<string, { item_id: string; part: ProfPart; pieces: number[] }>()
    for (const it of items) {
      const sys = it.options?.system
      if (!sys) continue
      const p = windowPieces(it.design)
      for (const part of PROF_PARTS) {
        const g = m.get(`${sys}|${part}`) ?? { item_id: sys, part, pieces: [] }
        for (let i = 0; i < it.qty; i++) g.pieces.push(...p[part])
        m.set(`${sys}|${part}`, g)
      }
    }
    return [...m.values()].filter((g) => g.pieces.length)
  }, [items])

  const plans = useMemo(
    () =>
      groups.map((g) => {
        const offs = free.filter((o) => o.item_id === g.item_id && o.part === g.part).map((o) => ({ id: o.id, length: o.length_mm }))
        const plan = planCuts(g.pieces, offs, cfg.bar, cfg.kerf)
        return { g, plan, sum: summarize(plan, cfg.min) }
      }),
    [groups, free, cfg],
  )

  const apply = async () => {
    const used = plans.flatMap((p) => p.plan.bars.filter((b) => b.offcutId).map((b) => b.offcutId!))
    const fresh = plans.flatMap((p) => p.sum.leftovers.map((l) => ({ item_id: p.g.item_id, part: p.g.part, length_mm: Math.round(l) })))
    setBusy(true)
    const { error } = await supabase.rpc('apply_cutting', { p_order: orderId, p_used: used, p_new: fresh })
    setBusy(false)
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: `${t.saved}: ${used.length} → ${fresh.length}` })
    load()
  }

  if (!plans.length) return null
  const m = (mm: number) => (mm / 1000).toFixed(2).replace('.', ',')
  const nothing = plans.every((p) => !p.plan.bars.some((b) => b.source === 'offcut') && !p.sum.leftovers.length)

  return (
    <div className="card form">
      <h2>{t.title}</h2>
      <p className="muted small">
        {t.hint} ({t.bar}: {m(cfg.bar)} m · {t.kerf}: {cfg.kerf} mm · {t.minLeft}: {cfg.min} mm)
      </p>
      {msg && <div className={msg.ok ? 'note ok' : 'note bad'}>{msg.text}</div>}
      {plans.map(({ g, plan, sum }) => {
        const usedOff = plan.bars.filter((b) => b.source === 'offcut')
        return (
          <div key={`${g.item_id}|${g.part}`} className="stage-item">
            <b>{names.get(`${g.item_id}|${g.part}`) ?? g.part}</b>
            <div className="small">
              {t.pieces}: {g.pieces.length} · {t.cutLen}: {m(sum.cutMm)} m
            </div>
            <div className="small">
              {t.newBars}: <b>{sum.newBars}</b>
              {sum.usedOffcuts > 0 && (
                <>
                  {' '}
                  · {t.usedOffcuts}: <b>{sum.usedOffcuts}</b> ({usedOff.map((b) => m(b.length)).join(', ')} m)
                </>
              )}
              {' · '}
              {t.waste}: {sum.wastePct}%
            </div>
            {sum.leftovers.length > 0 && (
              <div className="small muted">
                {t.leftovers}: {sum.leftovers.map((l) => m(l)).join(', ')} m
              </div>
            )}
            {plan.unplaced.length > 0 && (
              <div className="warn small">
                {t.tooLong}: {plan.unplaced.map((l) => m(l)).join(', ')} m
              </div>
            )}
          </div>
        )
      })}
      <div className="inline wrap">
        <button type="button" onClick={apply} disabled={busy || done || nothing}>
          {t.apply}
        </button>
        <Link to="/offcuts">{t.openList}</Link>
      </div>
      {done && <p className="muted small">{t.already}</p>}
      <p className="muted small">{t.note}</p>
    </div>
  )
}
