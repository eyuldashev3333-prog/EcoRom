import { describe, expect, it } from 'vitest'
import { fmtLen, fmtM, fmtM2, lenToMm, withLenUnit } from './units'

describe('единицы', () => {
  it('мм остаются целыми, дюймы — до сотых', () => {
    expect(fmtLen(1500.4, 'mm')).toBe('1500')
    expect(fmtLen(1500, 'in')).toBe('59.06')
    expect(fmtLen(25.4, 'in')).toBe('1')
  })
  it('ввод в дюймах переводится в мм и обратно без потери точности до мм', () => {
    expect(lenToMm(59.06, 'in')).toBe(1500)
    expect(lenToMm(1500, 'mm')).toBe(1500)
    for (const mm of [300, 750, 1200, 1500, 2100]) expect(Math.abs(lenToMm(Number(fmtLen(mm, 'in')), 'in') - mm)).toBeLessThanOrEqual(1)
  })
  it('метры → футы, м² → кв. футы', () => {
    expect(fmtM(1, 'in')).toBeCloseTo(3.2808, 3)
    expect(fmtM2(2.25, 'in')).toBeCloseTo(24.22, 2)
    expect(fmtM(6, 'mm')).toBe(6)
  })
  it('подпись поля', () => {
    expect(withLenUnit('Eni, mm', 'in')).toBe('Eni, in')
    expect(withLenUnit('Eni, mm', 'mm')).toBe('Eni, mm')
    expect(withLenUnit('Qism', 'in')).toBe('Qism')
  })
})
