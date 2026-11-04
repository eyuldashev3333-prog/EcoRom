import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { signedUrls, uploadPhotos } from '../lib/photo'
import { uz } from '../uz'

const t = uz.service

interface T {
  id: string
  order_id: string
  description: string
  photo_paths: string[]
  work_photo_paths: string[]
  work_done_at: string | null
  work_note: string | null
  due_date: string | null
  status: string
  order_no: number
  client_name: string | null
  address: string | null
  contact_phone: string | null
}

// монтажник: сервис-заявка — что случилось, куда ехать, «Boshladim» / «Bajarildi» с фото
export default function ServiceWork() {
  const { id } = useParams()
  const [tk, setTk] = useState<T | null | undefined>(undefined)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = async () => {
    const { data } = await supabase.from('w_service_tickets').select('*').eq('id', id).maybeSingle()
    const r = data as T | null
    setTk(r)
    if (r) setUrls(await signedUrls([...r.photo_paths, ...r.work_photo_paths]))
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const act = async (action: 'start' | 'done') => {
    if (!tk) return
    setBusy(true)
    setMsg(null)
    try {
      const paths = action === 'done' && files.length ? await uploadPhotos(tk.order_id, 'service', files) : []
      const { error } = await supabase.rpc('service_work', { p_id: tk.id, p_action: action, p_note: note, p_photos: paths })
      if (error) {
        if (paths.length) await supabase.storage.from('install-photos').remove(paths)
        throw error
      }
      setNote('')
      setFiles([])
      await load()
      if (action === 'done') setMsg({ ok: true, text: t.done })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    }
    setBusy(false)
  }

  if (tk === undefined) return <p className="muted">{uz.loading}</p>
  if (tk === null) return <p className="muted">{uz.order.notFound}</p>
  const links = (paths: string[]) => (
    <div className="inline wrap">
      {paths.map((p) => (
        <a key={p} href={urls[p]} target="_blank" rel="noreferrer">
          <img src={urls[p]} alt="" style={{ height: 90, borderRadius: 8 }} />
        </a>
      ))}
    </div>
  )

  return (
    <>
      <p>
        <Link to="/">← {t.back}</Link>
      </p>
      <h1>
        №{tk.order_no} · {t.title} <span className="status">{t.statuses[tk.status]}</span>
      </h1>
      <div className="card">
        <b>{tk.client_name}</b>
        {tk.due_date && <p className="muted">{t.due}: {tk.due_date.split('-').reverse().join('.')}</p>}
        {tk.address && <p>{tk.address}</p>}
        {tk.contact_phone && (
          <p>
            <a className="btn-link" href={`tel:${tk.contact_phone.replace(/[^\d+]/g, '')}`}>
              {tk.contact_phone}
            </a>
          </p>
        )}
        <p>{tk.description}</p>
        {links(tk.photo_paths)}
      </div>
      {msg && <div className={msg.ok ? 'card note ok' : 'card note bad'}>{msg.text}</div>}
      {tk.work_done_at ? (
        <div className="card">
          <b>✔ {t.done}</b>
          {tk.work_note && <p>{tk.work_note}</p>}
          {links(tk.work_photo_paths)}
        </div>
      ) : (
        <div className="card form">
          {tk.status === 'open' && (
            <button type="button" className="ghost" disabled={busy} onClick={() => act('start')}>
              {t.start}
            </button>
          )}
          <label>
            {t.note}
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <label>
            {t.workPhoto}
            <input type="file" accept="image/*" capture="environment" multiple onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, 5))} />
          </label>
          <button type="button" disabled={busy} onClick={() => act('done')}>
            {busy ? uz.install.uploading : t.done}
          </button>
        </div>
      )}
    </>
  )
}
