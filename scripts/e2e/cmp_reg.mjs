// Импорт истории из Google Sheet «REGISTRATSIYA» (xlsx): клиенты (все) + заказы с даты --from (по умолчанию 2025-04-01) + оплаты (BERDI).
// Сначала проверка без записи:  node import-history.mjs <файл.xlsx>
// Запись в базу:                node import-history.mjs <файл.xlsx> --apply
// Повторный запуск безопасен: существующие номера заказов и клиенты (по телефону) пропускаются.
import ExcelJS from 'file:///D:/Eco Rom/scripts/node_modules/exceljs/excel.js'
import { env } from 'file:///D:/Eco Rom/scripts/env.mjs'

const file = process.argv[2]
if (!file) throw new Error('укажите xlsx')
const APPLY = process.argv.includes('--apply')
const fi = process.argv.indexOf('--from')
const FROM = fi > 0 ? process.argv[fi + 1] : '2024-01-01'

// дата по названию листа, если в строке её нет (первые листы без года — 2024)
const MONTHS = { YANVAR: 1, FEVRAL: 2, FEBRAL: 2, MART: 3, APREL: 4, MAY: 5, IYUN: 6, IYUL: 7, AVGUST: 8, SENTABR: 9, OKTABR: 10, OKTYABR: 10, NOYABR: 11, DEKABR: 12 }
function sheetDate(name) {
  const m = name.toUpperCase().replace(/\s/g, '').match(/^([A-Z]+)-?(\d{4})?$/)
  if (!m || !MONTHS[m[1]]) return null
  return `${m[2] ?? '2024'}-${String(MONTHS[m[1]]).padStart(2, '0')}-01`
}

const sql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${env('SUPABASE_PROJECT_REF')}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('SUPABASE_ACCESS_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(t)
  return JSON.parse(t)
}

// ---------- разбор ячеек ----------
const raw = (v) => (v && typeof v === 'object' && 'result' in v ? v.result : v && typeof v === 'object' && 'richText' in v ? v.richText.map((x) => x.text).join('') : v)
const str = (v) => String(raw(v) ?? '').replace(/ /g, ' ').trim()
function num(v) {
  const x = raw(v)
  if (typeof x === 'number') return x
  const s = str(x).replace(/\s/g, '').replace(',', '.')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}
function date(v) {
  const x = raw(v)
  if (x instanceof Date) return x.toISOString().slice(0, 10)
  if (typeof x === 'number' && x > 30000) return new Date(Date.UTC(1899, 11, 30) + x * 86400000).toISOString().slice(0, 10)
  const m = str(x).match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/)
  if (!m) return null
  const y = m[3].length === 2 ? `20${m[3]}` : m[3]
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}
const phoneKey = (p) => (p.replace(/\D/g, '').slice(-9) || null)

// ---------- чтение книги ----------
const book = new ExcelJS.Workbook()
await book.xlsx.readFile(file)
const rows = []
const problems = []
for (const ws of book.worksheets) {
  let cols = null
  ws.eachRow((row, rn) => {
    const vals = row.values // 1-based
    const upper = vals.map((v) => str(v).toUpperCase())
    if (upper.includes('SANA') && upper.includes('RAQAMI')) {
      cols = {}
      upper.forEach((h, i) => h && !(h in cols) && (cols[h] = i))
      return
    }
    if (!cols) return
    const get = (h) => vals[cols[h]]
    const no = num(get('RAQAMI'))
    const name = str(get('ISMI'))
    if (!no || !name) return
    rows.push({
      sheet: ws.name,
      row: rn,
      order_no: Math.round(no),
      ...(() => {
        const d = date(get('SANA'))
        const sd = sheetDate(ws.name)
        if (!d) return { date: sd, dateFromSheet: true }
        // опечатка в годе (например 0206) — год из названия листа
        if (Number(d.slice(0, 4)) < 2020 && sd) return { date: `${sd.slice(0, 4)}${d.slice(4)}`, dateTypo: d }
        return { date: d }
      })(),
      name,
      address: str(get('MANZIL')),
      phone: str(get('KONTAKT')),
      color: str(get('RANGI')),
      alu: num(get('ALYUMIN-M2')),
      plast: num(get('PLAST-M2')),
      termo: num(get('TERMO-M2')),
      area: num(get('JAMI')),
      count: Math.round(num(get('SONI'))),
      contract: num(get('DOGOVOR')),
      paid: num(get('BERDI')),
      rest: num(get('QOLDIQ')),
      product: num(get('MAHSULOT')),
      service: num(get('SBOR-USLUG')),
      cost: num(get('JAMI TANI')),
      profit: num(get('SHOW-FOYDA')),
      installed: date(get('ORNATILISH')),
      status: str(get('STATUS')).toUpperCase(),
    })
  })
}

