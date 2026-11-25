import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { uz } from '../uz'

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n))

// главные цифры поверх 3D-завода — без рамок, крупно; читаются за счёт мягкой светлой дымки снизу кадра
export default function ZavodKpis() {
  const [d, setD] = useState<{ cash: number | null; since: string; debt: number | null; sup: number | null; orders: number | null }>({ cash: null, since: '', debt: null, sup: null, orders: null })
  useEffect(() => {
    const up = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }))
    // все цифры считает сервер (home_summary): никаких сумм в браузере по обрезанным выборкам
    supabase.rpc('home_summary').then(({ data }) => {
      const s = data as { cash: number; since: string | null; client_debt: number; supplier_debt: number; orders: number } | null
      if (!s) return
      up({ cash: Number(s.cash), since: s.since ?? '', debt: Number(s.client_debt), sup: Number(s.supplier_debt), orders: Number(s.orders) })
    })
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
