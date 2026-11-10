import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { formatSum } from '../lib/pricing'
import PayrollView, { type PayLine, type PayOut } from '../components/PayrollView'
import { uz } from '../uz'
import MonthPicker from '../ui/MonthPicker'

const t = uz.payroll

interface Sum {
  employee_id: string
  full_name: string
  role: string
  accrued: number
  paid: number
  remaining: number
  closed: boolean
}
interface Person {
  id: string
  full_name: string
}

const tashkentToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' })
const monthEnded = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  const next = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`
  return next <= tashkentToday()
}

// зарплата месяца: начислено автоматически по правилам → выплаты частями → остаток; закрытие месяца фиксирует расчёт
export default function Payroll() {
  const [month, setMonth] = useState(tashkentToday().slice(0, 7))
  const [sums, setSums] = useState<Sum[] | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [lines, setLines] = useState<PayLine[]>([])
  const [payouts, setPayouts] = useState<PayOut[]>([])
  const [pay, setPay] = useState({ employee: '', amount: '', date: tashkentToday(), note: '' })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [unpriced, setUnpriced] = useState<{ employee: string; stage: string; base: number; orders: string }[]>([])

  const first = `${month}-01`
  const load = useCallback(async () => {
    const { data } = await supabase.rpc('payroll_summary', { p_month: first })
    setSums(((data as Sum[]) ?? []).map((s) => ({ ...s, accrued: Number(s.accrued), paid: Number(s.paid), remaining: Number(s.remaining) })))
    const { data: up } = await supabase.rpc('payroll_unpriced', { p_month: first })
    setUnpriced(((up as { employee: string; stage: string; base: number; orders: string }[]) ?? []).map((x) => ({ ...x, base: Number(x.base) })))
  }, [first])
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    supabase.from('employees').select('id, full_name').eq('is_active', true).order('full_name').then(({ data }) => setPeople((data as Person[]) ?? []))
  }, [])
  const loadDetail = useCallback(
    async (emp: string) => {
      const [l, p] = await Promise.all([supabase.rpc('payroll_month', { p_month: first, p_employee: emp }), supabase.rpc('payroll_payouts', { p_month: first, p_employee: emp })])
      setLines((l.data as PayLine[]) ?? [])
      setPayouts((p.data as PayOut[]) ?? [])
    },
    [first],
  )
  useEffect(() => {
    if (open) loadDetail(open)
  }, [open, loadDetail])

  const run = async (fn: string, args: Record<string, unknown>, ok: string) => {
    setBusy(true)
    const { error } = await supabase.rpc(fn, args)
    setBusy(false)
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: ok })
    if (!error) {
      await load()
      if (open) await loadDetail(open)
    }
    return !error
  }

  const closed = sums?.some((s) => s.closed) ?? false
  const totals = (sums ?? []).reduce((a, s) => ({ accrued: a.accrued + s.accrued, paid: a.paid + s.paid }), { accrued: 0, paid: 0 })
  const cur = sums?.find((s) => s.employee_id === (pay.employee || open))

  const doPay = async () => {
    const emp = pay.employee || open
    if (!emp) return
    if (await run('record_salary_payout', { p_employee: emp, p_amount: Number(pay.amount.replace(/\D/g, '')), p_date: pay.date, p_period: month, p_note: pay.note }, t.paidOk)) setPay({ ...pay, amount: '', note: '' })
  }
  const reverse = (p: PayOut) => {
    const reason = window.prompt(`${formatSum(Number(p.amount))} — ${t.reverseReason}`)
    if (reason !== null) run('reverse_salary_payout', { p_id: p.id, p_note: reason }, t.reversedOk)
  }

  return (
    <>
      <p className="crumbs">
        <Link to="/pay-rules">{t.rules}</Link>
      </p>
      <div className="inline head">
        <h1>{t.title}</h1>
        <MonthPicker value={month} onChange={(v) => (setMonth(v), setOpen(null))} />
      </div>
      <p className="muted small">{t.hint}</p>
      {msg && <div className={msg.ok ? 'card note ok' : 'card note bad'}>{msg.text}</div>}
      {unpriced.length > 0 && (
        <div className="card note bad">
          <b>{t.unpricedTitle}</b>
          {unpriced.map((x) => (
            <div key={x.employee + x.stage}>
              {x.employee} · {x.stage} · {Math.round(x.base * 100) / 100} m² ({x.orders})
            </div>
          ))}
          <small>{t.unpricedHint}</small>
        </div>
      )}

      <div className="grid3">
        <div className="card stat">
          <small>{t.accrued}</small>
          <b>{formatSum(totals.accrued)} so‘m</b>
        </div>
        <div className="card stat">
          <small>{t.paid}</small>
          <b>{formatSum(totals.paid)} so‘m</b>
        </div>
        <div className={`card stat ${totals.accrued - totals.paid > 0 ? 'debt' : ''}`}>
          <small>{t.totalRemaining}</small>
          <b>{formatSum(totals.accrued - totals.paid)} so‘m</b>
        </div>
      </div>

      <div className="card inline wrap" style={{ alignItems: 'center' }}>
        <span className={`status ${closed ? 's-closed' : ''}`}>{closed ? t.closedTag : t.openTag}</span>
        {closed ? (
          <button className="ghost small-btn" disabled={busy} onClick={() => window.confirm(t.reopenConfirm) && run('payroll_reopen', { p_month: first }, t.reopen)}>
            {t.reopen}
          </button>
        ) : monthEnded(month) ? (
          <button className="small-btn" disabled={busy} onClick={() => window.confirm(t.closeConfirm) && run('payroll_close', { p_month: first }, t.close)}>
            {t.close}
          </button>
        ) : (
          <small className="muted">{t.closeLater}</small>
        )}
      </div>

      {sums === null && <p className="muted">{uz.loading}</p>}
      {sums?.length === 0 && <p className="muted">{t.empty}</p>}
      {sums?.map((s) => (
        <div key={s.employee_id} className={`card ${open === s.employee_id ? 'form' : ''}`}>
          <div className="row order-row" style={{ cursor: 'pointer' }} onClick={() => setOpen(open === s.employee_id ? null : s.employee_id)}>
            <b>{s.full_name}</b>
            <span className="muted small">{uz.roles[s.role as keyof typeof uz.roles]}</span>
            <span className="spacer" />
            <span className="muted small">
              {t.accrued}: {formatSum(s.accrued)} · {t.paid}: {formatSum(s.paid)}
            </span>
            <b className={s.remaining > 0 ? 'debt-tag' : ''}>{s.remaining < 0 ? `${t.advance}: ${formatSum(-s.remaining)}` : `${t.remaining}: ${formatSum(s.remaining)}`}</b>
          </div>
          {open === s.employee_id && <PayrollView lines={lines} payouts={payouts} onReverse={reverse} />}
        </div>
      ))}

      <div className="card form">
        <h2>{t.payTitle}</h2>
        <div className="grid3">
          <label>
            {t.employee}
            <select value={pay.employee || open || ''} onChange={(e) => setPay({ ...pay, employee: e.target.value })}>
              <option value="">—</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.amount}
            <input inputMode="numeric" value={pay.amount ? formatSum(Number(pay.amount.replace(/\D/g, ''))) : ''} onChange={(e) => setPay({ ...pay, amount: e.target.value.replace(/\D/g, '') })} />
          </label>
          <label>
            {t.date}
            <input type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} />
          </label>
        </div>
        <label>
          {t.note}
          <input value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} />
        </label>
        <div className="inline wrap">
          {cur && cur.remaining > 0 && (
            <button type="button" className="ghost small-btn" onClick={() => setPay({ ...pay, amount: String(Math.round(cur.remaining)) })}>
              {t.rest}
            </button>
          )}
          <button onClick={doPay} disabled={busy || !(pay.employee || open) || !pay.amount}>
            {t.pay} · {month}
          </button>
        </div>
      </div>
    </>
  )
}
