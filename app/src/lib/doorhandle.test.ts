import { describe, it, expect } from 'vitest'
import { quoteItem, type CatalogItem } from './quote'
import { measure, newDesign, updateLeaf } from './window'
const u = (id: string, kind: string, name: string, unit: CatalogItem['unit'], price: number, params: CatalogItem['params'] = {}): CatalogItem => ({ id, kind, name, unit, price, params })
describe('door handle', () => {
  it('door gets handle_simple when handle_balcony is not priced', () => {
    const cat = new Map([u('S', 'system', 'S', 'm', 1, { frame: 1, sash: 1, impost: 1, bead: 1, gasket: 1 }), u('H', 'hardware', 'H', 'pcs', 50, { handle_simple: 7 })].map((x) => [x.id, x]))
    let d = newDesign(900, 2100)
    d = updateLeaf(d, d.root.id, { opening: 'turn_l', door: true })
    const q = quoteItem(measure(d), { system: 'S', hardware: 'H' }, cat, 900, 2100)
    expect(q.lines.find((l) => l.name.includes('ruchka'))?.sum).toBe(7)
  })
})