// дубли номеров и проверки
const seen = new Map()
const unique = []
for (const r of rows) {
  if (seen.has(r.order_no)) {
    problems.push(`№${r.order_no}: повтор (${seen.get(r.order_no)} и ${r.sheet}:${r.row}) — взят первый`)
    continue
  }
  seen.set(r.order_no, `${r.sheet}:${r.row}`)
  unique.push(r)
  if (!r.date) problems.push(`№${r.order_no}: нет даты (${r.sheet}:${r.row})`)
  else if (r.dateFromSheet) problems.push(`№${r.order_no}: нет даты — взято 1-е число месяца листа ${r.sheet} (${r.date})`)
  else if (r.dateTypo) problems.push(`№${r.order_no}: опечатка в дате ${r.dateTypo} — год взят из листа ${r.sheet} → ${r.date}`)
  if (Math.abs(r.contract - r.paid - r.rest) > 1) problems.push(`№${r.order_no}: договор ${r.contract} − внесено ${r.paid} ≠ остаток ${r.rest}`)
  if (Math.abs(r.product + r.service - r.cost) > 1) problems.push(`№${r.order_no}: материал ${r.product} + сборка ${r.service} ≠ себестоимость ${r.cost}`)
}
const orders = unique.filter((r) => r.date && r.date >= FROM)
for (const r of unique.filter((x) => !orders.includes(x))) problems.push(`№${r.order_no}: НЕ загружается — дата ${r.date ?? 'нет'} (${r.sheet}:${r.row}, ${r.name})`)

// клиенты: по телефону, без телефона — по имени
const clientKey = (r) => phoneKey(r.phone) ?? `name:${r.name.toUpperCase()}`
const clients = new Map()
for (const r of unique) if (!clients.has(clientKey(r))) clients.set(clientKey(r), { full_name: r.name, phone: r.phone || null, address: r.address || null })

// ===== СВЕРКА с базой =====
const db = await sql(`select o.order_no, o.created_at::date d, o.status, o.is_imported, o.contract_price::numeric cp, o.area_m2::numeric a, o.windows_count wc, o.calc_cost::numeric cc, o.address, o.contact_phone ph, o.color, o.install_date, o.m2_alu, o.m2_plast, o.m2_termo, o.cost_product, o.cost_service, c.full_name cn, c.phone cph,
  coalesce((select sum(amount) from payments p where p.order_id=o.id),0)::numeric paid from orders o left join clients c on c.id=o.client_id where o.order_no between 1000 and 2434`)
const dbBy = new Map(db.map(r => [Number(r.order_no), r]))
const diffs = []
let matched = 0
for (const r of unique) {
  const d = dbBy.get(r.order_no)
  if (!d) { diffs.push(`№${r.order_no}: НЕТ в базе (${r.sheet}:${r.row}) ${r.name} договор ${r.contract}`); continue }
  matched++
  const chk = (f, a, b) => { if (a !== b) diffs.push(`№${r.order_no} ${f}: таблица=${a} база=${b}`) }
  chk('договор', r.contract, Number(d.cp))
  chk('оплачено', r.paid, Number(d.paid))
  chk('м2 общ', Math.round(r.area*100)/100, Number(d.a))
  chk('окон', r.count, Number(d.wc))
  chk('себестоимость', r.cost, Number(d.cc))
  chk('дата', r.date, String(d.d).slice(0,10))
  chk('имя', r.name.toUpperCase(), String(d.cn||'').toUpperCase())
  chk('адрес', r.address||'', d.address||'')
  chk('телефон', (r.phone||'').trim(), (d.ph||'').trim())
  chk('цвет', r.color||'', d.color||'')
  if (d.m2_alu != null) { chk('alu', r.alu, Number(d.m2_alu)); chk('plast', r.plast, Number(d.m2_plast)); chk('termo', r.termo, Number(d.m2_termo)); chk('mahsulot', r.product, Number(d.cost_product)); chk('sbor', r.service, Number(d.cost_service)) }
  chk('закрыт', r.status==='YOPILDI', d.status==='closed')
}
const tableNos = new Set(unique.map(r=>r.order_no))
for (const [no,d] of dbBy) if (!tableNos.has(no)) diffs.push(`№${no}: есть в базе, НЕТ в таблице (${d.cn})`)
console.log(`строк в таблице уникальных: ${unique.length}; в базе (1000–2434): ${db.length}; совпало по номеру: ${matched}`)
console.log(`расхождений: ${diffs.length}`)
const byField = {}; for (const x of diffs) { const k = x.replace(/^№\d+ ?/,'').split(':')[0]; byField[k]=(byField[k]||0)+1 }
console.log(JSON.stringify(byField))
import { writeFileSync } from 'node:fs'
writeFileSync(process.argv[3] || 'reg_diffs.txt', diffs.join('\n'), 'utf8')
console.log('первые 30:'); diffs.slice(0,30).forEach(x=>console.log(' ',x))
console.log('проблемы самой таблицы:', problems.length); problems.slice(0,40).forEach(x=>console.log(' ·',x))
// сумма
const S=(a,k)=>a.reduce((s,x)=>s+x[k],0)
console.log('таблица: договоры', S(unique,'contract'), 'оплачено', S(unique,'paid'), 'остаток', S(unique,'rest'))
console.log('база: договоры', db.reduce((s,x)=>s+Number(x.cp),0), 'оплачено', db.reduce((s,x)=>s+Number(x.paid),0))
