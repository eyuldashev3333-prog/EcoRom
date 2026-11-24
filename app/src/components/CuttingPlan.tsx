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
  // итог одной строкой; подробности — по нажатию
  const newBars = plans.reduce((s, p) => s + p.sum.newBars, 0)
  const fromOff = plans.reduce((s, p) => s + p.sum.usedOffcuts, 0)
  const usedMm = plans.reduce((s, p) => s + p.plan.bars.reduce((a, b) => a + b.length, 0), 0)
  const lostMm = plans.reduce((s, p) => s + p.plan.bars.reduce((a, b) => a + b.length, 0) - p.sum.cutMm - p.sum.leftovers.reduce((a, c) => a + c, 0), 0)
  const waste = usedMm ? Math.round((1000 * lostMm) / usedMm) / 10 : 0
  const tooLong = plans.some((p) => p.plan.unplaced.length > 0)

  return (
    <details className="card cut-plan">
      <summary>
        <b>{t.title}</b>
        <span>
          {t.newBars}: <b>{newBars}</b>
          {fromOff > 0 && <> · {t.usedOffcuts}: <b>{fromOff}</b></>} · {t.waste}: {waste}%
          {done && <> · ✓</>}
        </span>
      </summary>
      {msg && <div className={msg.ok ? 'note ok' : 'note bad'}>{msg.text}</div>}
      {tooLong && <p className="warn small">{t.tooLong}</p>}
      <table className="kv cut-table">
        <thead>
          <tr>
            <th>{t.profileCol}</th>
            <th>{t.pieces}</th>
            <th>{t.newBars}</th>
            <th>{t.leftovers}, m</th>
          </tr>
        </thead>
        <tbody>
          {plans.map(({ g, plan, sum }) => (
            <tr key={`${g.item_id}|${g.part}`}>
              <td>{names.get(`${g.item_id}|${g.part}`) ?? g.part}</td>
              <td>{g.pieces.length}</td>
              <td>
                {sum.newBars}
                {sum.usedOffcuts > 0 && <small className="muted"> +{sum.usedOffcuts} {t.offcutShort}</small>}
              </td>
              <td>
                {sum.leftovers.length ? sum.leftovers.map((l) => m(l)).join(', ') : '—'}
                {plan.unplaced.length > 0 && <small className="warn"> ({m(plan.unplaced[0])}!)</small>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        {t.bar}: {m(cfg.bar)} m · {t.kerf}: {cfg.kerf} mm · {t.minLeft}: {cfg.min} mm
      </p>
      <div className="inline wrap">
        <button type="button" onClick={apply} disabled={busy || done || nothing}>
          {done ? t.written : t.apply}
        </button>
        <Link to="/offcuts">{t.openList}</Link>
      </div>
    </details>
  )
}