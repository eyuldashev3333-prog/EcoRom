import { describe, expect, it } from 'vitest'
import { CONFIGS } from './configs'
import { designProblems, layout, measure } from './window'

describe('каталог конфигураций', () => {
  it('ключи уникальны, не меньше 80 схем (в WinStudio ≈80–100)', () => {
    const keys = CONFIGS.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(CONFIGS.length).toBeGreaterThanOrEqual(80)
  })
  it('каждая схема: части дают габарит, нет проблем чертежа, площадь стекла > 0', () => {
    for (const c of CONFIGS) {
      const d = c.build()
      const cells = layout(d).cells
      const area = cells.reduce((s, x) => s + x.rect.w * x.rect.h, 0)
      expect(area, c.key).toBe(d.width * d.height) // ячейки покрывают габарит без дыр и перекрытий
      expect(cells.some((x) => !x.leaf.void), c.key).toBe(true)
      expect(designProblems(d), c.key).toEqual([])
      expect(measure(d).glass_m2, c.key).toBeGreaterThan(0)
    }
  })
})
