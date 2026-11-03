import type { CatalogState } from '../lib/catalog'
import type { ItemOptions } from '../lib/quote'
import { uz } from '../uz'

const t = uz.order

interface Props {
  value: ItemOptions
  onChange: (o: ItemOptions) => void
  catalog: CatalogState
  widthMm: number
}

function Pick({ label, kind, value, onChange, catalog }: { label: string; kind: string; value?: string; onChange: (id?: string) => void; catalog: CatalogState }) {
  return (
    <label>
      {label}
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">{t.none}</option>
        {catalog.byKind(kind).map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
    </label>
  )
}

function Multi({ label, kind, value, onChange, catalog }: { label: string; kind: string; value?: string[]; onChange: (ids: string[]) => void; catalog: CatalogState }) {
  const set = new Set(value ?? [])
  return (
    <fieldset className="multi">
      <legend>{label}</legend>
      {catalog.byKind(kind).map((i) => (
        <label key={i.id} className="check">
          <input
            type="checkbox"
            checked={set.has(i.id)}
            onChange={(e) => {
              e.target.checked ? set.add(i.id) : set.delete(i.id)
              onChange([...set])
            }}
          />
          {i.name}
        </label>
      ))}
    </fieldset>
  )
}

// длина подоконника/отлива: по умолчанию = ширина окна
function LenPick({ label, kind, value, onChange, catalog, widthMm }: { label: string; kind: string; value?: { id: string; length_mm?: number; qty?: number }; onChange: (v?: { id: string; length_mm?: number; qty?: number }) => void; catalog: CatalogState; widthMm: number }) {
  return (
    <div className="inline">
      <Pick label={label} kind={kind} value={value?.id} catalog={catalog} onChange={(id) => onChange(id ? { ...value, id } : undefined)} />
      {value && (
        <label className="narrow">
          {t.lengthMm}
          <input inputMode="numeric" placeholder={String(widthMm)} value={value.length_mm ?? ''} onChange={(e) => onChange({ ...value, length_mm: Number(e.target.value) || undefined })} />
        </label>
      )}
    </div>
  )
}

export default function ItemOptionsForm({ value: o, onChange, catalog, widthMm }: Props) {
  const set = (patch: Partial<ItemOptions>) => onChange({ ...o, ...patch })
  return (
    <div className="card form">
      <h2>{t.options}</h2>
      <Pick label={t.system} kind="system" value={o.system} catalog={catalog} onChange={(system) => set({ system })} />
      <Pick label={t.glass} kind="glass" value={o.glass} catalog={catalog} onChange={(glass) => set({ glass })} />
      <LenPick label={t.sill} kind="sill" value={o.sill} catalog={catalog} widthMm={widthMm} onChange={(sill) => set({ sill })} />
      <LenPick label={t.ebb} kind="ebb" value={o.ebb} catalog={catalog} widthMm={widthMm} onChange={(ebb) => set({ ebb })} />
      <Pick label={t.hardware} kind="hardware" value={o.hardware} catalog={catalog} onChange={(hardware) => set({ hardware })} />
      <Pick label={t.doorHardware} kind="hardware" value={o.door_hardware} catalog={catalog} onChange={(door_hardware) => set({ door_hardware })} />
      <Pick label={t.net} kind="net" value={o.net} catalog={catalog} onChange={(net) => set({ net })} />
      <Pick label={t.color} kind="color" value={o.color} catalog={catalog} onChange={(color) => set({ color })} />
      {catalog.byKind('lamination').length > 0 && <Pick label={t.lamination} kind="lamination" value={o.lamination} catalog={catalog} onChange={(lamination) => set({ lamination })} />}
      <Multi label={t.works} kind="work" value={o.works} catalog={catalog} onChange={(works) => set({ works })} />
      <Multi label={t.misc} kind="misc" value={o.misc} catalog={catalog} onChange={(misc) => set({ misc })} />
    </div>
  )
}
