// Проверка разбора фраз ИИ на НАСТОЯЩЕМ омборе (только чтение, в базу ничего не пишет).
// Каждая фраза — с правильным ответом: E|сумма|категория, P|материал омбора|кол-во|сумма, U (не записывать).
// Запуск: deno run --allow-net --allow-read scripts/e2e/ai_expense_try.ts scripts/e2e/ai_expense_phrases.json [модель]
import { AI_MODEL, askAi, type AiCtx, type BatchLine } from '../../supabase/functions/tg-bot/ai-expense.ts'

const env = Object.fromEntries(
  Deno.readTextFileSync(new URL('../../.env.local', import.meta.url)).split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
const get = async (q: string) => (await fetch(`${env.SUPABASE_URL}/rest/v1/${q}`, { headers: H })).json()
const ctx: AiCtx = {
  stock: await get('v_stock_balance?select=item_id,part,name,unit,kind,sort&order=kind,sort,name,part'),
  cats: await get('expense_categories?select=id,name,keywords&is_active=eq.true&order=id'),
  people: await get('employees?select=id,full_name&is_active=eq.true&order=full_name'),
}
const cases: { t: string; e: string[] }[] = JSON.parse(Deno.readTextFileSync(Deno.args[0]))
const model = Deno.args[1] ?? AI_MODEL
const catName = (id?: number | null) => ctx.cats.find((c) => c.id === id)?.name ?? '?'
const stockName = (id?: string, part?: string) => ctx.stock.find((s) => s.item_id === id && s.part === (part ?? ''))?.name ?? '?'
const code = (l: BatchLine) =>
  l.kind === 'expense' ? `E|${l.amount}|${catName(l.category_id)}` : l.kind === 'purchase' ? `P|${stockName(l.item_id, l.part)}|${l.qty}|${l.amount}` : 'U'

let p = 0, c = 0, o = 0, good = 0
const bad: string[] = []
for (const x of cases) {
  const r = await askAi(env.OPENAI_API_KEY, x.t, ctx, 30000, model)
  p += r.usage.prompt; c += r.usage.cached; o += r.usage.completion
  const got = r.lines.map(code)
  const ok = JSON.stringify(got) === JSON.stringify(x.e)
  if (ok) good++
  else bad.push(`${x.t.replace(/\n/g, ' ⏎ ')}\n     ждали: ${x.e.join(' ; ')}\n     ИИ:    ${got.join(' ; ')}   ${r.lines.filter((l) => l.kind === 'unclear').map((l) => `(${l.reason})`).join(' ')}`)
  console.log(ok ? 'OK  ' : 'FAIL', x.t.replace(/\n/g, ' ⏎ '), ok ? '' : `→ ${got.join(' ; ')}`)
}
const price: Record<string, [number, number, number]> = { 'gpt-4.1-mini': [0.4, 0.1, 1.6], 'gpt-4.1': [2, 0.5, 8], 'gpt-5-mini': [0.25, 0.025, 2] }
const [pi, pc, po] = price[model] ?? [0, 0, 0]
const usd = ((p - c) * pi + c * pc + o * po) / 1e6
console.log(`\n${model}: верно ${good} из ${cases.length}; токены prompt ${p} (кэш ${c}), out ${o} → $${usd.toFixed(4)} (≈ $${(usd / cases.length).toFixed(5)} за сообщение)`)
if (bad.length) console.log('\nОШИБКИ:\n  ' + bad.join('\n  '))
