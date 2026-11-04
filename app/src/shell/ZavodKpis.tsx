import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { uz } from '../uz'

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n))

// главные цифры поверх 3D-завода — без рамок, крупно; читаются за счёт мягкой светлой дымки снизу кадра
export default function ZavodKpis() {
  const [d, setD] = useState<{ cash: number | null; since: string; debt: number | null; sup: number | null; orders: number | null }>({ cash: null, since: '', debt: null, sup: null, orders: null })
  useEffect(() => {
    const up = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }))
    supabase.from('v_cash_balance').select('cash, since').maybeSingle().then(({ data }) => {
      const c = data as { cash: string; since: string } | null
      up({ cash: Number(c?.cash ?? 0), since: c?.since ?? '' })
    })
    Promise.all([supabase.from('v_order_paid').select('order_id, debt'), supabase.from('orders').select('id').neq('status', 'cancelled')]).then(([dd, o]) => {
      const active = new Set(((o.data as { id: string }[]) ?? []).map((x) => x.id))
      up({ debt: ((dd.data as { order_id: string; debt: string }[]) ?? []).filter((x) => active.has(x.order_id)).reduce((a, x) => a + Math.max(0, Number(x.debt)), 0) })
    })
    supabase.from('v_supplier_debt').select('debt').then(({ data }) => up({ sup: ((data as { debt: string }[]) ?? []).reduce((a, x) => a + Math.max(0, Number(x.debt)), 0) }))
    supabase.from('orders').select('id', { count: 'exact', head: true }).then(({ count }) => up({ orders: count ?? 0 }))
  }, [])
  const items = [
    { label: uz.home.cash, value: d.cash, money: true, sub: d.since ? `${d.since.split('-').reverse().join('.')} dan` : '' },
    { label: uz.home.clientDebt, value: d.debt, money: true, red: !!d.debt },
    { label: uz.home.supplierDebt, value: d.sup, money: true },
    { label: uz.home.orders, value: d.orders, money: false },
  ]
  return (
    <div className="zkpis">
      {items.map((k) => (
        <div key={k.label} className={`zkpi ${k.red ? 'red' : ''}`}>
          <span className="zkpi-label">{k.label}</span>
          <span className="zkpi-value">
            {k.value === null ? '—' : fmt(k.value)}
            {k.money && <small> so‘m</small>}
          </span>
          {k.sub && <span className="zkpi-sub">{k.sub}</span>}
        </div>
      ))}
    </div>
  )
}
