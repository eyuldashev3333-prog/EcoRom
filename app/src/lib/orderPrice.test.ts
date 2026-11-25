import { describe, expect, it } from 'vitest'
import { roundDown1000, suggestedTotal } from './orderPrice'

describe('suggestedTotal — одна формула итога', () => {
  it('налог берётся один раз с суммы, а не с каждого окна', () => {
    // три окна по 9193.56 при налоге 15%: на сумму = 31 717.78; налог с округлением на каждое окно дал бы 31 717.77 (копейки накапливаются в расхождение между экранами)
    const prices = [9193.56, 9193.56, 9193.56]
    expect(suggestedTotal(prices, [1, 1, 1], 1.15)).toBe(31717.78)
    expect(suggestedTotal([9193.56], [3], 1.15)).toBe(31717.78)
  })
  it('количество учитывается, налог 0 не меняет сумму', () => {
    expect(suggestedTotal([100.5, 200.25], [2, 3], 1)).toBe(801.75)
  })
  it('пустой заказ = 0, договор округляется вниз до 1000', () => {
    expect(suggestedTotal([], [], 1.15)).toBe(0)
    expect(roundDown1000(34133999.96)).toBe(34133000)
    expect(roundDown1000(999)).toBe(0)
  })
})
