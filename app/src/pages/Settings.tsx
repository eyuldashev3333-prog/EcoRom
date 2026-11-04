import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { uz } from '../uz'

const t = uz.settings

interface Field {
  key: string
  kind: 'number' | 'bool'
  def: number | boolean
  min?: number
}
// ключи app_settings, которые Rahbar меняет сам (подписи и подсказки — в uz.settings.fields)
const FIELDS: Field[] = [
  { key: 'shop_reply_hours', kind: 'number', def: 2, min: 0.5 },
  { key: 'margin_alert_pct', kind: 'number', def: 15, min: 0 },
  { key: 'cash_opening_balance', kind: 'number', def: 0 },
  { key: 'bar_length_m', kind: 'number', def: 6, min: 0.1 },
  { key: 'saw_kerf_mm', kind: 'number', def: 4, min: 0 },
  { key: 'offcut_min_mm', kind: 'number', def: 300, min: 1 },
  { key: 'leak_stuck_days', kind: 'number', def: 3, min: 1 },
  { key: 'leak_window_days', kind: 'number', def: 60, min: 1 },
  { key: 'warranty_years', kind: 'number', def: 5, min: 0 },
  { key: 'install_photo_required', kind: 'bool', def: true },
  { key: 'expense_reminder_on', kind: 'bool', def: true },
]

// «Sozlamalar»: числа, которые раньше менялись только в базе. Сохранение — по каждой строке отдельно.
export default function Settings() {
  const [vals, setVals] = useState<Record<string, string | boolean>>({})
  const [saved, setSaved] = useState<Record<string, string | boolean>>({})
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    supabase
      .from('app_settings')
      .select('key, value')
      .in('key', FIELDS.map((f) => f.key))
      .then(({ data, error }) => {
        if (error) return setMsg({ ok: false, text: error.message })
        const m = new Map((data ?? []).map((r) => [r.key as string, r.value as unknown]))
        const v: Record<string, string | boolean> = {}
        for (const f of FIELDS) {
          const x = m.get(f.key)
          v[f.key] = f.kind === 'bool' ? (typeof x === 'boolean' ? x : (f.def as boolean)) : String(x ?? f.def)
        }
        setVals(v)
        setSaved(v)
      })
  }, [])

  const save = async (f: Field, raw: string | boolean) => {
    let value: number | boolean
    if (f.kind === 'bool') value = Boolean(raw)
    else {
      value = Number(String(raw).replace(/\s/g, '').replace(',', '.'))
      if (!Number.isFinite(value) || String(raw).trim() === '' || (f.min !== undefined && value < f.min)) return setMsg({ ok: false, text: `${t.fields[f.key].label}: ${t.bad}` })
    }
    setBusy(f.key)
    const { error } = await supabase.from('app_settings').upsert({ key: f.key, value, updated_at: new Date().toISOString() })
    setBusy('')
    if (error) return setMsg({ ok: false, text: error.message })
    setSaved((s) => ({ ...s, [f.key]: typeof value === 'boolean' ? value : String(value) }))
    setMsg({ ok: true, text: `${t.fields[f.key].label}: ${t.saved}` })
  }

  return (
    <>
      <h1>{t.title}</h1>
      <p className="muted small">{t.hint}</p>
      {msg && <div className={msg.ok ? 'card note ok' : 'card note bad'}>{msg.text}</div>}
      {FIELDS.map((f) => {
        const info = t.fields[f.key]
        const v = vals[f.key]
        if (v === undefined) return null
        return (
          <div key={f.key} className="card form">
            {f.kind === 'bool' ? (
              <label className="check">
                <input type="checkbox" checked={Boolean(v)} disabled={busy === f.key} onChange={(e) => { setVals((s) => ({ ...s, [f.key]: e.target.checked })); save(f, e.target.checked) }} /> <b>{info.label}</b>
              </label>
            ) : (
              <label>
                <b>
                  {info.label}
                  {info.unit ? `, ${info.unit}` : ''}
                </b>
                <div className="inline">
                  <input inputMode="decimal" value={String(v)} onChange={(e) => setVals((s) => ({ ...s, [f.key]: e.target.value }))} />
                  <button type="button" onClick={() => save(f, v)} disabled={busy === f.key || v === saved[f.key]}>
                    {t.save}
                  </button>
                </div>
              </label>
            )}
            <small className="muted">{info.hint}</small>
          </div>
        )
      })}
    </>
  )
}
