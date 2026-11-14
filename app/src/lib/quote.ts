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

export type Side = 'l' | 't' | 'r' | 'b' // слева, сверху, справа, снизу
export const SIDES: Side[] = ['l', 't', 'r', 'b']
export const DOBOR = ['15', '20', '40', '60', '80', '100'] as const
export type Dobor = (typeof DOBOR)[number]
export interface Sel {
  id: string
  length_mm?: number
  qty?: number
}
/** профили по сторонам окна; цены метра лежат в параметрах оконной системы (support, threshold, corner, connect, connect90, connect135, nashelnik, dobor15…dobor100) */
export interface SideOpts {
  support?: boolean // подставочный профиль (по ширине)
  threshold?: boolean // порог (по ширине)
  corner?: boolean // наличник угловой (по ширине)
  connect?: Side[]
  connect90?: Side[]
  connect135?: Side[]
  nashelnik?: Side[]
  dobor?: Partial<Record<Dobor, Side[]>>
}

/** выбор опций позиции (хранится в order_items.options) */
export interface ItemOptions {
  system?: string
  glass?: string
  // sill/ebb — зеркало первого выбранного (на них смотрит SQL монтажа: options ? 'sill'); полный список — sills/ebbs
  sill?: Sel
  ebb?: Sel
  sills?: Sel[]
  ebbs?: Sel[]
  lamination_in?: string // ламинация внутри (руб/м²)
  lamination_out?: string // ламинация снаружи
  own_price?: number // своя цена окна для клиента (до скидки), заменяет расчётную
  scheme?: string // финансовая схема окна (id из настроек прайса); без неё — скидка и наценка заказа
  sides?: SideOpts
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
  work_cost: number // часть cost — работы (kind 'work'); на неё действует «маржа работ» финансовой схемы
  materials: Material[] // за 1 изделие, без цен (видно цеху, списывается со склада)
  missing: string[] // выбранные позиции без цены (0) — подсказка Rahbar
  unknown: string[] // выбранные позиции, которых нет в каталоге (удалены/скрыты) — считать нельзя
}

/** единица части на складе: заглушки — штуки, профиль/резина сетки — метры */
export const partUnit = (unit: Unit, part: string): Unit => (part === 'zaglushka' ? 'pcs' : ['profil', 'rezina'].includes(part) ? 'm' : unit)

const SYS_PARTS: { key: string; label: string; m: (x: Measure) => number }[] = [
  { key: 'frame', label: 'rama', m: (x) => x.frame_m },
  { key: 'impost', label: 'impost', m: (x) => x.impost_m },
  { key: 'sash', label: 'tavaqa', m: (x) => r3(x.sash_m - x.door_sash_m) },
  { key: 'bead', label: 'shtapik', m: (x) => x.bead_m },
  { key: 'gasket', label: 'rezina', m: (x) => x.gasket_m },
]
// Колонки таблицы оконных систем, которые считаются только если в прайсе стоит цена (>0): иначе строка не добавляется и не даёт «нет цены».
// Предположения (подтвердить у владельца): комплект механики — на каждую оконную створку по типу открывания; армировка — по длине профиля;
// усилитель угла рамы — 4 на окно, угла створки — по 4 на створку; коннектор импоста — 2 на отрезок импоста.
const MECH_BY_OPENING: Record<string, string> = { tt_l: 'mech_tt', tt_r: 'mech_tt', turn_l: 'mech_h', turn_r: 'mech_h', tilt: 'mech_v', top: 'mech_v', slide_l: 'mech_slide', slide_r: 'mech_slide' }

const r3 = (n: number) => Math.round(n * 1000) / 1000

/** количество по единице каталога для «на изделие» позиций (работы, разное, цвет) */
function qtyByUnit(unit: Unit, m: Measure): number {
  if (unit === 'm2') return m.area_m2
  if (unit === 'm') return m.frame_m
  return 1
}

/** на что умножать цену строки: params.basis = pcs | m2 | perimeter | width | height (как колонки «шт/m2/m…» в таблицах WinStudio), иначе по единице */
function qtyOf(it: CatalogItem, m: Measure, W: number, H: number): number {
  switch (String(it.params?.basis ?? '')) {
    case 'pcs': return 1
    case 'm2': return m.area_m2
    case 'perimeter': return (2 * (W + H)) / 1000
    case 'width': return W / 1000
    case 'height': return H / 1000
    default: return qtyByUnit(it.unit, m)
  }
}

/** стоимость работ в строках расчёта (для замороженных позиций считается по сохранённым строкам) */
export const workCost = (lines: QuoteLine[]): number => round2(lines.filter((l) => l.kind === 'work').reduce((s, l) => s + l.sum, 0))

