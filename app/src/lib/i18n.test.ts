import { describe, expect, it } from 'vitest'
import { DICTS, deepAssign } from './i18n'
import { uz } from '../uz'

// путь → значение для всех строк словаря
const leaves = (o: Record<string, unknown>, p = ''): [string, string][] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[`${p}${k}`, v] as [string, string]] : v && typeof v === 'object' ? leaves(v as Record<string, unknown>, `${p}${k}.`) : []))
const at = (o: unknown, path: string) => path.split('.').reduce<unknown>((x, k) => (x && typeof x === 'object' ? (x as Record<string, unknown>)[k] : undefined), o)

describe('языки', () => {
  // uz в тестах не переведён (язык по умолчанию), поэтому проверяем соответствие ключей словарей ключам uz.ts
  for (const lang of ['ru', 'en'] as const)
    it(`${lang}: каждый ключ словаря существует в uz.ts как строка (нет опечаток в путях)`, () => {
      const bad = leaves(DICTS[lang]).filter(([path]) => typeof at(uz, path) !== 'string').map(([p]) => p)
      expect(bad).toEqual([])
    })
  it('ru и en переводят один и тот же набор ключей', () => {
    expect(leaves(DICTS.ru).map(([p]) => p).sort()).toEqual(leaves(DICTS.en).map(([p]) => p).sort())
  })
  it('перевод меняет объект на месте, чужие ключи и нестроки не трогает', () => {
    const t = { a: { b: 'x', c: 'y' }, n: 1 }
    const ref = t.a
    deepAssign(t as never, { a: { b: 'z', zzz: 'q' }, n: 'str', extra: 'e' } as never)
    expect(ref.b).toBe('z')
    expect(ref.c).toBe('y')
    expect(t.n).toBe(1)
    expect('extra' in t).toBe(false)
  })
})
