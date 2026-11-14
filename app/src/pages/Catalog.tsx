import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { Confirm } from '../components/Dialog'
import { BASIS, TABLES, isPlaceholder, newName, type Col, type PriceTable } from '../lib/priceTables'
import { SETTING_KEYS, defaultSchemes, parsePriceSettings, type PriceSettings, type Scheme } from '../lib/priceSettings'
import { uz } from '../uz'

const t = uz.catalog

interface Item {
  id: string
  kind: string
  name: string
  unit: 'm' | 'm2' | 'pcs'
  price: number
  params: Record<string, number | string>
  sort: number
}

// числовая ячейка: правка текстом, запись при выходе из поля или Enter
function NumCell({ value, onCommit, label }: { value: number | string | undefined; onCommit: (n: number) => void; label: string }) {
  const show = value === undefined || value === null ? '' : String(value)
  const [v, setV] = useState(show)
  useEffect(() => setV(show), [show])
  const commit = () => {
    if (v.trim() === '') return Number(show || 0) === 0 ? setV('') : onCommit(0)
    const n = Number(v.replace(/\s/g, '').replace(',', '.'))
    if (Number.isFinite(n) && n >= 0) n !== Number(show || 0) && onCommit(n)
    else setV(show)
  }
  return <input className="cell" inputMode="decimal" aria-label={label} value={v} placeholder="0" onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
}

function TextCell({ value, onCommit, label }: { value: string; onCommit: (s: string) => void; label: string }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return <input className="cell name" aria-label={label} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => (v.trim() && v !== value ? onCommit(v.trim()) : setV(value))} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
}

function cellValue(it: Item, c: Col) {
  return c.where === 'price' ? it.price : it.params?.[c.key]
}

