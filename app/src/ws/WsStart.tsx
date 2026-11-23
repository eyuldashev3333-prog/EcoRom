import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { uz } from '../uz'
import './ws.css'
import { Phone } from './parts'
import { WS_DRAFT_KEY } from './useWsOrder'

const t = uz.ws
const KEY = WS_DRAFT_KEY

interface Draft {
  id?: string
  full_name: string
  phone: string
  address: string
  deadline?: string
  notes?: string
}
const readDraft = (): Draft | null => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? 'null')
  } catch {
    return null
  }
}
const writeDraft = (d: Draft) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(d))
  } catch {
    /* частный режим: черновик останется в памяти экрана */
  }
}

const Brand = () => <div className="ws-brand">{t.brand}</div>

// 1) НОВЫЙ ЗАКАЗ: две кнопки
export function WsNew() {
  const nav = useNavigate()
  return (
    <Phone>
      <Brand />
      <div className="ws-center">
        <h2>{t.newOrder}</h2>
        <button type="button" className="ws-bigbtn blue" onClick={() => nav('/ws/customer')}>
          {t.newCustomer}
        </button>
        <button type="button" className="ws-bigbtn magenta" onClick={() => nav('/ws/customers')}>
          {t.customerFromBase}
        </button>
      </div>
    </Phone>
  )
}

// 2) ЗАКАЗЧИК: имя*, телефон → НОВЫЙ ЗАКАЗ
export function WsCustomer() {
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const next = () => {
    if (!name.trim()) return
    writeDraft({ full_name: name.trim(), phone: phone.trim(), address: '' })
    nav('/ws/order')
  }
  return (
    <Phone>
      <Brand />
      <div className="ws-top">
        <form
          className="ws-form"
          onSubmit={(e) => {
            e.preventDefault()
            next()
          }}
        >
          <div className="ws-formhead blue">{t.customer}</div>
          <label className="ws-field">
            <span>{t.customerName}</span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </label>
          <label className="ws-field">
            <span>{t.customerPhone}</span>
            <input value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
          </label>
          <button type="submit" className="ws-submit magenta" disabled={!name.trim()}>
            {t.newOrder}
          </button>
        </form>
      </div>
    </Phone>
  )
}

// 3) ЗАКАЗЧИК ИЗ БАЗЫ: список, радио справа → НОВЫЙ ЗАКАЗ
export function WsCustomers() {
  const nav = useNavigate()
  const [rows, setRows] = useState<Draft[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  useEffect(() => {
    supabase.from('clients').select('id, full_name, phone, address').order('full_name').limit(3000).then(({ data }) => setRows(((data as { id: string; full_name: string; phone: string | null; address: string | null }[]) ?? []).map((c) => ({ id: c.id, full_name: c.full_name, phone: c.phone ?? '', address: c.address ?? '' }))))
  }, [])
  const chosen = rows?.find((r) => r.id === sel)
  return (
    <Phone>
      <Brand />
      <div className="ws-listhead">{t.allCustomers}</div>
      <div className="ws-list" role="radiogroup">
        {rows === null && <p style={{ textAlign: 'center' }}>{uz.loading}</p>}
        {rows?.map((r) => (
          <button key={r.id} type="button" role="radio" aria-checked={sel === r.id} className={sel === r.id ? 'ws-row on' : 'ws-row'} onClick={() => setSel(r.id!)}>
            <span>{r.full_name}</span>
            <span className="ws-radio" />
          </button>
        ))}
      </div>
      <div className="ws-bottom">
        <button
          type="button"
          className="ws-submit magenta"
          disabled={!chosen}
          onClick={() => {
            if (!chosen) return
            writeDraft(chosen)
            nav('/ws/order')
          }}
        >
          {t.newOrder}
        </button>
      </div>
    </Phone>
  )
}

// 4) ЗАКАЗ: адрес*, срок, заметка → СОЗДАТЬ (заказ создаётся сразу и открывается экран окна)
export function WsOrderForm() {
  const nav = useNavigate()
  const draft = readDraft()
  const [address, setAddress] = useState(draft?.address ?? '')
  const [deadline, setDeadline] = useState('')
  const [notes, setNotes] = useState('')
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (!draft) nav('/ws/new', { replace: true })
  }, [draft, nav])
  if (!draft) return null
  // заказ уходит в базу вместе с первым окном (сервер не принимает заказ без окон): пока что это черновик в памяти вкладки
  const create = () => {
    if (!address.trim()) return setMsg(t.mustAddress)
    writeDraft({ ...draft, address: address.trim(), deadline, notes })
    nav('/ws/edit', { replace: true })
  }
  return (
    <Phone>
      <Brand />
      <div className="ws-top">
        <form
          className="ws-form"
          onSubmit={(e) => {
            e.preventDefault()
            create()
          }}
        >
          <div className="ws-formhead magenta">
            {t.orderTitle}
            <b>{t.customerIs}</b>
            <b>{draft.full_name}</b>
          </div>
          <label className="ws-field">
            <span>{t.address}</span>
            <input autoFocus value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="off" />
          </label>
          <label className="ws-field">
            <span>{t.deadline}</span>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </label>
          <label className="ws-field">
            <span>{t.note}</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} autoComplete="off" />
          </label>
          <button type="submit" className="ws-submit blue">
            {t.create}
          </button>
        </form>
        {msg && <div className="ws-msg">{msg}</div>}
      </div>
    </Phone>
  )
}

