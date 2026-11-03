import { describe, expect, it } from 'vitest'
import { profit, suggestedPrice } from './pricing'

describe('suggestedPrice', () => {
  it('эталон ECOROM: окно 1200×1620 → 2 092 265.93 (+37%)', () => {
    expect(suggestedPrice(1527201.41, 0.37)).toBe(2092265.93)
  })
  it('пример WinStudio: скидка 5% и наценка 20%', () => {
    expect(suggestedPrice(72490.29, 0.2, 5)).toBeCloseTo(82638.91, 0)
  })
  it('заказ №1915 из таблицы: 46 523 100 × 1.37 ≈ договор 63 500 000 (в пределах 0.5%)', () => {
    const s = suggestedPrice(46523100, 0.37)
    expect(Math.abs(s - 63500000) / 63500000).toBeLessThan(0.005)
  })
})

describe('profit', () => {
  it('заказ №1915: прибыль 16 976 900 (~26.7%)', () => {
    const r = profit(63500000, 46523100)
    expect(r.profit).toBe(16976900)
    expect(r.marginPct).toBeCloseTo(26.74, 1)
  })
})
