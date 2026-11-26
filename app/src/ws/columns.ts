import type { ItemOptions, QuoteLine } from '../lib/quote'
import { selList } from '../lib/quote'
import type { Measure } from '../lib/window'

// Колонки нижней таблицы WinStudio в порядке экрана (сняты с V44.4 живыми дампами 23.11.2026):
// позиция | площадь | рамы | импосты | штапики | уплотн. | створки | двер.створки | стекла | сэндв.п. | шпросы | ламин.внутр. | ламин.внеш. | работы | подоконники | отливы |
// фурнитура | моск.сетки | разное | подстав.проф | порог | наличн.углов | соединит.проф | соед.проф.90° | соед.проф.135° | нащельники | добор.15…100 | всего
export const WS_COLS = [
  'area', 'frame', 'impost', 'bead', 'gasket', 'sash', 'doorSash', 'glass', 'sandwich', 'spros', 'lamIn', 'lamOut', 'works', 'sills', 'ebbs', 'hardware', 'nets', 'misc',
  'support', 'threshold', 'corner', 'connect', 'connect90', 'connect135', 'nashelnik', 'dobor15', 'dobor20', 'dobor40', 'dobor60', 'dobor80', 'dobor100',
] as const
export type WsCol = (typeof WS_COLS)[number]

/** колонка строки расчёта: у новых строк проставлена при расчёте (col), у старых сохранённых заказов — по названию части */
export function colOfLine(l: QuoteLine): WsCol | null {
  if (l.col && (WS_COLS as readonly string[]).includes(l.col)) return l.col as WsCol
  if (l.kind === 'net') return 'nets' // профиль, резина, уголки, ручки сетки — всё в колонке «моск.сетки»
  const p = l.part
  if (p === 'rama' || p === 'armatura rama' || p.startsWith('burchak kuchaytirgich rama')) return 'frame'
  if (p === 'impost' || p === 'armatura impost' || p === 'impost konnektor') return 'impost'
  if (p === 'shtapik') return 'bead'
  if (p === 'rezina') return 'gasket'
  if (p === 'tavaqa' || p === 'armatura tavaqa' || p.startsWith('mexanika') || p.startsWith('burchak kuchaytirgich tavaqa')) return 'sash'
  if (p === 'armatura eshik') return 'doorSash'
  if (p === 'sendvich panel') return 'sandwich'
  if (l.kind === 'glass') return 'glass'
  if (l.kind === 'sill') return 'sills'
  if (l.kind === 'ebb') return 'ebbs'
  if (l.kind === 'hardware') return 'hardware'
  if (l.kind === 'net') return 'nets'
  if (l.kind === 'work') return 'works'
  if (l.kind === 'misc') return 'misc'
  if (l.kind === 'lamination' || p === 'ichki') return 'lamIn'
  if (p === 'tashqi') return 'lamOut'
  if (p === 'tayanch profil') return 'support'
  if (p === "bo'sag'a") return 'threshold'
  if (p === 'burchak peshtoq') return 'corner'
  if (p === 'ulovchi profil') return 'connect'
  if (p === 'ulovchi profil 90°') return 'connect90'
  if (p === 'ulovchi profil 135°') return 'connect135'
  if (p === 'qoplama (nashelnik)') return 'nashelnik'
  const d = /^dobor (\d+) mm$/.exec(p)
  if (d) return `dobor${d[1]}` as WsCol
  return null
}

/** стоимость по колонкам для одного окна */
export function columnCosts(lines: QuoteLine[]): Partial<Record<WsCol, number>> {
  const out: Partial<Record<WsCol, number>> = {}
  for (const l of lines) {
    const c = colOfLine(l)
    if (c) out[c] = (out[c] ?? 0) + l.sum
  }
  return out
}

