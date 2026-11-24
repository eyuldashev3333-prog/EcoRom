import { useMemo, useState } from 'react'
import OrderCard from '../components/OrderCard'
import { RahbarActions } from '../components/OrderActions'
import { columnOf, useOrderCards, type CardData, type Column } from '../lib/orderCards'
import MonthPicker from '../ui/MonthPicker'
import { uz } from '../uz'

const t = uz.order
const c = uz.cards
const COLS: Column[] = ['new', 'shop', 'ready', 'install', 'done']
const tashkentMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' }).slice(0, 7)

// Заказы канбаном: колонки по этапам, под каждой карточкой — кнопки своей колонки (нажал — карточка сразу переехала)
export function OrdersBoard() {
  const { cards, names, reload } = useOrderCards()
  const [q, setQ] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('q') ?? '') // глобальный поиск из шапки
  const [sort, setSort] = useState<'no' | 'name' | 'deadline'>('no')
  const [showDone, setShowDone] = useState(false)
  const [byMonth, setByMonth] = useState(false)
  const [month, setMonth] = useState(tashkentMonth())

  const s = q.trim().toLowerCase()
  const shown = useMemo(() => {
    const found = (cards ?? []).filter(
      (r) =>
        (!s || String(r.order_no).includes(s) || r.client.toLowerCase().includes(s) || (r.phone ?? '').includes(s) || (r.address ?? '').toLowerCase().includes(s)) &&
        (!byMonth || r.created_at.slice(0, 7) === month || (r.deadline ?? '').slice(0, 7) === month),
    )
    const cmp: Record<typeof sort, (a: CardData, b: CardData) => number> = {
      no: (a, b) => b.order_no - a.order_no,
      name: (a, b) => a.client.localeCompare(b.client, 'ru') || b.order_no - a.order_no,
      deadline: (a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || b.order_no - a.order_no,
    }
    return [...found].sort(cmp[sort])
  }, [cards, s, byMonth, month, sort])
  const cols = COLS.filter((k) => k !== 'done' || showDone)

  return (
    <>
      <div className="inline wrap" style={{ alignItems: 'center', marginBottom: 10 }}>
        <input placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} className="search" style={{ flex: 1, margin: 0, minWidth: 200 }} />
        <div className="tabs" role="group" aria-label={t.sort}>
          <button type="button" className={sort === 'no' ? 'tab on' : 'tab'} onClick={() => setSort('no')}>
            {t.sortNo}
          </button>
          <button type="button" className={sort === 'name' ? 'tab on' : 'tab'} onClick={() => setSort('name')}>
            {t.sortName}
          </button>
          <button type="button" className={sort === 'deadline' ? 'tab on' : 'tab'} onClick={() => setSort('deadline')}>
            {c.sortDeadline}
          </button>
        </div>
      </div>
      <div className="inline wrap" style={{ alignItems: 'center', marginBottom: 12, gap: 18 }}>
        <label className="switch">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          <i />
          {c.showDone}
        </label>
        <label className="switch">
          <input type="checkbox" checked={byMonth} onChange={(e) => setByMonth(e.target.checked)} />
          <i />
          {c.byMonth}
        </label>
        {byMonth && <MonthPicker value={month} onChange={setMonth} />}
      </div>
      {cards === null && <p className="muted">{uz.loading}</p>}
      {cards?.length === 0 && <p className="muted">{t.empty}</p>}
      {cards && cards.length > 0 && (
        <div className="kanban" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
          {cols.map((k) => {
            const list = shown.filter((r) => columnOf(r.status) === k)
            return (
              <section key={k} className={`kcol k-${k}`}>
                <header>
                  <span>{c.columns[k]}</span>
                  <b>{list.length}</b>
                </header>
                {list.length === 0 && <div className="kempty">—</div>}
                {list.map((r) => (
                  <OrderCard key={r.id} c={r} names={names}>
                    <RahbarActions c={r} onDone={reload} compact />
                  </OrderCard>
                ))}
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}

export default function Orders() {
  return (
    <>
      <h1>{t.list}</h1>
      <OrdersBoard />
    </>
  )
}
