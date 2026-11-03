import { formatSum } from '../lib/pricing'
import { uz } from '../uz'

const t = uz.payroll

export interface PayLine {
  employee_id: string
  full_name: string
  kind: string
  label: string
  base: number | null
  rate: number | null
  amount: number
  ref: string | null
  closed: boolean
}
export interface PayOut {
  id: string
  employee_id: string
  amount: number
  paid_at: string
  note: string | null
  reverses_id: string | null
}

const num = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')

// строки начислений и выплаты одного сотрудника (общий вид для Rahbar и «Ish haqim»)
export default function PayrollView({ lines, payouts, onReverse }: { lines: PayLine[]; payouts: PayOut[]; onReverse?: (p: PayOut) => void }) {
  const reversed = new Set(payouts.filter((p) => p.reverses_id).map((p) => p.reverses_id))
  return (
    <>
      <h3>{t.lines}</h3>
      {lines.length === 0 && <p className="muted">{t.none}</p>}
      {lines.length > 0 && (
        <table className="tbl">
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className={l.amount < 0 ? 'neg' : ''}>
                <td>
                  {l.label}
                  {(l.base !== null || l.ref) && (
                    <>
                      <br />
                      <small className="muted">
                        {l.base !== null && l.rate !== null && (l.kind === 'percent_sales' ? `${formatSum(Number(l.base))} × ${num(Number(l.rate))}%` : `${num(Number(l.base))} × ${formatSum(Number(l.rate))}`)}
                        {l.ref ? ` ${l.ref}` : ''}
                      </small>
                    </>
                  )}
                </td>
                <td className="num">{formatSum(Number(l.amount))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {payouts.length > 0 && (
        <>
          <h3>{t.payouts}</h3>
          <table className="tbl">
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id} className={p.reverses_id || reversed.has(p.id) ? 'struck' : ''}>
                  <td>{p.paid_at.split('-').reverse().join('.')}</td>
                  <td>{p.note}</td>
                  <td className="num">{formatSum(Number(p.amount))}</td>
                  <td>
                    {onReverse && !p.reverses_id && !reversed.has(p.id) && (
                      <button className="ghost small-btn" onClick={() => onReverse(p)}>
                        {t.reverse}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  )
}
