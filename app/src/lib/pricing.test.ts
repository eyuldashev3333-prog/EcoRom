import { describe, expect, it } from 'vitest'
import { itemPrice, profit, suggestedPrice } from './pricing'

describe('цена окна: своя цена и финансовая схема (эталон WinStudio)', () => {
  it('своя цена 2255, скидка 1%: 2232.45 за окно, 11162.25 за 5 шт', () => {
    const p = itemPrice(0, 0, 0.37, 0, { own_price: 2255 }, { discount: 1, margin: 0, margin_work: 0 })
    expect(p).toBe(2232.45)
    expect(Math.round(p * 5 * 100) / 100).toBe(11162.25)
  })
  it('без схемы — формула заказа (скидка, затем наценка) на материалы и работы вместе', () => {
    expect(itemPrice(1000, 0, 0.37, 0, {})).toBe(1370)
    expect(itemPrice(1000, 400, 0.37, 5, {})).toBe(1301.5)
    expect(itemPrice(1527201.41, 0, 0.37, 0, {})).toBe(2092265.93)
  })
  it('схема (как WinStudio, маржа заказа 0): отдельная маржа материалов (30%) и работ (10%), скидка схемы главнее скидки заказа', () => {
    // материалы 800, работы 200, скидка 5%: 800·0.95·1.3 + 200·0.95·1.1 = 988 + 209 = 1197
    expect(itemPrice(1000, 200, 0, 0, {}, { discount: 5, margin: 30, margin_work: 10 })).toBe(1197)
    expect(itemPrice(1000, 200, 0, 3, {}, { discount: 0, margin: 30, margin_work: 10 })).toBe(1260)
  })
})
describe('маржа компании 35% (решение Asad 28.11.2026)', () => {
  it('без схемы: tannarx × 1.35', () => {
    expect(itemPrice(1327993.38, 0, 0.35, 0, {})).toBe(1792791.06)
  })
  it('со схемой «Chegirma 5%» (маржа схемы 0): маржа заказа не теряется, скидка схемы применяется', () => {
    // 1000 · 0.95 · 1.35 = 1282.5
    expect(itemPrice(1000, 0, 0.35, 0, {}, { discount: 5, margin: 0, margin_work: 0 })).toBe(1282.5)
  })
  it('маржа схемы добавляется к марже заказа', () => {
    // материалы 800·(1+0.35+0.1) + работы 200·(1+0.35+0.05) = 1160 + 280 = 1440
    expect(itemPrice(1000, 200, 0.35, 0, {}, { discount: 0, margin: 10, margin_work: 5 })).toBe(1440)
  })
  it('маржа 0 — цена как раньше (старые заказы не меняются)', () => {
    expect(itemPrice(1327993.38, 0, 0, 0, {})).toBe(1327993.38)
  })
  it('своя цена окна — без маржи (ручная цена клиенту)', () => {
    expect(itemPrice(0, 0, 0.35, 0, { own_price: 2255 })).toBe(2255)
  })
})
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
