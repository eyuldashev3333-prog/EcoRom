import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { formatSum } from '../lib/pricing'
import { uz } from '../uz'

interface Row {
  id: string
  order_no: number
  created_at: string
  status: string
  windows_count: number
  area_m2: number
  contract_price: number
  deadline: string | null
  clients: { full_name: string; phone: string | null } | null
}
const t = uz.order

export default function Orders() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [q, setQ] = useState('')
  const nav = useNavigate()
  useEffect(() => {
    supabase
      .from('orders')
      .select('id, order_no, created_at, status, windows_count, area_m2, contract_price, deadline, clients(full_name, phone)')
      .order('order_no', { ascending: false })
      .limit(300)
      .then(({ data }) => setRows((data as unknown as Row[]) ?? []))
  }, [])
  const s = q.trim().toLowerCase()
  const shown = (rows ?? []).filter((r) => !s || String(r.order_no).includes(s) || r.clients?.full_name.toLowerCase().includes(s) || (r.clients?.phone ?? '').includes(s))

  return (
    <>
      <p>
        <Link to="/">←</Link>
      </p>
      <div className="inline head">
        <h1>{t.list}</h1>
        <button onClick={() => nav('/orders/new')}>+ {t.new}</button>
      </div>
      <input placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} className="search" />
      {rows === null && <p className="muted">{uz.loading}</p>}
      {rows?.length === 0 && <p className="muted">{t.empty}</p>}
      {shown.map((r) => (
        <Link key={r.id} to={`/orders/${r.id}`} className="card row order-row">
          <b>#{r.order_no}</b>
          <span>{r.clients?.full_name}</span>
          <span className="muted">{r.clients?.phone}</span>
          <span className="muted">
            {r.windows_count} {uz.home.windows} · {Number(r.area_m2)} m²
          </span>
          <span className="spacer" />
          <b>{formatSum(Number(r.contract_price))}</b>
          <span className={`status s-${r.status}`}>{t.statuses[r.status]}</span>
        </Link>
      ))}
    </>
  )
}
