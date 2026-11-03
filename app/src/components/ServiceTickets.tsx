import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { formatSum } from '../lib/pricing'
import { signedUrls } from '../lib/photo'
import { uz } from '../uz'

const t = uz.service

export interface Ticket {
  id: string
  order_id: string
  order_item_id: string | null
  description: string
  photo_paths: string[]
  work_photo_paths: string[]
  assigned_to: string | null
  due_date: string | null
  status: string
  cause: string | null
  payer: string | null
  cost: number
  in_warranty: boolean | null
  work_done_at: string | null
  work_note: string | null
  created_at: string
  closed_at: string | null
  orders: { order_no: number; clients: { full_name: string } | null } | null
  order_items: { pos: number; width_mm: number; height_mm: number } | null
  assignee: { full_name: string } | null
}
interface Man {
  id: string
  full_name: string
}
const when = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { timeZone: 'Asia/Tashkent' })
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' })

// Rahbar: заявки (по заказу или все): назначить исполнителя, увидеть работу, закрыть с причиной/плательщиком/стоимостью
export default function ServiceTickets({ orderId, onlyOpen = false, reloadKey = 0, onLoaded }: { orderId?: string; onlyOpen?: boolean; reloadKey?: number; onLoaded?: (rows: Ticket[]) => void }) {
  const [rows, setRows] = useState<Ticket[] | null>(null)
  const [men, setMen] = useState<Man[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [assign, setAssign] = useState<Record<string, { who: string; due: string }>>({})
  const [closing, setClosing] = useState<string | null>(null)
  const [cf, setCf] = useState({ cause: '', payer: 'factory', cost: '', warranty: '' })
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    let q = supabase
      .from('service_tickets')
      .select('*, orders(order_no, clients(full_name)), order_items(pos, width_mm, height_mm), assignee:employees!assigned_to(full_name)')
      .order('created_at', { ascending: false })
      .limit(300)
    if (orderId) q = q.eq('order_id', orderId)
    if (onlyOpen) q = q.neq('status', 'closed')
    const { data } = await q
    const list = ((data as unknown as Ticket[]) ?? []).map((r) => ({ ...r, cost: Number(r.cost) }))
    setRows(list)
    onLoaded?.(list)
    setUrls(await signedUrls(list.flatMap((r) => [...(r.photo_paths ?? []), ...(r.work_photo_paths ?? [])])))
  }, [orderId, onlyOpen, onLoaded])
  useEffect(() => {
    load()
    supabase.from('employees').select('id, full_name').eq('role', 'montajchi').eq('is_active', true).order('full_name').then(({ data }) => setMen((data as Man[]) ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, onlyOpen, reloadKey])

  const run = async (fn: string, args: Record<string, unknown>) => {
    setErr('')
    const { error } = await supabase.rpc(fn, args)
    if (error) return setErr(error.message), false
    await load()
    return true
  }
  const del = async (r: Ticket) => {
    if (!window.confirm(t.deleteConfirm)) return
    const { error } = await supabase.from('service_tickets').delete().eq('id', r.id)
    if (error) return setErr(error.message)
    load()
  }

  if (rows === null) return <p className="muted">{uz.loading}</p>
  if (orderId && rows.length === 0) return null

  const photos = (paths: string[]) =>
    paths.length > 0 && (
      <div className="inline wrap">
        {paths.map((p) => (
          <a key={p} href={urls[p]} target="_blank" rel="noreferrer">
            📷
          </a>
        ))}
      </div>
    )

  return (
    <div className="card form">
      <h2>{orderId ? t.title : t.list}</h2>
      {err && <div className="note bad">{err}</div>}
      {rows.length === 0 && <p className="muted">{t.empty}</p>}
      {rows.map((r) => {
        const a = assign[r.id] ?? { who: r.assigned_to ?? '', due: r.due_date ?? '' }
        const isOver = r.status !== 'closed' && r.due_date !== null && r.due_date < today()
        return (
          <div key={r.id} className="glass-row">
            <div className="inline wrap">
              <b>
                {!orderId && r.orders && (
                  <>
                    <Link to={`/orders/${r.order_id}`}>№{r.orders.order_no}</Link> {r.orders.clients?.full_name} ·{' '}
                  </>
                )}
                {r.order_items ? `${r.order_items.pos}) ${r.order_items.width_mm}×${r.order_items.height_mm}` : t.whole}
              </b>
              <span className={`status s-${r.status === 'closed' ? 'closed' : r.status === 'open' ? 'new' : 'in_production'}`}>{t.statuses[r.status]}</span>
              {r.in_warranty !== null && <span className={r.in_warranty ? 'status s-ready' : 'status s-cancelled'}>{r.in_warranty ? t.inWarranty : t.outWarranty}</span>}
              {isOver && <span className="debt-tag">{t.overdue}</span>}
              <span className="muted small">{when(r.created_at)}</span>
            </div>
            <div>{r.description}</div>
            {photos(r.photo_paths ?? [])}
            {r.work_done_at && (
              <div className="note ok">
                {t.workDone}: {r.assignee?.full_name} · {when(r.work_done_at)}
                {r.work_note ? ` — ${r.work_note}` : ''}
                {photos(r.work_photo_paths ?? [])}
              </div>
            )}
            {r.status === 'closed' ? (
              <p className="muted small">
                {t.closedTitle} {r.closed_at && when(r.closed_at)} · {r.cause} · {r.payer && t.payers[r.payer]} · {formatSum(r.cost)} so‘m
              </p>
            ) : (
              <>
                <div className="grid3">
                  <label>
                    {t.assignee}
                    <select value={a.who} onChange={(e) => setAssign({ ...assign, [r.id]: { ...a, who: e.target.value } })}>
                      <option value="">{t.none}</option>
                      {men.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t.due}
                    <input type="date" value={a.due} onChange={(e) => setAssign({ ...assign, [r.id]: { ...a, due: e.target.value } })} />
                  </label>
                  <div className="inline wrap" style={{ alignItems: 'end' }}>
                    <button type="button" className="small-btn" disabled={!a.who || !assign[r.id]} onClick={async () => (await run('assign_service', { p_id: r.id, p_assignee: a.who, p_due: a.due || null })) && setAssign(({ [r.id]: _, ...rest }) => rest)}>
                      {t.assign}
                    </button>
                  </div>
                </div>
                {closing === r.id ? (
                  <div className="form">
                    <label>
                      {t.cause}
                      <input value={cf.cause} onChange={(e) => setCf({ ...cf, cause: e.target.value })} />
                    </label>
                    <div className="grid3">
                      <label>
                        {t.payer}
                        <select value={cf.payer} onChange={(e) => setCf({ ...cf, payer: e.target.value })}>
                          {Object.entries(t.payers).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {t.cost}
                        <input inputMode="numeric" value={cf.cost ? formatSum(Number(cf.cost)) : ''} onChange={(e) => setCf({ ...cf, cost: e.target.value.replace(/\D/g, '') })} />
                      </label>
                      <label>
                        {t.warranty}
                        <select value={cf.warranty} onChange={(e) => setCf({ ...cf, warranty: e.target.value })}>
                          <option value="">{r.in_warranty === null ? '—' : r.in_warranty ? t.inWarranty : t.outWarranty}</option>
                          <option value="true">{t.inWarranty}</option>
                          <option value="false">{t.outWarranty}</option>
                        </select>
                      </label>
                    </div>
                    <div className="inline wrap">
                      <button
                        type="button"
                        disabled={!cf.cause.trim()}
                        onClick={async () => {
                          if (await run('close_service', { p_id: r.id, p_cause: cf.cause, p_payer: cf.payer, p_cost: Number(cf.cost) || 0, p_in_warranty: cf.warranty === '' ? null : cf.warranty === 'true' })) {
                            setClosing(null)
                            setCf({ cause: '', payer: 'factory', cost: '', warranty: '' })
                          }
                        }}
                      >
                        {t.closeBtn}
                      </button>
                      <button type="button" className="ghost" onClick={() => setClosing(null)}>
                        {uz.stock.cancel}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="inline wrap">
                    <button type="button" className={r.work_done_at ? '' : 'ghost'} onClick={() => setClosing(r.id)}>
                      {t.close}
                    </button>
                    <button type="button" className="ghost small-btn" onClick={() => del(r)}>
                      {t.delete}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
