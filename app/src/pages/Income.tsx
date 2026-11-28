import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { formatSum } from '../lib/pricing'
import { fetchAll } from '../lib/fetchAll'
import { fmtQty, loadStock, stockKey, unitLabel, type StockRow } from '../lib/stock'
import { uz } from '../uz'
import MonthPicker from '../ui/MonthPicker'

const t = uz.income

interface Row {
  id: string
  kind: 'stock' | 'free'
  amount: number
  received_at: string
  title: string
  note: string | null
  qty: number | null
  part: string | null
  reverses_id: string | null
  catalog_items: { unit: string } | null
}

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' })
const nextMonth = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  return mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`
}
const num = (v: string) => (v.trim() ? Number(v.replace(/\s/g, '').replace(',', '.')) : NaN)
// единица части — как part_unit в базе: заглушка в штуках, профиль/резина сетки в метрах
const partUnit = (unit: string, part: string | null) => (part === 'zaglushka' ? 'pcs' : part === 'profil' || part === 'rezina' ? 'm' : unit)

// Moliya → Kirim: деньги мимо заказов — продажа со склада (склад уменьшается) или свободный приход. Касса растёт, прибыль — нет.
export default function Income() {
  const [month, setMonth] = useState(today().slice(0, 7))
  const [rows, setRows] = useState<Row[] | null>(null)
  const [stock, setStock] = useState<StockRow[]>([])
  const [kind, setKind] = useState<'stock' | 'free'>('stock')
  const [f, setF] = useState({ item: '', qty: '', what: '', amount: '', date: today(), note: '' })
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await fetchAll<Row>((a, b) =>
      supabase
        .from('incomes')
        .select('id, kind, amount, received_at, title, note, qty, part, reverses_id, catalog_items(unit)')
        .gte('received_at', `${month}-01`)
        .lt('received_at', nextMonth(month))
        .order('received_at', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id')
        .range(a, b) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
    )
    setRows(data.map((r) => ({ ...r, amount: Number(r.amount), qty: r.qty === null ? null : Number(r.qty) })))
  }, [month])
  const loadStockRows = useCallback(async () => setStock((await loadStock()).filter((r) => r.qty > 0)), [])
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    loadStockRows()
  }, [loadStockRows])

  const sel = stock.find((r) => stockKey(r.item_id, r.part) === f.item) ?? null
  const qty = num(f.qty)
  const amount = num(f.amount)
  const tooMuch = kind === 'stock' && sel !== null && qty > sel.qty
  const ready = amount > 0 && (kind === 'free' ? f.what.trim().length > 0 : sel !== null && qty > 0 && !tooMuch)
  const s = q.trim().toLowerCase()
  const shownStock = stock.filter((r) => !s || r.name.toLowerCase().includes(s) || stockKey(r.item_id, r.part) === f.item)

  const save = async () => {
    if (!ready) return
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.rpc('record_income', {
      p_kind: kind,
      p_amount: amount,
      p_date: f.date,
      p_title: kind === 'free' ? f.what : null,
      p_note: f.note,
      p_item: kind === 'stock' ? sel?.item_id : null,
      p_part: kind === 'stock' ? sel?.part : null,
      p_qty: kind === 'stock' ? qty : null,
    })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: error.message })
    setMsg({ ok: true, text: kind === 'stock' ? t.savedStock : t.saved })
    setF({ ...f, item: '', qty: '', what: '', amount: '', note: '' })
    setQ('')
    if (kind === 'stock') loadStockRows()
    if (f.date.slice(0, 7) === month) load()
    else setMonth(f.date.slice(0, 7))
  }
  const reverse = async (r: Row) => {
    const reason = window.prompt(`${formatSum(r.amount)} — ${t.reverseReason}`)
    if (reason === null) return
    const { error } = await supabase.rpc('reverse_income', { p_id: r.id, p_note: reason })
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: t.reversed })
    load()
    if (r.kind === 'stock') loadStockRows()
  }

  const reversed = new Set((rows ?? []).filter((r) => r.reverses_id).map((r) => r.reverses_id))
  const total = (rows ?? []).reduce((a, r) => a + r.amount, 0) // все строки месяца со знаком: отмены уже с минусом

  return (
    <>
      <div className="inline head">
        <h1>{t.title}</h1>
        <MonthPicker value={month} onChange={setMonth} />
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

      <div className="card form">
        <h2>{t.add}</h2>
        <div className="inline" role="tablist">
          <button type="button" role="tab" aria-selected={kind === 'stock'} className={kind === 'stock' ? '' : 'ghost'} onClick={() => setKind('stock')}>
            {t.kindStock}
          </button>
          <button type="button" role="tab" aria-selected={kind === 'free'} className={kind === 'free' ? '' : 'ghost'} onClick={() => setKind('free')}>
            {t.kindFree}
          </button>
        </div>

        {kind === 'stock' ? (
          <>
            {stock.length === 0 && <p className="muted">{t.noStock}</p>}
            <div className="grid2">
              <label>
                {t.material}
                <input placeholder={uz.stock.search} value={q} onChange={(e) => setQ(e.target.value)} />
                <select value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })}>
                  <option value="">{t.pick}</option>
                  {shownStock.map((r) => (
                    <option key={stockKey(r.item_id, r.part)} value={stockKey(r.item_id, r.part)}>
                      {r.name} · {t.left} {fmtQty(r.qty)} {unitLabel(r.unit)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t.qty}
                {sel ? ` (${unitLabel(sel.unit)})` : ''}
                <input inputMode="decimal" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
                {tooMuch && sel && (
                  <small className="debt-tag">
                    {t.tooMuch} {fmtQty(sel.qty)} {unitLabel(sel.unit)}
                  </small>
                )}
                {sel && qty > 0 && !tooMuch && (
                  <small className="muted">
                    {t.stockValue}: {formatSum(Math.round(qty * sel.price))} so‘m
                  </small>
                )}
              </label>
            </div>
          </>
        ) : (
          <label>
            {t.what}
            <input placeholder={t.whatPh} value={f.what} onChange={(e) => setF({ ...f, what: e.target.value })} />
          </label>
        )}

        <div className="grid3">
          <label>
            {t.amount}
            <input inputMode="numeric" value={f.amount ? formatSum(Number(f.amount.replace(/\D/g, ''))) : ''} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/\D/g, '') })} />
          </label>
          <label>
            {t.date}
            <input type="date" value={f.date} max={today()} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </label>
          <label>
            {t.note}
            <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </label>
        </div>
        <button onClick={save} disabled={busy || !ready}>
          {t.save}
        </button>
      </div>

      <h2>{t.list}</h2>
      {rows === null && <p className="muted">{uz.loading}</p>}
      {rows?.length === 0 && <p className="muted">{t.empty}</p>}
      {rows && rows.length > 0 && (
        <div className="card tbl-wrap">
          <table className="tbl">
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.reverses_id || reversed.has(r.id) ? 'struck' : ''}>
                  <td>{r.received_at.split('-').reverse().slice(0, 2).join('.')}</td>
                  <td>
                    <b>{r.title}</b>
                    <br />
                    <small className="muted">
                      {[
                        r.kind === 'stock' ? `${t.fromStock}${r.qty !== null ? ` ${fmtQty(Math.abs(r.qty))} ${unitLabel(partUnit(r.catalog_items?.unit ?? '', r.part))}` : ''}` : t.kindFree,
                        r.note,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
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
      )}
    </>
  )
}
