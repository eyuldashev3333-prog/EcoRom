import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { supabase } from '../supabase'
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
  const [orders, setOrders] = useState<number | null>(null)
  useEffect(() => {
    supabase.from('v_cash_balance').select('cash').maybeSingle().then(({ data }) => setCash(Number((data as { cash: string } | null)?.cash ?? 0)))
    supabase.from('orders').select('id', { count: 'exact', head: true }).then(({ count }) => setOrders(count ?? 0))
  }, [])
  return (
    <>
      <div className="grid">
        <div className="card stat">
          <small>{uz.home.cash}</small>
          <b>{cash === null ? '…' : `${sum(cash)} so‘m`}</b>
        </div>
        <div className="card stat">
          <small>{uz.home.orders}</small>
          <b>{orders === null ? '…' : orders}</b>
        </div>
      </div>
      <div className="grid">
        <Link to="/catalog" className="card tile">
          {uz.home.catalog}
        </Link>
        <Link to="/employees" className="card tile">
          {uz.home.employees}
        </Link>
        <div className="card tile off">
          {uz.home.orders} · {uz.home.soon}
        </div>
      </div>
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
      {me?.role === 'rahbar' ? <RahbarHome /> : <WorkerHome />}
      <p>
        <Link to="/password">{uz.home.password}</Link>
      </p>
    </>
  )
}
