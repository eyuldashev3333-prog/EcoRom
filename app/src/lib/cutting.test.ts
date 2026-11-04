import { describe, expect, it } from 'vitest'
import { planCuts, summarize, windowPieces } from './cutting'
import { measure, newDesign } from './window'

describe('windowPieces', () => {
  it('глухое окно: рама из 4 сторон, одно стекло — 4 штапика, без импостов и створок', () => {
    const p = windowPieces(newDesign(1200, 1500))
    expect(p.rama.sort()).toEqual([1200, 1200, 1500, 1500])
    expect(p.impost).toEqual([])
    expect(p.tavaqa).toEqual([])
    expect(p.shtapik).toHaveLength(4)
  })

  it('сумма длин деталей совпадает с метрами расчёта (±1 мм на деталь)', () => {
    const d = newDesign(1800, 1400)
    const m = measure(d)
    const p = windowPieces(d)
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / 1000
    expect(sum(p.rama)).toBeCloseTo(m.frame_m, 1)
    expect(sum(p.shtapik)).toBeCloseTo(m.bead_m, 1)
  })
})

describe('planCuts', () => {
  it('два куска по 2,9 м влезают в один хлыст 6 м с пропилами', () => {
    const plan = planCuts([2900, 2900], [], 6000, 4)
    expect(plan.bars).toHaveLength(1)
    expect(plan.bars[0].left).toBe(6000 - 2 * 2900 - 8)
  })

  it('сначала берёт подходящий обрезок, а не новый хлыст', () => {
    const plan = planCuts([1500], [{ id: 'a', length: 1400 }, { id: 'b', length: 1600 }, { id: 'c', length: 5000 }], 6000, 4)
    expect(plan.bars).toHaveLength(1)
    expect(plan.bars[0]).toMatchObject({ source: 'offcut', offcutId: 'b' })
  })

  it('деталь длиннее хлыста — в unplaced', () => {
    const plan = planCuts([7000, 1000], [], 6000, 4)
    expect(plan.unplaced).toEqual([7000])
    expect(plan.bars).toHaveLength(1)
  })

  it('остаток кладёт в самый плотный начатый кусок (best fit)', () => {
    const plan = planCuts([3000, 2500, 1000], [], 6000, 0)
    // 3000+2500 = 5500 → хлыст №1 (остаток 500), 1000 не влезает → хлыст №2
    expect(plan.bars).toHaveLength(2)
    expect(plan.bars[0].cuts).toEqual([3000, 2500])
  })

  it('summarize: остатки ≥ минимума становятся обрезками, потери — остальное', () => {
    const plan = planCuts([4000], [], 6000, 0)
    const s = summarize(plan, 300)
    expect(s).toMatchObject({ newBars: 1, usedOffcuts: 0, cutMm: 4000, leftMm: 2000, leftovers: [2000], wastePct: 0 })
    const s2 = summarize(plan, 3000)
    expect(s2.leftovers).toEqual([])
    expect(s2.wastePct).toBeCloseTo(33.3, 1)
  })
})
