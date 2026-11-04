import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { uploadPhotos } from '../lib/photo'
import ServiceTickets from './ServiceTickets'
import { uz } from '../uz'

const t = uz.service

interface ItemRef {
  id: string
  pos: number
  title: string | null
  width_mm: number
  height_mm: number
}
interface HistOrder {
  id: string
  order_no: number
  created_at: string
  status: string
  windows_count: number
  order_items: { pos: number; width_mm: number; height_mm: number; qty: number }[]
}
const fmtDate = (d: string) => d.slice(0, 10).split('-').reverse().join('.')

// Rahbar, карточка заказа: гарантия, новая сервис-заявка, заявки заказа, история окон клиента
export default function ServicePanel({ orderId, clientId, items }: { orderId: string; clientId?: string; items: ItemRef[] }) {
  const [until, setUntil] = useState<string | null | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [desc, setDesc] = useState('')
  const [item, setItem] = useState('')
  const [due, setDue] = useState('')
  const [who, setWho] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [men, setMen] = useState<{ id: string; full_name: string }[]>([])
  const [hist, setHist] = useState<HistOrder[]>([])
  const [tick, setTick] = useState(0)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    supabase.rpc('order_warranty', { p_order: orderId }).then(({ data }) => setUntil((data as string | null) ?? null))
    supabase.from('employees').select('id, full_name').eq('role', 'montajchi').eq('is_active', true).order('full_name').then(({ data }) => setMen((data as { id: string; full_name: string }[]) ?? []))
  }, [orderId])
  useEffect(() => {
    if (!clientId) return
    supabase
      .from('orders')
      .select('id, order_no, created_at, status, windows_count, order_items(pos, width_mm, height_mm, qty)')
      .eq('client_id', clientId)
      .neq('id', orderId)
      .order('created_at', { ascending: false })
      .then(({ data }) => setHist((data as unknown as HistOrder[]) ?? []))
  }, [clientId, orderId])

  const create = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const paths = files.length ? await uploadPhotos(orderId, 'service', files) : []
      const { error } = await supabase.rpc('create_service', { p_order: orderId, p_item: item || null, p_description: desc, p_due: due || null, p_assignee: who || null, p_photos: paths })
      if (error) {
        if (paths.length) await supabase.storage.from('install-photos').remove(paths)
        throw error
      }
      setMsg({ ok: true, text: t.created })
      setOpen(false)
      setDesc('')
      setItem('')
      setDue('')
      setWho('')
      setFiles([])
      setTick((n) => n + 1)
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    }
    setBusy(false)
  }

  const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' })
  return (
    <>
      <div className="card form">
        <h2>{t.panel}</h2>
        <p>
          {t.warranty}:{' '}
          {until === undefined ? '…' : until ? (
            <b className={until >= todayIso ? '' : 'debt-tag'}>
              {fmtDate(until)} {t.until} · {until >= todayIso ? t.active : t.expired}
            </b>
          ) : (
            <span className="muted">{t.unknown}</span>
          )}
        </p>
        {msg && <div className={msg.ok ? 'note ok' : 'note bad'}>{msg.text}</div>}
        {!open ? (
          <button type="button" className="ghost" onClick={() => setOpen(true)}>
            {t.new}
          </button>
        ) : (
          <div className="form">
            <label>
              {t.problem}
              <textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />
            </label>
            <div className="grid3">
              <label>
                {t.window}
                <select value={item} onChange={(e) => setItem(e.target.value)}>
                  <option value="">{t.whole}</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.pos}) {i.title ? `${i.title} · ` : ''}
                      {i.width_mm}×{i.height_mm}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t.due}
                <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              </label>
              <label>
                {t.assignee}
                <select value={who} onChange={(e) => setWho(e.target.value)}>
                  <option value="">{t.none}</option>
                  {men.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              {t.photo}
              <input type="file" accept="image/*" capture="environment" multiple onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, 5))} />
            </label>
            <div className="inline wrap">
              <button type="button" onClick={create} disabled={busy || !desc.trim()}>
                {busy ? uz.install.uploading : t.create}
              </button>
              <button type="button" className="ghost" onClick={() => setOpen(false)}>
                {uz.stock.cancel}
              </button>
            </div>
          </div>
        )}
      </div>

      <ServiceTickets orderId={orderId} reloadKey={tick} />

      {clientId && (
        <div className="card">
          <h2>{t.history}</h2>
          {hist.length === 0 && <p className="muted">{t.historyEmpty}</p>}
          {hist.map((h) => (
            <p key={h.id}>
              <Link to={`/orders/${h.id}`}>№{h.order_no}</Link> <span className="muted">{fmtDate(h.created_at)}</span> ·{' '}
              {h.order_items.length ? h.order_items.map((i) => `${i.width_mm}×${i.height_mm}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ') : <span className="muted">{h.windows_count} {uz.home.windows} — {t.sizesUnknown}</span>}
            </p>
          ))}
        </div>
      )}
    </>
  )
}
