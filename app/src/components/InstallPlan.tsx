import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { uz } from '../uz'

const t = uz.install

interface Man {
  id: string
  full_name: string
}
interface Job {
  id: string
  plan_date: string | null
  status: string
  note: string | null
  install_job_members: { employee_id: string }[]
}

// Rahbar: назначить монтаж (люди + дата) → монтажникам уходит сообщение в Telegram
export default function InstallPlan({ orderId, status }: { orderId: string; status: string }) {
  const [men, setMen] = useState<Man[]>([])
  const [job, setJob] = useState<Job | null>(null)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [crew, setCrew] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [m, j] = await Promise.all([
      supabase.from('employees').select('id, full_name').eq('role', 'montajchi').eq('is_active', true).order('full_name'),
      supabase.from('install_jobs').select('id, plan_date, status, note, install_job_members(employee_id)').eq('order_id', orderId).order('created_at', { ascending: false }).limit(1),
    ])
    setMen((m.data as Man[]) ?? [])
    const cur = ((j.data as Job[]) ?? [])[0] ?? null
    setJob(cur)
    if (cur) {
      if (cur.plan_date) setDate(cur.plan_date)
      setCrew(cur.install_job_members.map((x) => x.employee_id))
      setNote(cur.note ?? '')
    }
  }, [orderId])
  useEffect(() => {
    load()
  }, [load])

  if (!['in_production', 'ready', 'installing'].includes(status) && !job) return null
  const locked = !['in_production', 'ready', 'installing'].includes(status)

  const save = async () => {
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.rpc('assign_install', { p_order: orderId, p_date: date, p_members: crew, p_note: note })
    setBusy(false)
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: t.saved })
    if (!error) load()
  }

  return (
    <div className="card form">
      <h2>
        {t.assign} {job && <span className="status">{t.jobStatus[job.status]}</span>}
      </h2>
      {msg && <div className={msg.ok ? 'note ok' : 'note bad'}>{msg.text}</div>}
      {men.length === 0 ? (
        <p className="warn">{t.noCrew}</p>
      ) : (
        <>
          <div className="grid2">
            <label>
              {t.date}
              <input type="date" value={date} disabled={locked} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
              {t.note}
              <input value={note} disabled={locked} onChange={(e) => setNote(e.target.value)} />
            </label>
          </div>
          <fieldset className="multi">
            <legend>{t.crew}</legend>
            <div className="crew">
              {men.map((m) => (
                <label key={m.id} className="check">
                  <input type="checkbox" checked={crew.includes(m.id)} disabled={locked} onChange={(e) => setCrew(e.target.checked ? [...crew, m.id] : crew.filter((x) => x !== m.id))} /> {m.full_name}
                </label>
              ))}
            </div>
          </fieldset>
          {!locked && (
            <button onClick={save} disabled={busy || crew.length === 0 || !date}>
              {t.save}
            </button>
          )}
        </>
      )}
    </div>
  )
}