/** список подоконников/отливов: новый массив, либо старое одиночное поле */
export const selList = (o: ItemOptions, k: 'sill' | 'ebb'): Sel[] => (k === 'sill' ? o.sills : o.ebbs) ?? (o[k] ? [o[k] as Sel] : [])

/** приводит опции к виду для хранения: sill/ebb — зеркало первого выбора (ключи нужны SQL монтажа), пустое удаляется */
export function mirrorOptions(o: ItemOptions): ItemOptions {
  const out: ItemOptions = { ...o }
  for (const [k, list] of [['sill', 'sills'], ['ebb', 'ebbs']] as const) {
    const arr = out[list]
    if (arr && arr.length) out[k] = arr[0]
    else {
      delete out[k]
      delete out[list]
    }
  }
  return out
}

const sideMeters = (sides: Side[] | undefined, W: number, H: number) => (sides ?? []).reduce((s, x) => s + (x === 'l' || x === 'r' ? H : W), 0) / 1000
const SIDE_ROLES: { key: 'connect' | 'connect90' | 'connect135' | 'nashelnik'; label: string }[] = [
  { key: 'connect', label: "ulovchi profil" },
  { key: 'connect90', label: 'ulovchi profil 90°' },
  { key: 'connect135', label: 'ulovchi profil 135°' },
  { key: 'nashelnik', label: 'qoplama (nashelnik)' },
]
const FLAG_ROLES: { key: 'support' | 'threshold' | 'corner'; label: string }[] = [
  { key: 'support', label: 'tayanch profil' },
  { key: 'threshold', label: "bo'sag'a" },
  { key: 'corner', label: 'burchak peshtoq' },
]
export const hasSides = (s?: SideOpts) =>
  !!s && (!!s.support || !!s.threshold || !!s.corner || SIDE_ROLES.some((r) => (s[r.key] ?? []).length > 0) || DOBOR.some((d) => (s.dobor?.[d] ?? []).length > 0))

