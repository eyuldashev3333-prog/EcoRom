import { useState, type ReactNode } from 'react'
import { itemColor, type CatalogState } from '../lib/catalog'
import { formatSum } from '../lib/pricing'
import { DOBOR, SIDES, mirrorOptions, selList, type Dobor, type ItemOptions, type Sel, type Side, type SideOpts } from '../lib/quote'
import { uz } from '../uz'

const t = uz.order

interface Props {
  value: ItemOptions
  onChange: (o: ItemOptions) => void
  catalog: CatalogState
  widthMm: number
  calcPrice?: number // расчётная цена окна для подсказки в поле «своя цена»
}

// секция настроек: заголовок, краткое содержимое справа, раскрывается
function Section({ title, summary, open, children }: { title: string; summary?: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="opt-sec" open={open}>
      <summary>
        <span>{title}</span>
        {summary && <small>{summary}</small>}
      </summary>
      <div className="opt-body">{children}</div>
    </details>
  )
}

// один выбор из списка (радио) с пунктом «не учитывать»
function Radios({ kind, value, onChange, catalog, swatch }: { kind: string; value?: string; onChange: (id?: string) => void; catalog: CatalogState; swatch?: boolean }) {
  const list = catalog.byKind(kind)
  const name = `r-${kind}-${useState(() => Math.random().toString(36).slice(2))[0]}`
  return (
    <div className="opt-list" role="radiogroup">
      <label className="check">
        <input type="radio" name={name} checked={!value} onChange={() => onChange(undefined)} />
        {t.none}
      </label>
      {list.map((i) => (
        <label key={i.id} className="check">
          <input type="radio" name={name} checked={value === i.id} onChange={() => onChange(i.id)} />
          {swatch && <span className="swatch" style={{ background: itemColor(i) }} aria-hidden="true" />}
          {i.name}
        </label>
      ))}
      {list.length === 0 && <span className="muted">{t.emptyKind}</span>}
    </div>
  )
}

// несколько выборов (галочки); withLen — у выбранного можно задать длину и количество (подоконник, отлив)
function Checks({ kind, value, onChange, catalog, widthMm, withLen }: { kind: string; value: Sel[]; onChange: (v: Sel[]) => void; catalog: CatalogState; widthMm: number; withLen?: boolean }) {
  const list = catalog.byKind(kind)
  return (
    <div className="opt-list">
      {list.map((i) => {
        const sel = value.find((s) => s.id === i.id)
        return (
          <div key={i.id} className="opt-row">
            <label className="check">
              <input type="checkbox" checked={!!sel} onChange={(e) => onChange(e.target.checked ? [...value, { id: i.id }] : value.filter((s) => s.id !== i.id))} />
              {i.name}
            </label>
            {withLen && sel && (
              <span className="opt-len">
                <input aria-label={t.lengthMm} inputMode="numeric" placeholder={String(widthMm)} value={sel.length_mm ?? ''} onChange={(e) => onChange(value.map((s) => (s.id === i.id ? { ...s, length_mm: Number(e.target.value) || undefined } : s)))} />
                ×
                <input aria-label={t.qty} inputMode="numeric" placeholder="1" value={sel.qty ?? ''} onChange={(e) => onChange(value.map((s) => (s.id === i.id ? { ...s, qty: Number(e.target.value) || undefined } : s)))} />
              </span>
            )}
          </div>
        )
      })}
      {list.length === 0 && <span className="muted">{t.emptyKind}</span>}
    </div>
  )
}

// значок стороны окна: квадрат с жирной линией на нужной стороне
function SideIcon({ side }: { side: Side }) {
  const line = { l: 'M4,4 V20', t: 'M4,4 H20', r: 'M20,4 V20', b: 'M4,20 H20' }[side]
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.45" />
      <path d={line} stroke="currentColor" strokeWidth="3.2" strokeLinecap="butt" />
    </svg>
  )
}

function SideChips({ value, onChange, label }: { value?: Side[]; onChange: (v: Side[]) => void; label: string }) {
  const set = new Set(value ?? [])
  return (
    <div className="sides" role="group" aria-label={label}>
      {SIDES.map((s) => (
        <button
          key={s}
          type="button"
          className={set.has(s) ? 'chip on' : 'chip'}
          aria-pressed={set.has(s)}
          title={t.sides[s]}
          onClick={() => {
            set.has(s) ? set.delete(s) : set.add(s)
            onChange(SIDES.filter((x) => set.has(x)))
          }}
        >
          <SideIcon side={s} />
        </button>
      ))}
    </div>
  )
}

const count = (n: number) => (n ? String(n) : undefined)

