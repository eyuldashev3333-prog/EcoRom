import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { formatSum } from '../lib/pricing'
import PayrollView, { type PayLine, type PayOut } from '../components/PayrollView'
import { uz } from '../uz'

const t = uz.payroll

// «Ish haqim»: сотрудник видит только своё — начисления за месяц, выплаты и остаток
export default function MyPay() {
  const [month, setMonth] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' }).slice(0, 7))
  const [lines, setLines] = useState<PayLine[] | null>(null)
  const [payouts, setPayouts] = useState<PayOut[]>([])
  const [sum, setSum] = useState<{ accrued: number; paid: number; remaining: number; closed: boolean } | null>(null)

  useEffect(() => {
    setLines(null)
    const m = `${month}-01`
    Promise.all([supabase.rpc('payroll_month', { p_month: m }), supabase.rpc('payroll_payouts', { p_month: m }), supabase.rpc('payroll_summary', { p_month: m })]).then(([l, p, s]) => {
      setLines((l.data as PayLine[]) ?? [])
      setPayouts((p.data as PayOut[]) ?? [])
      const row = ((s.data as { accrued: number; paid: number; remaining: number; closed: boolean }[]) ?? [])[0]
      setSum(row ? { accrued: Number(row.accrued), paid: Number(row.paid), remaining: Number(row.remaining), closed: row.closed } : { accrued: 0, paid: 0, remaining: 0, closed: false })
    })
  }, [month])

  return (
    <>
      <p>
        <Link to="/">←</Link>
      </p>
      <div className="inline head">
        <h1>{t.my}</h1>
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} style={{ width: 'auto' }} />
      </div>
      {sum && (
        <>
          <div className="grid3">
            <div className="card stat">
              <small>{t.accrued}</small>
              <b>{formatSum(sum.accrued)} so‘m</b>
            </div>
            <div className="card stat">
              <small>{t.paid}</small>
              <b>{formatSum(sum.paid)} so‘m</b>
            </div>
            <div className="card stat">
              <small>{t.remaining}</small>
              <b>{formatSum(sum.remaining)} so‘m</b>
            </div>
          </div>
          <p className="muted small">{sum.closed ? t.closedTag : t.openTag}</p>
        </>
      )}
      {lines === null ? <p className="muted">{uz.loading}</p> : <div className="card"><PayrollView lines={lines} payouts={payouts} /></div>}
    </>
  )
}
