import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { formatSum } from '../lib/pricing'
import { uz } from '../uz'

const t = uz.finance
const MONTHS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek']

interface Rep {
  month: string
  cash: { received: number; other?: number; expenses: number; salaries: number; suppliers: number; net: number }
  expenses: { total: number; by_category: { name: string; amount: number }[] }
}
const tk = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' }).slice(0, 7)
const shift = (m: string, d: number) => {
  const [y, mo] = m.split('-').map(Number)
  const x = new Date(Date.UTC(y, mo - 1 + d, 1))
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`
}
const out = (r: Rep) => Number(r.cash.expenses) + Number(r.cash.salaries) + Number(r.cash.suppliers)
// всё, что пришло в кассу: оплаты по заказам + «Kirim» (ombordan sotish, eski mijozlar)
const inn = (r: Rep) => Number(r.cash.received) + Number(r.cash.other ?? 0)
const short = (n: number) => (Math.abs(n) >= 1e6 ? `${Math.round(n / 1e5) / 10} mln` : Math.abs(n) >= 1e3 ? `${Math.round(n / 1e3)} ming` : String(Math.round(n)))
const PALETTE = ['#1f7a3d', '#2d6cdf', '#b26a00', '#7a4bc2', '#c0392b', '#6b7a8f']

// Moliya: кликабельные Kirim / Chiqim с калькуляцией, столбики по месяцам, круг расходов по категориям
export default function FinanceCharts() {
  const [reps, setReps] = useState<Rep[] | null>(null)
  const [open, setOpen] = useState<'in' | 'out' | null>(null)
  useEffect(() => {
    const now = tk()
    const months = [5, 4, 3, 2, 1, 0].map((i) => shift(now, -i))
    Promise.all(months.map((m) => supabase.rpc('monthly_report', { p_month: `${m}-01` }))).then((all) => setReps(all.map((x, i) => ({ ...(x.data as Rep), month: months[i] })).filter((x) => x.cash)))
  }, [])

  if (!reps) return <p className="muted">{uz.loading}</p>
  const cur = reps[reps.length - 1]
  if (!cur) return null
  const inc = inn(cur)
  const outc = out(cur)
  const max = Math.max(1, ...reps.flatMap((r) => [inn(r), out(r)]))
  const W = 600, H = 220, pl = 8, pb = 26, pt = 14
  const gw = (W - pl) / reps.length
  const y = (v: number) => pt + (H - pt - pb) * (1 - v / max)
  const cats = [...cur.expenses.by_category].sort((a, b) => Number(b.amount) - Number(a.amount))
  const top = cats.slice(0, 5)
  const rest = cats.slice(5).reduce((s, c) => s + Number(c.amount), 0)
  const slices = [...top.map((c) => ({ name: c.name, v: Number(c.amount) })), ...(rest > 0 ? [{ name: t.other, v: rest }] : [])].filter((s) => s.v > 0)
  const total = slices.reduce((s, c) => s + c.v, 0)
  let acc = 0
  const R = 70, C = 2 * Math.PI * R

  return (
    <>
      <div className="fin-cards">
        <button type="button" className={`fin-card in ${open === 'in' ? 'on' : ''}`} onClick={() => setOpen(open === 'in' ? null : 'in')} aria-expanded={open === 'in'}>
          <span>{t.income}</span>
          <b>{formatSum(inc)} <small>so‘m</small></b>
          <em>{t.calc}</em>
        </button>
        <button type="button" className={`fin-card out ${open === 'out' ? 'on' : ''}`} onClick={() => setOpen(open === 'out' ? null : 'out')} aria-expanded={open === 'out'}>
          <span>{t.outcome}</span>
          <b>{formatSum(outc)} <small>so‘m</small></b>
          <em>{t.calc}</em>
        </button>
      </div>
      {open === 'in' && (
        <div className="card">
          <h3>{t.incomeCalc}</h3>
          <table className="tbl">
            <tbody>
              <tr><td>{t.fromClients}</td><td className="num">{formatSum(Number(cur.cash.received))}</td></tr>
              <tr><td>{t.otherIncome}</td><td className="num">{formatSum(Number(cur.cash.other ?? 0))}</td></tr>
              <tr className="sum"><td><b>{t.income}</b></td><td className="num"><b>{formatSum(inc)}</b></td></tr>
            </tbody>
          </table>
          <p className="muted small">{t.incomeNote}</p>
        </div>
      )}
      {open === 'out' && (
        <div className="card">
          <h3>{t.outcomeCalc}</h3>
          <table className="tbl">
            <tbody>
              <tr><td>{t.expensesRow}</td><td className="num">{formatSum(Number(cur.cash.expenses))}</td></tr>
              {cats.map((c) => (
                <tr key={c.name} className="sub"><td>· {c.name}</td><td className="num muted">{formatSum(Number(c.amount))}</td></tr>
              ))}
              <tr><td>{t.salaryRow}</td><td className="num">{formatSum(Number(cur.cash.salaries))}</td></tr>
              <tr><td>{t.supplierRow}</td><td className="num">{formatSum(Number(cur.cash.suppliers))}</td></tr>
              <tr className="sum"><td><b>{t.outcome}</b></td><td className="num"><b>{formatSum(outc)}</b></td></tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="fin-grid">
        <div className="card">
          <h3>{t.byMonth}</h3>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.byMonth} className="fin-svg">
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={pl} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="#e3e6ea" />
                <text x={W} y={y(max * f) - 3} textAnchor="end" fontSize="10" fill="#8a919a">{short(max * f)}</text>
              </g>
            ))}
            {reps.map((r, i) => {
              const x0 = pl + i * gw + gw * 0.14
              const bw = gw * 0.34
              const a = inn(r), b = out(r)
              const m = Number(r.month.split('-')[1]) - 1
              return (
                <g key={r.month}>
                  <rect x={x0} y={y(a)} width={bw} height={Math.max(0, H - pb - y(a))} rx="2" fill="#1f7a3d"><title>{`${t.income}: ${formatSum(a)}`}</title></rect>
                  <rect x={x0 + bw + 3} y={y(b)} width={bw} height={Math.max(0, H - pb - y(b))} rx="2" fill="#c0392b"><title>{`${t.outcome}: ${formatSum(b)}`}</title></rect>
                  <text x={x0 + bw} y={H - 8} textAnchor="middle" fontSize="11" fill="#5f6670">{MONTHS[m]}</text>
                </g>
              )
            })}
          </svg>
          <div className="fin-legend">
            <span><i style={{ background: '#1f7a3d' }} />{t.income}</span>
            <span><i style={{ background: '#c0392b' }} />{t.outcome}</span>
          </div>
        </div>
        <div className="card">
          <h3>{t.byCategory}</h3>
          {total === 0 ? (
            <p className="muted">{t.noData}</p>
          ) : (
            <div className="fin-donut">
              <svg viewBox="0 0 200 200" role="img" aria-label={t.byCategory} width="170" height="170">
                <g transform="rotate(-90 100 100)">
                  {slices.map((s, i) => {
                    const len = (s.v / total) * C
                    const el = <circle key={s.name} cx="100" cy="100" r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="26" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc}><title>{`${s.name}: ${formatSum(s.v)}`}</title></circle>
                    acc += len
                    return el
                  })}
                </g>
                <text x="100" y="98" textAnchor="middle" fontSize="12" fill="#5f6670">{t.expensesRow}</text>
                <text x="100" y="118" textAnchor="middle" fontSize="15" fontWeight="700" fill="#1b1f24">{short(total)}</text>
              </svg>
              <ul className="fin-list">
                {slices.map((s, i) => (
                  <li key={s.name}>
                    <i style={{ background: PALETTE[i % PALETTE.length] }} />
                    <span>{s.name}</span>
                    <b>{Math.round((s.v / total) * 100)}%</b>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
