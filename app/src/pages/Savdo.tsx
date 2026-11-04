import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download } from 'lucide-react'
import { supabase } from '../supabase'
import Sheet, { type Col } from '../ui/Sheet'
import { exportBlocks, monthName, type XCol } from '../lib/xlsx'
import { uz } from '../uz'

const t = uz.tables
const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n))

interface OrderR { id: string; raqami: number; ismi: string; alyumin: number; plast: number; termo: number; umumiy: number; soni: number; dogovor: number; foyda: number; holati: string }
interface SalR { id: string; name: string; rate: string | null; etap: { id: string; amount: number; date: string }[]; oldi: number; oyligi: number }
interface PrixodR { id: string; date: string; raqami: number; ismi: string; amount: number; note: string | null }
interface RasxodR { id: string; date: string; category: string; category_id: number; amount: number; note: string | null; employee: string | null }
interface Month {
  month: string
  orders: OrderR[]
  salaries: SalR[]
  by_category: { name: string; amount: number }[]
  prixod: PrixodR[]
  rasxod: RasxodR[]
  itog: { hizmat: number; faqat_rasxod: number; sof_foyda: number; prixod: number; kassa_rasxod: number; ostatka: number; oylik: number; rasxod: number; postavshik: number }
  categories: { id: number; name: string }[]
  months: string[]
}

