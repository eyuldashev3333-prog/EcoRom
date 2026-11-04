import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { formatSum } from '../lib/pricing'
import { uz } from '../uz'

const t = uz.expenses

interface Cat {
  id: number
  name: string
}
interface Row {
  id: string
  amount: number
  spent_at: string
  note: string | null
  source: string
  reverses_id: string | null
  category_id: number
  expense_categories: { name: string } | null
  employees: { full_name: string } | null // кому
  orders: { order_no: number } | null
}
interface Person {
  id: string
  full_name: string
}

const monthOf = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' }).slice(0, 7)
const nextMonth = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  return mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`
}

// расходы: ввод вручную, список за месяц, итоги по категориям; тот же журнал, что пишет бот
export default function Expenses() {
  const [month, setMonth] = useState(monthOf(new Date()))
  const [cats, setCats] = useState<Cat[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [rows, setRows] = useState<Row[] | null>(null)
  const [f, setF] = useState({ category: '', amount: '', date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' }), note: '', who: '', order: '' })
  const [newCat, setNewCat] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('expenses')
      .select('id, amount, spent_at, note, source, reverses_id, category_id, expense_categories(name), employees!for_employee_id(full_name), orders(order_no)')
      .gte('spent_at', `${month}-01`)
      .lt('spent_at', nextMonth(month))
      .order('spent_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1000)
    setRows(((data as unknown as Row[]) ?? []).map((r) => ({ ...r, amount: Number(r.amount) })))
  }, [month])
  useEffect(() => {
    load()
  }, [load])
  const loadCats = useCallback(
    () => supabase.from('expense_categories').select('id, name').eq('is_active', true).order('name').then(({ data }) => setCats((data as Cat[]) ?? [])),
    [],
  )
  useEffect(() => {
    loadCats()
    supabase.from('employees').select('id, full_name').eq('is_active', true).order('full_name').then(({ data }) => setPeople((data as Person[]) ?? []))
  }, [loadCats])

  const save = async () => {
    setBusy(true)
    setMsg(null)
    let orderId: string | null = null
    if (f.order.trim()) {
      const { data } = await supabase.from('orders').select('id').eq('order_no', Number(f.order.replace(/\D/g, ''))).maybeSingle()
      if (!data) {
        setBusy(false)
        return setMsg({ ok: false, text: t.orderNotFound })
      }
      orderId = (data as { id: string }).id
    }
    const { error } = await supabase.rpc('record_expense', {
      p_category: Number(f.category),
      p_amount: Number(f.amount.replace(/\D/g, '')),
      p_date: f.date,
      p_note: f.note,
      p_for: f.who || null,
      p_order: orderId,
    })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: error.message })
    setMsg({ ok: true, text: t.saved })
    setF({ ...f, amount: '', note: '', who: '', order: '' })
    if (f.date.slice(0, 7) === month) load()
    else setMonth(f.date.slice(0, 7))
  }
  const reverse = async (r: Row) => {
    const reason = window.prompt(`${formatSum(r.amount)} — ${t.reverseReason}`)
    if (reason === null) return
    const { error } = await supabase.rpc('reverse_expense', { p_id: r.id, p_note: reason })
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: t.reversed })
    load()
  }
  const addCategory = async () => {
    const { error } = await supabase.from('expense_categories').insert({ name: newCat.trim().toUpperCase() })
    if (error) return setMsg({ ok: false, text: error.code === '23505' ? uz.suppliers.exists : error.message })
    setNewCat('')
    loadCats()
  }

  const reversed = new Set((rows ?? []).filter((r) => r.reverses_id).map((r) => r.reverses_id))
  const total = (rows ?? []).reduce((s, r) => s + r.amount, 0) // встречные записи с минусом — итог уже чистый
  const byCat = new Map<string, number>()
  for (const r of rows ?? []) byCat.set(r.expense_categories?.name ?? '—', (byCat.get(r.expense_categories?.name ?? '—') ?? 0) + r.amount)
  const cats2 = [...byCat.entries()].filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1])

  return (
    <>
      <div className="inline head">
        <h1>{t.title}</h1>
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} style={{ width: 'auto' }} />
      </div>
      <p className="muted small">{t.hint}</p>
      {msg && <div className={msg.ok ? 'card note ok' : 'card note bad'}>{msg.text}</div>}

      <div className="grid">
        <div className="card stat">
          <small>
            {t.total} · {month}
          </small>
          <b>{formatSum(total)} so‘m</b>
        </div>
      </div>
      {cats2.length > 0 && (
        <div className="card">
          <h2>{t.byCategory}</h2>
          <table className="kv">
            <tbody>
              {cats2.map(([name, v]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{formatSum(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card form">
        <h2>{t.add}</h2>
        <div className="grid3">
          <label>
            {t.category}
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              <option value="">{t.pick}</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.amount}
            <input inputMode="numeric" value={f.amount ? formatSum(Number(f.amount.replace(/\D/g, ''))) : ''} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/\D/g, '') })} />
          </label>
          <label>
            {t.date}
            <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </label>
        </div>
        <div className="grid3">
          <label>
            {t.note}
            <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </label>
          <label>
            {t.who}
            <select value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })}>
              <option value="">—</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.order}
            <input inputMode="numeric" value={f.order} onChange={(e) => setF({ ...f, order: e.target.value })} />
          </label>
        </div>
        <button onClick={save} disabled={busy || !f.category || !f.amount}>
          {t.save}
        </button>
        <div className="inline">
          <input placeholder={t.newCategory} value={newCat} onChange={(e) => setNewCat(e.target.value)} />
          <button className="ghost" onClick={addCategory} disabled={!newCat.trim()}>
            {t.addCategory}
          </button>
        </div>
      </div>

      <h2>{t.list}</h2>
      {rows === null && <p className="muted">{uz.loading}</p>}
      {rows?.length === 0 && <p className="muted">{t.empty}</p>}
      <div className="card tbl-wrap">
        <table className="tbl">
          <tbody>
            {rows?.map((r) => (
              <tr key={r.id} className={r.reverses_id || reversed.has(r.id) ? 'struck' : ''}>
                <td>{r.spent_at.split('-').reverse().slice(0, 2).join('.')}</td>
                <td>
                  <b>{r.expense_categories?.name}</b>
                  <br />
                  <small className="muted">
                    {[r.note, r.employees?.full_name, r.orders && `№${r.orders.order_no}`, r.source === 'telegram' && t.telegram].filter(Boolean).join(' · ')}
                  </small>
                </td>
                <td className="num">{formatSum(r.amount)}</td>
                <td>
                  {!r.reverses_id && !reversed.has(r.id) && (
                    <button className="ghost small-btn" onClick={() => reverse(r)}>
                      {t.reverse}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
