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
  const [debts, setDebts] = useState<Map<string, number>>(new Map())
  const [pct, setPct] = useState<Map<string, number>>(new Map())
  const [q, setQ] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('q') ?? '') // глобальный поиск из шапки
  const nav = useNavigate()
  useEffect(() => {
    supabase
      .from('orders')
      .select('id, order_no, created_at, status, windows_count, area_m2, contract_price, deadline, clients(full_name, phone)')
      .order('order_no', { ascending: false })
      .limit(5000) // вся история (сотни заказов) — поиск работает по всем
      .then(({ data }) => setRows((data as unknown as Row[]) ?? []))
    supabase
      .from('v_order_paid')
      .select('order_id, debt')
      .then(({ data }) => setDebts(new Map(((data as { order_id: string; debt: string }[]) ?? []).map((d) => [d.order_id, Number(d.debt)]))))
    supabase
      .from('v_order_progress')
      .select('order_id, percent')
      .gt('percent', 0)
      .then(({ data }) => setPct(new Map(((data as { order_id: string; percent: string }[]) ?? []).map((d) => [d.order_id, Number(d.percent)]))))
  }, [])
  const s = q.trim().toLowerCase()
  const shown = (rows ?? []).filter((r) => !s || String(r.order_no).includes(s) || r.clients?.full_name.toLowerCase().includes(s) || (r.clients?.phone ?? '').includes(s))

  return (
    <>
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
          {r.status !== 'cancelled' && (debts.get(r.id) ?? 0) > 0 && (
            <span className="debt-tag">
              {uz.money.debt}: {formatSum(debts.get(r.id) ?? 0)}
            </span>
          )}
          {['in_production', 'ready', 'installing'].includes(r.status) && <span className="pct">{pct.get(r.id) ?? 0}%</span>}
          <span className={`status s-${r.status}`}>{t.statuses[r.status]}</span>
        </Link>
      ))}
    </>
  )
}