export default function ItemOptionsForm({ value: o, onChange, catalog, widthMm, calcPrice }: Props) {
  const set = (patch: Partial<ItemOptions>) => onChange(mirrorOptions({ ...o, ...patch }))
  const sd: SideOpts = o.sides ?? {}
  const setSides = (patch: Partial<SideOpts>) => set({ sides: { ...sd, ...patch } })
  const sills = selList(o, 'sill')
  const ebbs = selList(o, 'ebb')
  const nm = (id?: string) => (id ? catalog.byId.get(id)?.name : undefined)
  const doborCount = DOBOR.reduce((n, d) => n + (sd.dobor?.[d]?.length ?? 0), 0)

  return (
    <div className="card form opts">
      <h2>{t.options}</h2>

      <Section title={t.ownPrice} summary={o.own_price ? formatSum(o.own_price) : undefined} open>
        <div className="inline">
          <input className="money" inputMode="numeric" placeholder={calcPrice ? formatSum(calcPrice) : '0'} value={o.own_price ?? ''} onChange={(e) => set({ own_price: Number(e.target.value.replace(/\D/g, '')) || undefined })} aria-label={t.ownPrice} />
          {o.own_price !== undefined && (
            <button type="button" className="ghost small-btn" onClick={() => set({ own_price: undefined })} aria-label={t.clear}>
              ✕
            </button>
          )}
        </div>
        <p className="muted hint">{t.ownPriceHint}</p>
      </Section>

      <Section title={t.itemDiscount} summary={catalog.settings.schemes.find((s) => s.id === o.scheme)?.name ?? t.inherit} open>
        <div className="opt-list" role="radiogroup">
          <label className="check">
            <input type="radio" name="item-scheme" checked={!o.scheme} onChange={() => set({ scheme: undefined })} />
            {t.inherit}
          </label>
          {catalog.settings.schemes.map((s) => (
            <label key={s.id} className="check">
              <input type="radio" name="item-scheme" checked={o.scheme === s.id} onChange={() => set({ scheme: s.id })} />
              {s.name} <small className="muted">(−{s.discount}%, +{s.margin}% / +{s.margin_work}%)</small>
            </label>
          ))}
        </div>
      </Section>

      <Section title={t.system} summary={nm(o.system)} open>
        <Radios kind="system" value={o.system} catalog={catalog} onChange={(system) => set({ system })} />
      </Section>
      <Section title={t.glass} summary={nm(o.glass)} open>
        <Radios kind="glass" value={o.glass} catalog={catalog} onChange={(glass) => set({ glass })} />
      </Section>
      <Section title={t.ebb} summary={count(ebbs.length)}>
        <Checks kind="ebb" value={ebbs} catalog={catalog} widthMm={widthMm} withLen onChange={(ebbs) => set({ ebbs })} />
      </Section>
      <Section title={t.sill} summary={count(sills.length)}>
        <Checks kind="sill" value={sills} catalog={catalog} widthMm={widthMm} withLen onChange={(sills) => set({ sills })} />
      </Section>
      <Section title={t.hardware} summary={nm(o.hardware)} open>
        <Radios kind="hardware" value={o.hardware} catalog={catalog} onChange={(hardware) => set({ hardware })} />
      </Section>
      <Section title={t.doorHardware} summary={nm(o.door_hardware)}>
        <Radios kind="hardware" value={o.door_hardware} catalog={catalog} onChange={(door_hardware) => set({ door_hardware })} />
      </Section>
      <Section title={t.misc} summary={count(o.misc?.length ?? 0)}>
        <Checks kind="misc" value={(o.misc ?? []).map((id) => ({ id }))} catalog={catalog} widthMm={widthMm} onChange={(v) => set({ misc: v.map((x) => x.id) })} />
      </Section>
      <Section title={t.works} summary={count(o.works?.length ?? 0)}>
        <Checks kind="work" value={(o.works ?? []).map((id) => ({ id }))} catalog={catalog} widthMm={widthMm} onChange={(v) => set({ works: v.map((x) => x.id) })} />
      </Section>
      <Section title={t.net} summary={nm(o.net)}>
        <Radios kind="net" value={o.net} catalog={catalog} onChange={(net) => set({ net })} />
      </Section>
      <Section title={t.laminationIn} summary={nm(o.lamination_in)}>
        <Radios kind="lamination" value={o.lamination_in} catalog={catalog} onChange={(lamination_in) => set({ lamination_in })} />
      </Section>
      <Section title={t.laminationOut} summary={nm(o.lamination_out)}>
        <Radios kind="lamination" value={o.lamination_out} catalog={catalog} onChange={(lamination_out) => set({ lamination_out })} />
      </Section>
      <Section title={t.color} summary={nm(o.color)}>
        <Radios kind="color" value={o.color} catalog={catalog} swatch onChange={(color) => set({ color })} />
      </Section>

      <Section title={t.additions} summary={count([sd.support, sd.threshold, sd.corner].filter(Boolean).length)}>
        <div className="opt-list">
          <label className="check">
            <input type="checkbox" checked={!!sd.support} onChange={(e) => setSides({ support: e.target.checked || undefined })} />
            {t.support}
          </label>
          <label className="check">
            <input type="checkbox" checked={!!sd.threshold} onChange={(e) => setSides({ threshold: e.target.checked || undefined })} />
            {t.threshold}
          </label>
          <label className="check">
            <input type="checkbox" checked={!!sd.corner} onChange={(e) => setSides({ corner: e.target.checked || undefined })} />
            {t.corner}
          </label>
          <p className="muted hint">{t.sidesHint}</p>
        </div>
      </Section>
      {(
        [
          ['connect', t.connect],
          ['connect90', t.connect90],
          ['connect135', t.connect135],
          ['nashelnik', t.nashelnik],
        ] as const
      ).map(([k, label]) => (
        <Section key={k} title={label} summary={count(sd[k]?.length ?? 0)}>
          <SideChips label={label} value={sd[k]} onChange={(v) => setSides({ [k]: v.length ? v : undefined })} />
        </Section>
      ))}
      <Section title={t.dobor} summary={count(doborCount)}>
        <div className="dobor">
          {DOBOR.map((d: Dobor) => (
            <div key={d} className="dobor-row">
              <b>{d} mm</b>
              <SideChips
                label={`${t.dobor} ${d}`}
                value={sd.dobor?.[d]}
                onChange={(v) => {
                  const dobor = { ...sd.dobor, [d]: v.length ? v : undefined }
                  setSides({ dobor: Object.values(dobor).some((x) => x && x.length) ? dobor : undefined })
                }}
              />
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
