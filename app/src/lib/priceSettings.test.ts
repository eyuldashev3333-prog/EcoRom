import { describe, expect, it } from 'vitest'
import { defaultSchemes, parsePriceSettings, scaleItem } from './priceSettings'

describe('настройки прайса', () => {
  it('пустая база: наценка 37%, схемы 1/2/3/5% с той же наценкой, курс 1, налог 0', () => {
    const s = parsePriceSettings([])
    expect(s.markup).toBe(0.37)
    expect(s.rate).toBe(1)
    expect(s.taxPct).toBe(0)
    expect(s.schemes.map((x) => [x.discount, x.margin, x.margin_work])).toEqual([[1, 37, 37], [2, 37, 37], [3, 37, 37], [5, 37, 37]])
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
  it('defaultSchemes считает маржу из наценки', () => {
    expect(defaultSchemes(0.2)[0].margin).toBe(20)
  })
})
