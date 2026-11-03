import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { formatSum } from '../lib/pricing'
import { attentionCount, type Leaks as L } from '../lib/leaks'
import { uz } from '../uz'

const t = uz.leaks

function Box({ title, count, bad = true, to, children }: { title: string; count?: number | string; bad?: boolean; to?: string; children?: ReactNode }) {
  const zero = count === 0
  return (
    <div className={`card ${!zero && bad ? 'leak-bad' : ''}`}>
      <div className="inline head">
        <h2>{title}</h2>
        <span className={zero ? 'status s-ready' : bad ? 'status s-cancelled leak-count' : 'status'}>{zero ? '✓' : count}</span>
      </div>
      {zero ? <p className="muted small">{t.ok}</p> : children}
      {to && !zero && (
        <p className="small">
          <Link to={to}>{t.all} →</Link>
        </p>
      )}
    </div>
  )
}
const ord = (o: { order_id: string; order_no: number; client: string }) => (
  <Link to={`/orders/${o.order_id}`}>
    №{o.order_no} {o.client}
  </Link>
)

// «Teshiklar»: где сегодня теряются деньги и время — на одном экране
export default function Leaks() {
  const [d, setD] = useState<L | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    supabase.rpc('leaks_report').then(({ data, error }) => (error ? setErr(error.message) : setD(data as L)))
  }, [])
  if (err) return <div className="card note bad">{err}</div>
  if (!d) return <p className="muted">{uz.loading}</p>
  const n = attentionCount(d)

  return (
    <>
      <p>
        <Link to="/">←</Link>
      </p>
      <h1>{t.title}</h1>
      <p className="muted small">{t.hint}</p>
      <div className={`card note ${n ? 'bad' : 'ok'}`}>{n ? `${t.action}: ${n}` : t.ok}</div>

      <Box title={t.overdue} count={d.overdue.count}>
        <table className="tbl">
          <tbody>
            {d.overdue.items.map((o) => (
              <tr key={o.order_id}>
                <td>{ord(o)}</td>
                <td className="num debt-tag">
                  {o.days_late} {t.daysLate}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>

      <Box title={t.stuck} count={d.stuck.count}>
        <table className="tbl">
          <tbody>
            {d.stuck.items.map((o) => (
              <tr key={o.order_id}>
                <td>{ord(o)}</td>
                <td className="num">
                  {o.days} {t.days}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>

      <Box title={t.material} count={d.material.count}>
        <table className="tbl">
          <tbody>
            {d.material.items.map((o) => (
              <tr key={o.order_id}>
                <td>{ord(o)}</td>
                <td className="debt-tag">
                  {t.results[o.result]}
                  {o.note ? ` — ${o.note}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>

      <Box title={t.installedUnpaid} count={d.installed_unpaid.count}>
        <p className="debt-tag">{formatSum(d.installed_unpaid.sum)} so‘m</p>
        <table className="tbl">
          <tbody>
            {d.installed_unpaid.items.map((o) => (
              <tr key={o.order_id}>
                <td>{ord(o)}</td>
                <td className="num">{formatSum(o.debt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>

      <Box title={t.service} count={d.service.count} to="/service">
        <table className="tbl">
          <tbody>
            {d.service.items.map((s) => (
              <tr key={s.id}>
                <td>
                  №{s.order_no} {s.client}
                  <br />
                  <small className="muted">{s.description}</small>
                </td>
                <td className="debt-tag">{t.flags[s.flag]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>

      <Box title={t.breakage} count={d.breakage_undecided.count} to="/breakages">
        <p className="debt-tag">{formatSum(d.breakage_undecided.sum)} so‘m</p>
      </Box>

      <Box title={t.stockNeg} count={d.stock_negative.count} to="/stock">
        <table className="tbl">
          <tbody>
            {d.stock_negative.items.map((s) => (
              <tr key={s.name} className="neg">
                <td>{s.name}</td>
                <td className="num">
                  {String(s.qty).replace('.', ',')} {uz.catalog.units[s.unit] ?? s.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>

      {d.cash.negative && (
        <div className="card leak-bad">
          <h2>{t.cashNeg}</h2>
          <p className="debt-tag">{formatSum(d.cash.balance)} so‘m</p>
        </div>
      )}

      <Box title={t.clientDebts} count={d.client_debts.count} bad={d.client_debts.older > 0}>
        <table className="kv">
          <tbody>
            <tr>
              <td>{t.d30}</td>
              <td>{formatSum(d.client_debts.d30)}</td>
            </tr>
            <tr>
              <td>{t.d90}</td>
              <td>{formatSum(d.client_debts.d90)}</td>
            </tr>
            <tr>
              <td>{t.older}</td>
              <td className={d.client_debts.older > 0 ? 'debt-tag' : ''}>{formatSum(d.client_debts.older)}</td>
            </tr>
          </tbody>
        </table>
        <table className="tbl">
          <tbody>
            {d.client_debts.items.map((o) => (
              <tr key={o.order_id}>
                <td>{ord(o)}</td>
                <td className="muted small">
                  {o.age_days} {t.ageDays}
                </td>
                <td className="num">{formatSum(o.debt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>

      <Box title={t.supplierDebts} count={d.supplier_debts.count} bad={false} to="/suppliers">
        <p>{formatSum(d.supplier_debts.sum)} so‘m</p>
        <table className="tbl">
          <tbody>
            {d.supplier_debts.items.map((s) => (
              <tr key={s.supplier_id}>
                <td>{s.name}</td>
                <td className="num">{formatSum(s.debt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>

      <Box title={t.pricey} count={d.pricey_purchases.count} bad={false} to="/purchases">
        <p className="debt-tag">
          {t.excess}: {formatSum(d.pricey_purchases.excess)} so‘m
        </p>
        <table className="tbl">
          <tbody>
            {d.pricey_purchases.items.map((p) => (
              <tr key={p.name}>
                <td>{p.name}</td>
                <td className="num small">
                  {formatSum(p.unit_cost)} / {formatSum(p.catalog_price)}
                </td>
                <td className="num">{formatSum(p.excess)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>

      <Box title={`${t.lowMargin} (${t.lowMarginNote} ${d.low_margin.threshold}%)`} count={d.low_margin.count} bad={false}>
        <table className="tbl">
          <tbody>
            {d.low_margin.items.map((o) => (
              <tr key={o.order_id}>
                <td>{ord(o)}</td>
                <td className="num debt-tag">{String(o.margin_pct).replace('.', ',')}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>

      {d.unknown_status.count > 0 && (
        <div className="card">
          <b>{t.unknown}:</b> {d.unknown_status.count} <Link to="/orders">→</Link>
        </div>
      )}

      {d.pace.length > 0 && (
        <div className="card">
          <h2>{t.pace}</h2>
          <table className="tbl">
            <tbody>
              {d.pace.map((p, i) => (
                <tr key={i}>
                  <td>{p.name}</td>
                  <td>{p.stage}</td>
                  <td className="num">
                    {p.marks} {t.mark} · {String(p.m2).replace('.', ',')} m²
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
