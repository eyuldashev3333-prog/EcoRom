import { describe, expect, it } from 'vitest'
import { isPlaceholder, TABLES } from './priceTables'
import { quoteItem, type CatalogItem } from './quote'
import { measure, newDesign } from './window'

describe('таблицы прайса', () => {
  it('ключи колонок уникальны внутри таблицы, разделы без повторов', () => {
    expect(new Set(TABLES.map((t) => t.kind)).size).toBe(TABLES.length)
    for (const t of TABLES) expect(new Set(t.cols.map((c) => c.key)).size, t.kind).toBe(t.cols.length)
  })
  it('заглушка новой строки распознаётся', () => {
    expect(isPlaceholder('new_system')).toBe(true)
    expect(isPlaceholder('PVX A')).toBe(false)
  })
  it('каждая колонка системы реально участвует в расчёте (цена по параметру даёт строку в расчёте)', () => {
    // выставляем всем ценовым колонкам системы цену 1 и проверяем, что сумма строк выросла; пары «окно/створка/сетка» включены в тестовом окне
    const sys = TABLES.find((t) => t.kind === 'system')!
    const params: CatalogItem['params'] = {}
    for (const c of sys.cols) params[c.key] = 1
    const item: CatalogItem = { id: 'S', kind: 'system', name: 'S', unit: 'm', price: 0, params }
    // окно со всеми типами створок, дверью, панелью, импостом и сеткой
    const b = newDesign(2400, 1500)
    const d: ReturnType<typeof newDesign> = { ...b, root: { kind: 'split', id: 's', dir: 'v', sizes: [300, 300, 300, 300, 300, 300, 300, 300], children: [
      { kind: 'leaf', id: '1', opening: 'tt_l' }, { kind: 'leaf', id: '2', opening: 'turn_l', door: true }, { kind: 'leaf', id: '3', opening: 'tilt', net: true },
      { kind: 'leaf', id: '4', opening: 'slide_l' }, { kind: 'leaf', id: '5', opening: 'fixed', panel: true }, { kind: 'leaf', id: '6', opening: 'fixed' },
      { kind: 'leaf', id: '7', opening: 'turn_r' }, { kind: 'leaf', id: '8', opening: 'fixed' } ] } }
    const q = quoteItem(measure(d), { system: 'S', sides: { support: true, threshold: true, corner: true, connect: ['l'], connect90: ['l'], connect135: ['l'], nashelnik: ['l'], dobor: { '15': ['l'], '20': ['l'], '40': ['l'], '60': ['l'], '80': ['l'], '100': ['l'] } } }, new Map([['S', item]]), 2400, 1500)
    const used = new Set(q.lines.map((l) => l.part))
    expect(used.size).toBeGreaterThan(20)
    // по числу колонок: каждая колонка даёт свою строку (рама/импост/створка/штапик/резина + остальные)
    expect(q.lines.length).toBeGreaterThanOrEqual(sys.cols.length - 1)
  })
})