// SAVDO BOLIMI: лист месяца, как у владельца — заказы, зарплата, расходы, приход, итог и касса; всё из системы, деньги правятся в ячейке
export default function Savdo() {
  const nav = useNavigate()
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [d, setD] = useState<Month | null>(null)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('savdo_month', { p_month: `${month}-01` })
    if (error) return setMsg(error.message)
    setMsg('')
    setD(data as Month)
  }, [month])
  useEffect(() => {
    load()
  }, [load])

  const fix = (fn: string) => async (r: { id: string }, key: string, value: string) => {
    const field = key === 'category_id' ? 'category' : key
    const { error } = await supabase.rpc(fn, { p_id: r.id, p_field: field, p_value: value })
    if (error) return error.message
    await load()
    return null
  }

  const ordersCols: Col<OrderR>[] = [
    { key: 'raqami', label: 'ISH №', width: 70, sticky: true, render: (r) => <a className="xl-link" onClick={() => nav(`/orders/${r.id}`)}>{r.raqami}</a> },
    { key: 'ismi', label: 'MIJOZ', width: 200, sticky: true },
    { key: 'alyumin', label: 'ALYUMIN', type: 'num', width: 90, total: true },
    { key: 'plast', label: 'PLAST', type: 'num', width: 90, total: true },
    { key: 'termo', label: 'TERMO', type: 'num', width: 90, total: true },
    { key: 'umumiy', label: 'UMUMIY', type: 'num', width: 90, total: true },
    { key: 'soni', label: 'SONI', type: 'num', width: 64, total: true },
    { key: 'dogovor', label: 'DOGOVOR', type: 'money', width: 120, total: true },
    { key: 'foyda', label: 'FOYDA', type: 'money', width: 120, total: true },
    { key: 'holati', label: 'HOLATI', width: 150, render: (r) => <span className={`status s-${r.holati}`}>{uz.order.statuses[r.holati]}</span> },
  ]
  const etap = (r: SalR, i: number) => (i < 3 ? r.etap[i]?.amount ?? null : r.etap.slice(3).reduce((a, x) => a + Number(x.amount), 0) || null)
  const salRows = (d?.salaries ?? []).map((s) => ({ ...s, e1: etap(s, 0), e2: etap(s, 1), e3: etap(s, 2), e4: etap(s, 3), qoldiq: Number(s.oyligi) - Number(s.oldi) }))
  const salCols: Col<(typeof salRows)[number]>[] = [
    { key: 'name', label: 'HODIM', width: 180, sticky: true },
    { key: 'rate', label: 'KELISHUV', width: 200 },
    { key: 'e1', label: '1-ETAP', type: 'money', width: 110, total: true },
    { key: 'e2', label: '2-ETAP', type: 'money', width: 110, total: true },
    { key: 'e3', label: '3-ETAP', type: 'money', width: 110, total: true },
    { key: 'e4', label: '4-ETAP', type: 'money', width: 110, total: true },
    { key: 'oldi', label: 'JAMI OLDI', type: 'money', width: 120, total: true },
    { key: 'oyligi', label: 'OYLIGI (hisob)', type: 'money', width: 130, total: true },
    { key: 'qoldiq', label: 'QOLDIQ', type: 'money', width: 110, total: true, className: (r) => (r.qoldiq > 0 ? 'neg' : '') },
  ]
  const prixodCols: Col<PrixodR>[] = [
    { key: 'date', label: 'SANA', type: 'date', width: 100, editable: true, sticky: true },
    { key: 'raqami', label: 'ISH №', width: 70 },
    { key: 'ismi', label: 'MIJOZ', width: 200 },
    { key: 'amount', label: 'PRIXOD', type: 'money', width: 130, editable: true, total: true },
    { key: 'note', label: 'IZOH', width: 220, editable: true },
  ]
  const catOpts = (d?.categories ?? []).map((c) => ({ value: String(c.id), label: c.name }))
  const rasxodCols: Col<RasxodR>[] = [
    { key: 'date', label: 'SANA', type: 'date', width: 100, editable: true, sticky: true },
    { key: 'category_id', label: 'KATEGORIYA', type: 'select', width: 170, editable: true, options: catOpts, render: (r) => r.category },
    { key: 'note', label: 'SABABI', width: 240, editable: true },
    { key: 'employee', label: 'XODIM', width: 140 },
    { key: 'amount', label: 'SUMMA', type: 'money', width: 130, editable: true, total: true },
  ]
  const catRows = (d?.by_category ?? []).map((c) => ({ id: c.name, ...c }))
  const catCols: Col<(typeof catRows)[number]>[] = [
    { key: 'name', label: 'RASXOD TURI', width: 220 },
    { key: 'amount', label: 'SUMMA', type: 'money', width: 140, total: true },
  ]

  const xc = <R,>(cols: Col<R>[]): XCol[] =>
    cols.map((c) => ({ header: c.label, key: c.key, width: Math.round((c.width ?? 100) / 7), type: c.type === 'select' ? 'text' : (c.type as XCol['type']), total: c.total }))
  const exportMonth = async () => {
    if (!d) return
    const it = d.itog
    await exportBlocks(`SAVDO BOLIMI ${monthName(month)}.xlsx`, monthName(month), [
      { title: 'BUYURTMALAR', cols: xc(ordersCols), rows: d.orders.map((o) => ({ ...o, holati: uz.order.statuses[o.holati] })) },
      { title: 'ISH HAQI', cols: xc(salCols), rows: salRows },
      { title: 'RASXOD TURLARI', cols: xc(catCols), rows: catRows },
      { title: 'PRIXOD', cols: xc(prixodCols), rows: d.prixod.map((p) => ({ ...p })) },
      { title: 'RASXOD', cols: xc(rasxodCols), rows: d.rasxod.map((r) => ({ ...r, category_id: r.category })) },
      {
        title: 'FOYDA HISOBI · KASSA HISOBI',
        cols: [{ header: 'HIZMAT', key: 'a', type: 'money', width: 16 }, { header: 'FAQAT-RASXOD', key: 'b', type: 'money', width: 16 }, { header: 'SOF-FOYDA', key: 'c', type: 'money', width: 16 }, { header: 'PRIXOD', key: 'd', type: 'money', width: 16 }, { header: 'RASXOD', key: 'e', type: 'money', width: 16 }, { header: 'OSTATKA KASSA', key: 'f', type: 'money', width: 16 }],
        rows: [{ a: it.hizmat, b: it.faqat_rasxod, c: it.sof_foyda, d: it.prixod, e: it.kassa_rasxod, f: it.ostatka }],
      },
    ])
  }

  const months = d?.months?.length ? d.months : [month]
  return (
    <div className="table-page">
      <div className="inline head">
        <div>
          <div className="sec-kicker">{t.kicker}</div>
          <h1>SAVDO BOLIMI</h1>
        </div>
        <button type="button" className="ghost" onClick={exportMonth} disabled={!d}>
          <Download size={16} strokeWidth={1.7} /> Excel · {monthName(month)}
        </button>
      </div>
      {msg && <div className="note bad">{msg}</div>}
      <div className="tabs">
        {months.map((m) => (
          <button key={m} type="button" className={`tab ${m === month ? 'on' : ''}`} onClick={() => setMonth(m)}>
            {monthName(m)}
          </button>
        ))}
      </div>
      {!d ? (
        <p className="muted">{uz.loading}</p>
      ) : (
        <>
          <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            {[
              ['HIZMAT', d.itog.hizmat, ''],
              ['FAQAT-RASXOD', d.itog.faqat_rasxod, ''],
              ['SOF-FOYDA', d.itog.sof_foyda, d.itog.sof_foyda < 0 ? 'k-red' : 'k-green'],
              ['PRIXOD', d.itog.prixod, ''],
              ['RASXOD (kassa)', d.itog.kassa_rasxod, ''],
              ['OSTATKA KASSA', d.itog.ostatka, d.itog.ostatka < 0 ? 'k-red' : ''],
            ].map(([l, v, c]) => (
              <div key={l as string} className={`kpi ${c}`}>
                <span className="kpi-label">{l}</span>
                <span className="kpi-value">{fmt(Number(v))}</span>
              </div>
            ))}
          </div>
          <p className="muted small" style={{ margin: '0 0 14px' }}>{t.hintSavdo}</p>
          <section className="xl-block">
            <h2>Buyurtmalar ({d.orders.length})</h2>
            <Sheet cols={ordersCols} rows={d.orders} />
          </section>
          <section className="xl-block">
            <h2>Ish haqi</h2>
            {salRows.length ? <Sheet cols={salCols} rows={salRows} /> : <p className="muted small">{t.noSalary}</p>}
          </section>
          <div className="cols">
            <section className="xl-block">
              <h2>Rasxod turlari</h2>
              <Sheet cols={catCols} rows={catRows} />
            </section>
            <section className="xl-block">
              <h2>Prixod ({d.prixod.length})</h2>
              <Sheet cols={prixodCols} rows={d.prixod} onEdit={fix('payment_correct')} />
            </section>
          </div>
          <section className="xl-block">
            <h2>Rasxod ({d.rasxod.length})</h2>
            <Sheet cols={rasxodCols} rows={d.rasxod} onEdit={fix('expense_correct')} />
          </section>
        </>
      )}
    </div>
  )
}
