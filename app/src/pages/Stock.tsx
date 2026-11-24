import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { Dialog } from '../components/Dialog'
import { formatSum } from '../lib/pricing'
import { fmtQty, loadStock, stockKey, unitLabel, type StockRow } from '../lib/stock'
import { uz } from '../uz'

const t = uz.stock

// остатки склада + инвентаризация (факт → разница = утечка)
export default function Stock() {
  const [rows, setRows] = useState<StockRow[] | null>(null)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [nonZero, setNonZero] = useState(false)
  const [counting, setCounting] = useState(false)
  const [facts, setFacts] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [monthLoss, setMonthLoss] = useState(0)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [nm, setNm] = useState({ name: '', unit: '', qty: '', price: '' })
  // приход прямо из строки: «+ Kirim» → сколько куплено и на какую сумму
  const [recv, setRecv] = useState<StockRow | null>(null)
  const [rv, setRv] = useState({ qty: '', total: '', note: '' })
  const [lastRecv, setLastRecv] = useState<string | null>(null) // id закупки — чтобы можно было отменить

  const num = (v: string) => (v.trim() ? Number(v.replace(/\s/g, '').replace(',', '.')) : NaN)
  const receive = async () => {
    if (!recv) return
    const qty = num(rv.qty)
    const total = num(rv.total)
    if (!(qty > 0) || !(total > 0)) return setMsg({ ok: false, text: uz.money.badAmount })
    setBusy(true)
    const { data, error } = await supabase.rpc('stock_receive', { p_item: recv.item_id, p_part: recv.part, p_qty: qty, p_total: total, p_note: rv.note })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: error.message })
    setMsg({ ok: true, text: `${t.recvDone}: ${recv.name} +${fmtQty(qty)} ${unitLabel(recv.unit)} · ${formatSum(total)} so‘m` })
    setLastRecv(data as string)
    setRecv(null)
    setRv({ qty: '', total: '', note: '' })
    load()
  }
  const undoRecv = async () => {
    if (!lastRecv) return
    setBusy(true)
    const { error } = await supabase.rpc('stock_receive_undo', { p_purchase: lastRecv })
    setBusy(false)
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: t.recvUndone })
    if (!error) setLastRecv(null)
    load()
  }

  const addItem = async () => {
    const n = (v: string) => (v.trim() ? Number(v.replace(/\s/g, '').replace(',', '.')) : 0)
    if (!Number.isFinite(n(nm.qty)) || !Number.isFinite(n(nm.price))) return setMsg({ ok: false, text: uz.money.badAmount })
    setBusy(true)
    const { error } = await supabase.rpc('add_stock_item', { p_name: nm.name, p_unit: nm.unit, p_qty: n(nm.qty), p_price: n(nm.price) })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: error.message })
    setMsg({ ok: true, text: t.itemAdded })
    setAdding(false)
    setNm({ name: '', unit: '', qty: '', price: '' })
    load()
  }

  const load = async () => {
    setRows(await loadStock())
    const from = new Date()
    from.setDate(1)
    const { data } = await supabase.from('stock_movements').select('qty, unit_cost').eq('kind', 'adjust').lt('qty', 0).gte('created_at', from.toISOString().slice(0, 10))
    setMonthLoss(((data as { qty: number; unit_cost: number | null }[]) ?? []).reduce((s, m) => s - Number(m.qty) * Number(m.unit_cost ?? 0), 0))
  }
  useEffect(() => {
    load()
  }, [])

  const s = q.trim().toLowerCase()
  const shown = (rows ?? []).filter((r) => (!kind || r.kind === kind) && (!nonZero || r.qty !== 0) && (!s || r.name.toLowerCase().includes(s)))
  const total = (rows ?? []).reduce((sum, r) => sum + r.value, 0)
  const kinds = [...new Set((rows ?? []).map((r) => r.kind))]

  const saveCount = async () => {
    const lines = (rows ?? [])
      .filter((r) => facts[stockKey(r.item_id, r.part)]?.trim())
      .map((r) => ({ item_id: r.item_id, part: r.part, fact: Number(facts[stockKey(r.item_id, r.part)].replace(',', '.')) }))
    if (lines.some((l) => !Number.isFinite(l.fact))) return setMsg({ ok: false, text: uz.money.badAmount })
    setBusy(true)
    const { data, error } = await supabase.rpc('stock_count', { p: { note, lines } })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: error.message })
    setMsg({ ok: true, text: `${t.counted}: ${data.lines}. ${t.loss}: ${formatSum(Number(data.loss))} so‘m` })
    setCounting(false)
    setFacts({})
    setNote('')
    load()
  }

  return (
    <>
      <div className="inline head">
        <h1>{t.title}</h1>
        {!counting && (
          <div className="inline">
            <button className="ghost" onClick={() => setAdding(!adding)}>{t.addItem}</button>
            <button onClick={() => setCounting(true)}>{t.count}</button>
          </div>
        )}
      </div>
      {adding && (
        <div className="card form">
          <h2>{t.addItem}</h2>
          <p className="muted small">{t.addHint}</p>
          <div className="grid2">
            <label>
              {t.itemName}
              <input value={nm.name} maxLength={120} onChange={(e) => setNm({ ...nm, name: e.target.value })} autoFocus />
            </label>
            <label>
              {t.itemUnit}
              <input list="stock-units" value={nm.unit} maxLength={20} onChange={(e) => setNm({ ...nm, unit: e.target.value })} />
              <datalist id="stock-units">
                {['m', 'm²', 'dona', 'kg', 'litr', 'rulon', 'list', 'komplekt', 'qop'].map((u) => <option key={u} value={u} />)}
              </datalist>
            </label>
          </div>
          <div className="grid2">
            <label>
              {t.itemQty}
              <input inputMode="decimal" value={nm.qty} onChange={(e) => setNm({ ...nm, qty: e.target.value })} />
            </label>
            <label>
              {t.itemPrice}
              <input inputMode="decimal" value={nm.price} onChange={(e) => setNm({ ...nm, price: e.target.value })} />
            </label>
          </div>
          <div className="inline wrap">
            <button onClick={addItem} disabled={busy || !nm.name.trim() || !nm.unit.trim()}>{t.itemSave}</button>
            <button className="ghost" onClick={() => setAdding(false)}>{t.cancel}</button>
          </div>
        </div>
      )}
      {msg && (
        <div className={msg.ok ? 'card note ok' : 'card note bad'}>
          {msg.text}{' '}
          {msg.ok && lastRecv && msg.text.startsWith(t.recvDone) && (
            <button type="button" className="ghost small-btn" disabled={busy} onClick={undoRecv}>
              {t.cancel}
            </button>
          )}
        </div>
      )}
      {recv && (
        <Dialog title={`${t.recvTitle}: ${recv.name}`} onClose={() => setRecv(null)}>
          <div className="form">
            <label>
              {t.recvQty} ({unitLabel(recv.unit)})
              <input inputMode="decimal" autoFocus value={rv.qty} onChange={(e) => setRv({ ...rv, qty: e.target.value })} />
            </label>
            <label>
              {t.recvTotal}
              <input inputMode="decimal" value={rv.total} onChange={(e) => setRv({ ...rv, total: e.target.value })} />
            </label>
            {num(rv.qty) > 0 && num(rv.total) > 0 && (
              <p className="muted small">
                1 {unitLabel(recv.unit)} = {formatSum(Math.round((num(rv.total) / num(rv.qty)) * 100) / 100)} so‘m
              </p>
            )}
            <label>
              {t.recvNote}
              <input value={rv.note} onChange={(e) => setRv({ ...rv, note: e.target.value })} />
            </label>
            <p className="muted small">{t.recvHint}</p>
            <div className="dialog-actions">
              <button type="button" className="ghost" onClick={() => setRecv(null)}>
                {t.cancel}
              </button>
              <button type="button" disabled={busy || !(num(rv.qty) > 0) || !(num(rv.total) > 0)} onClick={receive}>
                {t.recvSave}
              </button>
            </div>
          </div>
        </Dialog>
      )}
      <div className="grid">
        <div className="card stat">
          <small>{t.total}</small>
          <b>{formatSum(total)} so‘m</b>
        </div>
        <div className={`card stat ${monthLoss > 0 ? 'debt' : ''}`}>
          <small>{t.monthLoss}</small>
          <b>{formatSum(monthLoss)} so‘m</b>
        </div>
      </div>
      {counting && (
        <div className="card form">
          <p className="muted small">{t.countHint}</p>
          <input placeholder={t.noteCount} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="inline wrap">
            <button onClick={saveCount} disabled={busy || !Object.values(facts).some((v) => v.trim())}>
              {t.saveCount}
            </button>
            <button className="ghost" onClick={() => (setCounting(false), setFacts({}))}>
              {t.cancel}
            </button>
          </div>
        </div>
      )}
      <div className="filters">
        <input type="search" placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">{t.all}</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {uz.catalog.kinds[k] ?? k}
            </option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={nonZero} onChange={(e) => setNonZero(e.target.checked)} /> {t.nonZero}
        </label>
      </div>
      {rows === null && <p className="muted">{uz.loading}</p>}
      {shown.some((r) => r.qty < 0) && <p className="warn">{t.minus}</p>}
      <div className="card tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>{t.item}</th>
              <th className="num">{t.qty}</th>
              {counting ? (
                <>
                  <th className="num">{t.fact}</th>
                  <th className="num">{t.diff}</th>
                </>
              ) : (
                <>
                  <th className="num">{t.value}</th>
                  <th />
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const key = stockKey(r.item_id, r.part)
              const f = facts[key]?.trim() ? Number(facts[key].replace(',', '.')) : null
              const diff = f === null || !Number.isFinite(f) ? null : f - r.qty
              return (
                <tr key={key} className={r.qty < 0 ? 'neg' : ''}>
                  <td>{r.name}</td>
                  <td className="num">
                    {fmtQty(r.qty)} {unitLabel(r.unit)}
                  </td>
                  {counting ? (
                    <>
                      <td className="num">
                        <input inputMode="decimal" value={facts[key] ?? ''} onChange={(e) => setFacts({ ...facts, [key]: e.target.value })} />
                      </td>
                      <td className={`num ${diff !== null && diff < 0 ? 'debt-tag' : ''}`}>{diff === null ? '' : `${diff > 0 ? '+' : ''}${fmtQty(diff)}`}</td>
                    </>
                  ) : (
                    <>
                      <td className="num">{r.value ? formatSum(r.value) : ''}</td>
                      <td className="num">
                        <button type="button" className="ghost small-btn" onClick={() => { setRv({ qty: '', total: '', note: '' }); setRecv(r) }}>
                          + {t.recvBtn}
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
