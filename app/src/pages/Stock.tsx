import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
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
      <p>
        <Link to="/">←</Link>
      </p>
      <div className="inline head">
        <h1>{t.title}</h1>
        {!counting && <button onClick={() => setCounting(true)}>{t.count}</button>}
      </div>
      {msg && <div className={msg.ok ? 'card note ok' : 'card note bad'}>{msg.text}</div>}
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
                <th className="num">{t.value}</th>
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
                    <td className="num">{r.value ? formatSum(r.value) : ''}</td>
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