export function quoteItem(m: Measure, opt: ItemOptions, catalog: Map<string, CatalogItem>, widthMm: number, heightMm: number = widthMm): Quote {
  const lines: QuoteLine[] = []
  const missing: string[] = []
  const add = (it: CatalogItem | undefined, qty: number, label?: string, price?: number, unit?: Unit) => {
    if (!it || qty <= 0) return
    const p = price ?? (Number(it.price) || 0)
    if (!p) missing.push(label ? `${it.name} (${label})` : it.name)
    lines.push({ item_id: it.id, part: label ?? '', kind: it.kind, name: label ? `${it.name} — ${label}` : it.name, qty: r3(qty), unit: unit ?? partUnit(it.unit, label ?? ''), price: p, sum: round2(qty * p) })
  }
  // необязательная колонка прайса: добавляется только при цене > 0
  const addIf = (it: CatalogItem | undefined, key: string, qty: number, label: string, unit: Unit) => {
    const p = Number(it?.params?.[key] ?? 0)
    if (it && p > 0 && qty > 0) add(it, qty, label, p, unit)
  }

  const sys = opt.system ? catalog.get(opt.system) : undefined
  if (sys) {
    for (const part of SYS_PARTS) add(sys, part.m(m), part.label, Number(sys.params?.[part.key] ?? 0))
    // дверная створка: отдельная цена метра, иначе как у обычной
    if (m.door_sash_m > 0) add(sys, m.door_sash_m, 'tavaqa', Number(sys.params?.door_sash ?? 0) || Number(sys.params?.sash ?? 0))
    addIf(sys, 'sandwich', m.sandwich_m2, 'sendvich panel', 'm2')
    addIf(sys, 'armor_frame', m.frame_m, 'armatura rama', 'm')
    addIf(sys, 'armor_impost', m.impost_m, 'armatura impost', 'm')
    addIf(sys, 'armor_sash', r3(m.sash_m - m.door_sash_m), 'armatura tavaqa', 'm')
    addIf(sys, 'armor_door', m.door_sash_m, 'armatura eshik', 'm')
    for (const [o, n] of Object.entries(m.sash_by)) {
      const key = MECH_BY_OPENING[o]
      if (key && n) addIf(sys, key, n, `mexanika ${key.slice(5)}`, 'pcs')
    }
    addIf(sys, 'corner_frame', 4, 'burchak kuchaytirgich rama', 'pcs')
    addIf(sys, 'corner_sash', 4 * m.sashes, 'burchak kuchaytirgich tavaqa', 'pcs')
    addIf(sys, 'connector', 2 * m.imposts, 'impost konnektor', 'pcs')
  }

  // стеклопакет: если в прайсе заполнены составляющие (стекло 1–3, плёнка, газ — за м²; спейсер, осушитель, бутил, герметик — за м периметра стёкол) — считаем по ним, иначе цена за м²
  const gl = opt.glass ? catalog.get(opt.glass) : undefined
  const glassParts = ['glass1', 'glass2', 'glass3', 'film', 'gas', 'spacer', 'desiccant', 'butyl', 'sealant']
  if (gl && glassParts.some((k) => Number(gl.params?.[k] ?? 0) > 0)) {
    const perim = m.panes.reduce((s, p) => s + (2 * (p.w + p.h)) / 1000, 0)
    for (const [k, l] of [['glass1', 'stekla 1'], ['glass2', 'stekla 2'], ['glass3', 'stekla 3'], ['film', 'plyonka'], ['gas', 'gaz']] as const) addIf(gl, k, m.glass_m2, l, 'm2')
    for (const [k, l] of [['spacer', 'spreyser'], ['desiccant', 'quritgich'], ['butyl', 'butil lenta'], ['sealant', 'germetik']] as const) addIf(gl, k, perim, l, 'm')
  } else add(gl, m.glass_m2)

  for (const k of ['sill', 'ebb'] as const) {
    for (const sel of selList(opt, k)) {
      const it = catalog.get(sel.id)
      if (!it) continue
      const qty = sel.qty ?? 1
      add(it, ((sel.length_mm ?? widthMm) / 1000) * qty)
      // боковые заглушки есть и у отлива (side_cap), и у подоконника (по 2 на изделие)
      if (Number(it.params?.side_cap)) add(it, 2 * qty, 'zaglushka', Number(it.params.side_cap))
    }
  }

  const windowSashes = m.sashes - m.doors
  const hw = opt.hardware ? catalog.get(opt.hardware) : undefined
  add(hw, windowSashes)
  const dhw = opt.door_hardware ? catalog.get(opt.door_hardware) : hw
  add(dhw, m.doors)
  // ручки: простая — на оконную створку, балконная — на дверную (предположение, подтвердить у владельца)
  addIf(hw, 'handle_simple', windowSashes, 'ruchka', 'pcs')
  addIf(dhw, 'handle_balcony', m.doors, 'ruchka balkon', 'pcs')

  const net = opt.net ? catalog.get(opt.net) : undefined
  if (net && m.nets_m2 > 0) {
    add(net, m.nets_m2)
    if (Number(net.params?.profile)) add(net, m.nets_m, 'profil', Number(net.params.profile))
    if (Number(net.params?.gasket)) add(net, m.nets_m, 'rezina', Number(net.params.gasket))
    // уголки — 4 на сетку, держатели — 4, ручка-петелька — 1 (предположение)
    addIf(net, 'corner', 4 * m.nets, 'burchak', 'pcs')
    addIf(net, 'holder', 4 * m.nets, 'ushlagich', 'pcs')
    addIf(net, 'pull', m.nets, 'ruchka-petelka', 'pcs')
  }

  for (const id of [opt.color, opt.lamination, ...(opt.misc ?? []), ...(opt.works ?? [])]) {
    const it = id ? catalog.get(id) : undefined
    if (it) add(it, qtyOf(it, m, widthMm, heightMm))
  }
  // ламинация внутри/снаружи — каждая по площади окна
  for (const [id, label] of [[opt.lamination_in, 'ichki'], [opt.lamination_out, 'tashqi']] as const) {
    const it = id ? catalog.get(id) : undefined
    if (it) add(it, m.area_m2, label)
  }

  // профили по сторонам: цена метра берётся из параметров оконной системы
  if (hasSides(opt.sides)) {
    const sd = opt.sides as SideOpts
    if (!sys) missing.push("Tizim tanlanmagan (profil qo'shimchalari)")
    else {
      const addM = (key: string, label: string, meters: number) => meters > 0 && add(sys, meters, label, Number(sys.params?.[key] ?? 0))
      for (const r of FLAG_ROLES) if (sd[r.key]) addM(r.key, r.label, widthMm / 1000)
      for (const r of SIDE_ROLES) addM(r.key, r.label, sideMeters(sd[r.key], widthMm, heightMm))
      for (const d of DOBOR) addM(`dobor${d}`, `dobor ${d} mm`, sideMeters(sd.dobor?.[d], widthMm, heightMm))
    }
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

  const chosen = [opt.system, opt.glass, ...selList(opt, 'sill').map((x) => x.id), ...selList(opt, 'ebb').map((x) => x.id), opt.lamination_in, opt.lamination_out, opt.hardware, opt.door_hardware, opt.net, opt.color, opt.lamination, ...(opt.misc ?? []), ...(opt.works ?? []), ...(opt.extras ?? []).map((x) => x.id)]
  const unknown = [...new Set(chosen.filter((id): id is string => !!id && !catalog.get(id)))]
  return { lines, cost: round2(lines.reduce((s, l) => s + l.sum, 0)), work_cost: workCost(lines), materials: [...mat.values()], missing: [...new Set(missing)], unknown }
}
