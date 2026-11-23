import { describe, expect, it } from 'vitest'
import { quoteItem, type CatalogItem } from './quote'
import { measure, newDesign } from './window'

// Эталон снят ВЖИВУЮ 23.11.2026 в WinStudio V44.4 (BlueStacks, размер телефона): окно 1500×1500 глухое,
// «ПВХ система B» (цены из файла winsystems/ПВХ система В.wprc), стеклопакет «простое 4-6-4» (в эмуляторе все цены стекла = 0).
// Экран показал: рамы 3094.20, штапики 518.36, уплотнитель 87.61, итого 3700.17 руб (снимок C:\wsre\phone\p18_sysB.png).
const sysB: CatalogItem = {
  id: 'sysB', kind: 'system', name: 'ПВХ система B', unit: 'm', price: 0,
  params: { frame: 295.5, impost: 289.2, sash: 260.8, bead: 92.3, gasket: 15.6, armor_frame: 220.2, armor_impost: 230.5, armor_sash: 230.2 },
}
const glass: CatalogItem = { id: 'g', kind: 'glass', name: 'простое 4-6-4', unit: 'm2', price: 0, params: {} }
const catalog = new Map([sysB, glass].map((i) => [i.id, i]))

describe('живая WinStudio: окно 1500×1500, система B', () => {
  const m = measure(newDesign(1500, 1500))
  const q = quoteItem(m, { system: 'sysB', glass: 'g' }, catalog, 1500, 1500)
  it('метры: рамы 6.00, штапик 5.62, уплотнитель 5.62, площадь 2.25', () => {
    expect(m.frame_m).toBe(6)
    expect(m.area_m2).toBe(2.25)
    expect(m.bead_m).toBeCloseTo(5.62, 2)
    expect(m.gasket_m).toBeCloseTo(5.62, 2)
  })
  it('рамы (профиль + армировка) = 3094.20', () => {
    const s = q.lines.filter((l) => l.part === 'rama' || l.part === 'armatura rama').reduce((a, l) => a + l.sum, 0)
    expect(s).toBeCloseTo(3094.2, 2)
  })
  it('штапики 518.36 и уплотнитель 87.61', () => {
    expect(q.lines.find((l) => l.part === 'shtapik')?.sum).toBeCloseTo(518.36, 1)
    expect(q.lines.find((l) => l.part === 'rezina')?.sum).toBeCloseTo(87.61, 1)
  })
  it('итого 3700.17', () => {
    expect(q.cost).toBeCloseTo(3700.17, 1)
  })
  it('двухкамерный стеклопакет 4-6-4-6-4 (490/490/490, 1.57/2.12/1.41/2.52): стекло = 2973.05', () => {
    const dbl: CatalogItem = { id: 'g2', kind: 'glass', name: 'простое 4-6-4-6-4', unit: 'm2', price: 0, params: { glass1: 490, glass2: 490, glass3: 490, spacer: 1.57, desiccant: 2.12, butyl: 1.41, sealant: 2.52 } }
    const cat = new Map([sysB, dbl].map((i) => [i.id, i]))
    const qq = quoteItem(m, { system: 'sysB', glass: 'g2' }, cat, 1500, 1500)
    const glassSum = qq.lines.filter((l) => l.item_id === 'g2').reduce((a, l) => a + l.sum, 0)
    expect(glassSum).toBeCloseTo(2973.05, 1)
    expect(qq.cost).toBeCloseTo(6673.22, 1)
  })
  it('однокамерный: слоёв 2 (стекло 1+2) → камера одна, бутил ×2 периметра', () => {
    const one: CatalogItem = { id: 'g1', kind: 'glass', name: 'простое 4-6-4', unit: 'm2', price: 0, params: { glass1: 1e6, glass2: 1e6, butyl: 1000 } }
    const qq = quoteItem(m, { glass: 'g1' }, new Map([[one.id, one]]), 1500, 1500)
    expect(qq.lines.find((l) => l.part === 'butil lenta')?.qty).toBeCloseTo(11.232, 3)
  })
})
