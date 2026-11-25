import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { uz } from '../uz'

interface Delivery {
  job_id: string
  order_id: string
  order_no: number
  plan_date: string | null
  job_status: string
  order_status: string
  address: string | null
  contact_phone: string | null
  driver_accepted_at: string | null
  driver_delivered_at: string | null
  crew: string | null
}
const t = uz.driver
const dmy = (d: string | null) => (d ? d.split('-').reverse().join('.') : '')
const hm = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit' })

// Водитель: свои рейсы (номер, адрес, телефон, дата, бригада) — без цен и денег; «Qabul qildim» → «Yetkazib berdim»
export default function DeliveryList() {
  const [rows, setRows] = useState<Delivery[] | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const load = useCallback(async () => {
    const { data } = await supabase.from('w_deliveries').select('*').order('plan_date', { ascending: true, nullsFirst: false })
    setRows((data as Delivery[]) ?? [])
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const act = async (job: string, action: 'accept' | 'delivered') => {
    setBusy(job + action)
    setErr('')
    const { data, error } = await supabase.rpc('driver_action', { p_job: job, p_action: action })
    setBusy('')
    if (error) return setErr(error.message)
    if (data && data.ok === false) return setErr(data.error ?? '')
    await load()
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' })
  const open = (rows ?? []).filter((r) => !r.driver_delivered_at)
  const done = (rows ?? []).filter((r) => !!r.driver_delivered_at)
  const card = (r: Delivery) => (
    <div key={r.job_id} className="card">
      <div className="inline wrap" style={{ justifyContent: 'space-between' }}>
        <b>№{r.order_no}</b>
        <span className={r.plan_date && r.plan_date <= today && !r.driver_delivered_at ? 'warn' : 'muted'}>{dmy(r.plan_date)}</span>
      </div>
      {r.address ? <div>📍 {r.address}</div> : <div className="muted">—</div>}
      {r.contact_phone && (
        <div>
          📞 <a href={`tel:${r.contact_phone}`}>{r.contact_phone}</a>
        </div>
      )}
      {r.crew && <div className="muted small">{t.crew}: {r.crew}</div>}
      {r.driver_delivered_at ? (
        <div className="muted small">📦 {t.delivered} · {hm(r.driver_delivered_at)}</div>
      ) : (
        <div className="inline wrap" style={{ marginTop: 8 }}>
          {!r.driver_accepted_at && (
            <button type="button" disabled={!!busy} onClick={() => act(r.job_id, 'accept')}>
              {t.accept}
            </button>
          )}
          {r.driver_accepted_at && <span className="muted small">✅ {t.accepted} · {hm(r.driver_accepted_at)}</span>}
          <button type="button" className={r.driver_accepted_at ? '' : 'ghost'} disabled={!!busy} onClick={() => act(r.job_id, 'delivered')}>
            {t.deliver}
          </button>
        </div>
      )}
    </div>
  )

  return (
    <>
      {err && <div className="note bad">{err}</div>}
      {rows === null && <p className="muted">{uz.loading}</p>}
      {rows && open.length === 0 && <p className="muted">{t.none}</p>}
      {open.map(card)}
      {done.length > 0 && (
        <>
          <h3>{t.doneTitle}</h3>
          {done.map(card)}
        </>
      )}
    </>
  )
}
