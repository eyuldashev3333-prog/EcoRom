import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { formatSum } from '../lib/pricing'
import { fmtQty, loadStock, stockKey, unitLabel, type StockRow } from '../lib/stock'
import { uz } from '../uz'

const t = uz.purchase
const WHIP_DEFAULT_M = 6 // если в app_settings.bar_length_m ничего нет

interface Supplier {
  id: string
  name: string
  city: string | null
}
interface Line {
  id: string // ключ строки формы
  key: string // stockKey
  qty: string
  price: string
}
interface Purchase {
  id: string
  purchased_at: string
  total: number
  delivery_cost: number
  note: string | null
  reverses_id: string | null
  suppliers: { name: string } | null
  purchase_items: { qty: number; part: string; catalog_items: { name: string } | null }[]
}

const num = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.')) || 0
const today = () => new Date().toISOString().slice(0, 10)

// закупка у поставщика → приход на склад; не оплачено сразу → долг поставщику
export default function Purchases() {
  const [stock, setStock] = useState<StockRow[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [list, setList] = useState<Purchase[]>([])
  const [supplier, setSupplier] = useState('')
  const [date, setDate] = useState(today())
  const [lines, setLines] = useState<Line[]>([])
  const [manualTotal, setManualTotal] = useState('')
  const [delivery, setDelivery] = useState('')
  const [paidNow, setPaidNow] = useState('')
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [barLen, setBarLen] = useState(String(WHIP_DEFAULT_M)) // длина хлыста для помощника «хлысты × метры»; у каждой строки своя
  const [bars, setBars] = useState<Record<string, { n: string; len: string }>>({})

  const loadList = useCallback(async () => {
    const { data } = await supabase
      .from('purchases')
      .select('id, purchased_at, total, delivery_cost, note, reverses_id, suppliers(name), purchase_items(qty, part, catalog_items(name))')
      .order('created_at', { ascending: false })
      .limit(100)
    setList((data as unknown as Purchase[]) ?? [])
  }, [])
  useEffect(() => {
    loadStock().then(setStock)
    supabase.from('suppliers').select('id, name, city').eq('is_active', true).order('name').then(({ data }) => setSuppliers((data as Supplier[]) ?? []))
    loadList()
    supabase.from('app_settings').select('value').eq('key', 'bar_length_m').maybeSingle().then(({ data }) => {
      if (Number(data?.value) > 0) setBarLen(String(data!.value))
    })
  }, [loadList])

  const byKey = useMemo(() => new Map(stock.map((r) => [stockKey(r.item_id, r.part), r])), [stock])
  const byName = useMemo(() => new Map(stock.map((r) => [r.name, r])), [stock])
  const linesTotal = lines.reduce((s, l) => s + Math.round(num(l.qty) * num(l.price) * 100) / 100, 0)
  const total = lines.length ? linesTotal : num(manualTotal)
  const reversed = new Set(list.filter((p) => p.reverses_id).map((p) => p.reverses_id))

  const patch = (i: number, p: Partial<Line>) => setLines((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const pickItem = (i: number, name: string) => {
    const r = byName.get(name)
    patch(i, r ? { key: stockKey(r.item_id, r.part), price: lines[i].price || (r.price ? String(r.price) : '') } : { key: '' })
  }

  const save = async () => {
    if (lines.some((l) => !byKey.has(l.key))) return setMsg({ ok: false, text: `${t.item}?` })
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.rpc('record_purchase', {
      p: {
        supplier_id: supplier,
        purchased_at: date,
        delivery_cost: num(delivery),
        paid_now: num(paidNow),
        note,
        total: num(manualTotal),
        lines: lines.map((l) => {
          const r = byKey.get(l.key)!
          return { item_id: r.item_id, part: r.part, qty: num(l.qty), unit_cost: num(l.price) }
        }),
      },
    })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: error.message })
    setMsg({ ok: true, text: t.saved })
    setLines([])
    setManualTotal('')
    setDelivery('')
    setPaidNow('')
    setNote('')
    loadStock().then(setStock)
    loadList()
  }

  const reverse = async (p: Purchase) => {
    const reason = window.prompt(`${formatSum(p.total)} — ${t.reverseReason}`)
    if (reason === null) return
    const { error } = await supabase.rpc('reverse_purchase', { p_purchase: p.id, p_note: reason })
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: t.reversed })
    loadStock().then(setStock)
    loadList()
  }

  return (
    <>
      <p>
        <Link to="/">←</Link> · <Link to="/stock">{uz.stock.title}</Link> · <Link to="/suppliers">{uz.suppliers.title}</Link>
      </p>
      <h1>{t.title}</h1>
      {msg && <div className={msg.ok ? 'card note ok' : 'card note bad'}>{msg.text}</div>}

      <div className="card form">
        <h2>{t.new}</h2>
        <div className="grid2">
          <label>
            {t.supplier}
            <select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
              <option value="">{t.pick}</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.city ? ` (${s.city})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.date}
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        {suppliers.length === 0 && (
          <p className="warn">
            <Link to="/suppliers">{uz.suppliers.title}</Link> → {uz.suppliers.add}
          </p>
        )}

        <h3>{t.lines}</h3>
        <datalist id="stock-items">
          {stock.map((r) => (
            <option key={stockKey(r.item_id, r.part)} value={r.name} />
          ))}
        </datalist>
        {lines.map((l, i) => {
          const r = byKey.get(l.key)
          const pricier = r && r.price > 0 && num(l.price) > r.price
          return (
            <div key={l.id} className="line-row">
              <label>
                {t.item}
                <input list="stock-items" defaultValue={r?.name ?? ''} onChange={(e) => pickItem(i, e.target.value)} />
              </label>
              <label className="grid-tight">
                {t.qty} {r ? `(${unitLabel(r.unit)})` : ''}
                <input inputMode="decimal" value={l.qty} onChange={(e) => patch(i, { qty: e.target.value })} />
                {r?.unit === 'm' && (
                  <>
                    <div className="inline">
                      <input
                        inputMode="numeric"
                        placeholder={t.barsCount}
                        value={bars[l.id]?.n ?? ''}
                        onChange={(e) => {
                          const b = { n: e.target.value, len: bars[l.id]?.len ?? barLen }
                          setBars((x) => ({ ...x, [l.id]: b }))
                          patch(i, { qty: b.n ? fmtQty(num(b.n) * num(b.len)) : '' })
                        }}
                      />
                      <span>×</span>
                      <input
                        inputMode="decimal"
                        placeholder={t.barLen}
                        value={bars[l.id]?.len ?? barLen}
                        onChange={(e) => {
                          const b = { n: bars[l.id]?.n ?? '', len: e.target.value }
                          setBars((x) => ({ ...x, [l.id]: b }))
                          if (b.n) patch(i, { qty: fmtQty(num(b.n) * num(b.len)) })
                        }}
                      />
                    </div>
                    <small className="muted">{t.whips}</small>
                  </>
                )}
              </label>
              <label>
                {t.price}
                <input inputMode="decimal" value={l.price} onChange={(e) => patch(i, { price: e.target.value })} />
                {pricier && <small className="warn">{t.pricier}</small>}
              </label>
              <div className="inline">
                <span className="sum">{formatSum(num(l.qty) * num(l.price))}</span>
                <button type="button" className="ghost small-btn" onClick={() => setLines((xs) => xs.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
            </div>
          )
        })}
        <button type="button" className="ghost" onClick={() => setLines((xs) => [...xs, { id: Math.random().toString(36).slice(2), key: '', qty: '', price: '' }])}>
          + {t.addLine}
        </button>
        {lines.length === 0 && (
          <label>
            {t.noLines}
            <input inputMode="numeric" value={manualTotal} onChange={(e) => setManualTotal(e.target.value)} />
          </label>
        )}
        <div className="grid3">
          <label>
            {t.delivery}
            <input inputMode="numeric" value={delivery} onChange={(e) => setDelivery(e.target.value)} />
          </label>
          <label>
            {t.paidNow}
            <input inputMode="numeric" value={paidNow} onChange={(e) => setPaidNow(e.target.value)} />
            <small className="muted">{t.paidHint}</small>
          </label>
          <label>
            {t.note}
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <p>
          <b>
            {t.total}: {formatSum(total + num(delivery))} so‘m
          </b>
        </p>
        <button onClick={save} disabled={busy || !supplier || total <= 0}>
          {t.save}
        </button>
      </div>

      <h2>{t.list}</h2>
      <div className="card tbl-wrap">
        <table className="tbl">
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className={p.reverses_id || reversed.has(p.id) ? 'struck' : ''}>
                <td>{p.purchased_at.split('-').reverse().join('.')}</td>
                <td>
                  <b>{p.suppliers?.name}</b>
                  <br />
                  <small className="muted">
                    {p.purchase_items.map((x) => `${x.catalog_items?.name}${x.part ? ` — ${x.part}` : ''} ${fmtQty(Number(x.qty))}`).join('; ')}
                    {p.note ? ` · ${p.note}` : ''}
                  </small>
                </td>
                <td className="num">
                  {formatSum(Number(p.total) + Number(p.delivery_cost))}
                </td>
                <td>
                  {!p.reverses_id && !reversed.has(p.id) && (
                    <button className="ghost small-btn" onClick={() => reverse(p)}>
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
