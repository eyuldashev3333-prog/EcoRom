import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Plus } from 'lucide-react'
import { supabase } from '../supabase'
import Sheet, { type Col } from '../ui/Sheet'
import { exportXlsx, monthName, type XCol } from '../lib/xlsx'
import { uz } from '../uz'

const t = uz.tables

interface Row {
  id: string
  raqami: number
  sana: string
  oy: string
  ismi: string
  manzil: string | null
  kontakt: string | null
  rangi: string | null
  alyumin: number
  plast: number
  termo: number
  jami: number
  soni: number
  dogovor: number
  berdi: number
  qoldiq: number
  mahsulot: number
  sbor: number
  jami_tani: number
  foyda: number
  ornatilish: string | null
  status: string
  is_imported: boolean
}

const STATUS_OPTS = Object.entries(uz.order.statuses).map(([value, label]) => ({ value, label }))

// REGISTRATSIYA: все заказы по месяцам — те же колонки, что в Google Sheet; заполняется сама, ячейки правятся прямо здесь
export default function Registratsiya() {
  const nav = useNavigate()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [month, setMonth] = useState('')
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState('')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('v_registratsiya').select('*').order('raqami', { ascending: true })
    if (error) return setMsg(error.message)
    const rs = ((data as Row[]) ?? []).map((r) => ({ ...r, id: (r as unknown as { id: string }).id }))
    setRows(rs)
    setMonth((m) => m || rs.reduce((a, r) => (r.oy > a ? r.oy : a), ''))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const months = useMemo(() => [...new Set((rows ?? []).map((r) => r.oy))].sort().reverse(), [rows])
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (rows ?? []).filter((r) => (s ? `${r.raqami} ${r.ismi} ${r.kontakt ?? ''}`.toLowerCase().includes(s) : r.oy === month))
  }, [rows, month, q])

  const onEdit = async (r: Row, key: string, value: string) => {
    const { error } =
      key === 'status' ? await supabase.rpc('set_order_status', { p_order: r.id, p_status: value }) : await supabase.rpc('registratsiya_set', { p_order: r.id, p_field: key, p_value: value })
    if (error) return error.message
    await load()
    return null
  }

  const ed = true
  const cols: Col<Row>[] = [
    { key: 'sana', label: 'SANA', type: 'date', width: 96, editable: ed, sticky: true },
    { key: 'raqami', label: 'RAQAMI', width: 72, sticky: true, render: (r) => <a className="xl-link" onClick={() => nav(`/orders/${r.id}`)}>{r.raqami}</a> },
    { key: 'ismi', label: 'ISMI', width: 190, editable: ed, sticky: true },
    { key: 'manzil', label: 'MANZIL', width: 160, editable: ed },
    { key: 'kontakt', label: 'KONTAKT', width: 120, editable: ed },
    { key: 'rangi', label: 'RANGI', width: 90, editable: ed },
    { key: 'alyumin', label: 'ALYUMIN-M2', type: 'num', width: 96, editable: ed, total: true },
    { key: 'plast', label: 'PLAST-M2', type: 'num', width: 88, editable: ed, total: true },
    { key: 'termo', label: 'TERMO-M2', type: 'num', width: 88, editable: ed, total: true },
    { key: 'jami', label: 'JAMI', type: 'num', width: 76, total: true },
    { key: 'soni', label: 'SONI', type: 'num', width: 60, total: true },
    { key: 'dogovor', label: 'DOGOVOR', type: 'money', width: 116, editable: ed, total: true },
    { key: 'berdi', label: 'BERDI', type: 'money', width: 116, total: true },
    { key: 'qoldiq', label: 'QOLDIQ', type: 'money', width: 110, total: true, className: (r) => (r.qoldiq > 0 && r.status !== 'cancelled' ? 'neg' : '') },
    { key: 'mahsulot', label: 'MAHSULOT', type: 'money', width: 116, editable: ed, total: true },
    { key: 'sbor', label: 'SBOR-USLUG', type: 'money', width: 104, editable: ed, total: true },
    { key: 'jami_tani', label: 'JAMI TANI', type: 'money', width: 116, total: true },
    { key: 'foyda', label: 'SHOW-FOYDA', type: 'money', width: 116, total: true },
    { key: 'ornatilish', label: 'ORNATILISH', type: 'date', width: 104, editable: ed },
    {
      key: 'status', label: 'STATUS', type: 'select', width: 150, editable: ed, options: STATUS_OPTS,
      render: (r) => <span className={`status s-${r.status}`}>{uz.order.statuses[r.status]}</span>,
    },
  ]

  const setF = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const addRow = async () => {
    if (!form.full_name?.trim()) return setMsg(t.needName)
    setBusy(true)
    const { data, error } = await supabase.rpc('registratsiya_add', { p: form })
    setBusy(false)
    if (error) return setMsg(error.message)
    setMsg('')
    setForm({})
    setAdding(false)
    setQ('')
    await load()
    const no = (data as { order_no: number }).order_no
    setMsg(`${t.added} №${no}`)
  }

  const exportAll = async () => {
    const xc: XCol[] = cols.map((c) => ({ header: c.label, key: c.key, width: Math.round((c.width ?? 100) / 7), type: c.type === 'select' ? 'text' : (c.type as XCol['type']), total: c.total }))
    const sheets = [...months].reverse().map((m) => ({
      name: monthName(m),
      cols: xc,
      rows: (rows ?? []).filter((r) => r.oy === m).map((r) => ({ ...r, status: uz.order.statuses[r.status] })),
    }))
    await exportXlsx(`REGISTRATSIYA ${new Date().toISOString().slice(0, 10)}.xlsx`, sheets)
  }

  return (
    <div className="table-page">
      <div className="inline head">
        <div>
          <div className="sec-kicker">{t.kicker}</div>
          <h1>REGISTRATSIYA</h1>
        </div>
        <div className="inline">
          <input type="search" className="xl-search" placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="button" onClick={() => setAdding(!adding)}>
            <Plus size={16} strokeWidth={2} /> {t.newRow}
          </button>
          <button type="button" className="ghost" onClick={exportAll} disabled={!rows}>
            <Download size={16} strokeWidth={1.7} /> Excel
          </button>
        </div>
      </div>
      {msg && <div className={`note ${msg.startsWith(t.added) ? 'ok' : 'bad'}`}>{msg}</div>}
      {adding && (
        <form className="card form addrow" onSubmit={(e) => { e.preventDefault(); addRow() }}>
          <h2>{t.newRow}</h2>
          <div className="addgrid">
            {([['full_name', 'ISMI *'], ['phone', 'KONTAKT'], ['address', 'MANZIL'], ['rangi', 'RANGI'], ['alyumin', 'ALYUMIN-M2'], ['plast', 'PLAST-M2'], ['termo', 'TERMO-M2'], ['soni', 'SONI'], ['dogovor', 'DOGOVOR'], ['berdi', 'BERDI (avans)'], ['mahsulot', 'MAHSULOT'], ['sbor', 'SBOR-USLUG']] as const).map(([k, l]) => (
              <label key={k}>
                {l}
                <input value={form[k] ?? ''} onChange={(e) => setF(k, e.target.value)} inputMode={['full_name', 'phone', 'address', 'rangi'].includes(k) ? undefined : 'decimal'} required={k === 'full_name'} />
              </label>
            ))}
          </div>
          <div className="inline">
            <button disabled={busy}>{t.save}</button>
            <button type="button" className="ghost" onClick={() => setAdding(false)}>{t.cancel}</button>
            <small className="muted">{t.newRowHint}</small>
          </div>
        </form>
      )}
      {!q && (
        <div className="tabs">
          {months.map((m) => (
            <button key={m} type="button" className={`tab ${m === month ? 'on' : ''}`} onClick={() => setMonth(m)}>
              {monthName(m)}
            </button>
          ))}
        </div>
      )}
      <p className="muted small" style={{ margin: '0 0 10px' }}>{t.hintReg}</p>
      {rows === null ? <p className="muted">{uz.loading}</p> : <Sheet cols={cols} rows={shown} onEdit={onEdit} />}
    </div>
  )
}
