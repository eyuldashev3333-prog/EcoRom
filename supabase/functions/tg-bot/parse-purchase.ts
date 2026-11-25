// Разбор закупки из сообщения Rahbar. Правило записи (одно, простое):
//   xarid <название материала> <количество> [единица] <сумма>
//   «xarid Otliv oq 200 30 m 600000»  → материал «Otliv oq 200», 30 m, всего 600 000 so'm
//   «xarid Kley 5 litr 250000», «xarid Dobor 20 15 450000», «xarid Lenta 3 1,5 mln»
// Последнее число — СУММА за всё (допустимы k / ming / mln: «600k», «1,5 mln»); число перед ним (с единицей или без) — количество;
// всё, что левее, — название. Без слова «xarid» в начале сообщение считается обычным расходом.
// Чистый TypeScript (без Deno/DOM): используется ботом и тестами сайта.

export interface ParsedPurchase {
  name: string
  qty: number
  unit: string | null
  total: number
}
export type PurchaseParse = { ok: true; value: ParsedPurchase } | { ok: false; error: string }

export const PURCHASE_HELP = 'Xarid yozish: «xarid <material nomi> <miqdor> [birlik] <summa>». Masalan: «xarid Otliv oq 200 30 m 600000» yoki «xarid Kley 5 litr 250k».'

const PREFIX = /^\s*xarid\b[\s:,\-–—]*/i
const MULT: Record<string, number> = { k: 1e3, ming: 1e3, минг: 1e3, mln: 1e6, млн: 1e6, mil: 1e6 }

/** число с разделителями: «600 000» не поддерживается (пробел — граница слов), «1.500.000», «1,5», «250000» */
function num(tok: string): number | null {
  if (!/^\d+(?:[.,]\d+)*$/.test(tok)) return null
  const thousands = /^\d{1,3}(?:[.,]\d{3})+$/.test(tok) // 1.500.000 / 600,000
  const n = Number(thousands ? tok.replace(/[.,]/g, '') : tok.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function isPurchase(text: string): boolean {
  return PREFIX.test(text)
}

export function parsePurchase(text: string): PurchaseParse {
  if (!PREFIX.test(text)) return { ok: false, error: PURCHASE_HELP }
  const toks = text.replace(PREFIX, '').trim().split(/\s+/).filter(Boolean)
  const bad = (error: string): PurchaseParse => ({ ok: false, error: `${error}\n${PURCHASE_HELP}` })
  if (toks.length < 3) return bad('Yetarli ma’lumot yo‘q.')

  // сумма: последний токен, возможно со множителем («600k» или «1,5 mln»)
  let total: number | null = null
  const last = toks[toks.length - 1].toLowerCase()
  const glued = last.match(/^(\d+(?:[.,]\d+)?)(k|ming|минг|mln|млн|mil)$/)
  if (glued) {
    total = Number(glued[1].replace(',', '.')) * MULT[glued[2]]
    toks.pop()
  } else if (MULT[last] && toks.length >= 2 && num(toks[toks.length - 2]) !== null) {
    total = (num(toks[toks.length - 2]) as number) * MULT[last]
    toks.pop()
    toks.pop()
  } else if (num(last) !== null) {
    total = num(last)
    toks.pop()
  }
  if (!total || total <= 0) return bad('Summani topa olmadim (oxirgi son — umumiy summa).')

  // количество: число (после него возможна единица)
  let unit: string | null = null
  let qty: number | null = null
  const t1 = toks[toks.length - 1]
  if (t1 !== undefined && num(t1) !== null) {
    qty = num(t1)
    toks.pop()
  } else if (t1 !== undefined && toks.length >= 2 && /^[^\d\s]{1,10}$/.test(t1) && num(toks[toks.length - 2]) !== null) {
    unit = t1
    qty = num(toks[toks.length - 2])
    toks.pop()
    toks.pop()
  }
  if (!qty || qty <= 0) return bad('Miqdorni topa olmadim (summadan oldingi son).')
  // границы базы: количество numeric(14,3), сумма numeric(14,2) — понятная ошибка вместо «numeric field overflow»
  if (qty < 0.001 || qty > 1_000_000) return bad('Miqdor 0,001 dan 1 000 000 gacha bo‘lsin.')
  if (total > 999_999_999_999) return bad('Summa juda katta.')

  const name = toks.join(' ').trim()
  if (!name) return bad('Material nomi yo‘q.')
  return { ok: true, value: { name, qty, unit, total } }
}
