// Обмен файлами (вместо Bluetooth в WinStudio): прайсы и окна заказа выгружаются в JSON и загружаются обратно.
// Деньги (оплаты, касса, номера заказов) файлами не передаются: так нельзя подделать и задвоить учёт.
import type { CatalogItem, ItemOptions, Sel } from './quote'
import { layout, type WindowDesign } from './window'

export interface PriceRow {
  kind: string
  name: string
  unit: 'm' | 'm2' | 'pcs'
  price: number
  params: Record<string, number | string>
}
export interface PricesFile {
  format: 'ecorom-prices'
  v: 1
  exported_at: string
  settings: Record<string, unknown> // валюта, курс, налог, финансовые схемы
  items: PriceRow[]
}
export interface WindowRow {
  title: string
  qty: number
  design: WindowDesign
  options: ItemOptions
  note: string
}
export interface WindowsFile {
  format: 'ecorom-windows'
  v: 1
  exported_at: string
  names: Record<string, { kind: string; name: string }> // id каталога → название (для переноса между базами)
  items: WindowRow[]
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

// ---------- прайсы ----------
export function buildPricesFile(items: PriceRow[], settings: Record<string, unknown>): PricesFile {
  return { format: 'ecorom-prices', v: 1, exported_at: new Date().toISOString(), settings, items: items.map(({ kind, name, unit, price, params }) => ({ kind, name, unit, price, params })) }
}

export function parsePricesFile(text: string): PricesFile | string {
  let j: unknown
  try {
    j = JSON.parse(text)
  } catch {
    return 'Fayl JSON emas'
  }
  if (!isObj(j) || j.format !== 'ecorom-prices' || !Array.isArray(j.items)) return "Bu narxlar fayli emas (ecorom-prices)"
  const items: PriceRow[] = []
  for (const r of j.items as unknown[]) {
    if (!isObj(r) || typeof r.kind !== 'string' || typeof r.name !== 'string' || !r.name.trim()) continue
    const price = Number(r.price)
    items.push({ kind: r.kind, name: r.name.trim(), unit: r.unit === 'm' || r.unit === 'm2' ? r.unit : 'pcs', price: Number.isFinite(price) && price >= 0 ? price : 0, params: isObj(r.params) ? (r.params as PriceRow['params']) : {} })
  }
  return { format: 'ecorom-prices', v: 1, exported_at: String(j.exported_at ?? ''), settings: isObj(j.settings) ? j.settings : {}, items }
}

export type DiffStatus = 'new' | 'changed' | 'same'
export interface DiffRow {
  key: string
  incoming: PriceRow
  status: DiffStatus
  currentId?: string
}
const same = (a: PriceRow, b: PriceRow) => a.unit === b.unit && Number(a.price) === Number(b.price) && JSON.stringify(sortKeys(a.params)) === JSON.stringify(sortKeys(b.params))
const sortKeys = (o: Record<string, number | string>) => Object.fromEntries(Object.entries(o ?? {}).sort(([a], [b]) => a.localeCompare(b)))

/** «новые / заменяемые / одинаковые» — как диалог получения файлов в WinStudio; строки сопоставляются по паре (раздел, название) */
export function diffPrices(current: (PriceRow & { id: string })[], incoming: PriceRow[]): DiffRow[] {
  const cur = new Map(current.map((c) => [`${c.kind}|${c.name}`, c]))
  return incoming.map((r) => {
    const key = `${r.kind}|${r.name}`
    const c = cur.get(key)
    return { key, incoming: r, status: !c ? 'new' : same(c, r) ? 'same' : 'changed', currentId: c?.id }
  })
}

// ---------- окна ----------
export function optionIds(o: ItemOptions): string[] {
  const ids: (string | undefined)[] = [o.system, o.glass, o.hardware, o.door_hardware, o.net, o.color, o.lamination, o.lamination_in, o.lamination_out, o.sill?.id, o.ebb?.id]
  for (const l of [o.sills, o.ebbs, o.extras]) for (const s of l ?? []) ids.push(s.id)
  for (const l of [o.misc, o.works]) for (const id of l ?? []) ids.push(id)
  return [...new Set(ids.filter((x): x is string => !!x))]
}

export function buildWindowsFile(items: WindowRow[], byId: Map<string, CatalogItem>): WindowsFile {
  const names: WindowsFile['names'] = {}
  for (const it of items) for (const id of optionIds(it.options)) {
    const c = byId.get(id)
    if (c) names[id] = { kind: c.kind, name: c.name }
  }
  return { format: 'ecorom-windows', v: 1, exported_at: new Date().toISOString(), names, items }
}

/** чертёж пригоден: габариты в разумных пределах, ячейки без дыр покрывают габарит */
export function isValidDesign(d: unknown): d is WindowDesign {
  if (!isObj(d) || !isObj(d.root) || typeof d.width !== 'number' || typeof d.height !== 'number') return false
  if (!(d.width >= 200 && d.width <= 10000 && d.height >= 200 && d.height <= 10000)) return false
  try {
    const cells = layout(d as unknown as WindowDesign).cells
    return cells.length > 0 && cells.length < 400 && cells.reduce((s, c) => s + c.rect.w * c.rect.h, 0) === d.width * d.height
  } catch {
    return false
  }
}

export function parseWindowsFile(text: string): WindowsFile | string {
  let j: unknown
  try {
    j = JSON.parse(text)
  } catch {
    return 'Fayl JSON emas'
  }
  if (!isObj(j) || j.format !== 'ecorom-windows' || !Array.isArray(j.items)) return 'Bu oynalar fayli emas (ecorom-windows)'
  const items: WindowRow[] = []
  for (const r of j.items as unknown[]) {
    if (!isObj(r) || !isValidDesign(r.design)) continue
    const qty = Math.round(Number(r.qty))
    items.push({ title: typeof r.title === 'string' ? r.title : '', qty: qty >= 1 && qty <= 9999 ? qty : 1, design: r.design, options: isObj(r.options) ? (r.options as ItemOptions) : {}, note: typeof r.note === 'string' ? r.note : '' })
  }
  return { format: 'ecorom-windows', v: 1, exported_at: String(j.exported_at ?? ''), names: isObj(j.names) ? (j.names as WindowsFile['names']) : {}, items }
}

/** id опций из чужой базы заменяются на свои по (раздел, название); не найденные убираются и возвращаются в dropped */
export function remapOptions(o: ItemOptions, names: WindowsFile['names'], byId: Map<string, CatalogItem>): { options: ItemOptions; dropped: string[] } {
  const dropped: string[] = []
  const byName = new Map([...byId.values()].map((c) => [`${c.kind}|${c.name}`, c.id]))
  const map = (id?: string): string | undefined => {
    if (!id) return undefined
    if (byId.has(id)) return id
    const n = names[id]
    const found = n ? byName.get(`${n.kind}|${n.name}`) : undefined
    if (!found) dropped.push(n?.name ?? id)
    return found
  }
  const sel = (s?: Sel): Sel | undefined => {
    const id = map(s?.id)
    return s && id ? { ...s, id } : undefined
  }
  const selList = (l?: Sel[]) => (l ? l.map(sel).filter((x): x is Sel => !!x) : undefined)
  const idList = (l?: string[]) => (l ? l.map(map).filter((x): x is string => !!x) : undefined)
  const out: ItemOptions = { ...o }
  for (const k of ['system', 'glass', 'hardware', 'door_hardware', 'net', 'color', 'lamination', 'lamination_in', 'lamination_out'] as const) {
    if (o[k]) {
      const m = map(o[k])
      if (m) out[k] = m
      else delete out[k]
    }
  }
  for (const k of ['sill', 'ebb'] as const) {
    if (o[k]) {
      const s = sel(o[k])
      if (s) out[k] = s
      else delete out[k]
    }
  }
  for (const k of ['sills', 'ebbs', 'extras'] as const) if (o[k]) out[k] = selList(o[k])
  for (const k of ['misc', 'works'] as const) if (o[k]) out[k] = idList(o[k])
  return { options: out, dropped: [...new Set(dropped)] }
}
