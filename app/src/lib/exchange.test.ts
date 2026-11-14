import { describe, expect, it } from 'vitest'
import { type PriceRow, buildPricesFile, buildWindowsFile, diffPrices, isValidDesign, parsePricesFile, parseWindowsFile, remapOptions } from './exchange'
import type { CatalogItem } from './quote'
import { layout, newDesign, splitLeaf } from './window'

const c = (id: string, kind: string, name: string): CatalogItem => ({ id, kind, name, unit: 'm', price: 1, params: {} })

describe('обмен прайсами', () => {
  const rows = [{ kind: 'system', name: 'A', unit: 'm' as const, price: 0, params: { frame: 10, impost: 5 } }]
  it('выгрузка → разбор возвращает те же строки', () => {
    const f = parsePricesFile(JSON.stringify(buildPricesFile(rows, { tax_pct: 12 })))
    expect(typeof f).toBe('object')
    if (typeof f === 'string') return
    expect(f.items).toEqual(rows)
    expect(f.settings.tax_pct).toBe(12)
  })
  it('не JSON и чужой формат — понятные ошибки', () => {
    expect(parsePricesFile('{')).toBe('Fayl JSON emas')
    expect(parsePricesFile('{"format":"x"}')).toContain('narxlar')
  })
  it('мусорные строки отбрасываются, отрицательная цена = 0', () => {
    const f = parsePricesFile(JSON.stringify({ format: 'ecorom-prices', v: 1, items: [{ kind: 'glass', name: ' G ', price: -5 }, { kind: 1 }, null, { kind: 'glass', name: '' }] }))
    expect(typeof f).toBe('object')
    if (typeof f !== 'string') expect(f.items).toEqual([{ kind: 'glass', name: 'G', unit: 'pcs', price: 0, params: {} }])
  })
  it('сравнение: новые / изменённые / одинаковые (порядок ключей параметров не важен)', () => {
    const cur: (PriceRow & { id: string })[] = [{ id: '1', kind: 'system', name: 'A', unit: 'm', price: 0, params: { impost: 5, frame: 10 } }, { id: '2', kind: 'system', name: 'B', unit: 'm', price: 0, params: { frame: 1 } }]
    const inc: PriceRow[] = [rows[0], { ...cur[1], params: { frame: 2 } }, { kind: 'glass', name: 'G', unit: 'm2', price: 3, params: {} }]
    expect(diffPrices(cur, inc).map((d) => [d.status, d.currentId])).toEqual([['same', '1'], ['changed', '2'], ['new', undefined]])
  })
})

describe('обмен окнами', () => {
  const base = newDesign(1500, 1500)
  const d = splitLeaf(base, base.root.id, 'v')
  it('чертёж проверяется: ячейки покрывают габарит, габарит в пределах', () => {
    expect(isValidDesign(d)).toBe(true)
    expect(isValidDesign({ ...d, width: 50 })).toBe(false)
    expect(isValidDesign({ ...d, width: 1400 })).toBe(false) // части не совпадают с габаритом
    expect(isValidDesign(null)).toBe(false)
    expect(layout(d).cells).toHaveLength(2)
  })
  it('выгрузка хранит названия опций, разбор отбрасывает окна с плохим чертежом', () => {
    const byId = new Map([c('s1', 'system', 'PVX A')].map((x) => [x.id, x]))
    const f = buildWindowsFile([{ title: 'Z', qty: 3, design: d, options: { system: 's1' }, note: '' }], byId)
    expect(f.names.s1).toEqual({ kind: 'system', name: 'PVX A' })
    const back = parseWindowsFile(JSON.stringify({ ...f, items: [...f.items, { title: 'bad', qty: 1, design: { width: 1, height: 1, root: {} } }] }))
    expect(typeof back).toBe('object')
    if (typeof back !== 'string') expect(back.items).toHaveLength(1)
  })
  it('перенос id по названию между базами; нет такой позиции — убирается и сообщается', () => {
    const mine = new Map([c('NEW-1', 'system', 'PVX A'), c('NEW-2', 'sill', 'Oq 400')].map((x) => [x.id, x]))
    const names = { 'old-1': { kind: 'system', name: 'PVX A' }, 'old-2': { kind: 'sill', name: 'Oq 400' }, 'old-3': { kind: 'work', name: 'Yo‘q ish' } }
    const { options, dropped } = remapOptions({ system: 'old-1', sills: [{ id: 'old-2', length_mm: 900 }], sill: { id: 'old-2' }, works: ['old-3'], color: 'NEW-2' }, names, mine)
    expect(options.system).toBe('NEW-1')
    expect(options.sills).toEqual([{ id: 'NEW-2', length_mm: 900 }])
    expect(options.sill).toEqual({ id: 'NEW-2' })
    expect(options.works).toEqual([])
    expect(options.color).toBe('NEW-2') // свой id остаётся
    expect(dropped).toEqual(['Yo‘q ish'])
  })
})