/** количество по колонкам для одного окна (строка «окно»): м², м, шт — как показывает WinStudio */
export function columnQty(m: Measure, o: ItemOptions, widthMm: number, heightMm: number): Partial<Record<WsCol, { v: number; unit: 'm2' | 'm' | 'pcs' }>> {
  const sd = o.sides ?? {}
  const sideM = (s?: string[]) => ((s ?? []).reduce((a, x) => a + (x === 'l' || x === 'r' ? heightMm : widthMm), 0)) / 1000
  // точные (неокруглённые) значения: WinStudio округляет только при показе, а «все окна» = точное × количество
  // (живая сверка 25.11.2026: створки 4.264 → «4.26», а не 4.27 из разности округлённых; 3 окна × 3.4233 → «10.27»)
  const e = m.exact ?? m
  const out: Partial<Record<WsCol, { v: number; unit: 'm2' | 'm' | 'pcs' }>> = {
    area: { v: e.area_m2, unit: 'm2' },
    frame: { v: e.frame_m, unit: 'm' },
    impost: { v: e.impost_m, unit: 'm' },
    bead: { v: e.bead_m, unit: 'm' },
    gasket: { v: e.gasket_m, unit: 'm' },
    sash: { v: e.sash_m - e.door_sash_m, unit: 'm' },
    doorSash: { v: e.door_sash_m, unit: 'm' },
    glass: { v: e.glass_m2, unit: 'm2' },
    sandwich: { v: e.sandwich_m2, unit: 'm2' },
  }
  if (o.lamination_in) out.lamIn = { v: m.lam_in_m2, unit: 'm2' }
  if (o.lamination_out) out.lamOut = { v: m.lam_out_m2, unit: 'm2' }
  const sills = selList(o, 'sill').reduce((a, s) => a + ((s.length_mm ?? widthMm) / 1000) * (s.qty ?? 1), 0)
  if (sills) out.sills = { v: sills, unit: 'm' }
  const ebbs = selList(o, 'ebb').reduce((a, s) => a + ((s.length_mm ?? widthMm) / 1000) * (s.qty ?? 1), 0)
  if (ebbs) out.ebbs = { v: ebbs, unit: 'm' }
  // WinStudio в строке «окно» колонки «моск.сетки» показывает число сеток («1 шт»), а не площадь (сверка 25.11.2026)
  if (o.net && m.nets > 0) out.nets = { v: m.nets, unit: 'pcs' }
  if (sd.support) out.support = { v: widthMm / 1000, unit: 'm' }
  if (sd.threshold) out.threshold = { v: widthMm / 1000, unit: 'm' }
  if (sd.corner) out.corner = { v: heightMm / 1000, unit: 'm' }
  for (const k of ['connect', 'connect90', 'connect135', 'nashelnik'] as const) if (sd[k]?.length) out[k] = { v: sideM(sd[k]), unit: 'm' }
  // стыки рам составного окна (Г/Т) WinStudio показывает в «соединит.проф» сама (сверка v14–v16: 1.30 m)
  if (m.join_m > 0) out.connect = { v: (out.connect?.v ?? 0) + m.join_m, unit: 'm' }
  for (const d of ['15', '20', '40', '60', '80', '100'] as const) {
    const s = sd.dobor?.[d]
    if (s?.length) out[`dobor${d}` as WsCol] = { v: sideM(s), unit: 'm' }
  }
  return out
}

export type QtyMap = Partial<Record<WsCol, { v: number; unit: 'm2' | 'm' | 'pcs' }>>
export type CostMap = Partial<Record<WsCol, number>>

/** строки «все окна» и «стоимость» WinStudio — итог по ВСЕМ окнам заказа с учётом количества каждого (проверено вживую: при двух окнах «все окна» = сумма обоих) */
export function aggregate(rows: { qty: QtyMap; cost: CostMap; count: number; noDiscount: number; withDiscount: number; own?: boolean }[]): { qty: QtyMap; cost: CostMap; noDiscount: number; withDiscount: number } {
  const qty: QtyMap = {}
  const cost: CostMap = {}
  let noDiscount = 0
  let withDiscount = 0
  for (const r of rows) {
    for (const [k, x] of Object.entries(r.qty) as [WsCol, { v: number; unit: 'm2' | 'm' | 'pcs' }][]) qty[k] = { v: (qty[k]?.v ?? 0) + x.v * r.count, unit: x.unit }
    // окна со «своей ценой» WinStudio в строку «стоимость» по колонкам не включает (сверка p01/p02 26.11.2026); в итог — включает
    if (!r.own) for (const [k, x] of Object.entries(r.cost) as [WsCol, number][]) cost[k] = (cost[k] ?? 0) + x * r.count
    noDiscount += r.noDiscount * r.count
    withDiscount += r.withDiscount * r.count
  }
  return { qty, cost, noDiscount, withDiscount }
}