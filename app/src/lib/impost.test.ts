import { describe, it, expect } from 'vitest'
import { newDesign, splitLeaf, gridLeaf, layout, measure } from './window'
describe('impost buttons', () => {
  it('split v/h 2,3 and grid', () => {
    const d = newDesign(1200, 1500)
    const id = d.root.id
    for (const [dir, n] of [['v',2],['v',3],['h',2],['h',3]] as const) {
      const r = splitLeaf(d, id, dir, n)
      expect(layout(r).cells.length).toBe(n)
    }
    const g = gridLeaf(d, id, 3, 2)
    expect(layout(g).cells.length).toBe(6)
    expect(measure(g).imposts).toBeGreaterThan(0)
  })
})
