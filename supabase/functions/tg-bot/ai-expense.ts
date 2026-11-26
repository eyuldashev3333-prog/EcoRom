// ИИ-разбор сообщения руководителя: расходы и закупки (gpt-4.1-mini, ответ строго по JSON-схеме).
// Правила Asad: решение принимает ИИ (тип, категория, материал омбора с опечатками, единица, разбиение списка);
// сумма — ровно та, что написал руководитель (ничего не умножать). Код проверяет только техническое (база ещё раз — bot_batch_check).
// Омбор передаётся свежим при каждом сообщении; неизменное начало промпта (правила → омбор → категории → сотрудники)
// OpenAI кэширует автоматически — повторные сообщения дешевле.
// Чистый TypeScript (fetch есть и в Deno, и в Node): используется ботом и тестами сайта.

// gpt-5-mini: на 32 фразах с настоящим омбором точнее gpt-4.1-mini (тот путал материалы от прогона к прогону) и дешевле
export const AI_MODEL = 'gpt-5-mini'

export interface StockRow { item_id: string; part: string; name: string; unit: string; kind?: string }
// раздел омбора — подсказка ИИ, что это за вещь (в названиях подоконников, например, слова «podokonnik» нет)
const KIND: Record<string, string> = {
  system: 'profil', glass: 'oyna / paket', hardware: 'furnitura', sill: 'podokonnik', ebb: 'otliv',
  net: "to'r (setka)", extra: "qo'shimcha profil", misc: 'mayda material',
}
export interface Cat { id: number; name: string; keywords?: string[] | null }
export interface Person { id: string; full_name: string }
export interface AiCtx { stock: StockRow[]; cats: Cat[]; people: Person[] }

export interface AiEntry {
  kind: 'expense' | 'purchase' | 'unclear'
  text: string
  amount: number | null
  category_id: number | null
  employee_ref: number | null
  stock_name?: string | null
  stock_ref: number | null
  qty: number | null
  note: string | null
  reason: string | null
}

// строка для bot_batch_create
export interface BatchLine {
  kind: 'expense' | 'purchase' | 'unclear'
  text: string
  amount?: number | null
  category_id?: number | null
  employee_id?: string | null
  note?: string | null
  item_id?: string
  part?: string
  qty?: number | null
  reason?: string | null
}

const UNIT: Record<string, string> = { pcs: 'dona', m: 'm', m2: 'm²', kg: 'kg', l: 'litr' }
export const unitName = (u: string | null | undefined) => (u ? (UNIT[u] ?? u) : '')

