import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { uz } from '../uz'

const t = uz.payroll

interface Person {
  id: string
  full_name: string
}
interface Absence {
  id: string
  employee_id: string
  day: string
  hours: number | null
  reason: string
  note: string | null
  deduct: boolean
  cancelled: boolean
}
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' })
const dmy = (d: string) => d.split('-').reverse().join('.')

// «Kelmadi»: руководитель отмечает пропуск (дата, весь день или часы, причина, вычитать из оклада или нет)
export default function Absences({ month, people, onChanged }: { month: string; people: Person[]; onChanged: () => void }) {
  const [rows, setRows] = useState<Absence[] | null>(null)
  const [f, setF] = useState({ employee: '', day: today(), hours: '', reason: 'sick', note: '', deduct: true })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('absences_list', { p_month: `${month}-01` })
    setRows(((data as Absence[]) ?? []).map((x) => ({ ...x, hours: x.hours === null ? null : Number(x.hours) })))
  }, [month])
  useEffect(() => {
    load()
  }, [load])

  const name = (id: string) => people.find((p) => p.id === id)?.full_name ?? '—'
  const add = async () => {
    const h = f.hours.trim() ? Number(f.hours.replace(',', '.')) : null
    if (h !== null && (!Number.isFinite(h) || h <= 0 || h > 24)) return setMsg({ ok: false, text: t.absHoursBad })
    setBusy(true)
    const { error } = await supabase.rpc('absence_add', { p_employee: f.employee, p_day: f.day, p_hours: h, p_reason: f.reason, p_note: f.note, p_deduct: f.deduct })
    setBusy(false)
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: t.absAdded })
    if (!error) {
      setF({ ...f, hours: '', note: '' })
      await load()
      onChanged()
    }
  }
  const cancel = async (a: Absence) => {
    if (!window.confirm(t.absCancelConfirm)) return
    const { error } = await supabase.rpc('absence_cancel', { p_id: a.id })
    setMsg(error ? { ok: false, text: error.message } : null)
    await load()
    onChanged()
  }

  return (
    <div className="card form">
      <h2>{t.absTitle}</h2>
      <p className="muted small">{t.absHint}</p>
      {msg && <div className={msg.ok ? 'note ok' : 'note bad'}>{msg.text}</div>}
      <div className="grid3">
        <label>
          {t.employee}
          <select value={f.employee} onChange={(e) => setF({ ...f, employee: e.target.value })}>
            <option value="">—</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.date}
          <input type="date" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} />
        </label>
        <label>
          {t.absHours}
          <input inputMode="decimal" placeholder={t.absWholeDay} value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} />
        </label>
      </div>
      <div className="grid2">
        <label>
          {t.absReason}
          <select value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })}>
            {Object.entries(t.absReasons).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.note}
          <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={f.deduct} onChange={(e) => setF({ ...f, deduct: e.target.checked })} />
        {t.absDeduct}
      </label>
      <button onClick={add} disabled={busy || !f.employee || !f.day}>
        {t.absAdd}
      </button>
      {rows && rows.length > 0 && (
        <table className="tbl">
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className={a.cancelled ? 'struck' : ''}>
                <td>{dmy(a.day)}</td>
                <td>
                  {name(a.employee_id)}
                  <br />
                  <small className="muted">
                    {t.absReasons[a.reason]}
                    {a.note ? ` · ${a.note}` : ''}
                  </small>
                </td>
                <td>{a.hours === null ? t.absWholeDay : `${a.hours} ${t.hourShort}`}</td>
                <td>{a.deduct ? t.absDeductShort : t.absNoDeductShort}</td>
                <td>
                  {!a.cancelled && (
                    <button className="ghost small-btn" onClick={() => cancel(a)}>
                      {t.reverse}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
