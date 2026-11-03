import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { formatSum } from '../lib/pricing'
import { uz } from '../uz'

const t = uz.money

interface Payment {
  id: string
  amount: number
  paid_at: string
  note: string | null
  reverses_id: string | null
  employees: { full_name: string } | null
}
const NEXT: Record<string, string[]> = {
  unknown: [],
  new: ['cancelled'], // в производство — только кнопкой «Sexga yuborish» (цех получает заказ)
  in_production: ['ready', 'cancelled'],
  ready: ['installing', 'installed'],
  installing: ['installed'],
  installed: ['closed'],
  closed: [],
  cancelled: ['new'],
}

// оплаты (журнал: только добавление и отмена встречной записью) + смена статуса заказа
export default function OrderMoney({ orderId, contract, status, imported = false, onChanged }: { orderId: string; contract: number; status: string; imported?: boolean; onChanged: () => void }) {
  const [payments, setPayments] = useState<Payment[]>([])
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('payments').select('id, amount, paid_at, note, reverses_id, employees!received_by(full_name)').eq('order_id', orderId).order('created_at')
    setPayments(((data as unknown as Payment[]) ?? []).map((p) => ({ ...p, amount: Number(p.amount) })))
  }, [orderId])
  useEffect(() => {
    load()
  }, [load])

  const paid = payments.reduce((s, p) => s + p.amount, 0)
  const debt = contract - paid
  const reversed = new Set(payments.filter((p) => p.reverses_id).map((p) => p.reverses_id))

  const call = async (fn: string, args: Record<string, unknown>, okText: string) => {
    setBusy(true)
    const { error } = await supabase.rpc(fn, args)
    if (!error) {
      await load() // сначала свежие цифры, потом сообщение
      onChanged()
    }
    setBusy(false)
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: okText })
    return !error
  }

  const pay = async () => {
    const n = Number(amount.replace(/\D/g, ''))
    if (!n) return setMsg({ ok: false, text: t.badAmount })
    if (n > debt && !window.confirm(t.overpay)) return
    if (await call('record_payment', { p_order: orderId, p_amount: n, p_date: date, p_note: note }, t.recorded)) {
      setAmount('')
      setNote('')
    }
  }
  const reverse = (p: Payment) => {
    const reason = window.prompt(`${formatSum(p.amount)} — ${t.reverseReason}`)
    if (reason === null) return
    call('reverse_payment', { p_payment: p.id, p_note: reason }, t.reversedOk)
  }
  const setStatus = (s: string) => {
    if (s === 'cancelled' && !window.confirm(t.cancelConfirm)) return
    call('set_order_status', { p_order: orderId, p_status: s }, uz.order.statuses[s])
  }

  return (
    <div className="card form">
      <h2>{t.title}</h2>
      {msg && <div className={msg.ok ? 'note ok' : 'note bad'}>{msg.text}</div>}
      <div className="grid3">
        <div className="stat"><small>{uz.order.contract}</small><b>{formatSum(contract)}</b></div>
        <div className="stat"><small>{t.paid}</small><b>{formatSum(paid)}</b></div>
        <div className={debt > 0 ? 'stat debt' : 'stat ok'}><small>{t.debt}</small><b>{formatSum(debt)}</b></div>
      </div>

      {payments.length > 0 && (
        <table className="kv pays">
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className={p.reverses_id || reversed.has(p.id) ? 'struck' : ''}>
                <td>{p.paid_at}</td>
                <td>
                  {p.note ?? ''} <small>{p.employees?.full_name}</small>
                </td>
                <td>{formatSum(p.amount)}</td>
                <td>
                  {!p.reverses_id && !reversed.has(p.id) && (
                    <button type="button" className="ghost small-btn" onClick={() => reverse(p)} disabled={busy}>
                      {t.reverse}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {status !== 'cancelled' && (
        <div className="pay-form">
          <div className="inline wrap">
            {[0.5, 0.7].map((f) => (
              <button key={f} type="button" className="ghost small-btn" onClick={() => setAmount(String(Math.round(contract * f)))}>
                {Math.round(f * 100)}%
              </button>
            ))}
            {debt > 0 && (
              <button type="button" className="ghost small-btn" onClick={() => setAmount(String(Math.round(debt)))}>
                {t.rest}
              </button>
            )}
          </div>
          <div className="grid3">
            <label>
              {t.amount}
              <input inputMode="numeric" value={amount ? formatSum(Number(amount.replace(/\D/g, ''))) : ''} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
            </label>
            <label>
              {t.date}
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
              {t.note}
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.notePh} />
            </label>
          </div>
          <button type="button" onClick={pay} disabled={busy || !amount}>
            {t.add}
          </button>
        </div>
      )}

      <h2>{t.status}</h2>
      {/* история без статуса: переключатель «Yopildi» вкл/выкл (закрыть — только без долга) */}
      {imported && (status === 'unknown' || status === 'closed') && (
        <label className="check switch">
          <input
            type="checkbox"
            checked={status === 'closed'}
            disabled={busy || (status === 'unknown' && debt > 0)}
            onChange={(e) => call('set_order_status', { p_order: orderId, p_status: e.target.checked ? 'closed' : 'unknown' }, uz.order.statuses[e.target.checked ? 'closed' : 'unknown'])}
          />
          {uz.order.closedSwitch}
        </label>
      )}
      <div className="inline wrap">
        <span className={`status s-${status}`}>{uz.order.statuses[status]}</span>
        {NEXT[status]?.map((s) => (
          <button key={s} type="button" className={s === 'cancelled' ? 'ghost' : ''} disabled={busy || (s === 'closed' && debt > 0)} onClick={() => setStatus(s)}>
            → {uz.order.statuses[s]}
          </button>
        ))}
      </div>
      {status === 'installed' && debt > 0 && <p className="warn">{t.closeHint}</p>}
    </div>
  )
}
