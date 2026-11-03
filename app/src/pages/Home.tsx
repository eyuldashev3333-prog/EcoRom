import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { supabase } from '../supabase'
import { progressPct } from '../components/StageGrid'
import { uz } from '../uz'

interface WOrder {
  id: string
  order_no: number
  status: string
  deadline: string | null
  windows_count: number
  address: string | null
}

const sum = (n: number) => new Intl.NumberFormat('ru-RU').format(n)

function RahbarHome() {
  const [cash, setCash] = useState<number | null>(null)
  const [since, setSince] = useState('')
  const [orders, setOrders] = useState<number | null>(null)
  const [debt, setDebt] = useState<number | null>(null)
  useEffect(() => {
    // долг клиентов: только по активным заказам (без отменённых)
    Promise.all([supabase.from('v_order_paid').select('order_id, debt'), supabase.from('orders').select('id').neq('status', 'cancelled')]).then(([d, o]) => {
      const active = new Set(((o.data as { id: string }[]) ?? []).map((x) => x.id))
      setDebt(((d.data as { order_id: string; debt: string }[]) ?? []).filter((x) => active.has(x.order_id)).reduce((s, x) => s + Math.max(0, Number(x.debt)), 0))
    })
    supabase
      .from('v_cash_balance')
      .select('cash, since')
      .maybeSingle()
      .then(({ data }) => {
        const d = data as { cash: string; since: string } | null
        setCash(Number(d?.cash ?? 0))
        setSince(d?.since ?? '')
      })
    supabase.from('orders').select('id', { count: 'exact', head: true }).then(({ count }) => setOrders(count ?? 0))
  }, [])
  return (
    <>
      <div className="grid">
        <div className="card stat">
          <small>
            {uz.home.cash}
            {since && ` (${since.split('-').reverse().join('.')} dan)`}
          </small>
          <b>{cash === null ? '…' : `${sum(cash)} so‘m`}</b>
        </div>
        <div className="card stat">
          <small>{uz.home.orders}</small>
          <b>{orders === null ? '…' : orders}</b>
        </div>
        <div className="card stat">
          <small>{uz.home.clientDebt}</small>
          <b>{debt === null ? '…' : `${sum(debt)} so‘m`}</b>
        </div>
      </div>
      <div className="grid">
        <Link to="/catalog" className="card tile">
          {uz.home.catalog}
        </Link>
        <Link to="/designer" className="card tile">
          {uz.home.designer}
        </Link>
        <Link to="/employees" className="card tile">
          {uz.home.employees}
        </Link>
        <Link to="/orders" className="card tile">
          {uz.home.orders}
        </Link>
      </div>
    </>
  )
}

interface ShopRow {
  id: string
  order_no: number
  status: string
  deadline: string | null
  client_name: string | null
  windows_count: number
  pct: number
}

// цех: заказы в работе с % готовности → экран заказа с галочками
function ShopHome() {
  const [rows, setRows] = useState<ShopRow[] | null>(null)
  useEffect(() => {
    ;(async () => {
      const { data: os } = await supabase
        .from('w_orders')
        .select('id, order_no, status, deadline, client_name, windows_count')
        .in('status', ['in_production', 'ready'])
        .order('deadline', { ascending: true, nullsFirst: false })
      const orders = (os as Omit<ShopRow, 'pct'>[]) ?? []
      if (!orders.length) return setRows([])
      const [its, st] = await Promise.all([
        supabase.from('w_order_items').select('id, order_id, qty').in('order_id', orders.map((o) => o.id)),
        supabase.from('stages').select('id', { count: 'exact', head: true }).eq('is_active', true),
      ])
      const items = (its.data as { id: string; order_id: string; qty: number }[]) ?? []
      const { data: ms } = await supabase.from('w_stage_marks').select('order_item_id').in('order_item_id', items.map((i) => i.id))
      const marks = (ms as { order_item_id: string }[]) ?? []
      setRows(
        orders.map((o) => {
          const mine = items.filter((i) => i.order_id === o.id)
          const ids = new Set(mine.map((i) => i.id))
          return { ...o, pct: progressPct(mine, marks.filter((m) => ids.has(m.order_item_id)), st.count ?? 0) }
        }),
      )
    })()
  }, [])
  return (
    <>
      <h2>{uz.stages.shopList}</h2>
      {rows === null && <p className="muted">{uz.loading}</p>}
      {rows?.length === 0 && <p className="muted">{uz.stages.noShop}</p>}
      {rows?.map((o) => (
        <Link key={o.id} to={`/shop/${o.id}`} className="card row order-row">
          <b>№{o.order_no}</b>
          <span>{o.client_name}</span>
          <span className="muted">
            {o.windows_count} {uz.home.windows}
            {o.deadline && ` · ${uz.home.deadline}: ${o.deadline.split('-').reverse().join('.')}`}
          </span>
          <span className="spacer" />
          <span className="pct">{o.pct}%</span>
          <span className={`status s-${o.status}`}>{uz.order.statuses[o.status]}</span>
        </Link>
      ))}
    </>
  )
}

function WorkerHome() {
  const [rows, setRows] = useState<WOrder[] | null>(null)
  useEffect(() => {
    supabase
      .from('w_orders')
      .select('id, order_no, status, deadline, windows_count, address')
      .order('order_no', { ascending: false })
      .then(({ data }) => setRows((data as WOrder[]) ?? []))
  }, [])
  return (
    <>
      <h2>{uz.home.myOrders}</h2>
      {rows === null && <p className="muted">{uz.loading}</p>}
      {rows?.length === 0 && <p className="muted">{uz.home.noOrders}</p>}
      {rows?.map((o) => (
        <div key={o.id} className="card row">
          <b>#{o.order_no}</b>
          <span>
            {o.windows_count} {uz.home.windows}
          </span>
          {o.deadline && (
            <span className="muted">
              {uz.home.deadline}: {o.deadline}
            </span>
          )}
          {o.address && <span className="muted">{o.address}</span>}
        </div>
      ))}
    </>
  )
}

export default function Home() {
  const { me } = useAuth()
  return (
    <>
      <h1>
        {uz.hello}, {me?.full_name}
      </h1>
      {me?.role === 'rahbar' ? <RahbarHome /> : me?.role === 'ishlab' ? <ShopHome /> : <WorkerHome />}
      <p>
        <Link to="/password">{uz.home.password}</Link>
      </p>
    </>
  )
}
