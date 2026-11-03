import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { supabase } from '../supabase'
import { uz } from '../uz'

const t = uz.glass
const ALL = ['none', 'ordered', 'arrived', 'installed']
const SHOP = ['ordered', 'arrived'] // цех принимает стекло; «поставлено» — Rahbar (Фаза 3 — монтажник)

interface Row {
  id: string
  pos: number
  title: string | null
  qty: number
  glass_status: string
  glass_status_at: string | null
  by: string | null
  panes: { w: number; h: number }[]
}
const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

// стеклопакеты по позициям: размеры + статус (заказано / привезли / поставлено), кто и когда
export default function GlassStatus({ orderId, locked = false }: { orderId: string; locked?: boolean }) {
  const { me } = useAuth()
  const rahbar = me?.role === 'rahbar'
  const [rows, setRows] = useState<Row[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = rahbar
      ? await supabase.from('order_items').select('id, pos, title, qty, materials, glass_status, glass_status_at, employees!glass_status_by(full_name)').eq('order_id', orderId).order('pos')
      : await supabase.from('w_order_items').select('id, pos, title, qty, materials, glass_status, glass_status_at, glass_by_name').eq('order_id', orderId).order('pos')
    type Raw = Omit<Row, 'by' | 'panes'> & { materials: { panes?: { w: number; h: number }[] }; employees?: { full_name: string } | null; glass_by_name?: string | null }
    setRows(((data as unknown as Raw[]) ?? []).map((x) => ({ ...x, panes: x.materials?.panes ?? [], by: x.employees?.full_name ?? x.glass_by_name ?? null })))
  }, [orderId, rahbar])
  useEffect(() => {
    load()
  }, [load])

  const allowed = rahbar ? ALL : me?.role === 'ishlab' ? SHOP : []
  const set = async (ids: string[], status: string) => {
    setBusy(true)
    setErr('')
    const { error } = await supabase.rpc('set_glass_status', { p_items: ids, p_status: status })
    if (error) setErr(error.message)
    await load()
    setBusy(false)
  }

  if (!rows.length) return null
  const panes = rows.reduce((s, r) => s + r.panes.length * r.qty, 0)
  const count = (st: string) => rows.filter((r) => r.glass_status === st).reduce((s, r) => s + r.panes.length * r.qty, 0)
  const can = (r: Row) => !locked && allowed.length > 0 && (rahbar || r.glass_status !== 'installed')

  return (
    <div className="card form">
      <h2>{t.title}</h2>
      <p className="muted small">
        {panes} {t.summary} · {ALL.filter((s) => s !== 'none' && count(s)).map((s) => `${t.statuses[s]}: ${count(s)}`).join(' · ') || t.statuses.none}
      </p>
      {err && <div className="note bad">{err}</div>}
      {!locked && allowed.length > 0 && rows.length > 1 && (
        <div className="inline wrap">
          <span className="muted small">{t.all}:</span>
          <div className="seg">
            {allowed.map((s) => (
              <button key={s} type="button" disabled={busy} onClick={() => set(rows.filter(can).map((r) => r.id), s)}>
                {t.statuses[s]}
              </button>
            ))}
          </div>
        </div>
      )}
      {rows.map((r) => (
        <div key={r.id} className="glass-row">
          <b>
            {r.pos}) {r.title ? `${r.title} · ` : ''}
            {r.panes.length ? r.panes.map((p) => `${p.w}×${p.h}`).join(', ') : t.noPanes}
            {r.qty > 1 ? ` (×${r.qty})` : ''}
          </b>
          <div className="seg">
            {ALL.map((s) => (
              <button
                key={s}
                type="button"
                className={`${r.glass_status === s ? 'on' : ''} g-${s}`}
                disabled={busy || !can(r) || !allowed.includes(s) || r.glass_status === s}
                onClick={() => set([r.id], s)}
              >
                {t.statuses[s]}
              </button>
            ))}
          </div>
          {r.glass_status_at && (
            <small className="muted">
              {r.by} · {when(r.glass_status_at)}
            </small>
          )}
        </div>
      ))}
    </div>
  )
}
