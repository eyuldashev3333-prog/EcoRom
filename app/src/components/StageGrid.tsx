import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { supabase } from '../supabase'
import WindowSvg from './WindowSvg'
import type { WindowDesign } from '../lib/window'
import { uz } from '../uz'

const t = uz.stages

export interface StageItem {
  id: string
  pos: number
  title: string | null
  width_mm: number
  height_mm: number
  qty: number
  design?: WindowDesign
  panes?: { w: number; h: number; sash?: boolean }[]
  note?: string | null
}
interface Stage {
  id: number
  name: string
  role: string
}
interface Mark {
  order_item_id: string
  stage_id: number
  done_by: string
  done_at: string
  name: string
}

const OPEN = ['in_production', 'ready', 'installing']
const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** % готовности: позиция ×2 окна весит вдвое (как v_order_progress) */
export const progressPct = (items: { id: string; qty: number }[], marks: { order_item_id: string }[], stages: number) => {
  const total = items.reduce((s, i) => s + i.qty, 0) * Math.max(stages, 1)
  const qty = new Map(items.map((i) => [i.id, i.qty]))
  return total ? Math.round((1000 * marks.reduce((s, m) => s + (qty.get(m.order_item_id) ?? 0), 0)) / total) / 10 : 0
}

// галочки этапов по каждой позиции: каждый ставит за себя (кто + когда), Rahbar может всё
export default function StageGrid({ items, status, drawings = false, onChanged }: { items: StageItem[]; status: string; drawings?: boolean; onChanged?: () => void }) {
  const { me } = useAuth()
  const [stages, setStages] = useState<Stage[]>([])
  const [marks, setMarks] = useState<Mark[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const rahbar = me?.role === 'rahbar'
  const ids = items.map((i) => i.id).join(',')

  const load = useCallback(async () => {
    if (!ids) return setMarks([])
    const list = ids.split(',')
    const [s, m] = await Promise.all([
      supabase.from('stages').select('id, name, role').eq('is_active', true).order('sort'),
      rahbar
        ? supabase.from('item_stage_marks').select('order_item_id, stage_id, done_by, done_at, employees(full_name)').in('order_item_id', list)
        : supabase.from('w_stage_marks').select('order_item_id, stage_id, done_by, done_at, done_by_name').in('order_item_id', list),
    ])
    setStages((s.data as Stage[]) ?? [])
    setMarks(
      ((m.data as unknown as (Mark & { employees?: { full_name: string }; done_by_name?: string })[]) ?? []).map((x) => ({
        ...x,
        name: x.employees?.full_name ?? x.done_by_name ?? '',
      })),
    )
  }, [ids, rahbar])
  useEffect(() => {
    load()
  }, [load])

  const toggle = async (item: StageItem, st: Stage, mark: Mark | undefined) => {
    if (mark && !window.confirm(`${st.name}: ${t.undoConfirm}`)) return
    setBusy(true)
    setErr('')
    const { error } = await supabase.rpc('mark_stage', { p_item: item.id, p_stage: st.id, p_done: !mark })
    if (error) setErr(error.message)
    await load()
    setBusy(false)
    if (!error) onChanged?.()
  }

  const pct = progressPct(items, marks, stages.length)
  const open = OPEN.includes(status)

  return (
    <div className="card form">
      <div className="inline head">
        <h2>{t.title}</h2>
        <span className="pct">
          {pct}% {t.ready}
        </span>
      </div>
      <div className="progress">
        <i style={{ width: `${pct}%` }} />
      </div>
      {err && <div className="note bad">{err}</div>}
      {items.map((it) => (
        <div key={it.id} className="stage-item">
          <b>
            {it.pos}) {it.title ? `${it.title}: ` : ''}
            {it.width_mm}×{it.height_mm} · {it.qty} {uz.print.pcs}
          </b>
          {drawings && it.design && (
            <div className="draw">
              <WindowSvg design={it.design} maxHeight={180} />
            </div>
          )}
          {drawings && it.panes && it.panes.length > 0 && (
            <p className="muted small">
              {t.panes}: {it.panes.map((p) => `${p.w}×${p.h}`).join(', ')}
            </p>
          )}
          {it.note && <p className="muted small">{it.note}</p>}
          <div className="stage-list">
            {stages.map((st) => {
              const mark = marks.find((m) => m.order_item_id === it.id && m.stage_id === st.id)
              const mine = rahbar || st.role === me?.role
              const can = open && mine && (!mark || rahbar || mark.done_by === me?.id)
              return (
                <label key={st.id} className={`stage ${mark ? 'done' : ''} ${can ? '' : 'off'}`} title={!open ? t.locked : !mine ? t.notYours : undefined}>
                  <input type="checkbox" checked={!!mark} disabled={busy || !can} onChange={() => toggle(it, st, mark)} />
                  <span>
                    {st.name}
                    {mark && (
                      <small>
                        {mark.name} · {when(mark.done_at)}
                      </small>
                    )}
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
