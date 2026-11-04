import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { formatSum } from '../lib/pricing'
import { uz } from '../uz'

const t = uz.suppliers

interface Row {
  supplier_id: string
  name: string
  city: string | null
  phone: string | null
  purchased: number
  paid: number
  debt: number
}
interface Hist {
  id: string
  kind: 'purchase' | 'payment'
  date: string
  amount: number
  note: string | null
  reverses_id: string | null
}

// поставщики: долг = закупки + доставка − оплаты; оплата — журнал (отмена встречной записью)
export default function Suppliers() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [form, setForm] = useState({ name: '', city: '', phone: '' })
  const [open, setOpen] = useState<string | null>(null)
  const [hist, setHist] = useState<Hist[]>([])
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('v_supplier_debt').select('*').eq('is_active', true).order('name')
    setRows(((data as Row[]) ?? []).map((r) => ({ ...r, purchased: Number(r.purchased), paid: Number(r.paid), debt: Number(r.debt) })))
  }, [])
  const loadHist = useCallback(async (id: string) => {
    const [p, s] = await Promise.all([
      supabase.from('purchases').select('id, purchased_at, total, delivery_cost, note, reverses_id').eq('supplier_id', id),
      supabase.from('supplier_payments').select('id, paid_at, amount, note, reverses_id').eq('supplier_id', id),
    ])
    const a: Hist[] = ((p.data as { id: string; purchased_at: string; total: number; delivery_cost: number; note: string | null; reverses_id: string | null }[]) ?? []).map((x) => ({
      id: x.id, kind: 'purchase', date: x.purchased_at, amount: Number(x.total) + Number(x.delivery_cost), note: x.note, reverses_id: x.reverses_id,
    }))
    const b: Hist[] = ((s.data as { id: string; paid_at: string; amount: number; note: string | null; reverses_id: string | null }[]) ?? []).map((x) => ({
      id: x.id, kind: 'payment', date: x.paid_at, amount: Number(x.amount), note: x.note, reverses_id: x.reverses_id,
    }))
    setHist([...a, ...b].sort((x, y) => y.date.localeCompare(x.date)))
  }, [])
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    if (open) loadHist(open)
  }, [open, loadHist])

  const add = async () => {
    setBusy(true)
    const { error } = await supabase.from('suppliers').insert({ name: form.name.trim(), city: form.city.trim() || null, phone: form.phone.trim() || null })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: error.code === '23505' ? t.exists : error.message })
    setForm({ name: '', city: '', phone: '' })
    setMsg(null)
    load()
  }
  const pay = async (id: string) => {
    setBusy(true)
    const { error } = await supabase.rpc('record_supplier_payment', { p_supplier: id, p_amount: Number(amount.replace(/\D/g, '')), p_date: date, p_note: note })
    setBusy(false)
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: t.paidOk })
    if (!error) {
      setAmount('')
      setNote('')
      load()
      loadHist(id)
    }
  }
  const reversePay = async (h: Hist) => {
    const reason = window.prompt(`${formatSum(h.amount)} — ${uz.money.reverseReason}`)
    if (reason === null) return
    const { error } = await supabase.rpc('reverse_supplier_payment', { p_payment: h.id, p_note: reason })
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: uz.money.reversedOk })
    load()
    if (open) loadHist(open)
  }

  const totalDebt = (rows ?? []).reduce((s, r) => s + Math.max(0, r.debt), 0)
  const reversed = new Set(hist.filter((h) => h.reverses_id).map((h) => h.reverses_id))

  return (
    <>
      <p className="crumbs">
        <Link to="/purchases">{uz.purchase.title}</Link> · <Link to="/stock">{uz.stock.title}</Link>
      </p>
      <h1>{t.title}</h1>
      {msg && <div className={msg.ok ? 'card note ok' : 'card note bad'}>{msg.text}</div>}
      <div className="card stat">
        <small>{t.totalDebt}</small>
        <b className={totalDebt > 0 ? 'debt-tag' : ''}>{formatSum(totalDebt)} so‘m</b>
      </div>

      <div className="card form">
        <div className="grid3">
          <label>
            {t.name}
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            {t.city}
            <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </label>
          <label>
            {t.phone}
            <input value={form.phone} inputMode="tel" onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
        </div>
        <button onClick={add} disabled={busy || !form.name.trim()}>
          + {t.add}
        </button>
      </div>

      {rows === null && <p className="muted">{uz.loading}</p>}
      {rows?.map((r) => (
        <div key={r.supplier_id} className={`card ${open === r.supplier_id ? 'form' : ''}`}>
          <div className="row order-row" style={{ cursor: 'pointer' }} onClick={() => setOpen(open === r.supplier_id ? null : r.supplier_id)}>
            <b>{r.name}</b>
            <span className="muted">{[r.city, r.phone].filter(Boolean).join(' · ')}</span>
            <span className="spacer" />
            <span className="muted small">
              {t.purchased}: {formatSum(r.purchased)} · {t.paid}: {formatSum(r.paid)}
            </span>
            <b className={r.debt > 0 ? 'debt-tag' : ''}>
              {r.debt < 0 ? `${t.advance}: ${formatSum(-r.debt)}` : `${t.debt}: ${formatSum(r.debt)}`}
            </b>
          </div>
          {open === r.supplier_id && (
            <>
              <div className="grid3">
                <label>
                  {t.payAmount}
                  <input inputMode="numeric" value={amount ? formatSum(Number(amount.replace(/\D/g, ''))) : ''} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
                </label>
                <label>
                  {uz.money.date}
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label>
                  {uz.money.note}
                  <input value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
              </div>
              <div className="inline wrap">
                {r.debt > 0 && (
                  <button type="button" className="ghost small-btn" onClick={() => setAmount(String(Math.round(r.debt)))}>
                    {uz.money.rest}
                  </button>
                )}
                <button onClick={() => pay(r.supplier_id)} disabled={busy || !amount}>
                  {t.pay}
                </button>
              </div>
              <h3>{t.history}</h3>
              <table className="tbl">
                <tbody>
                  {hist.map((h) => (
                    <tr key={h.id} className={h.reverses_id || reversed.has(h.id) ? 'struck' : ''}>
                      <td>{h.date.split('-').reverse().join('.')}</td>
                      <td>
                        {h.kind === 'purchase' ? t.purchaseRow : t.paymentRow}
                        {h.note ? <small className="muted"> · {h.note}</small> : null}
                      </td>
                      <td className="num">{h.kind === 'purchase' ? '+' : '−'}{formatSum(Math.abs(h.amount))}</td>
                      <td>
                        {h.kind === 'payment' && !h.reverses_id && !reversed.has(h.id) && (
                          <button className="ghost small-btn" onClick={() => reversePay(h)}>
                            {uz.money.reverse}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      ))}
    </>
  )
}
