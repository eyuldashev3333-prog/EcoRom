import { describe, expect, it } from 'vitest'
import { equalize, gridLeaf, hasUnequalParts, layout, measure, newDesign, setPartSize, splitLeaf, updateLeaf } from './window'

describe('Г-образное окно (пустая ячейка)', () => {
  it('вырез слева сверху: рама = габарит, импост только там, где с обеих сторон стекло', () => {
    const b = newDesign(1500, 1500)
    let d = splitLeaf(b, b.root.id, 'v', 3) // 500 | 500 | 500
    d = splitLeaf(d, layout(d).cells[0].leaf.id, 'h') // левая колонка: 750 + 750
    d = updateLeaf(d, layout(d).cells[0].leaf.id, { void: true })
    const m = measure(d)
    expect(m.area_m2).toBe(1.88) // 2.25 − вырез 500×750 (0.375), округление до сотых
    expect(m.frame_m).toBe(6)
    // вертикаль слева|центр: только нижние 750 → 750−100; вертикаль центр|право: 1500−100; горизонталь у выреза — не импост
    expect(m.impost_m).toBe(2.05)
    expect(m.panes).toHaveLength(3)
    // нижняя левая ячейка: рама слева, снизу и сверху (вырез), импост справа → 500−47.5−27.5 × 750−95
    const p = m.panes[0]
    expect([p.w, p.h]).toEqual([425, 655])
  })
})

describe('деление сеткой и сэндвич-панель', () => {
  it('3×2 клеток: 2 вертикальных и 3 горизонтальных импоста (в каждой колонке по одному)', () => {
    const b = newDesign(1500, 1500)
    const d = gridLeaf(b, b.root.id, 3, 2)
    const cells = layout(d).cells
    expect(cells).toHaveLength(6)
    expect(cells.every((c) => c.rect.w === 500 && c.rect.h === 750)).toBe(true)
    expect(measure(d).panes).toHaveLength(6)
  })
  it('сетка внутри одной части не трогает остальные', () => {
    let d = splitLeaf(newDesign(1500, 1500), newDesign(1500, 1500).root.id, 'v')
    d = (() => { const b = newDesign(1500, 1500); const s = splitLeaf(b, b.root.id, 'v'); return gridLeaf(s, layout(s).cells[1].leaf.id, 1, 3) })()
    expect(layout(d).cells.map((c) => [c.rect.x, c.rect.w, c.rect.h])).toEqual([[0, 750, 1500], [750, 750, 500], [750, 750, 500], [750, 750, 500]])
  })
  it('панель: нет стекла и штапика, площадь в sandwich_m2', () => {
    const b = newDesign(1500, 1500)
    const s = splitLeaf(b, b.root.id, 'h')
    const withPanel = updateLeaf(s, layout(s).cells[1].leaf.id, { panel: true })
    const m = measure(withPanel)
    expect(m.panes).toHaveLength(1)
    expect(m.sandwich_m2).toBeGreaterThan(0.9)
    expect(m.bead_m).toBeLessThan(measure(s).bead_m)
  })
})

describe('уравнять размеры', () => {
  it('определяет неравные части и выравнивает поровну', () => {
    const b = newDesign(1500, 1500)
    const d = splitLeaf(b, b.root.id, 'v', 3)
    expect(hasUnequalParts(d)).toBe(false)
    const u = setPartSize(d, d.root.id, 0, 700)
    expect(hasUnequalParts(u)).toBe(true)
    const e = equalize(u)
    expect(layout(e).cells.map((c) => c.rect.w)).toEqual([500, 500, 500])
    expect(hasUnequalParts(e)).toBe(false)
  })
  it('вложенные деления выравниваются в своей области', () => {
    const b = newDesign(1500, 1500)
    let d = splitLeaf(b, b.root.id, 'v')
    d = splitLeaf(d, layout(d).cells[1].leaf.id, 'h', 3)
    const e = equalize(setPartSize(d, d.root.id, 0, 500))
    expect(layout(e).cells.map((c) => [c.rect.w, c.rect.h])).toEqual([[750, 1500], [750, 500], [750, 500], [750, 500]])
  })
})

// Эталоны из записи экрана WinStudio от 13.11.2026 (docs/WINSTUDIO.md), окно 1500×1500, 2 вертикальные части.
const two = () => {
  const b = newDesign(1500, 1500)
  return splitLeaf(b, b.root.id, 'v')
}

describe('WinStudio 13.11.2026: 1500×1500', () => {
  it('две глухие части: 2.25 / 6.00 / 1.40 / 8.32 / 8.32', () => {
    const m = measure(two())
    expect([m.area_m2, m.frame_m, m.impost_m, m.bead_m, m.gasket_m, m.sash_m]).toEqual([2.25, 6, 1.4, 8.32, 8.32, 0])
  })
  it('правая часть — створка: штапики 7.93, уплотнитель 16.46, створка 4.26', () => {
    const d0 = two()
    for (const op of ['turn_l', 'turn_r', 'tilt', 'tt_r'] as const) {
      const d = updateLeaf(d0, layout(d0).cells[1].leaf.id, { opening: op })
      const m = measure(d)
      expect([m.impost_m, m.bead_m, m.sash_m]).toEqual([1.4, 7.93, 4.26])
      expect(Math.abs(m.gasket_m - 16.46)).toBeLessThanOrEqual(0.011)
    }
  })
})
