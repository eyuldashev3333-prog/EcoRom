import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { supabase } from '../supabase'
import { glassOf } from '../lib/orderCards'
import { uz } from '../uz'

const t = uz.glass
const f = uz.flow

interface Row {
  pos: number
  title: string | null
  qty: number
  glass_status: string
  panes: { w: number; h: number }[]
}

// Стекло заказа: размеры стеклопакетов (для заказа у поставщика) и два шага — «Shisha zakaz qilindi» / «Shisha o'rnatildi»
export default function GlassStatus({ orderId, status, onChanged }: { orderId: string; status: string; onChanged?: () => void }) {
  const { me } = useAuth()
  const rahbar = me?.role === 'rahbar'
  const [rows, setRows] = useState<Row[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from(rahbar ? 'order_items' : 'w_order_items').select('pos, title, qty, materials, glass_status').eq('order_id', orderId).order('pos')
    type Raw = Omit<Row, 'panes'> & { materials: { panes?: { w: number; h: number }[] } }
    setRows(((data as unknown as Raw[]) ?? []).map((x) => ({ ...x, panes: x.materials?.panes ?? [] })))
  }, [orderId, rahbar])
  useEffect(() => {
    load()
  }, [load])

  const set = async (s: 'ordered' | 'installed' | 'none') => {
    setBusy(true)
    setErr('')
    const { error } = await supabase.rpc('order_glass', { p_order: orderId, p_status: s })
    if (error) setErr(error.message)
    await load()
    setBusy(false)
    onChanged?.()
  }

  if (!rows.length) return null
  const g = glassOf(rows.map((r) => r.glass_status))
  const open = !['closed', 'cancelled', 'unknown'].includes(status)
  const panes = rows.reduce((s, r) => s + r.panes.length * r.qty, 0)

  return (
    <div className="card">
      <div className="inline head" style={{ marginBottom: 0 }}>
        <h2 style={{ margin: 0 }}>{t.title}</h2>
        <span className={g === 'installed' ? 'status s-installed' : g === 'none' ? 'status' : 'status s-in_production'}>
          {g === 'installed' ? f.glassInstalled : g === 'none' ? f.glassNone : f.glassOrdered}
        </span>
      </div>
      <div className="glass-sizes">
        {rows.map((r) => (
          <div key={r.pos}>
            {r.pos}) {r.panes.length ? r.panes.map((p) => `${p.w}×${p.h}`).join(', ') : t.noPanes}
            {r.qty > 1 && <span> ×{r.qty}</span>}
          </div>
        ))}
        <span>
          {panes} {t.summary}
        </span>
      </div>
      {err && <div className="note bad">{err}</div>}
      {open && rahbar && (
        <div className="inline wrap">
          {g === 'none' && (
            <button type="button" disabled={busy} onClick={() => set('ordered')}>
              {f.glassOrdered}
            </button>
          )}
          {g !== 'installed' && g !== 'none' && ['ready', 'installing', 'installed'].includes(status) && (
            <button type="button" className="ghost" disabled={busy} onClick={() => set('installed')}>
              {f.glassInstalled}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
