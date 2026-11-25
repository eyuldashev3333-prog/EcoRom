import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import OrderCard from '../components/OrderCard'
import { useOrderCards } from '../lib/orderCards'
import MonthPicker from '../ui/MonthPicker'
import { uz } from '../uz'

const t = uz.order
const c = uz.cards
const tashkentMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' }).slice(0, 7)

// Завершённые заказы — отдельный экран: месяц и поиск работают НА СЕРВЕРЕ (загружаются только нужные заказы, а не вся история)
export default function OrdersDone() {
  const [sp] = useSearchParams()
  const [q, setQ] = useState(sp.get('q') ?? '')
  const [debounced, setDebounced] = useState(q)
  const [byMonth, setByMonth] = useState(!(sp.get('q') ?? '').trim()) // при поиске — по всей истории
  const [month, setMonth] = useState(tashkentMonth())
  useEffect(() => {
    const h = setTimeout(() => setDebounced(q), 350)
    return () => clearTimeout(h)
  }, [q])
  useEffect(() => {
    const next = sp.get('q') ?? ''
    setQ(next)
    setDebounced(next)
    if (next.trim()) setByMonth(false)
  }, [sp])

  const { cards, names } = useOrderCards({ kind: 'done', month: byMonth ? month : null, q: debounced })
  const list = (cards ?? []).filter((r) => r.status !== 'cancelled').sort((a, b) => (b.status_at ?? '').localeCompare(a.status_at ?? '') || b.order_no - a.order_no)

  return (
    <>
      <p>
        <Link to="/orders">← {t.list}</Link>
      </p>
      <h1>{c.doneScreen}</h1>
      <div className="inline wrap" style={{ alignItems: 'center', marginBottom: 12, gap: 18 }}>
        <input placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} className="search" style={{ flex: 1, margin: 0, minWidth: 200 }} />
        <label className="switch">
          <input type="checkbox" checked={byMonth} onChange={(e) => setByMonth(e.target.checked)} />
          <i />
          {c.byMonth}
        </label>
        {byMonth && <MonthPicker value={month} onChange={setMonth} />}
      </div>
      {debounced.trim().length === 1 && <p className="muted small">{c.searchMin}</p>}
      {cards === null && <p className="muted">{uz.loading}</p>}
      {cards && list.length === 0 && <p className="muted">{t.empty}</p>}
      <div className="my-works">
        {list.map((r) => (
          <OrderCard key={r.id} c={r} names={names} />
        ))}
      </div>
    </>
  )
}