import { describe, expect, it } from 'vitest'
import { isPurchase, parsePurchase } from '../../../supabase/functions/tg-bot/parse-purchase'

const ok = (t: string) => {
  const r = parsePurchase(t)
  if (!r.ok) throw new Error(r.error)
  return r.value
}

describe('xarid (закупка через бота)', () => {
  it('узнаёт только сообщения со словом xarid в начале', () => {
    expect(isPurchase('xarid Kley 5 250000')).toBe(true)
    expect(isPurchase('  Xarid: Kley 5 250000')).toBe(true)
    expect(isPurchase('taksi 50000')).toBe(false)
    expect(isPurchase('obed xarid 100000')).toBe(false)
  })
  it('название с числом, количество с единицей, сумма', () => {
    expect(ok('xarid Otliv oq 200 30 m 600000')).toEqual({ name: 'Otliv oq 200', qty: 30, unit: 'm', total: 600000 })
  })
  it('единица необязательна: последнее число — сумма, перед ним — количество', () => {
    expect(ok('xarid Dobor 20 15 450000')).toEqual({ name: 'Dobor 20', qty: 15, unit: null, total: 450000 })
    expect(ok('xarid Kley 5 litr 250000')).toEqual({ name: 'Kley', qty: 5, unit: 'litr', total: 250000 })
  })
  it('сумма со множителем: 250k, 1,5 mln, 300 ming', () => {
    expect(ok('xarid Kley 5 litr 250k').total).toBe(250000)
    expect(ok('xarid Lenta 3 1,5 mln')).toEqual({ name: 'Lenta', qty: 3, unit: null, total: 1500000 })
    expect(ok('xarid Lenta 3 dona 300 ming').total).toBe(300000)
  })
  it('разделители тысяч', () => {
    expect(ok('xarid Gaz 2 1.500.000').total).toBe(1500000)
  })
  it('дробное количество', () => {
    expect(ok('xarid Profil 12,5 m 800000').qty).toBe(12.5)
  })
  it('ошибки: нет суммы, количества или названия', () => {
    expect(parsePurchase('xarid Kley').ok).toBe(false)
    expect(parsePurchase('xarid 5 250000').ok).toBe(false)
    expect(parsePurchase('xarid Kley litr 250000').ok).toBe(false)
  })
})
