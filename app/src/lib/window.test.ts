import { describe, expect, it } from 'vitest'
import { arcLength, designProblems, layout, measure, mergeParent, newDesign, resize, setPartSize, splitLeaf, updateLeaf, type WindowDesign } from './window'

// Эталоны — таблица WinStudio владельца из видео (позиция «окно»).
describe('measure: совпадение с WinStudio', () => {
  it('1500×1500 глухое: рамы 6.00, штапики 5.62, уплотнитель 5.62', () => {
    const m = measure(newDesign(1500, 1500))
    expect([m.area_m2, m.frame_m, m.impost_m, m.bead_m, m.gasket_m, m.sash_m]).toEqual([2.25, 6, 0, 5.62, 5.62, 0])
  })
  it('1500×1200 глухое: рамы 5.40, штапики 5.02, уплотнитель 5.02', () => {
    const m = measure(newDesign(1500, 1200))
    expect([m.area_m2, m.frame_m, m.bead_m, m.gasket_m]).toEqual([1.8, 5.4, 5.02, 5.02])
  })
  it('1200×1620: глухое + поворотно-откидная → 1.94 / 5.64 / 1.52 / 7.81 / 16.22 / 4.20', () => {
    const base = newDesign(1200, 1620)
    let d = splitLeaf(base, base.root.id, 'v')
    const right = layout(d).cells[1].leaf.id
    d = updateLeaf(d, right, { opening: 'tt_r' })
    const m = measure(d)
    expect(m.area_m2).toBe(1.94)
    expect(m.frame_m).toBe(5.64)
    expect(m.impost_m).toBe(1.52)
    expect(m.bead_m).toBe(7.81)
    expect(m.sash_m).toBe(4.2)
    expect(Math.abs(m.gasket_m - 16.22)).toBeLessThanOrEqual(0.01) // WinStudio округляет иначе: 16.21 vs 16.22
  })
})

describe('редактирование', () => {
  const two = (): WindowDesign => {
    const b = newDesign(1200, 1500)
    return splitLeaf(b, b.root.id, 'v')
  }
  it('деление пополам: 600 + 600', () => {
    const d = two()
    expect(layout(d).cells.map((c) => c.rect.w)).toEqual([600, 600])
  })
  it('изменение части: сосед забирает разницу, сумма не меняется', () => {
    const d = two()
    const e = setPartSize(d, d.root.id, 0, 650)
    expect(layout(e).cells.map((c) => c.rect.w)).toEqual([650, 550])
  })
  it('минимальная часть 100 мм', () => {
    const d = two()
    const e = setPartSize(d, d.root.id, 0, 1190)
    expect(layout(e).cells.map((c) => c.rect.w)).toEqual([1100, 100])
  })
  it('объединение возвращает одну ячейку', () => {
    const d = two()
    const e = mergeParent(d, layout(d).cells[0].leaf.id)
    expect(layout(e).cells).toHaveLength(1)
  })
  it('смена габарита масштабирует деления', () => {
    const d0 = two()
    const d = setPartSize(d0, d0.root.id, 0, 400)
    expect(layout(d).cells.map((c) => c.rect.w)).toEqual([400, 800])
    const e = resize(d, 2400, 1500)
    expect(layout(e).cells.map((c) => c.rect.w)).toEqual([800, 1600])
  })
  it('вложенное деление: фрамуга сверху + две колонки снизу', () => {
    const b = newDesign(1500, 2000)
    let d = splitLeaf(b, b.root.id, 'h')
    const bottom = layout(d).cells[1].leaf.id
    d = splitLeaf(d, bottom, 'v')
    const { cells, dividers } = layout(d)
    expect(cells).toHaveLength(3)
    expect(dividers).toHaveLength(2)
  })
})

describe('арка', () => {
  it('полукруг: дуга = π·R', () => {
    expect(arcLength(1000, 500)).toBeCloseTo(Math.PI * 500, 3)
  })
  it('рама арочного окна короче прямоугольной на (2·стрелка + ширина − дуга)', () => {
    const rect = measure(newDesign(1000, 1500)).frame_m
    const arch = measure({ ...newDesign(1000, 1500), shape: 'arch', archRise: 500 }).frame_m
    expect(arch).toBeCloseTo(rect - (2 * 500 + 1000 - Math.PI * 500) / 1000, 2)
  })
})

describe('designProblems: защита от «пустого» стекла', () => {
  it('обычное окно — без проблем', () => expect(designProblems(newDesign(1200, 1500))).toEqual([]))
  it('габарит вне 200…6000 мм', () => {
    expect(designProblems(newDesign(100, 1500))).toContain('size')
    expect(designProblems(newDesign(1200, 7000))).toContain('size')
  })
  it('створка в слишком узкой части → стекло ≤ 0', () => {
    const base = newDesign(1200, 1500)
    let d = splitLeaf(base, base.root.id, 'v')
    d = setPartSize(d, d.root.id, 0, 1100) // правая часть 100 мм
    const right = layout(d).cells[1].leaf.id
    d = updateLeaf(d, right, { opening: 'turn_l' })
    expect(designProblems(d)).toContain('pane')
  })
})
