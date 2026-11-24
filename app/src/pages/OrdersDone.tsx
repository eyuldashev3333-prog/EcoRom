import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import OrderCard from '../components/OrderCard'
import { columnOf, useOrderCards } from '../lib/orderCards'
import MonthPicker from '../ui/MonthPicker'
import { uz } from '../uz'

const t = uz.order
const c = uz.cards
const tashkentMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' }).slice(0, 7)
// месяц, в котором заказ стал завершённым (по времени смены статуса)
const monthOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' }).slice(0, 7) : '')

// Завершённые заказы — отдельный экран (не в одной доске с активными): поиск, месяц, карточки без кнопок действий
export default function OrdersDone() {
  const { cards, names } = useOrderCards()
  const [q, setQ] = useState('')
  const [byMonth, setByMonth] = useState(true)
  const [month, setMonth] = useState(tashkentMonth())

  const s = q.trim().toLowerCase()
  const list = useMemo(
    () =>
      (cards ?? [])
        .filter((r) => columnOf(r.status) === 'done' && r.status !== 'cancelled')
        .filter((r) => !s || String(r.order_no).includes(s) || r.client.toLowerCase().includes(s) || (r.phone ?? '').includes(s) || (r.address ?? '').toLowerCase().includes(s))
        .filter((r) => !byMonth || monthOf(r.status_at ?? r.created_at) === month)
        .sort((a, b) => (b.status_at ?? '').localeCompare(a.status_at ?? '') || b.order_no - a.order_no),
    [cards, s, byMonth, month],
  )

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
