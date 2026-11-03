// Расчёт позиции заказа по каталогу (как в WinStudio): строки «что × сколько × цена» + расход материалов без цен.
import { round2 } from './pricing'
import type { Measure } from './window'

export type Unit = 'm' | 'm2' | 'pcs'
export interface CatalogItem {
  id: string
  kind: string
  name: string
  unit: Unit
  price: number
  params: Record<string, number | string>
}

/** выбор опций позиции (хранится в order_items.options) */
export interface ItemOptions {
  system?: string
  glass?: string
  sill?: { id: string; length_mm?: number; qty?: number }
  ebb?: { id: string; length_mm?: number; qty?: number }
  hardware?: string // на каждую створку
  door_hardware?: string // на каждую дверь вместо оконной
  net?: string
  color?: string
  lamination?: string
  misc?: string[]
  works?: string[]
  extras?: { id: string; length_mm?: number; qty?: number }[]
}

export interface QuoteLine {
  item_id: string
  part: string // часть позиции на складе: rama/impost/… у системы, '' — сама позиция
  kind: string
  name: string
  qty: number
  unit: Unit
  price: number
  sum: number
}
export interface Material {
  item_id: string
  part: string
  name: string
  qty: number
  unit: Unit
}
export interface Quote {
  lines: QuoteLine[]
  cost: number // за 1 изделие
  materials: Material[] // за 1 изделие, без цен (видно цеху, списывается со склада)
  missing: string[] // выбранные позиции без цены (0) — подсказка Rahbar
}

/** единица части на складе: заглушки — штуки, профиль/резина сетки — метры */
export const partUnit = (unit: Unit, part: string): Unit => (part === 'zaglushka' ? 'pcs' : ['profil', 'rezina'].includes(part) ? 'm' : unit)

const SYS_PARTS: { key: string; label: string; m: (x: Measure) => number }[] = [
  { key: 'frame', label: 'rama', m: (x) => x.frame_m },
  { key: 'impost', label: 'impost', m: (x) => x.impost_m },
  { key: 'sash', label: 'tavaqa', m: (x) => x.sash_m },
  { key: 'bead', label: 'shtapik', m: (x) => x.bead_m },
  { key: 'gasket', label: 'rezina', m: (x) => x.gasket_m },
]

const r3 = (n: number) => Math.round(n * 1000) / 1000

/** количество по единице каталога для «на изделие» позиций (работы, разное, цвет) */
function qtyByUnit(unit: Unit, m: Measure): number {
  if (unit === 'm2') return m.area_m2
  if (unit === 'm') return m.frame_m
  return 1
}

export function quoteItem(m: Measure, opt: ItemOptions, catalog: Map<string, CatalogItem>, widthMm: number): Quote {
  const lines: QuoteLine[] = []
  const missing: string[] = []
  const add = (it: CatalogItem | undefined, qty: number, label?: string, price?: number) => {
    if (!it || qty <= 0) return
    const p = price ?? (Number(it.price) || 0)
    if (!p) missing.push(label ? `${it.name} (${label})` : it.name)
    lines.push({ item_id: it.id, part: label ?? '', kind: it.kind, name: label ? `${it.name} — ${label}` : it.name, qty: r3(qty), unit: partUnit(it.unit, label ?? ''), price: p, sum: round2(qty * p) })
  }

  const sys = opt.system ? catalog.get(opt.system) : undefined
  if (sys) for (const part of SYS_PARTS) add(sys, part.m(m), part.label, Number(sys.params?.[part.key] ?? 0))

  add(opt.glass ? catalog.get(opt.glass) : undefined, m.glass_m2)

  for (const k of ['sill', 'ebb'] as const) {
    const sel = opt[k]
    const it = sel ? catalog.get(sel.id) : undefined
    if (!it || !sel) continue
    const qty = sel.qty ?? 1
    add(it, ((sel.length_mm ?? widthMm) / 1000) * qty)
    if (k === 'ebb' && Number(it.params?.side_cap)) add(it, 2 * qty, 'zaglushka', Number(it.params.side_cap))
  }

  const windowSashes = m.sashes - m.doors
  add(opt.hardware ? catalog.get(opt.hardware) : undefined, windowSashes)
  add(opt.door_hardware ? catalog.get(opt.door_hardware) : opt.hardware ? catalog.get(opt.hardware) : undefined, m.doors)

  const net = opt.net ? catalog.get(opt.net) : undefined
  if (net && m.nets_m2 > 0) {
    add(net, m.nets_m2)
    if (Number(net.params?.profile)) add(net, m.nets_m, 'profil', Number(net.params.profile))
    if (Number(net.params?.gasket)) add(net, m.nets_m, 'rezina', Number(net.params.gasket))
  }

  for (const id of [opt.color, opt.lamination, ...(opt.misc ?? []), ...(opt.works ?? [])]) {
    const it = id ? catalog.get(id) : undefined
    if (it) add(it, qtyByUnit(it.unit, m))
  }
  for (const ex of opt.extras ?? []) {
    const it = catalog.get(ex.id)
    if (it) add(it, it.unit === 'm' ? ((ex.length_mm ?? widthMm) / 1000) * (ex.qty ?? 1) : ex.qty ?? 1)
  }

  // расход материалов: суммы по позиции каталога (без цен) — для цеха/склада
  const mat = new Map<string, Material>()
  for (const l of lines) {
    const it = catalog.get(l.item_id)!
    if (it.kind === 'work' || it.kind === 'color') continue
    const key = l.name
    const prev = mat.get(key)
    mat.set(key, { item_id: l.item_id, part: l.part, name: l.name, unit: l.unit, qty: r3((prev?.qty ?? 0) + l.qty) })
  }

  return { lines, cost: round2(lines.reduce((s, l) => s + l.sum, 0)), materials: [...mat.values()], missing: [...new Set(missing)] }
}
