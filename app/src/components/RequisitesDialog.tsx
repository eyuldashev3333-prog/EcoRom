import { useState } from 'react'
import { Dialog } from './Dialog'
import { supabase } from '../supabase'
import { uz } from '../uz'

const t = uz.print

export interface Company {
  title?: string // заголовок коммерческого предложения
  name?: string
  executor?: string
  address?: string
  phone?: string
  email?: string
  web?: string
}

const FIELDS: { key: keyof Company; label: string; type?: string }[] = [
  { key: 'title', label: t.docTitle },
  { key: 'executor', label: t.executor },
  { key: 'address', label: t.address },
  { key: 'phone', label: t.phone, type: 'tel' },
  { key: 'email', label: t.email, type: 'email' },
  { key: 'web', label: t.web },
]

// «Настройка реквизитов»: данные исполнителя в шапке печатных листов (app_settings.company)
export default function RequisitesDialog({ value, onSaved, onClose }: { value: Company; onSaved: (c: Company) => void; onClose: () => void }) {
  const [v, setV] = useState<Company>(value)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    setErr('')
    const clean: Company = { ...value }
    for (const f of FIELDS) clean[f.key] = (v[f.key] ?? '').trim()
    const { error } = await supabase.from('app_settings').upsert({ key: 'company', value: clean, updated_at: new Date().toISOString() })
    setBusy(false)
    if (error) return setErr(error.message)
    onSaved(clean)
    onClose()
  }
  return (
    <Dialog title={t.requisites} onClose={onClose}>
      {FIELDS.map((f) => (
        <label key={f.key}>
          {f.label}
          <input type={f.type ?? 'text'} value={v[f.key] ?? ''} placeholder={f.key === 'title' ? t.offerTitle : ''} onChange={(e) => setV((x) => ({ ...x, [f.key]: e.target.value }))} />
        </label>
      ))}
      {err && <div className="card note bad">{err}</div>}
      <div className="dialog-actions">
        <button type="button" className="ghost" onClick={onClose}>
          {t.cancel}
        </button>
        <button type="button" onClick={save} disabled={busy}>
          {busy ? '…' : t.save}
        </button>
      </div>
    </Dialog>
  )
}
