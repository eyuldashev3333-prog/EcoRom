import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { formatSum } from '../lib/pricing'
import { uz } from '../uz'

const t = uz.report

interface Rep {
  month: string
  incomplete: boolean
  historical?: boolean
  orders: { count: number; windows: number; area_m2: number; revenue: number; by_series: Record<string, number> }
  cost: { calc_cost: number; works: number }
  margin: number
  salaries: { accrued: number; paid: number; remaining: number; closed: boolean }
  expenses: { total: number; by_category: { name: string; amount: number }[] }
  losses: { breakage: number; service: number; stock: number; total: number }
  profit: number
  profit_without_works: number
  cash: { received: number; expenses: number; salaries: number; suppliers: number; net: number; balance_now: number }
  debts: { clients: number; suppliers: number }
}

const prevMonth = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`
}
const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + formatSum(Math.abs(n))

function Row({ label, value, bold = false, minus = false, to, hint }: { label: string; value: number | string; bold?: boolean; minus?: boolean; to?: string; hint?: string }) {
  const v = typeof value === 'number' ? `${minus && value ? '−' : ''}${formatSum(value)}` : value
  return (
    <tr>
      <td>
        {bold ? <b>{label}</b> : label}
        {to && (
          <>
            {' '}
            <Link to={to}>→</Link>
          </>
        )}
        {hint && (
          <>
            <br />
            <small className="muted">{hint}</small>
          </>
        )}
      </td>
      <td>{bold ? <b>{v}</b> : v}</td>
    </tr>
  )
}

// месячный отчёт: заказы, маржа, ish haqi, расходы, потери → прибыль; отдельно движение денег и долги
export default function Report() {
  const [month, setMonth] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' }).slice(0, 7))
  const [r, setR] = useState<Rep | null>(null)
  const [prev, setPrev] = useState<Rep | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    setR(null)
    setErr('')
    Promise.all([supabase.rpc('monthly_report', { p_month: `${month}-01` }), supabase.rpc('monthly_report', { p_month: `${prevMonth(month)}-01` })]).then(([a, b]) => {
      if (a.error) return setErr(a.error.message)
      setR(a.data as Rep)
      setPrev((b.data as Rep) ?? null)
    })
  }, [month])

  return (
    <>
      <p>
        <Link to="/">←</Link>
      </p>
      <div className="inline head">
        <h1>{t.title}</h1>
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} style={{ width: 'auto' }} />
      </div>
      {err && <div className="card note bad">{err}</div>}
      {!r && !err && <p className="muted">{uz.loading}</p>}
      {r && (
        <>
          {r.incomplete && <div className="card note bad">{t.incomplete}</div>}
          {r.historical && !r.incomplete && <div className="card note">{t.historical}</div>}
          <div className={`card stat ${r.profit < 0 ? 'debt' : 'ok'}`}>
            <small>
              {t.profit} · {r.month}
            </small>
            <b>{formatSum(r.profit)} so‘m</b>
            {prev && (
              <small className="muted">
                {sign(r.profit - prev.profit)} {t.vs}
              </small>
            )}
          </div>

          <div className="card">
            <h2>{t.sales}</h2>
            <table className="kv">
              <tbody>
                <Row label={t.orders} value={String(r.orders.count)} to="/orders" />
                <Row label={t.windows} value={String(r.orders.windows)} />
                <Row label={t.area} value={String(r.orders.area_m2).replace('.', ',')} />
                {Object.entries(r.orders.by_series).map(([k, v]) => (
                  <Row key={k} label={`· ${t.series[k] ?? k}, m²`} value={String(v).replace('.', ',')} />
                ))}
                <Row label={t.revenue} value={r.orders.revenue} bold />
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>{t.formula}</h2>
            <table className="kv">
              <tbody>
                <Row label={t.revenue} value={r.orders.revenue} />
                <Row label={t.cost} value={r.cost.calc_cost} minus />
                {r.cost.works > 0 && <Row label={`   ${t.worksIn}`} value={r.cost.works} />}
                <Row label={t.margin} value={r.margin} bold />
                <Row label={t.salaries} value={r.salaries.accrued} minus to="/payroll" hint={`${t.salariesPaid}: ${formatSum(r.salaries.paid)} · ${t.salariesLeft}: ${formatSum(r.salaries.remaining)}`} />
                <Row label={t.expenses} value={r.expenses.total} minus to="/expenses" />
                <Row label={t.losses} value={r.losses.total} minus />
                <Row label={t.profit} value={r.profit} bold />
                {r.cost.works > 0 && <Row label={t.profitNoWorks} value={r.profit_without_works} hint={t.worksHint} />}
              </tbody>
            </table>
          </div>

          {r.expenses.by_category.length > 0 && (
            <div className="card">
              <h2>{t.expenses}</h2>
              <table className="kv">
                <tbody>
                  {r.expenses.by_category.map((c) => (
                    <Row key={c.name} label={c.name} value={c.amount} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card">
            <h2>{t.losses}</h2>
            <table className="kv">
              <tbody>
                <Row label={t.breakage} value={r.losses.breakage} to="/breakages" />
                <Row label={t.service} value={r.losses.service} to="/service" />
                <Row label={t.stock} value={r.losses.stock} to="/stock" />
                <Row label={uz.breakage.total} value={r.losses.total} bold />
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>{t.cash}</h2>
            <table className="kv">
              <tbody>
                <Row label={t.received} value={r.cash.received} />
                <Row label={t.paidExp} value={r.cash.expenses} minus />
                <Row label={t.paidSal} value={r.cash.salaries} minus />
                <Row label={t.paidSup} value={r.cash.suppliers} minus />
                <Row label={t.net} value={sign(r.cash.net)} bold />
                <Row label={t.balance} value={r.cash.balance_now} />
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>{t.debts}</h2>
            <table className="kv">
              <tbody>
                <Row label={t.clients} value={r.debts.clients} to="/orders" />
                <Row label={t.suppliers} value={r.debts.suppliers} to="/suppliers" />
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
