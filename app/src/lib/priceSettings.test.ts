import { describe, expect, it } from 'vitest'
import { defaultSchemes, parsePriceSettings, scaleItem } from './priceSettings'

describe('настройки прайса', () => {
  it('пустая база: маржа 35% (минимум 35%), схемы 1/2/3/5% только со скидкой, курс 1, налог 0', () => {
    const s = parsePriceSettings([])
    expect(s.markup).toBe(0.35)
    expect(s.markupMin).toBe(0.35)
    expect(s.rate).toBe(1)
    expect(s.taxPct).toBe(0)
    expect(s.schemes.map((x) => [x.discount, x.margin, x.margin_work])).toEqual([[1, 0, 0], [2, 0, 0], [3, 0, 0], [5, 0, 0]])
  })
  it('маржа по умолчанию не ниже минимума: markup 0 → 0.35', () => {
    expect(parsePriceSettings([{ key: 'markup', value: 0 }]).markup).toBe(0.35)
    expect(parsePriceSettings([{ key: 'markup', value: 0.4 }]).markup).toBe(0.4)
  })
  it('читает сохранённые схемы и отбрасывает мусор', () => {
    const s = parsePriceSettings([{ key: 'finance_schemes', value: [{ id: 'a', name: 'VIP', discount: 7, margin: 30, margin_work: 10 }, null, { name: 'без id' }] }, { key: 'tax_pct', value: 12 }, { key: 'currency_rate', value: 'abc' }])
    expect(s.schemes).toEqual([{ id: 'a', name: 'VIP', discount: 7, margin: 30, margin_work: 10 }])
    expect(s.taxPct).toBe(12)
    expect(s.rate).toBe(1)
  })
  it('пустой список схем остаётся пустым (владелец удалил все)', () => {
    expect(parsePriceSettings([{ key: 'finance_schemes', value: [] }]).schemes).toEqual([])
  })
  it('курс умножает цену и числовые параметры, текст не трогает', () => {
    const it = scaleItem({ id: 'x', kind: 'system', name: 'A', unit: 'm', price: 10, params: { frame: 100, series: 'ABC', basis: 'pcs' } }, 12)
    expect(it.price).toBe(120)
    expect(it.params).toEqual({ frame: 1200, series: 'ABC', basis: 'pcs' })
  })
  it('defaultSchemes без своей маржи (маржа компании идёт поверх)', () => {
    expect(defaultSchemes()[0].margin).toBe(0)
  })
})