const RULES = `You turn a message from the factory director (window/door factory ECOROM, Uzbekistan) into cash book entries.
The director writes in Uzbek (Latin or Cyrillic), Russian or mixed, often with typos and abbreviations.

Split the message into entries. Every line, or every comma/"va"/"и"-separated item that has its own money sum, is a separate entry.
A fragment without its own sum belongs to the neighbouring entry.

For each entry decide the kind yourself:
- "purchase": buying material / raw material that is in the OMBOR (warehouse) list below (words like xarid, oldim, sotib oldim, keldi, купил, взял — or simply a material name with quantity and sum).
- "expense": any other spending (food, fuel, transport, rent, electricity, taxes, repairs, advertising, advance or payment to an employee, etc.).
- "unclear": cannot be recorded safely — explain why in "reason" (short, Uzbek Latin).

amount = the money sum EXACTLY as the director wrote it, only converted to a number:
"150 000", "150000", "150,000", "150.000" -> 150000; "150k", "150 ming", "150 тыс", "150 минг" -> 150000; "1,5 mln", "1.5 млн" -> 1500000; "so'm", "sum", "сум" are just currency words.
NEVER multiply quantity by price, never add, never compute anything. Example: "kley 30 litr 100 000" -> purchase, qty 30, amount 100000.
If the sum is in dollars or another currency, or there is no sum -> "unclear" (reason "summa yo'q" or "so'mda yozing").
If a line has a quantity and a sum, the number with a unit (m, metr, dona, ta, kg, litr, list, pachka, m2, kv) or right before a material size is the quantity; the money is the sum.

purchase:
- stock_ref = the number of the OMBOR row that the director means. Tolerate typos, Cyrillic/Latin transliteration, Russian names, missing words, word order (e.g. "otlif 200 oq" = "Otliv oq 200", "рама" = "rama", "штапик" = "shtapik").
- First write material = the material exactly as the director named it (e.g. "kley", "otliv", "rama 7000 akfa"), then stock_name = the exact name of the OMBOR row that is THE SAME material, then stock_ref = its number.
- The row must be the same thing, not just a similar word: glue (kley, клей) is not screws (samorez); handle (ruchka) is not screws (shurup); foam (ko'pik) is not glue; sealant (germetik) is not foam. When you are not sure it is the same material, choose "unclear" — a wrong material is worse than a question.
- Units: "kv", "kv.m", "m2", "кв", "квадрат" = m²; "m", "metr", "метр", "pm" = m; "dona", "ta", "шт", "sht" = dona. Apostrophes and spelling vary: "tor", "to'r", "тўр", "сетка" = To'r. If OMBOR has no row for this material -> "unclear", reason "omborda yo'q".
- If several rows fit and the director did not write what distinguishes them (size 200/300, colour, part, type) -> "unclear", reason "aniq emas: <row A> yoki <row B>". If one row is the plain name and others add extra words the director did not write, choose the plain one ("paket ok+ok" -> "Paket (Ok+Ok)").
- Numbers in a product name must match: the number the director wrote (7000, 6500, 200, 30 sm …) must appear in stock_name. "7000" is a different product from "6500" or "6000"; "Otliv 200" is not "Otliv 300". Brand words (AKFA, Engelberg, Termo) only help to choose among rows that already have the right number. Example: "рама 7000 акфа" -> "Plastik 7000 (AKFA) — rama" (NOT "AKFA 6500 (Penta) — rama").
- Profile rows are "<system> — <part>" (rama, impost, tavaqa, shtapik, rezina).
- Example: "otliv 30 m" (no 200/300) -> "unclear", reason "aniq emas: Otliv oq 200 yoki Otliv oq 300".
- qty = the quantity, in the unit of that OMBOR row. If the director's unit clearly differs from the OMBOR unit and they are not the same thing (e.g. "dona" vs "m"), use "unclear" with reason "birlik mos emas (omborda: <unit>)".
- If nothing in OMBOR matches -> "unclear", reason "omborda yo'q". If two rows fit equally -> "unclear", reason "aniq emas: <row A> yoki <row B>".
expense:
- category_id = the best category id from CATEGORIES. The keywords were set by the director: if a keyword of a category appears in the text (any spelling: "такси" = "taksi"), use THAT category, even if another category also seems to fit (e.g. "taksi" -> "KOCHA KIRA", not "TRANSPORT"). Never use "ISH HAQI (tarix)", "OYNA SINISHI", "SERVIS" — they are filled automatically by other parts of the system. If nothing fits, use "KUT-HARAJAT".
- employee_ref = number from EMPLOYEES only when money is handed to that employee personally (e.g. "Islomga qarz berdim"); otherwise null, even if a driver/car/worker is mentioned ("benzin Damas" -> null).
- Salary, advance or bonus to an employee (ish haqi, avans, oylik, mukofot, зарплата, аванс) is NOT an expense here -> "unclear", reason "ish haqi/avans — tizimdagi «Ish haqi» bo'limida yozing".
- note = a short description in the director's own words (e.g. "obed", "benzin Damas").
If the message is not about spending at all (greeting, question) -> one "unclear" entry with reason "xarajat yoki xarid emas".
text = the original fragment of the message for this entry. Fill fields that do not apply with null.`

export function buildPrompt(ctx: AiCtx) {
  const stock = ctx.stock.map((s, i) => `${i + 1}|${s.name}|${unitName(s.unit)}|${KIND[s.kind ?? ''] ?? s.kind ?? ''}`).join('\n')
  const cats = ctx.cats.map((c) => `${c.id}|${c.name}${c.keywords?.length ? `|${c.keywords.join(', ')}` : ''}`).join('\n')
  const people = ctx.people.map((p, i) => `${i + 1}|${p.full_name}`).join('\n')
  return `${RULES}\n\nOMBOR (number|name|unit|section):\n${stock}\n\nCATEGORIES (id|name|keywords):\n${cats}\n\nEMPLOYEES (number|name):\n${people}`
}

const nul = (t: string) => ({ type: [t, 'null'] })
export const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['entries'],
  properties: {
    entries: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'kind', 'material', 'stock_name', 'stock_ref', 'qty', 'amount', 'category_id', 'employee_ref', 'note', 'reason'],
        properties: {
          text: { type: 'string' },
          kind: { type: 'string', enum: ['expense', 'purchase', 'unclear'] },
          material: nul('string'),
          stock_name: nul('string'),
          amount: nul('number'),
          category_id: nul('integer'),
          employee_ref: nul('integer'),
          stock_ref: nul('integer'),
          qty: nul('number'),
          note: nul('string'),
          reason: nul('string'),
        },
      },
    },
  },
}

// ответ ИИ → строки для базы (номера омбора/сотрудников → id). Только техника: несуществующий номер → «unclear».
export function toBatchLines(entries: AiEntry[], ctx: AiCtx): BatchLine[] {
  return entries.map((e) => {
    const text = String(e.text ?? '').trim().slice(0, 300)
    if (e.kind === 'expense') {
      const person = e.employee_ref ? ctx.people[e.employee_ref - 1] : undefined
      return { kind: 'expense', text, amount: e.amount, category_id: e.category_id, employee_id: person?.id ?? null, note: e.note ?? text }
    }
    if (e.kind === 'purchase') {
      const row = e.stock_ref ? ctx.stock[e.stock_ref - 1] : undefined
      if (!row) return { kind: 'unclear', text, reason: "omborda yo'q" }
      return { kind: 'purchase', text, amount: e.amount, qty: e.qty, item_id: row.item_id, part: row.part }
    }
    return { kind: 'unclear', text, reason: e.reason ?? 'tushunarsiz' }
  })
}

