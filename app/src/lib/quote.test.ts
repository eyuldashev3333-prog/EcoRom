import { describe, expect, it } from 'vitest'
import { quoteItem, type CatalogItem } from './quote'
import { layout, measure, newDesign, splitLeaf, updateLeaf } from './window'

const items: CatalogItem[] = [
  { id: 'sys', kind: 'system', name: '6000-Куатро (Ок)', unit: 'm', price: 0, params: { frame: 45120, impost: 53277, sash: 10000, bead: 2000, gasket: 500 } },
  { id: 'gl', kind: 'glass', name: 'Пакет (Ок+Серий)', unit: 'm2', price: 170000, params: {} },
  { id: 'sill', kind: 'sill', name: 'Ок 35 см', unit: 'm', price: 100000, params: {} },
  { id: 'ebb', kind: 'ebb', name: 'Отлив белый 200', unit: 'm', price: 50000, params: { side_cap: 10000 } },
  { id: 'hw', kind: 'hardware', name: 'Оконный (Откидной)', unit: 'pcs', price: 150000, params: {} },
  { id: 'dhw', kind: 'hardware', name: 'Дверной (Супра)', unit: 'pcs', price: 400000, params: {} },
  { id: 'net', kind: 'net', name: 'Сетка белая', unit: 'm2', price: 30000, params: { profile: 5000, gasket: 0 } },
  { id: 'mont', kind: 'work', name: 'Монтаж (Пласт)', unit: 'pcs', price: 100000, params: {} },
  { id: 'foam', kind: 'misc', name: 'Саморез-Пена', unit: 'pcs', price: 20000, params: {} },
  { id: 'col', kind: 'color', name: 'Шеффилд', unit: 'pcs', price: 0, params: {} },
]
const catalog = new Map(items.map((i) => [i.id, i]))

function window1200() {
  const b = newDesign(1200, 1620)
  const d = splitLeaf(b, b.root.id, 'v')
  return updateLeaf(d, layout(d).cells[1].leaf.id, { opening: 'tt_r', net: true })
}

describe('quoteItem', () => {
  const m = measure(window1200())
  const q = quoteItem(m, { system: 'sys', glass: 'gl', sill: { id: 'sill' }, ebb: { id: 'ebb' }, hardware: 'hw', net: 'net', works: ['mont'], misc: ['foam'], color: 'col' }, catalog, 1200)
  const line = (name: string) => q.lines.find((l) => l.name === name)

  it('рама: 5.64 м × 45 120 = 254 476.8 (как в WinStudio владельца: 254 476.83)', () => {
    expect(line('6000-Куатро (Ок) — rama')?.sum).toBe(254476.8)
  })
  it('импост: 1.52 м × 53 277', () => {
    expect(line('6000-Куатро (Ок) — impost')?.sum).toBe(80981.04)
  })
  it('стекло по площади стёкол, подоконник и отлив по ширине окна', () => {
    expect(line('Пакет (Ок+Серий)')?.qty).toBe(m.glass_m2)
    expect(line('Ок 35 см')?.sum).toBe(120000)
    expect(line('Отлив белый 200')?.sum).toBe(60000)
    expect(line('Отлив белый 200 — zaglushka')?.sum).toBe(20000)
  })
  it('фурнитура на каждую створку, сетка м² + профиль', () => {
    expect(line('Оконный (Откидной)')?.qty).toBe(1)
    expect(line('Сетка белая')?.qty).toBe(m.nets_m2)
    expect(line('Сетка белая — profil')?.qty).toBe(m.nets_m)
  })
  it('себестоимость = сумма строк', () => {
    expect(q.cost).toBeCloseTo(q.lines.reduce((s, l) => s + l.sum, 0), 2)
  })
  it('позиции без цены подсвечиваются', () => {
    expect(q.missing).toContain('Шеффилд')
  })
  it('расход материалов без работ и цветов', () => {
    expect(q.materials.find((x) => x.name === 'Монтаж (Пласт)')).toBeUndefined()
    expect(q.materials.find((x) => x.name === '6000-Куатро (Ок) — rama')?.qty).toBe(5.64)
    // склад: часть позиции и её единица
    expect(q.materials.find((x) => x.name === '6000-Куатро (Ок) — rama')).toMatchObject({ item_id: 'sys', part: 'rama', unit: 'm' })
    expect(q.materials.find((x) => x.part === 'zaglushka')).toMatchObject({ item_id: 'ebb', unit: 'pcs', qty: 2 })
    expect(q.materials.find((x) => x.item_id === 'gl')?.part).toBe('')
  })
  it('дверь получает дверную фурнитуру', () => {
    const b = newDesign(800, 2100)
    const d = updateLeaf(b, b.root.id, { opening: 'tt_l', door: true })
    const qq = quoteItem(measure(d), { hardware: 'hw', door_hardware: 'dhw' }, catalog, 800)
    expect(qq.lines.map((l) => l.name)).toEqual(['Дверной (Супра)'])
  })
})
