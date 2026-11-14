import { describe, expect, it } from 'vitest'
import { mirrorOptions, quoteItem, type CatalogItem } from './quote'
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

describe('quoteItem: позиции, которых нет в каталоге', () => {
  it('удалённая система попадает в unknown, а не молча выпадает', () => {
    const cat = new Map<string, CatalogItem>([['G', { id: 'G', kind: 'glass', name: 'G', unit: 'm2', price: 100, params: {} }]])
    const q = quoteItem(measure(newDesign(1200, 1500)), { system: 'GONE', glass: 'G' }, cat, 1200)
    expect(q.unknown).toEqual(['GONE'])
  })
  it('всё найдено — unknown пуст', () => {
    const cat = new Map<string, CatalogItem>([['G', { id: 'G', kind: 'glass', name: 'G', unit: 'm2', price: 100, params: {} }]])
    expect(quoteItem(measure(newDesign(1200, 1500)), { glass: 'G' }, cat, 1200).unknown).toEqual([])
  })
})

describe('Блок 2: настройки окна', () => {
  const sysItem: CatalogItem = { id: 'sys2', kind: 'system', name: 'PVX A', unit: 'm', price: 0, params: { frame: 0, support: 83.9, threshold: 270, corner: 142.32, connect: 280.3, nashelnik: 22.5, dobor15: 100, dobor20: 186.2, dobor100: 386.2 } }
  const extra: CatalogItem[] = [sysItem, { id: 'lam', kind: 'lamination', name: 'Svetlyy dub', unit: 'm2', price: 190, params: {} }, { id: 'sill2', kind: 'sill', name: 'Oq 400', unit: 'm', price: 916, params: { side_cap: 23 } }, { id: 'pena', kind: 'misc', name: 'Pena', unit: 'pcs', price: 615, params: { basis: 'm2' } }, { id: 'otk', kind: 'work', name: 'Otkos', unit: 'pcs', price: 230, params: { basis: 'perimeter' } }]
  const cat = new Map([...items, ...extra].map((i) => [i.id, i]))
  const m = measure(newDesign(1500, 1500))
  const l = (q: ReturnType<typeof quoteItem>, name: string) => q.lines.find((x) => x.name === name)

  it('профили по сторонам: длина стороны × цена метра системы (эталон WinStudio: 1500 → 1.50 м, две стороны → 3.00 м)', () => {
    const q = quoteItem(m, { system: 'sys2', sides: { support: true, threshold: true, corner: true, connect: ['l', 't', 'b'], nashelnik: ['l', 't', 'r', 'b'], dobor: { '15': ['t'], '20': ['l', 'r'], '100': ['b'] } } }, cat, 1500, 1500)
    expect(l(q, 'PVX A — tayanch profil')).toMatchObject({ qty: 1.5, sum: 125.85 })
    expect(l(q, "PVX A — bo'sag'a")?.qty).toBe(1.5)
    expect(l(q, 'PVX A — ulovchi profil')?.qty).toBe(4.5)
    expect(l(q, 'PVX A — qoplama (nashelnik)')?.qty).toBe(6)
    expect(l(q, 'PVX A — dobor 15 mm')?.qty).toBe(1.5)
    expect(l(q, 'PVX A — dobor 20 mm')).toMatchObject({ qty: 3, sum: 558.6 })
    expect(l(q, 'PVX A — dobor 100 mm')?.qty).toBe(1.5)
  })
  it('профили по сторонам без выбранной системы — предупреждение, не падение', () => {
    const q = quoteItem(m, { sides: { support: true } }, cat, 1500, 1500)
    expect(q.missing.join()).toContain('Tizim')
  })
  it('высота у боковых сторон: слева у окна 1200×1800 — 1.8 м', () => {
    const q = quoteItem(measure(newDesign(1200, 1800)), { system: 'sys2', sides: { dobor: { '20': ['l'] } } }, cat, 1200, 1800)
    expect(l(q, 'PVX A — dobor 20 mm')?.qty).toBe(1.8)
  })
  it('ламинация внутри и снаружи — по площади, отдельными строками', () => {
    const q = quoteItem(m, { lamination_in: 'lam', lamination_out: 'lam' }, cat, 1500, 1500)
    expect(q.lines.filter((x) => x.item_id === 'lam').map((x) => [x.part, x.qty])).toEqual([['ichki', 2.25], ['tashqi', 2.25]])
  })
  it('несколько подоконников и заглушки', () => {
    const q = quoteItem(m, { sills: [{ id: 'sill2' }, { id: 'sill', length_mm: 1000 }] }, cat, 1500, 1500)
    expect(l(q, 'Oq 400')?.sum).toBe(1374)
    expect(l(q, 'Oq 400 — zaglushka')?.sum).toBe(46)
    expect(l(q, 'Ок 35 см')?.qty).toBe(1)
  })
  it('единица строки (basis): м² окна, периметр', () => {
    const q = quoteItem(m, { misc: ['pena'], works: ['otk'] }, cat, 1500, 1500)
    expect(l(q, 'Pena')?.qty).toBe(2.25)
    expect(l(q, 'Otkos')?.qty).toBe(6)
  })
  it('mirrorOptions: sill/ebb — зеркало первого выбора, пустое удаляется (нужно SQL монтажа)', () => {
    expect(mirrorOptions({ sills: [{ id: 'a' }, { id: 'b' }], ebbs: [] }).sill).toEqual({ id: 'a' })
    const e = mirrorOptions({ sills: [], sill: { id: 'old' }, ebbs: [{ id: 'e' }] })
    expect('sill' in e).toBe(false)
    expect('sills' in e).toBe(false)
    expect(e.ebb).toEqual({ id: 'e' })
  })
})
describe('Блок 3: колонки прайса WinStudio', () => {
  const u = (id: string, kind: string, name: string, unit: CatalogItem['unit'], price: number, params: CatalogItem['params'] = {}): CatalogItem => ({ id, kind, name, unit, price, params })
  const cat = new Map(
    [
      u('S', 'system', 'Sys', 'm', 0, { frame: 100, impost: 100, sash: 100, door_sash: 150, sandwich: 300, armor_frame: 10, armor_impost: 10, armor_sash: 10, armor_door: 20, mech_tt: 1000, mech_h: 700, mech_v: 600, corner_frame: 5, corner_sash: 3, connector: 40 }),
      u('G', 'glass', 'Glass', 'm2', 999, { glass1: 100, glass2: 100, glass3: 0, spacer: 2, desiccant: 3 }),
      u('H', 'hardware', 'Hw', 'pcs', 50, { handle_simple: 10, handle_balcony: 25 }),
      u('N', 'net', 'Net', 'm2', 150, { corner: 4, holder: 2, pull: 3 }),
      u('W', 'work', 'Mont', 'pcs', 200),
    ].map((i) => [i.id, i]),
  )
  const line = (q: ReturnType<typeof quoteItem>, name: string) => q.lines.find((l) => l.name === name)

  it('стеклопакет по составляющим: стекло 1+2 за м², спейсер и осушитель за метр периметра; цена за м² игнорируется', () => {
    const d = newDesign(1500, 1500)
    const m = measure(d)
    const q = quoteItem(m, { glass: 'G' }, cat, 1500, 1500)
    expect(q.lines.some((l) => l.name === 'Glass')).toBe(false)
    expect(line(q, 'Glass — stekla 1')?.qty).toBe(m.glass_m2)
    expect(line(q, 'Glass — stekla 3')).toBeUndefined()
    const perim = (2 * (m.panes[0].w + m.panes[0].h)) / 1000
    expect(line(q, 'Glass — spreyser')?.qty).toBeCloseTo(perim, 2)
  })
  it('механика по типу открывания, углы, коннектор, армировка', () => {
    let d = splitLeaf(newDesign(1500, 1500), newDesign(1500, 1500).root.id, 'v')
    d = (() => { const b = newDesign(1500, 1500); const s = splitLeaf(b, b.root.id, 'v'); const c = layout(s).cells; return updateLeaf(updateLeaf(s, c[0].leaf.id, { opening: 'tt_l' }), c[1].leaf.id, { opening: 'tilt' }) })()
    const m = measure(d)
    const q = quoteItem(m, { system: 'S' }, cat, 1500, 1500)
    expect(line(q, 'Sys — mexanika tt')).toMatchObject({ qty: 1, sum: 1000, unit: 'pcs' })
    expect(line(q, 'Sys — mexanika v')).toMatchObject({ qty: 1, sum: 600 })
    expect(line(q, 'Sys — mexanika h')).toBeUndefined()
    expect(line(q, 'Sys — burchak kuchaytirgich rama')?.sum).toBe(20)
    expect(line(q, 'Sys — burchak kuchaytirgich tavaqa')?.qty).toBe(8)
    expect(line(q, 'Sys — impost konnektor')?.qty).toBe(2)
    expect(line(q, 'Sys — armatura rama')?.qty).toBe(m.frame_m)
  })
  it('дверная створка по своей цене, оконная — по обычной; сэндвич-панель по м²', () => {
    const b = newDesign(1500, 1500)
    const s = splitLeaf(b, b.root.id, 'v')
    const c = layout(s).cells
    let d = updateLeaf(s, c[0].leaf.id, { opening: 'turn_l', door: true })
    d = updateLeaf(d, c[1].leaf.id, { panel: true })
    const q = quoteItem(measure(d), { system: 'S' }, cat, 1500, 1500)
    const sashLines = q.lines.filter((l) => l.name === 'Sys — tavaqa')
    expect(sashLines.map((l) => l.price)).toContain(150)
    expect(line(q, 'Sys — sendvich panel')?.price).toBe(300)
    expect(line(q, 'Sys — armatura eshik')?.price).toBe(20)
  })
  it('ручки и комплектующие сетки; работы выделяются в work_cost', () => {
    const b = newDesign(1500, 1500)
    const s = splitLeaf(b, b.root.id, 'v')
    const d = updateLeaf(s, layout(s).cells[1].leaf.id, { opening: 'turn_r', net: true })
    const q = quoteItem(measure(d), { hardware: 'H', net: 'N', works: ['W'] }, cat, 1500, 1500)
    expect(line(q, 'Hw — ruchka')?.sum).toBe(10)
    expect(line(q, 'Net — burchak')?.qty).toBe(4)
    expect(line(q, 'Net — ushlagich')?.qty).toBe(4)
    expect(line(q, 'Net — ruchka-petelka')?.sum).toBe(3)
    expect(q.work_cost).toBe(200)
  })
  it('колонки без цены не создают «нет цены»', () => {
    const q = quoteItem(measure(newDesign(1500, 1500)), { system: 'S' }, new Map([['S', { id: 'S', kind: 'system', name: 'Sys', unit: 'm', price: 0, params: { frame: 100, impost: 100, sash: 100, bead: 1, gasket: 1 } } as CatalogItem]]), 1500, 1500)
    expect(q.missing).toEqual([])
  })
})