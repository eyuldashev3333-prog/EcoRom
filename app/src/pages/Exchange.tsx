import { useRef, useState } from 'react'
import { supabase } from '../supabase'
import { download } from '../lib/export'
import { buildPricesFile, diffPrices, parsePricesFile, type DiffRow, type PriceRow, type PricesFile } from '../lib/exchange'
import { SETTING_KEYS } from '../lib/priceSettings'
import { uz } from '../uz'

const t = uz.exchange

type Cur = PriceRow & { id: string; sort: number }

// «Обмен данными»: выгрузка и загрузка прайсов файлом. Загрузка показывает новые / заменяемые / одинаковые строки с галочками.
export default function Exchange() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [file, setFile] = useState<PricesFile | null>(null)
  const [cur, setCur] = useState<Cur[]>([])
  const [diff, setDiff] = useState<DiffRow[]>([])
  const [pick, setPick] = useState<Set<string>>(new Set())
  const [withSettings, setWithSettings] = useState(false)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const loadCurrent = async (): Promise<Cur[]> => {
    const { data, error } = await supabase.from('catalog_items').select('id, kind, name, unit, price, params, sort').eq('is_active', true)
    if (error) throw new Error(error.message)
    return ((data as Cur[]) ?? []).map((i) => ({ ...i, price: Number(i.price), params: i.params ?? {} }))
  }
  const loadSettings = async (): Promise<Record<string, unknown>> => {
    const { data } = await supabase.from('app_settings').select('key, value').in('key', [...SETTING_KEYS])
    return Object.fromEntries(((data as { key: string; value: unknown }[]) ?? []).map((r) => [r.key, r.value]))
  }

  const exportPrices = async () => {
    setBusy(true)
    try {
      const f = buildPricesFile(await loadCurrent(), await loadSettings())
      download(new Blob([JSON.stringify(f, null, 1)], { type: 'application/json' }), `ecorom-narxlar-${new Date().toISOString().slice(0, 10)}.json`)
      setMsg({ ok: true, text: `${f.items.length} ${uz.catalog.title}` })
    } catch (e) {
      setMsg({ ok: false, text: String((e as Error).message) })
    }
    setBusy(false)
  }

  const onFile = async (f?: File) => {
    if (!f) return
    setMsg(null)
    const parsed = parsePricesFile(await f.text())
    if (typeof parsed === 'string') return setMsg({ ok: false, text: parsed })
    try {
      const c = await loadCurrent()
      const d = diffPrices(c, parsed.items)
      setCur(c)
      setFile(parsed)
      setDiff(d)
      setPick(new Set(d.filter((x) => x.status !== 'same').map((x) => x.key)))
    } catch (e) {
      setMsg({ ok: false, text: String((e as Error).message) })
    }
    if (input.current) input.current.value = ''
  }

  const apply = async () => {
    const todo = diff.filter((d) => pick.has(d.key))
    if (!todo.length && !withSettings) return setMsg({ ok: false, text: t.nothing })
    setBusy(true)
    try {
      let sort = Math.max(0, ...cur.map((c) => c.sort))
      for (const d of todo) {
        const r = d.incoming
        if (d.status === 'new') {
          const { error } = await supabase.from('catalog_items').insert({ kind: r.kind, name: r.name, unit: r.unit, price: r.price, params: r.params, sort: ++sort })
          if (error) throw new Error(`${r.name}: ${error.message}`)
        } else if (d.currentId) {
          const { error } = await supabase.from('catalog_items').update({ unit: r.unit, price: r.price, params: r.params }).eq('id', d.currentId)
          if (error) throw new Error(`${r.name}: ${error.message}`)
        }
      }
      if (withSettings && file) {
        for (const k of SETTING_KEYS) {
          if (!(k in file.settings)) continue
          const { error } = await supabase.from('app_settings').upsert({ key: k, value: file.settings[k], updated_at: new Date().toISOString() })
          if (error) throw new Error(`${k}: ${error.message}`)
        }
      }
      setMsg({ ok: true, text: `${t.applied}: ${todo.length}` })
      setFile(null)
      setDiff([])
    } catch (e) {
      setMsg({ ok: false, text: String((e as Error).message) })
    }
    setBusy(false)
  }

  const group = (status: DiffRow['status'], title: string) => {
    const rows = diff.filter((d) => d.status === status)
    if (!rows.length) return null
    return (
      <fieldset className={`diff diff-${status}`}>
        <legend>
          {title} · {rows.length}
        </legend>
        {rows.map((d) => (
          <label key={d.key} className="check">
            <input
              type="checkbox"
              checked={pick.has(d.key)}
              onChange={(e) =>
                setPick((p) => {
                  const n = new Set(p)
                  e.target.checked ? n.add(d.key) : n.delete(d.key)
                  return n
                })
              }
            />
            <span>
              {uz.catalog.kinds[d.incoming.kind] ?? d.incoming.kind}: <b>{d.incoming.name}</b>
            </span>
          </label>
        ))}
      </fieldset>
    )
  }

  return (
    <>
      <h1>{t.title}</h1>
      <p className="muted small">{t.hint}</p>
      {msg && <div className={msg.ok ? 'card note ok' : 'card note bad'}>{msg.text}</div>}

      <section className="card form">
        <h2>{t.prices}</h2>
        <div className="inline wrap">
          <button type="button" onClick={exportPrices} disabled={busy}>
            ↓ {t.exportPrices}
          </button>
          <label className="btn ghost" style={{ width: 'auto' }}>
            ↑ {t.importPrices}
            <input ref={input} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        </div>
        {file && (
          <>
            {group('new', t.newRows)}
            {group('changed', t.changedRows)}
            {group('same', t.sameRows)}
            {Object.keys(file.settings).length > 0 && (
              <label className="check">
                <input type="checkbox" checked={withSettings} onChange={(e) => setWithSettings(e.target.checked)} />
                {t.withSettings}
              </label>
            )}
            <div className="inline wrap">
              <button type="button" onClick={apply} disabled={busy}>
                {busy ? '…' : t.apply}
              </button>
              <button type="button" className="ghost" onClick={() => { setFile(null); setDiff([]) }}>
                {uz.catalog.cancel}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="card form">
        <h2>{t.windows}</h2>
        <p className="muted small">{t.windowsHint}</p>
      </section>
    </>
  )
}
