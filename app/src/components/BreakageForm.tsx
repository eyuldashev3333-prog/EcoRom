import { useState } from 'react'
import { supabase } from '../supabase'
import { compressPhoto } from '../lib/photo'
import { uz } from '../uz'

const t = uz.breakage

export interface BreakItem {
  id: string
  pos: number
  title: string | null
  width_mm: number
  height_mm: number
  qty: number
}

// «Oyna sindi»: окно, сколько штук, причина, фото → Rahbar сразу узнаёт; стекло заказывается заново
export default function BreakageForm({ orderId, items, onDone }: { orderId: string; items: BreakItem[]; onDone?: () => void }) {
  const [open, setOpen] = useState(false)
  const [item, setItem] = useState(items[0]?.id ?? '')
  const [pieces, setPieces] = useState(1)
  const [reason, setReason] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  if (!items.length) return null
  const cur = items.find((i) => i.id === (item || items[0].id)) ?? items[0]

  const send = async () => {
    setBusy(true)
    setMsg(null)
    try {
      let path: string | null = null
      if (file) {
        const blob = await compressPhoto(file)
        path = `${orderId}/breakage/${cur.id}_${Date.now()}.jpg`
        const up = await supabase.storage.from('install-photos').upload(path, blob, { contentType: 'image/jpeg' })
        if (up.error) throw up.error
      }
      const { error } = await supabase.rpc('record_breakage', { p_item: cur.id, p_pieces: pieces, p_reason: reason, p_photo: path })
      if (error) {
        if (path) await supabase.storage.from('install-photos').remove([path])
        throw error
      }
      setMsg({ ok: true, text: t.sent })
      setOpen(false)
      setReason('')
      setFile(null)
      setPieces(1)
      onDone?.()
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    }
    setBusy(false)
  }

  return (
    <div className="card form">
      {msg && <div className={msg.ok ? 'note ok' : 'note bad'}>{msg.text}</div>}
      {!open ? (
        <button type="button" className="ghost" onClick={() => setOpen(true)}>
          🪟 {t.report}
        </button>
      ) : (
        <>
          <h2>{t.report}</h2>
          <div className="grid2">
            <label>
              {t.window}
              <select
                value={cur.id}
                onChange={(e) => {
                  setItem(e.target.value)
                  setPieces(1)
                }}
              >
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.pos}) {i.title ? `${i.title} · ` : ''}
                    {i.width_mm}×{i.height_mm}
                  </option>
                ))}
              </select>
            </label>
            {cur.qty > 1 && (
              <label>
                {t.pieces} (1–{cur.qty})
                <input type="number" min={1} max={cur.qty} value={pieces} onChange={(e) => setPieces(Math.min(cur.qty, Math.max(1, Number(e.target.value) || 1)))} />
              </label>
            )}
          </div>
          <label>
            {t.reason}
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <label>
            {t.photo}
            <input type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <div className="inline wrap">
            <button type="button" onClick={send} disabled={busy || !reason.trim()}>
              {busy ? uz.install.uploading : t.send}
            </button>
            <button type="button" className="ghost" onClick={() => setOpen(false)}>
              {uz.stock.cancel}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
