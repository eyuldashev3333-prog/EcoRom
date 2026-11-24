import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { uz } from '../uz'

const t = uz.mywork

interface Row {
  orders: number
  windows: number
  m2: number
  services: number
}
const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')

// Главные цифры работника за месяц (свои, из worker_stats). first — цифры «сейчас» (очередь) перед месячными.
export default function MyStats({ role, first = [], month }: { role: 'ishlab' | 'montajchi'; first?: { label: string; value: number }[]; month?: string }) {
  const [r, setR] = useState<Row | null>(null)
  useEffect(() => {
    const m = (month ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' }).slice(0, 7)) + '-01'
    supabase.rpc('worker_stats', { p_month: m }).then(({ data }) => {
      const x = ((data as Row[] | null) ?? [])[0]
      setR(x ? { orders: Number(x.orders), windows: Number(x.windows), m2: Number(x.m2), services: Number(x.services) } : { orders: 0, windows: 0, m2: 0, services: 0 })
    })
  }, [month])
  const month_items: { label: string; value: string | number }[] = [
    { label: role === 'ishlab' ? t.orders : t.installed, value: r ? r.orders : '…' },
    { label: t.windows, value: r ? r.windows : '…' },
    role === 'ishlab' ? { label: t.m2, value: r ? fmt(r.m2) : '…' } : { label: t.service, value: r ? r.services : '…' },
  ]
  const grid = (items: { label: string; value: string | number }[]) => (
    <div className="kpis" style={{ border: 0, borderRadius: 0, margin: 0 }}>
      {items.map((k) => (
        <div key={k.label} className="kpi">
          <span className="kpi-label">{k.label}</span>
          <span className="kpi-value">{k.value}</span>
        </div>
      ))}
    </div>
  )
  return (
    <section className="panel">
      {first.length > 0 && <div className="panel-body">{grid(first)}</div>}
      <header className="panel-head" style={first.length ? { borderTop: '1px solid var(--line)' } : undefined}>
        <h2>{t.thisMonth}</h2>
      </header>
      <div className="panel-body">{grid(month_items)}</div>
    </section>
  )
}