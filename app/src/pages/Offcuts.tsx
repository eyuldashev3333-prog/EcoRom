import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { loadStock, type StockRow } from '../lib/stock'
import { PROF_PARTS } from '../lib/cutting'
import { uz } from '../uz'

const t = uz.cutting

interface OffcutRow {
  id: string
  item_id: string
  part: string
  length_mm: number
  note: string | null
  source_order_id: string | null
  created_at: string
  orders: { order_no: number } | null
}

// реестр обрезков профиля: что лежит в цехе («2,1 м», «1,4 м»); добавить вручную, убрать (использовано / выбросили)
export default function Offcuts() {
  const [rows, setRows] = useState<OffcutRow[]>([])
  const [stock, setStock] = useState<StockRow[]>([])
  const [key, setKey] = useState('')
  const [len, setLen] = useState('')
  const [count, setCount] = useState('1')
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('offcuts').select('id, item_id, part, length_mm, note, source_order_id, created_at, orders!source_order_id(order_no)').is('used_at', null).order('length_mm', { ascending: false })
    setRows((data as unknown as OffcutRow[]) ?? [])
  }, [])
  useEffect(() => {
    load()
    loadStock().then((s) => setStock(s.filter((r) => r.kind === 'system' && PROF_PARTS.includes(r.part as never))))
  }, [load])

  const nameOf = useMemo(() => new Map(stock.map((r) => [`${r.item_id}|${r.part}`, r.name])), [stock])
  const groups = useMemo(() => {
    const m = new Map<string, OffcutRow[]>()
    for (const r of rows) m.set(`${r.item_id}|${r.part}`, [...(m.get(`${r.item_id}|${r.part}`) ?? []), r])
    return [...m.entries()]
  }, [rows])
  const totalM = rows.reduce((s, r) => s + r.length_mm, 0) / 1000
  const fmt = (mm: number) => (mm / 1000).toFixed(2).replace('.', ',')

  const add = async () => {
    const [item_id, part] = key.split('|')
    const mm = Math.round(Number(len.replace(',', '.')))
    const n = Math.max(1, Math.min(50, Math.round(Number(count) || 1)))
    if (!item_id || !part || !(mm > 0)) return setMsg({ ok: false, text: t.badInput })
    setBusy(true)
    const { error } = await supabase.from('offcuts').insert(Array.from({ length: n }, () => ({ item_id, part, length_mm: mm, note: note.trim() || null })))
    setBusy(false)
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: t.added })
    if (!error) {
      setLen('')
      setNote('')
      setCount('1')
      load()
    }
  }
  const use = async (r: OffcutRow) => {
    const { error } = await supabase.from('offcuts').update({ used_at: new Date().toISOString() }).eq('id', r.id)
    if (error) setMsg({ ok: false, text: error.message })
    load()
  }
  const remove = async (r: OffcutRow) => {
    if (!window.confirm(t.deleteConfirm)) return
    const { error } = await supabase.from('offcuts').delete().eq('id', r.id)
    if (error) setMsg({ ok: false, text: error.message })
    load()
  }

  return (
    <>
      <p className="crumbs">
        <Link to="/stock">{uz.stock.title}</Link>
      </p>
      <h1>{t.listTitle}</h1>
      <p className="muted small">{t.listHint}</p>
      {msg && <div className={msg.ok ? 'card note ok' : 'card note bad'}>{msg.text}</div>}
      <div className="card stat">
        <small>{t.total}</small>
        <b>
          {rows.length} {t.pcs} · {totalM.toFixed(2).replace('.', ',')} m
        </b>
      </div>

      <div className="card form">
        <h2>{t.add}</h2>
        <label>
          {t.profile}
          <select value={key} onChange={(e) => setKey(e.target.value)}>
            <option value="">—</option>
            {stock.map((r) => (
              <option key={`${r.item_id}|${r.part}`} value={`${r.item_id}|${r.part}`}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid3">
          <label>
            {t.length}
            <input inputMode="numeric" value={len} onChange={(e) => setLen(e.target.value)} placeholder="2100" />
          </label>
          <label>
            {t.count}
            <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
          </label>
          <label>
            {uz.money.note}
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <button type="button" onClick={add} disabled={busy}>
          {t.addBtn}
        </button>
      </div>

      {groups.length === 0 && <p className="muted">{t.empty}</p>}
      {groups.map(([k, list]) => (
        <div key={k} className="card form">
          <h2>
            {nameOf.get(k) ?? k} <small className="muted">· {list.length} {t.pcs}</small>
          </h2>
          {list.map((r) => (
            <div key={r.id} className="inline wrap">
              <b>{fmt(r.length_mm)} m</b>
              <small className="muted">
                {r.orders ? `№${r.orders.order_no} · ` : ''}
                {r.created_at.slice(0, 10)}
                {r.note ? ` · ${r.note}` : ''}
              </small>
              <span className="spacer" />
              <button type="button" className="ghost small-btn" onClick={() => use(r)}>
                {t.usedBtn}
              </button>
              <button type="button" className="ghost small-btn" onClick={() => remove(r)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      ))}
    </>
  )
}
