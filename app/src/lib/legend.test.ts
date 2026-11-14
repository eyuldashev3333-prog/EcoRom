import { describe, expect, it } from 'vitest'
import { optionLegend } from './legend'
import type { CatalogItem } from './quote'

const mk = (id: string, name: string): CatalogItem => ({ id, kind: 'x', name, unit: 'pcs', price: 0, params: {} })

describe('легенда опций', () => {
  const byId = new Map([mk('s', 'PVX A'), mk('g', '4-6-4'), mk('w', 'Montaj')].map((i) => [i.id, i]))
  it('пустые опции — пустой список', () => expect(optionLegend({}, byId)).toEqual([]))
  it('своя цена, скидка, несколько подоконников и стороны', () => {
    const l = optionLegend({ own_price: 2255, scheme: 'd1', sills: [{ id: 's' }, { id: 'g' }], sides: { support: true, dobor: { '20': ['l', 'r'] } } }, byId, (id) => (id === 'd1' ? 'Chegirma 1%' : undefined))
    expect(l).toEqual(["O'z narxi: 2255", 'Sxema: Chegirma 1%', 'Deraza tokchasi: PVX A', 'Deraza tokchasi: 4-6-4', 'Tayanch profil', 'Dobor 20: chap, o\'ng'])
  })
  it('выбранное попадает в список, неизвестное id пропускается', () => {
    const l = optionLegend({ system: 's', glass: 'g', works: ['w', 'нет'] }, byId)
    expect(l).toEqual(['Tizim: PVX A', 'Oyna paket: 4-6-4', 'Ish: Montaj'])
  })
})