// ВСЕ ЗАКАЗЫ: заказчик (зелёная плашка) → его заказы-адреса (охра), «|||» — карточка заказа; внизу ОТКРЫТЬ ЗАКАЗ и A-Z
interface OrderRow {
  id: string
  address: string | null
  windows_count: number
  created_at: string
  clients: { id: string; full_name: string; created_at: string } | null
}
export function WsOrders() {
  const nav = useNavigate()
  const [rows, setRows] = useState<OrderRow[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [az, setAz] = useState(false)
  useEffect(() => {
    supabase
      .from('orders')
      .select('id, address, windows_count, created_at, clients(id, full_name, created_at)')
      .order('created_at', { ascending: false })
      .limit(1500)
      .then(({ data }) => setRows((data as unknown as OrderRow[]) ?? []))
  }, [])
  const groups = new Map<string, { name: string; at: string; orders: OrderRow[] }>()
  for (const r of rows ?? []) {
    const c = r.clients
    if (!c) continue
    const g = groups.get(c.id) ?? { name: c.full_name, at: r.created_at, orders: [] }
    g.orders.push(r)
    groups.set(c.id, g)
  }
  const list = [...groups.values()].sort((a, b) => (az ? a.name.localeCompare(b.name, 'ru') : b.at.localeCompare(a.at)))
  const fmt = (s: string) => new Date(s).toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  return (
    <Phone>
      <div className="ws-listhead" style={{ background: '#facc6e' }}>
        {uz.order.list.toUpperCase()}
      </div>
      <div className="ws-list">
        {rows === null && <p style={{ textAlign: 'center' }}>{uz.loading}</p>}
        {list.map((g, gi) => (
          <div key={gi} style={{ margin: '6px 0' }}>
            <div className="ws-ocust">
              <div>
                {g.name}
                <small>{fmt(g.at)}</small>
              </div>
            </div>
            {g.orders.map((o) => (
              <div key={o.id} className={sel === o.id ? 'ws-oord on' : 'ws-oord'}>
                <button type="button" className="main" onClick={() => setSel(o.id)} onDoubleClick={() => nav(`/ws/edit/${o.id}`)}>
                  {o.address || '—'} · {uz.designer.pcs}: {o.windows_count}
                  <small>{fmt(o.created_at)}</small>
                </button>
                <button type="button" className="det" aria-label="|||" onClick={() => nav(`/orders/${o.id}`)}>
                  |||
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="ws-obar">
        <button type="button" className="open" disabled={!sel} onClick={() => sel && nav(`/ws/edit/${sel}`)}>
          {t.openOrder}
        </button>
        <button type="button" className="az" onClick={() => setAz((v) => !v)}>
          A-Z
        </button>
      </div>
    </Phone>
  )
}