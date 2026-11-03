// Разбор расхода из текста сообщения Rahbar: «obed 150000», «бензин 200 000 Hyundai», «ремонт 1,5 mln».
// Чистый TypeScript (без Deno/DOM): используется ботом и тестами сайта.

export interface ExpenseCategory {
  id: number
  name: string
}
export interface ExpensePerson {
  id: string
  full_name: string
}
export interface ParsedExpense {
  amount: number | null
  categoryId: number | null
  note: string
  employeeId: string | null
}

// слова, по которым категория угадывается (названия категорий — как в expense_categories)
const KEYWORDS: Record<string, string[]> = {
  PITANIYA: ['obed', 'ovqat', 'choy', 'tushlik', 'nonushta', 'pitani', 'обед', 'чай', 'питани', 'еда', 'обеда'],
  TRANSPORT: ['benzin', 'бензин', 'gaz', 'газ', 'metan', 'propan', 'dostavka', 'доставка', 'transport', 'yoqilg', 'solyarka', 'dizel'],
  LABO: ['labo', 'лабо', 'gruzovik', 'грузовик'],
  'KOCHA KIRA': ['kocha', 'yolkira', "yo'lkira", "yo'l kira", 'yol kira', 'дорожн', 'taksi', 'такси'],
  'OFIS ARENDA': ['arenda', 'ijara', 'ofis', 'аренда', 'офис'],
  KREDIT: ['kredit', 'кредит'],
  SVET: ['svet', 'свет', 'elektr', 'электр', 'kommunal', 'коммунал'],
  SOLIQ: ['soliq', 'nalog', 'налог'],
  MAHSULOT: ['mahsulot', 'maxsulot', 'ruchka', 'samorez', 'самарез', 'саморез', 'расходник', 'kley', 'клей', 'lenta', 'germetik', 'герметик'],
  'KUT-HARAJAT': ['kut', 'harajat', 'xarajat', 'remont', 'ремонт', 'boshqa', 'прочее'],
}

const STOP_NAME_TOKENS = new Set(['aka', 'opa', 'ака', 'ока', 'bek', 'бек', 'boy', 'бой', 'xon', 'хон'])

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[ʻʼ’`´‘]/g, "'")
    .replace(/ё/g, 'е')
    .replace(/ /g, ' ')

const SUFFIX: Record<string, number> = { mln: 1e6, млн: 1e6, million: 1e6, миллион: 1e6, ming: 1e3, минг: 1e3, тыс: 1e3, k: 1e3, к: 1e3 }

interface Hit {
  index: number
  length: number
  value: number
}

function findAmount(text: string): Hit | null {
  const hits: Hit[] = []
  // 1,5 mln · 150k · 200 ming
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s*(mln|млн|million|миллион|ming|минг|тыс|k|к)(?![\p{L}])/gu)) {
    hits.push({ index: m.index!, length: m[0].length, value: Math.round(Number(m[1].replace(',', '.')) * SUFFIX[m[2]]) })
  }
  // 200 000 · 1 500 000 · 150,000 · 1.500.000
  for (const m of text.matchAll(/(?<![\d])\d{1,3}(?:[ ,.]\d{3})+(?![\d])/g)) {
    hits.push({ index: m.index!, length: m[0].length, value: Number(m[0].replace(/[ ,.]/g, '')) })
  }
  // 150000
  for (const m of text.matchAll(/(?<![\d])\d{4,9}(?![\d])/g)) hits.push({ index: m.index!, length: m[0].length, value: Number(m[0]) })
  const ok = hits.filter((h) => h.value >= 1000 && h.value <= 1e10)
  if (!ok.length) return null
  // самое раннее; при равенстве — самое длинное совпадение (чтобы «200 000» не превратилось в «200»)
  ok.sort((a, b) => a.index - b.index || b.length - a.length)
  return ok[0]
}

export function parseExpense(raw: string, categories: ExpenseCategory[], people: ExpensePerson[] = []): ParsedExpense {
  const text = normalize(raw).trim()
  const hit = findAmount(text)
  const rest = hit ? (text.slice(0, hit.index) + ' ' + text.slice(hit.index + hit.length)).replace(/\s+/g, ' ').trim() : text
  const tokens = rest.split(/[^\p{L}\p{N}']+/u).filter(Boolean)

  // категория: первое слово текста, которое подходит
  const byName = new Map(categories.map((c) => [normalize(c.name), c]))
  const words: [string, ExpenseCategory][] = []
  for (const [name, list] of Object.entries(KEYWORDS)) {
    const cat = byName.get(normalize(name))
    if (cat) for (const w of list) words.push([normalize(w), cat])
  }
  for (const c of categories) {
    if (Object.keys(KEYWORDS).some((k) => normalize(k) === normalize(c.name))) continue
    for (const w of normalize(c.name).split(/[^\p{L}\p{N}']+/u)) if (w.length >= 3) words.push([w, c]) // свои категории — по своему названию
  }
  let category: ExpenseCategory | null = null
  for (const tok of tokens) {
    const w = words.find(([k]) => (k.includes(' ') ? false : tok.startsWith(k)))
    if (w) {
      category = w[1]
      break
    }
  }
  if (!category) {
    const w = words.find(([k]) => k.includes(' ') && rest.includes(k))
    if (w) category = w[1]
  }

  // сотрудник: ровно один человек, чьё имя (слово ≥ 4 букв, не «aka/opa/bek») встречается в тексте
  const toks = new Set(tokens)
  const matched = people.filter((p) =>
    normalize(p.full_name)
      .split(/[^\p{L}\p{N}']+/u)
      .some((n) => n.length >= 4 && !STOP_NAME_TOKENS.has(n) && toks.has(n)),
  )

  return {
    amount: hit ? hit.value : null,
    categoryId: category?.id ?? null,
    note: raw.replace(/\s+/g, ' ').trim().slice(0, 200),
    employeeId: matched.length === 1 ? matched[0].id : null,
  }
}
