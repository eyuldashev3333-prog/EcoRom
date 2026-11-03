import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { formatSum } from '../lib/pricing'
import { uz } from '../uz'

const t = uz.breakage

interface Row {
  id: string
  order_id: string
  reason: string | null
  photo_path: string | null
  payer: string
  amount: number
  pieces: number
  decided: boolean
  created_at: string
  employee_id: string | null
  orders: { order_no: number } | null
  order_items: { pos: number; width_mm: number; height_mm: number } | null
  employees: { full_name: string } | null
}
interface Person {
  id: string
  full_name: string
}
const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

// Rahbar: история боя стекла (по заказу или вся), решение «кто платит» и сумма
export default function BreakageList({ orderId, since, onChanged }: { orderId?: string; since?: string; onChanged?: (rows: Row[]) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [edit, setEdit] = useState<Record<string, { payer: string; amount: string; who: string }>>({})
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    let q = supabase
      .from('glass_breakages')
      .select('id, order_id, reason, photo_path, payer, amount, pieces, decided, created_at, employee_id, orders(order_no), order_items(pos, width_mm, height_mm), employees!employee_id(full_name)')
      .order('created_at', { ascending: false })
      .limit(300)
    if (orderId) q = q.eq('order_id', orderId)
    if (since) q = q.gte('created_at', since)
    const { data } = await q
    const list = ((data as unknown as Row[]) ?? []).map((r) => ({ ...r, amount: Number(r.amount) }))
    setRows(list)
    onChanged?.(list)
    const paths = list.map((r) => r.photo_path).filter((p): p is string => !!p)
    if (paths.length) {
      const { data: signed } = await supabase.storage.from('install-photos').createSignedUrls(paths, 3600)
      setUrls(Object.fromEntries((signed ?? []).flatMap((s) => (s.signedUrl && s.path ? [[s.path, s.signedUrl]] : []))))
    }
  }, [orderId, since, onChanged])
  useEffect(() => {
    load()
    supabase.from('employees').select('id, full_name').eq('is_active', true).in('role', ['montajchi', 'ishlab']).order('full_name').then(({ data }) => setPeople((data as Person[]) ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, since])

  const save = async (r: Row) => {
    const e = edit[r.id] ?? { payer: r.payer, amount: String(r.amount), who: r.employee_id ?? '' }
    setErr('')
    const { error } = await supabase.rpc('resolve_breakage', { p_id: r.id, p_payer: e.payer, p_amount: Number(e.amount.replace(/\D/g, '')) || 0, p_employee: e.who || null })
    if (error) return setErr(error.message)
    setEdit((x) => {
      const { [r.id]: _, ...rest } = x
      return rest
    })
    load()
  }
  const del = async (r: Row) => {
    if (!window.confirm(t.deleteConfirm)) return
    const { error } = await supabase.from('glass_breakages').delete().eq('id', r.id)
    if (error) return setErr(error.message)
    load()
  }

  if (rows === null) return <p className="muted">{uz.loading}</p>
  if (orderId && rows.length === 0) return null

  return (
    <div className="card form">
      <h2>{orderId ? t.title : t.list}</h2>
      {err && <div className="note bad">{err}</div>}
      {rows.length === 0 && <p className="muted">{t.empty}</p>}
      {rows.map((r) => {
        const e = edit[r.id] ?? { payer: r.payer, amount: String(r.amount), who: r.employee_id ?? '' }
        const dirty = !!edit[r.id]
        const set = (p: Partial<typeof e>) => setEdit((x) => ({ ...x, [r.id]: { ...e, ...p } }))
        return (
          <div key={r.id} className="glass-row">
            <div className="inline wrap">
              <b>
                {!orderId && r.orders && (
                  <>
                    <Link to={`/orders/${r.order_id}`}>№{r.orders.order_no}</Link> ·{' '}
                  </>
                )}
                {r.order_items ? `${r.order_items.pos}) ${r.order_items.width_mm}×${r.order_items.height_mm}` : ''} · {r.pieces} {t.qtyTag}
              </b>
              <span className="muted small">
                {when(r.created_at)} · {r.employees?.full_name ?? '—'}
              </span>
              {!r.decided && <span className="debt-tag">{t.undecided}</span>}
            </div>
            <div>{r.reason}</div>
            {r.photo_path && urls[r.photo_path] && (
              <a href={urls[r.photo_path]} target="_blank" rel="noreferrer">
                📷 {t.photoOpen}
              </a>
            )}
            <div className="grid3">
              <label>
                {t.payer}
                <select value={e.payer} onChange={(ev) => set({ payer: ev.target.value })}>
                  {Object.entries(t.payers).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t.who}
                <select value={e.who} onChange={(ev) => set({ who: ev.target.value })}>
                  <option value="">—</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t.amount}
                <input inputMode="numeric" value={e.amount ? formatSum(Number(e.amount.replace(/\D/g, ''))) : ''} onChange={(ev) => set({ amount: ev.target.value.replace(/\D/g, '') })} />
              </label>
            </div>
            <div className="inline wrap">
              <button type="button" className="small-btn" disabled={!dirty && r.decided} onClick={() => save(r)}>
                {t.save}
              </button>
              <button type="button" className="ghost small-btn" onClick={() => del(r)}>
                {t.delete}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