function PriceGrid({ table, items, currency, onPatch, onAdd, onDelete }: { table: PriceTable; items: Item[]; currency: string; onPatch: (it: Item, patch: { name?: string; col?: [Col, number | string] }) => void; onAdd: () => void; onDelete: (it: Item) => void }) {
  return (
    <section className="card ptable-card" id={`t-${table.kind}`} aria-label={table.title}>
      <h2>{table.title}</h2>
      <div className="tbl-scroll flat" tabIndex={0}>
        <table className="ptable">
          <thead>
            <tr>
              <th>{table.nameLabel}</th>
              {table.cols.map((c) => (
                <th key={c.key}>
                  {c.label}
                  {c.type !== 'basis' && c.type !== 'hex' && <small>{`${currency}/${t.units[c.unit]}`}</small>}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className={isPlaceholder(it.name) ? 'ph' : ''}>
                <th scope="row">
                  <TextCell value={it.name} label={table.nameLabel} onCommit={(name) => onPatch(it, { name })} />
                </th>
                {table.cols.map((c) => (
                  <td key={c.key}>
                    {c.type === 'basis' ? (
                      <select className="cell" aria-label={c.label} value={String(it.params?.basis ?? '')} onChange={(e) => onPatch(it, { col: [c, e.target.value] })}>
                        {BASIS.map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    ) : c.type === 'hex' ? (
                      <input className="cell color" type="color" aria-label={c.label} value={/^#[0-9a-f]{6}$/i.test(String(it.params?.hex ?? '')) ? String(it.params.hex) : '#f4f4f2'} onChange={(e) => onPatch(it, { col: [c, e.target.value] })} />
                    ) : (
                      <NumCell value={cellValue(it, c) as number | undefined} label={c.label} onCommit={(n) => onPatch(it, { col: [c, n] })} />
                    )}
                  </td>
                ))}
                <td>
                  <button type="button" className="ghost small-btn" onClick={() => onDelete(it)} aria-label={`${t.remove}: ${it.name}`}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={table.cols.length + 2} className="muted">
                  {t.emptyTable}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div>
        <button type="button" className="ghost" onClick={onAdd}>
          + {t.add}
        </button>
      </div>
    </section>
  )
}

export default function Catalog() {
  const [items, setItems] = useState<Item[]>([])
  const [settings, setSettings] = useState<PriceSettings>(() => parsePriceSettings([]))
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [del, setDel] = useState<{ kind: 'item'; it: Item } | { kind: 'scheme'; s: Scheme } | null>(null)
  const topRef = useRef<HTMLDivElement>(null)

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text })
    if (ok) setTimeout(() => setMsg((m) => (m?.text === text ? null : m)), 1800)
  }

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([
      supabase.from('catalog_items').select('id, kind, name, unit, price, params, sort').eq('is_active', true).order('sort').order('name'),
      supabase.from('app_settings').select('key, value').in('key', [...SETTING_KEYS]),
    ])
    if (c.error) return flash(false, c.error.message)
    setItems(((c.data as Item[]) ?? []).map((i) => ({ ...i, price: Number(i.price), params: i.params ?? {} })))
    setSettings(parsePriceSettings((s.data as { key: string; value: unknown }[]) ?? []))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const saveSetting = async (key: string, value: unknown) => {
    const { error } = await supabase.from('app_settings').upsert({ key, value, updated_at: new Date().toISOString() })
    if (error) flash(false, error.message)
    else flash(true, t.saved)
  }
  const patchSettings = (patch: Partial<PriceSettings>, key: string, value: unknown) => {
    setSettings((s) => ({ ...s, ...patch }))
    return saveSetting(key, value)
  }

  const patchItem = async (it: Item, patch: { name?: string; col?: [Col, number | string] }) => {
    const upd: Partial<Item> = {}
    if (patch.name !== undefined) upd.name = patch.name
    if (patch.col) {
      const [c, v] = patch.col
      if (c.where === 'price') upd.price = Number(v)
      else upd.params = { ...it.params, [c.key]: v }
    }
    const { error } = await supabase.from('catalog_items').update(upd).eq('id', it.id)
    if (error) return flash(false, error.code === '23505' ? t.duplicate : error.message)
    setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, ...upd } : x)))
    flash(true, t.saved)
  }

  const addItem = async (table: PriceTable) => {
    if (items.some((i) => i.kind === table.kind && isPlaceholder(i.name))) return flash(false, t.renameFirst)
    const sort = Math.max(0, ...items.filter((i) => i.kind === table.kind).map((i) => i.sort)) + 1
    const { error } = await supabase.from('catalog_items').insert({ kind: table.kind, name: newName(table.kind), unit: table.unit, params: {}, sort })
    if (error) return flash(false, error.code === '23505' ? t.renameFirst : error.message)
    await load()
  }

  // «удалить» скрывает строку из прайса; старые заказы с ней остаются посчитанными, при правке такого заказа система предупредит
  const removeItem = async (it: Item) => {
    const { error } = await supabase.from('catalog_items').update({ is_active: false, name: `${it.name} [o'chirilgan ${new Date().toISOString().slice(0, 10)}]` }).eq('id', it.id)
    if (error) return flash(false, error.message)
    setItems((xs) => xs.filter((x) => x.id !== it.id))
    flash(true, t.removed)
  }

  // ----- финансовые схемы -----
  const saveSchemes = (schemes: Scheme[]) => patchSettings({ schemes }, 'finance_schemes', schemes)
  const patchScheme = (s: Scheme, patch: Partial<Scheme>) => {
    if (patch.name !== undefined && settings.schemes.some((x) => x.id !== s.id && x.name === patch.name)) return flash(false, t.duplicate)
    return saveSchemes(settings.schemes.map((x) => (x.id === s.id ? { ...x, ...patch } : x)))
  }
  const addScheme = () => {
    if (settings.schemes.some((s) => isPlaceholder(s.name))) return flash(false, t.renameFirst)
    return saveSchemes([...settings.schemes, { id: `s${Date.now().toString(36)}`, name: 'new_finance', discount: 0, margin: Math.round(settings.markup * 1000) / 10, margin_work: Math.round(settings.markup * 1000) / 10 }])
  }

  const jump = (kind: string) => document.getElementById(`t-${kind}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <>
      <h1 ref={topRef as never}>{t.title}</h1>
      <p className="muted small">{t.hint}</p>
      <div className="tabs" role="navigation" aria-label={t.title}>
        <button type="button" className="tab" onClick={() => document.getElementById('t-settings')?.scrollIntoView({ behavior: 'smooth' })}>
          {t.settingsTitle}
        </button>
        {TABLES.map((tb) => (
          <button key={tb.kind} type="button" className="tab" onClick={() => jump(tb.kind)}>
            {tb.title}
          </button>
        ))}
      </div>
      <div className="sticky-msg" role="status" aria-live="polite">
        {msg && <div className={msg.ok ? 'card note ok' : 'card note bad'}>{msg.text}</div>}
      </div>

      <section className="card form" id="t-settings">
        <h2>{t.settingsTitle}</h2>
        <div className="grid3">
          <label>
            {t.priceCurrency}
            <input value={settings.currency} onChange={(e) => setSettings((s) => ({ ...s, currency: e.target.value }))} onBlur={(e) => e.target.value.trim() && saveSetting('price_currency', e.target.value.trim())} />
          </label>
          <label>
            {t.rate}
            <input inputMode="decimal" value={String(settings.rate)} onChange={(e) => setSettings((s) => ({ ...s, rate: Number(e.target.value.replace(',', '.')) || 0 }))} onBlur={() => settings.rate > 0 && saveSetting('currency_rate', settings.rate)} />
          </label>
          <label>
            {t.resultCurrency}
            <input value={settings.resultCurrency} onChange={(e) => setSettings((s) => ({ ...s, resultCurrency: e.target.value }))} onBlur={(e) => e.target.value.trim() && saveSetting('result_currency', e.target.value.trim())} />
          </label>
        </div>
        <p className="muted small">{t.rateHint}</p>
        <div className="grid3">
          <label>
            {t.taxName}
            <input value={settings.taxName} onChange={(e) => setSettings((s) => ({ ...s, taxName: e.target.value }))} onBlur={(e) => e.target.value.trim() && saveSetting('tax_name', e.target.value.trim())} />
          </label>
          <label>
            {t.taxPct}
            <input inputMode="decimal" value={String(settings.taxPct)} onChange={(e) => setSettings((s) => ({ ...s, taxPct: Number(e.target.value.replace(',', '.')) || 0 }))} onBlur={() => saveSetting('tax_pct', settings.taxPct)} />
          </label>
          <label>
            {t.markup}
            <input inputMode="decimal" value={String(Math.round(settings.markup * 1000) / 10)} onChange={(e) => setSettings((s) => ({ ...s, markup: (Number(e.target.value.replace(',', '.')) || 0) / 100 }))} onBlur={() => saveSetting('markup', settings.markup)} />
          </label>
        </div>
      </section>

      <section className="card ptable-card" id="t-schemes" aria-label={t.schemes}>
        <h2>{t.schemes}</h2>
        <div className="tbl-scroll flat" tabIndex={0}>
          <table className="ptable">
            <thead>
              <tr>
                <th>{t.scheme}</th>
                <th>
                  {t.discount}
                  <small>%</small>
                </th>
                <th>
                  {t.marginMat}
                  <small>%</small>
                </th>
                <th>
                  {t.marginWork}
                  <small>%</small>
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {settings.schemes.map((s) => (
                <tr key={s.id} className={isPlaceholder(s.name) || s.name === 'new_finance' ? 'ph' : ''}>
                  <th scope="row">
                    <TextCell value={s.name} label={t.scheme} onCommit={(name) => patchScheme(s, { name })} />
                  </th>
                  <td>
                    <NumCell value={s.discount} label={t.discount} onCommit={(n) => patchScheme(s, { discount: n })} />
                  </td>
                  <td>
                    <NumCell value={s.margin} label={t.marginMat} onCommit={(n) => patchScheme(s, { margin: n })} />
                  </td>
                  <td>
                    <NumCell value={s.margin_work} label={t.marginWork} onCommit={(n) => patchScheme(s, { margin_work: n })} />
                  </td>
                  <td>
                    <button type="button" className="ghost small-btn" onClick={() => setDel({ kind: 'scheme', s })} aria-label={`${t.remove}: ${s.name}`}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {settings.schemes.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    {t.emptyTable}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="inline wrap">
          <button type="button" className="ghost" onClick={addScheme}>
            + {t.add}
          </button>
          <button type="button" className="ghost" onClick={() => saveSchemes(defaultSchemes(settings.markup))}>
            {t.resetSchemes}
          </button>
        </div>
        <p className="muted small">{t.schemesHint}</p>
      </section>

      {TABLES.map((tb) => (
        <PriceGrid key={tb.kind} table={tb} items={items.filter((i) => i.kind === tb.kind)} currency={settings.currency} onPatch={patchItem} onAdd={() => addItem(tb)} onDelete={(it) => setDel({ kind: 'item', it })} />
      ))}

      {del && (
        <Confirm
          text={`${t.removeConfirm}: ${del.kind === 'item' ? del.it.name : del.s.name}`}
          no={uz.catalog.cancel}
          yes="OK"
          onNo={() => setDel(null)}
          onYes={() => {
            if (del.kind === 'item') removeItem(del.it)
            else saveSchemes(settings.schemes.filter((x) => x.id !== del.s.id))
            setDel(null)
          }}
        />
      )}
    </>
  )
}
