import { describe, expect, it } from 'vitest'
import { parseExpense, type ExpenseCategory } from '../../../supabase/functions/tg-bot/parse-expense'

const cats: ExpenseCategory[] = ['OFIS ARENDA', 'KREDIT', 'SVET', 'SOLIQ', 'MAHSULOT', 'PITANIYA', 'LABO', 'KOCHA KIRA', 'KUT-HARAJAT', 'TRANSPORT', 'TELEFON'].map((name, i) => ({ id: i + 1, name }))
const id = (n: string) => cats.find((c) => c.name === n)!.id
const people = [
  { id: 'p1', full_name: 'Akmal Karimov' },
  { id: 'p2', full_name: 'Elyor aka' },
  { id: 'p3', full_name: 'Bobur Aliyev' },
]

describe('parseExpense: сумма', () => {
  it('просто число', () => expect(parseExpense('обед 150000', cats).amount).toBe(150000))
  it('с пробелами', () => expect(parseExpense('бензин 200 000 Hyundai', cats).amount).toBe(200000))
  it('миллионы с пробелами', () => expect(parseExpense('kredit 1 500 000', cats).amount).toBe(1500000))
  it('запятая-разделитель', () => expect(parseExpense('svet 150,000', cats).amount).toBe(150000))
  it('mln / млн', () => {
    expect(parseExpense('remont 1,5 mln', cats).amount).toBe(1500000)
    expect(parseExpense('ремонт 2 млн', cats).amount).toBe(2000000)
  })
  it('k / ming', () => {
    expect(parseExpense('choy 50k', cats).amount).toBe(50000)
    expect(parseExpense('obed 120 ming', cats).amount).toBe(120000)
  })
  it('сумма в начале', () => expect(parseExpense('150000 обед', cats).amount).toBe(150000))
  it('маленькие числа — не сумма (номер заказа, 031)', () => {
    expect(parseExpense('obed 150', cats).amount).toBeNull()
    expect(parseExpense('031 avtol', cats).amount).toBeNull()
  })
  it('нет числа', () => expect(parseExpense('obed', cats).amount).toBeNull())
})

describe('parseExpense: категория', () => {
  const cat = (t: string) => parseExpense(t, cats).categoryId
  it('питание', () => {
    expect(cat('обед 150000')).toBe(id('PITANIYA'))
    expect(cat('obedga 90000')).toBe(id('PITANIYA'))
    expect(cat('choy 20000')).toBe(id('PITANIYA'))
  })
  it('транспорт', () => {
    expect(cat('бензин 200 000 Hyundai')).toBe(id('TRANSPORT'))
    expect(cat('gaz 100000')).toBe(id('TRANSPORT'))
  })
  it('прочее', () => {
    expect(cat('ремонт 300000')).toBe(id('KUT-HARAJAT'))
    expect(cat('labo 200000')).toBe(id('LABO'))
    expect(cat("yo'l kira 30000")).toBe(id('KOCHA KIRA'))
    expect(cat('самарез 80000')).toBe(id('MAHSULOT'))
    expect(cat('свет 400000')).toBe(id('SVET'))
  })
  it('своя категория — по названию', () => expect(cat('telefon 50000')).toBe(id('TELEFON')))
  it('неизвестное → null (бот спросит)', () => expect(cat('qandaydir narsa 50000')).toBeNull())
  it('первое подходящее слово побеждает', () => expect(cat('benzin obed 50000')).toBe(id('TRANSPORT')))
  it('категории нет в базе — не угадываем', () => expect(parseExpense('kredit 1000000', cats.filter((c) => c.name !== 'KREDIT')).categoryId).toBeNull())
})

describe('parseExpense: сотрудник и заметка', () => {
  it('одно имя', () => expect(parseExpense('obed Akmal 50000', cats, people).employeeId).toBe('p1'))
  it('«aka» — не имя', () => expect(parseExpense('yo\'l kira aka 30000', cats, people).employeeId).toBeNull())
  it('два имени — не угадываем', () => expect(parseExpense('Akmal Bobur 50000 obed', cats, people).employeeId).toBeNull())
  it('имя Elyor aka находится по Elyor', () => expect(parseExpense('benzin Elyor 100000', cats, people).employeeId).toBe('p2'))
  it('заметка — исходный текст', () => expect(parseExpense('  обед   150000 ', cats).note).toBe('обед 150000'))
})
