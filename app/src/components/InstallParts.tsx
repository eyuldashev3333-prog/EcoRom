import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { supabase } from '../supabase'
import { compressPhoto } from '../lib/photo'
import WindowSvg from './WindowSvg'
import type { WindowDesign } from '../lib/window'
import { uz } from '../uz'

const t = uz.install

export interface InstallItem {
  id: string
  pos: number
  title: string | null
  width_mm: number
  height_mm: number
  qty: number
  design?: WindowDesign
  options: { sill?: unknown; ebb?: unknown }
  note?: string | null
}
interface Mark {
  order_item_id: string
  part: string
  done_by: string
  done_at: string
  photo_path: string | null
  name: string
}

const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const partsOf = (it: InstallItem) => ['frame', 'glass', ...(it.options?.sill || it.options?.ebb ? ['sill_ebb'] : [])]

// отметки монтажа по окну: Rama / Shisha / Podokonnik-otliv, каждая с фото (кто + когда)
export default function InstallParts({ orderId, items, status, drawings = false, onChanged }: { orderId: string; items: InstallItem[]; status: string; drawings?: boolean; onChanged?: () => void }) {
  const { me } = useAuth()
  const rahbar = me?.role === 'rahbar'
  const [marks, setMarks] = useState<Mark[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const ids = items.map((i) => i.id).join(',')

  const load = useCallback(async () => {
    if (!ids) return setMarks([])
    const list = ids.split(',')
    const { data } = rahbar
      ? await supabase.from('install_marks').select('order_item_id, part, done_by, done_at, photo_path, employees(full_name)').in('order_item_id', list)
      : await supabase.from('w_install_marks').select('order_item_id, part, done_by, done_at, photo_path, done_by_name').in('order_item_id', list)
    const ms = ((data as unknown as (Mark & { employees?: { full_name: string }; done_by_name?: string })[]) ?? []).map((x) => ({ ...x, name: x.employees?.full_name ?? x.done_by_name ?? '' }))
    setMarks(ms)
    const paths = ms.map((m) => m.photo_path).filter((p): p is string => !!p)
    if (paths.length) {
      const { data: signed } = await supabase.storage.from('install-photos').createSignedUrls(paths, 3600)
      setUrls(Object.fromEntries((signed ?? []).flatMap((s) => (s.signedUrl && s.path ? [[s.path, s.signedUrl]] : []))))
    }
  }, [ids, rahbar])
  useEffect(() => {
    load()
  }, [load])

  const call = async (item: InstallItem, part: string, done: boolean, photo: string | null) => {
    const { error } = await supabase.rpc('mark_install', { p_item: item.id, p_part: part, p_done: done, p_photo: photo })
    if (error) setErr(error.message)
    await load()
    if (!error) onChanged?.()
    return !error
  }
  const withPhoto = async (item: InstallItem, part: string, file: File) => {
    const key = `${item.id}:${part}`
    setBusy(key)
    setErr('')
    try {
      const blob = await compressPhoto(file)
      const path = `${orderId}/${item.id}_${part}_${Date.now()}.jpg`
      const up = await supabase.storage.from('install-photos').upload(path, blob, { contentType: 'image/jpeg' })
      if (up.error) throw up.error
      const ok = await call(item, part, true, path)
      if (!ok) await supabase.storage.from('install-photos').remove([path]) // не получилось отметить — не копим мусор (если есть право)
    } catch (e) {
      setErr((e as Error).message)
    }
    setBusy('')
  }
  const plain = async (item: InstallItem, part: string, done: boolean) => {
    if (!done && !window.confirm(t.undoConfirm)) return
    setBusy(`${item.id}:${part}`)
    setErr('')
    await call(item, part, done, null)
    setBusy('')
  }

  const open = ['ready', 'installing'].includes(status)
  const total = items.reduce((s, i) => s + partsOf(i).length, 0)
  const doneN = items.reduce((s, i) => s + partsOf(i).filter((p) => marks.some((m) => m.order_item_id === i.id && m.part === p)).length, 0)

  return (
    <div className="card form">
      <div className="inline head">
        <h2>{t.parts}</h2>
        <span className="pct">
          {doneN} / {total}
        </span>
      </div>
      <div className="progress">
        <i style={{ width: `${total ? (100 * doneN) / total : 0}%` }} />
      </div>
      {!open && !['installed', 'closed'].includes(status) && <p className="warn">{t.notReady}</p>}
      {status === 'installed' && <p className="muted">{t.done}</p>}
      {err && <div className="note bad">{err}</div>}
      {items.map((it) => (
        <div key={it.id} className="stage-item">
          <b>
            {it.pos}) {it.title ? `${it.title}: ` : ''}
            {it.width_mm}×{it.height_mm} · {it.qty} {uz.print.pcs}
          </b>
          {drawings && it.design && (
            <div className="draw">
              <WindowSvg design={it.design} maxHeight={150} />
            </div>
          )}
          {it.note && <p className="muted small">{it.note}</p>}
          <div className="part-grid">
            {partsOf(it).map((part) => {
              const m = marks.find((x) => x.order_item_id === it.id && x.part === part)
              const key = `${it.id}:${part}`
              const canUndo = m && (rahbar || m.done_by === me?.id) && ['installing', 'installed'].includes(status)
              return (
                <div key={part} className={`part ${m ? 'done' : ''}`}>
                  <b>{t.part[part]}</b>
                  {m ? (
                    <>
                      {m.photo_path && urls[m.photo_path] && (
                        <a href={urls[m.photo_path]} target="_blank" rel="noreferrer" title={t.open}>
                          <img src={urls[m.photo_path]} alt={t.part[part]} />
                        </a>
                      )}
                      <small className="muted">
                        ✔ {m.name} · {when(m.done_at)}
                      </small>
                      {canUndo && (
                        <button type="button" className="ghost" disabled={busy === key} onClick={() => plain(it, part, false)}>
                          {t.undo}
                        </button>
                      )}
                    </>
                  ) : (
                    open && (
                      <>
                        <label className="btn">
                          {busy === key ? t.uploading : `📷 ${t.photoMark}`}
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            hidden
                            disabled={!!busy}
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              e.target.value = ''
                              if (f) withPhoto(it, part, f)
                            }}
                          />
                        </label>
                        {rahbar && (
                          <button type="button" className="ghost" disabled={!!busy} onClick={() => plain(it, part, true)}>
                            {t.markNoPhoto}
                          </button>
                        )}
                      </>
                    )
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