export interface AiResult { lines: BatchLine[]; usage: { prompt: number; cached: number; completion: number } }

export async function askAi(key: string, message: string, ctx: AiCtx, timeoutMs = 25000, model = AI_MODEL): Promise<AiResult> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: ac.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        // модели с рассуждением (gpt-5*) не принимают temperature — им задаётся глубина рассуждения
        ...(model.startsWith('gpt-5') ? { reasoning_effort: 'low' } : { temperature: 0 }),
        prompt_cache_key: 'ecorom-expenses',
        messages: [
          { role: 'system', content: buildPrompt(ctx) },
          { role: 'user', content: message.slice(0, 3000) },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'entries', strict: true, schema: SCHEMA } },
      }),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j?.error?.message ?? `OpenAI ${r.status}`)
    const content = j.choices?.[0]?.message?.content
    if (!content) throw new Error('OpenAI: bo‘sh javob')
    const entries = (JSON.parse(content).entries ?? []) as AiEntry[]
    return {
      lines: toBatchLines(entries, ctx),
      usage: { prompt: j.usage?.prompt_tokens ?? 0, cached: j.usage?.prompt_tokens_details?.cached_tokens ?? 0, completion: j.usage?.completion_tokens ?? 0 },
    }
  } finally {
    clearTimeout(t)
  }
}

// ---- тексты карточек (только из того, что вернула база) ----
const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Number(n)).replace(/\s/g, ' ')
export interface CheckedLine {
  kind: 'expense' | 'purchase' | 'unclear'
  text: string
  amount?: number
  category?: string
  employee?: string | null
  note?: string | null
  name?: string
  unit?: string
  qty?: number
  reason?: string
}

export function draftText(lines: CheckedLine[]) {
  const ok = lines.filter((l) => l.kind !== 'unclear')
  const bad = lines.filter((l) => l.kind === 'unclear')
  const out: string[] = []
  if (ok.length) {
    out.push(`Tushundim (${ok.length} ta):`)
    ok.forEach((l, i) => {
      if (l.kind === 'expense')
        out.push(`${i + 1}) 💸 ${l.note || l.text} — ${fmt(l.amount!)} so‘m · ${l.category}${l.employee ? ` · ${l.employee}` : ''}`)
      else out.push(`${i + 1}) 🛒 ${l.name} — ${fmt(l.qty!)} ${unitName(l.unit)} · ${fmt(l.amount!)} so‘m → omborga`)
    })
  }
  for (const l of bad) out.push(`❓ «${l.text}» — ${l.reason === "omborda yo'q" ? "omborda yo‘q: avval omborga qo‘shing, keyin qayta yozing" : l.reason}`)
  if (ok.length) out.push(`\nJami kassadan ayriladi: ${fmt(ok.reduce((s, l) => s + Number(l.amount), 0))} so‘m`)
  else out.push('\nYoziladigan narsa yo‘q.')
  return out.join('\n')
}

export interface DoneResult {
  expenses: { amount: number; category: string; note: string | null; employee: string | null }[]
  purchases: { amount: number; qty: number; name: string; unit: string }[]
  expense_total: number
  purchase_total: number
  cash: number
}
export function doneText(r: DoneResult) {
  const out = ['✅ Yozildi:']
  for (const e of r.expenses) out.push(`💸 ${e.note ?? e.category} — ${fmt(e.amount)} so‘m · ${e.category}${e.employee ? ` · ${e.employee}` : ''}`)
  for (const p of r.purchases) out.push(`🛒 ${p.name} — omborga +${fmt(p.qty)} ${unitName(p.unit)} · ${fmt(p.amount)} so‘m`)
  out.push(`\nKassadan ${fmt(Number(r.expense_total) + Number(r.purchase_total))} so‘m ayrildi. Kassa: ${fmt(r.cash)} so‘m.`)
  return out.join('\n')
}

export function undoText(r: { expense_total: number; purchase_total: number; failed: { name: string; reason: string }[]; cash: number }) {
  const back = Number(r.expense_total) + Number(r.purchase_total)
  const out = [`↩ Bekor qilindi: kassaga ${fmt(back)} so‘m qaytdi${Number(r.purchase_total) ? ', ombordan ayrildi' : ''}. Kassa: ${fmt(r.cash)} so‘m.`]
  for (const f of r.failed) out.push(`⚠️ «${f.name}» bekor qilinmadi: ${f.reason}`)
  return out.join('\n')
}
