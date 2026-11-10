import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { formatSum } from '../lib/pricing'
import PayrollView, { type PayLine, type PayOut } from '../components/PayrollView'
import { uz } from '../uz'
import MonthPicker from '../ui/MonthPicker'

const t = uz.payroll

// «Ish haqim»: сотрудник видит только своё — начисления за месяц, выплаты и остаток
export default function MyPay() {
  const [month, setMonth] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' }).slice(0, 7))
  const [lines, setLines] = useState<PayLine[] | null>(null)
  const [payouts, setPayouts] = useState<PayOut[]>([])
  const [sum, setSum] = useState<{ accrued: number; paid: number; remaining: number; closed: boolean } | null>(null)
  const [output, setOutput] = useState<{ stage_code: string; stage_name: string; windows: number; m2: number; orders: number }[] | null>(null)

  useEffect(() => {
    setLines(null)
    setOutput(null)
    const m = `${month}-01`
    Promise.all([supabase.rpc('payroll_month', { p_month: m }), supabase.rpc('payroll_payouts', { p_month: m }), supabase.rpc('payroll_summary', { p_month: m }), supabase.rpc('my_output', { p_month: m })]).then(([l, p, s, o]) => {
      setOutput(((o.data as typeof output) ?? []).map((x) => ({ ...x, windows: Number(x.windows), m2: Number(x.m2), orders: Number(x.orders) })))
      setLines((l.data as PayLine[]) ?? [])
      setPayouts((p.data as PayOut[]) ?? [])
      const row = ((s.data as { accrued: number; paid: number; remaining: number; closed: boolean }[]) ?? [])[0]
      setSum(row ? { accrued: Number(row.accrued), paid: Number(row.paid), remaining: Number(row.remaining), closed: row.closed } : { accrued: 0, paid: 0, remaining: 0, closed: false })
    })
  }, [month])

  return (
    <>
      <div className="inline head">
        <h1>{t.my}</h1>
        <MonthPicker value={month} onChange={setMonth} />
      </div>
      {sum && (
        <>
          <div className="grid3">
            <div className="card stat t-green">
              <small>{t.accrued}</small>
              <b>{formatSum(sum.accrued)} so‘m</b>
            </div>
            <div className="card stat t-green">
              <small>{t.paid}</small>
              <b>{formatSum(sum.paid)} so‘m</b>
            </div>
            <div className={`card stat ${sum.remaining > 0 ? 't-orange' : ''}`}>
              <small>{t.remaining}</small>
              <b>{formatSum(sum.remaining)} so‘m</b>
            </div>
          </div>
          <p className="muted small">{sum.closed ? t.closedTag : t.openTag}</p>
        </>
      )}
      {output && (
        <div className="card">
          <h3>{t.done}</h3>
          {output.length === 0 && <p className="muted">{t.doneNone}</p>}
          {output.length > 0 && (
            <table className="tbl">
              <tbody>
                {output.map((x) => (
                  <tr key={x.stage_code}>
                    <td>{x.stage_name}<br /><small className="muted">{x.windows} {t.doneWindows} · {x.orders} {t.doneOrders}</small></td>
                    <td className="num">{String(Math.round(x.m2 * 100) / 100).replace('.', ',')} {t.doneM2}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {lines === null ? <p className="muted">{uz.loading}</p> : <div className="card"><PayrollView lines={lines} payouts={payouts} /></div>}
    </>
  )
}
