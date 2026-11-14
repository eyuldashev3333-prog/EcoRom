// Раскрой профиля: длины деталей окна → резка из обрезков и хлыстов.
// Длины деталей — наружные (как в расчёте метров): рама = стороны, импост = пролёт − 2×impostCut, створка = просвет + нахлёст, штапик = стекло.
import { arcLength, DEFAULT_DIMS, frameSides, hasSash, impostPieces, layout, measure, type Dims, type WindowDesign } from './window'

export type ProfPart = 'rama' | 'impost' | 'tavaqa' | 'shtapik'
export const PROF_PARTS: ProfPart[] = ['rama', 'impost', 'tavaqa', 'shtapik']

/** длины деталей одного окна по частям профиля, мм (целые) */
export function windowPieces(d: WindowDesign, dims: Dims = DEFAULT_DIMS): Record<ProfPart, number[]> {
  const W = d.width
  const H = d.height
  const rise = d.shape === 'arch' ? Math.min(d.archRise ?? 0, W / 2, H) : 0
  const rama = rise > 0 ? [W, H - rise, H - rise, arcLength(W, rise)] : [W, W, H, H]
  const { cells, dividers } = layout(d)
  const impost = impostPieces(cells, dividers, dims.impostCut)
  const tavaqa: number[] = []
  for (const { leaf, rect } of cells) {
    if (leaf.void || !hasSash(leaf.opening)) continue
    const fs = frameSides(cells, rect, W, H)
    const cut = (t: boolean) => (t ? dims.frameCut : 0)
    const sw = rect.w - cut(fs.l) - cut(fs.r) + 2 * dims.sashOverlap
    const sh = rect.h - cut(fs.t) - cut(fs.b) + 2 * dims.sashOverlap
    tavaqa.push(sw, sw, sh, sh)
  }
  const shtapik: number[] = []
  for (const p of measure(d, dims).panes) shtapik.push(p.w, p.w, p.h, p.h)
  const clean = (xs: number[]) => xs.map((x) => Math.round(x)).filter((x) => x > 0)
  return { rama: clean(rama), impost: clean(impost), tavaqa: clean(tavaqa), shtapik: clean(shtapik) }
}

export interface Offcut {
  id: string
  length: number // мм
}
export interface Bar {
  source: 'offcut' | 'new'
  offcutId?: string
  length: number // мм, исходная длина куска
  cuts: number[]
  left: number // мм, что осталось после резки (с учётом пропилов)
}
export interface CutPlan {
  bars: Bar[]
  unplaced: number[] // детали длиннее хлыста
}

/**
 * Жадный раскрой (FFD): детали по убыванию; кладём в уже начатый кусок с наименьшим подходящим остатком,
 * иначе берём наименьший подходящий обрезок, иначе новый хлыст. kerf — пропил на каждый рез.
 */
export function planCuts(pieces: number[], offcuts: Offcut[], barLen: number, kerf: number): CutPlan {
  const free = [...offcuts].sort((a, b) => a.length - b.length)
  const bars: Bar[] = []
  const unplaced: number[] = []
  for (const p of [...pieces].sort((a, b) => b - a)) {
    let best: Bar | null = null
    for (const b of bars) if (b.left >= p && (!best || b.left < best.left)) best = b
    if (!best) {
      const i = free.findIndex((o) => o.length >= p)
      if (i >= 0) {
        const o = free.splice(i, 1)[0]
        best = { source: 'offcut', offcutId: o.id, length: o.length, cuts: [], left: o.length }
        bars.push(best)
      } else if (p <= barLen) {
        best = { source: 'new', length: barLen, cuts: [], left: barLen }
        bars.push(best)
      }
    }
    if (!best) {
      unplaced.push(p)
      continue
    }
    best.cuts.push(p)
    best.left = Math.max(0, best.left - p - kerf)
  }
  return { bars, unplaced }
}

export interface PlanSummary {
  newBars: number
  usedOffcuts: number
  cutMm: number
  leftMm: number // сумма остатков (годных и негодных)
  wastePct: number // доля потерь = остатки < minLeft + пропилы
  leftovers: number[] // остатки ≥ minLeft — станут обрезками
}
export function summarize(plan: CutPlan, minLeft: number): PlanSummary {
  const newBars = plan.bars.filter((b) => b.source === 'new').length
  const usedOffcuts = plan.bars.filter((b) => b.source === 'offcut').length
  const cutMm = plan.bars.reduce((s, b) => s + b.cuts.reduce((a, c) => a + c, 0), 0)
  const leftMm = plan.bars.reduce((s, b) => s + b.left, 0)
  const leftovers = plan.bars.map((b) => b.left).filter((l) => l >= minLeft)
  const lost = plan.bars.reduce((s, b) => s + b.length, 0) - cutMm - leftovers.reduce((a, c) => a + c, 0)
  const used = plan.bars.reduce((s, b) => s + b.length, 0)
  return { newBars, usedOffcuts, cutMm, leftMm, wastePct: used ? Math.round((1000 * lost) / used) / 10 : 0, leftovers }
}
