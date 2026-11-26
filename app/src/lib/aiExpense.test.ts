import { describe, expect, it } from 'vitest'
import { buildPrompt, doneText, draftText, toBatchLines, undoText, type AiCtx, type AiEntry } from '../../../supabase/functions/tg-bot/ai-expense'

const ctx: AiCtx = {
  stock: [
    { item_id: 'a', part: '', name: 'Otliv oq 200', unit: 'm', kind: 'ebb' },
    { item_id: 'b', part: 'rama', name: 'Plastik 7000 (AKFA) — rama', unit: 'm', kind: 'system' },
  ],
  cats: [{ id: 6, name: 'PITANIYA', keywords: ['obed'] }],
  people: [{ id: 'p1', full_name: 'Islom' }],
}
const e = (x: Partial<AiEntry>): AiEntry => ({ kind: 'unclear', text: '', amount: null, category_id: null, employee_ref: null, stock_ref: null, qty: null, note: null, reason: null, ...x })

describe('ИИ-расходы: ответ ИИ → строки для базы', () => {
  it('номера омбора и сотрудников переводятся в id, сумма не меняется', () => {
    const r = toBatchLines([
      e({ kind: 'expense', text: 'obed 150000', amount: 150000, category_id: 6, note: 'obed' }),
      e({ kind: 'purchase', text: 'rama 7000 60 m 4200000', amount: 4200000, qty: 60, stock_ref: 2 }),
      e({ kind: 'expense', text: 'Islomga 300000', amount: 300000, category_id: 6, employee_ref: 1 }),
    ], ctx)
    expect(r[0]).toMatchObject({ kind: 'expense', amount: 150000, category_id: 6, employee_id: null })
    expect(r[1]).toMatchObject({ kind: 'purchase', amount: 4200000, qty: 60, item_id: 'b', part: 'rama' })
    expect(r[2].employee_id).toBe('p1')
  })
  it('несуществующий номер омбора → «omborda yo‘q», ничего не записывается', () => {
    expect(toBatchLines([e({ kind: 'purchase', text: 'kley 30 l 100000', amount: 100000, qty: 30, stock_ref: 99 })], ctx)[0]).toMatchObject({ kind: 'unclear', reason: "omborda yo'q" })
  })
  it('промпт: омбор с разделом и единицей, категории с ключевыми словами', () => {
    const p = buildPrompt(ctx)
    expect(p).toContain('1|Otliv oq 200|m|otliv')
    expect(p).toContain('6|PITANIYA|obed')
    expect(p).toContain('NEVER multiply')
  })
})

describe('ИИ-расходы: тексты карточек', () => {
  it('черновик: строки, непонятое и итог', () => {
    const t = draftText([
      { kind: 'expense', text: 'obed', amount: 150000, category: 'PITANIYA', note: 'obed' },
      { kind: 'purchase', text: 'otliv', amount: 200000, name: 'Otliv oq 200', unit: 'm', qty: 10 },
      { kind: 'unclear', text: 'kley 5 litr 50000', reason: "omborda yo'q" },
    ])
    expect(t).toContain('Tushundim (2 ta)')
    expect(t).toContain('💸 obed — 150 000 so‘m · PITANIYA')
    expect(t).toContain('🛒 Otliv oq 200 — 10 m · 200 000 so‘m → omborga')
    expect(t).toContain('«kley 5 litr 50000» — omborda yo‘q')
    expect(t).toContain('Jami kassadan ayriladi: 350 000 so‘m')
  })
  it('нечего записывать — честно', () => {
    expect(draftText([{ kind: 'unclear', text: 'salom', reason: 'xarajat yoki xarid emas' }])).toContain('Yoziladigan narsa yo‘q')
  })
  it('после записи и после отмены — суммы из ответа базы', () => {
    expect(doneText({ expenses: [{ amount: 150000, category: 'PITANIYA', note: 'obed', employee: null }], purchases: [{ amount: 200000, qty: 10, name: 'Otliv oq 200', unit: 'm' }], expense_total: 150000, purchase_total: 200000, cash: -350000 }))
      .toContain('Kassadan 350 000 so‘m ayrildi. Kassa: -350 000 so‘m.')
    expect(undoText({ expense_total: 150000, purchase_total: 200000, failed: [], cash: 0 })).toContain('kassaga 350 000 so‘m qaytdi, ombordan ayrildi')
  })
})
