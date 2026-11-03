// Импорт истории из Google Sheet «REGISTRATSIYA» (xlsx): клиенты (все) + заказы с даты --from (по умолчанию 2025-04-01) + оплаты (BERDI).
// Сначала проверка без записи:  node import-history.mjs <файл.xlsx>
// Запись в базу:                node import-history.mjs <файл.xlsx> --apply
// Повторный запуск безопасен: существующие номера заказов и клиенты (по телефону) пропускаются.
import ExcelJS from 'exceljs'
import { env } from './env.mjs'

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

const sum = (xs, k) => xs.reduce((s, x) => s + x[k], 0)
const byMonth = {}
for (const o of orders) byMonth[o.date.slice(0, 7)] = (byMonth[o.date.slice(0, 7)] ?? 0) + 1
console.log(`Листов: ${book.worksheets.length}; строк заказов: ${rows.length}; уникальных номеров: ${unique.length}`)
console.log(`Клиентов (уникальных): ${clients.size}`)
console.log(`Заказов с ${FROM}: ${orders.length}; договоры ${Math.round(sum(orders, 'contract')).toLocaleString('ru-RU')}; внесено ${Math.round(sum(orders, 'paid')).toLocaleString('ru-RU')}; долг ${Math.round(sum(orders, 'rest')).toLocaleString('ru-RU')}; закрыто ${orders.filter((o) => o.status === 'YOPILDI').length}`)
console.log('По месяцам:', JSON.stringify(byMonth))
console.log(`Расхождений: ${problems.length}`)
for (const p of problems.slice(0, 40)) console.log('  ·', p)
if (problems.length > 40) console.log(`  … и ещё ${problems.length - 40}`)

if (!APPLY) {
  console.log('\nПроверка без записи. Для записи добавьте --apply')
  process.exit(0)
}

// ---------- запись ----------
const q = (s) => `$imp$${JSON.stringify(s)}$imp$`
// 1) клиенты, которых нет (по телефону)
const existing = await sql(`select id, full_name, phone from public.clients`)
const idByKey = new Map(existing.map((c) => [phoneKey(c.phone ?? '') ?? `name:${c.full_name.toUpperCase()}`, c.id]))
const newClients = [...clients.entries()].filter(([k]) => !idByKey.has(k)).map(([key, c]) => ({ key, ...c }))
for (let i = 0; i < newClients.length; i += 300) {
  const chunk = newClients.slice(i, i + 300)
  const ins = await sql(`insert into public.clients(full_name, phone, address)
    select x.full_name, x.phone, x.address from json_to_recordset(${q(chunk)}) as x(key text, full_name text, phone text, address text)
    returning id, full_name, phone`)
  for (const c of ins) idByKey.set(phoneKey(c.phone ?? '') ?? `name:${c.full_name.toUpperCase()}`, c.id)
}
console.log(`клиентов добавлено: ${newClients.length}`)

// 2) заказы + 3) оплаты
const years = Number((await sql(`select coalesce((value #>> '{}')::int, 5) y from app_settings where key='warranty_years'`))[0]?.y ?? 5)
const payload = orders.map((o) => {
  // в таблице статус заполняли только до марта 2025: YOPILDI → закрыт, остальное — «не указан» (владелец отметит переключателем)
  const closed = o.status === 'YOPILDI'
  const install = o.installed ?? null
  const closeDay = install ?? o.date
  return {
    order_no: o.order_no,
    client_id: idByKey.get(clientKey(o)),
    created_at: `${o.date}T12:00:00+05:00`,
    address: o.address || null,
    contact_phone: o.phone || null,
    color: o.color || null,
    status: closed ? 'closed' : 'unknown',
    install_date: install,
    closed_at: closed ? `${closeDay}T18:00:00+05:00` : null,
    warranty_until: closed ? `${Number(closeDay.slice(0, 4)) + years}${closeDay.slice(4)}` : null,
    windows_count: o.count,
    area_m2: Math.round(o.area * 100) / 100,
    calc_cost: o.cost,
    contract_price: o.contract,
    notes: `Import (REGISTRATSIYA ${o.sheet}): Alyumin ${o.alu} m², Plast ${o.plast} m², Termo ${o.termo} m²; Mahsulot ${o.product}; Sbor/usluga ${o.service}; Foyda ${o.profit}`,
    paid: o.paid,
    pay_date: o.date,
  }
})
let addedOrders = 0
let addedPays = 0
for (let i = 0; i < payload.length; i += 200) {
  const chunk = payload.slice(i, i + 200)
  const ins = await sql(`with src as (select * from json_to_recordset(${q(chunk)}) as x(order_no bigint, client_id uuid, created_at timestamptz, address text, contact_phone text, color text,
      status text, install_date date, closed_at timestamptz, warranty_until date, windows_count int, area_m2 numeric, calc_cost numeric, contract_price numeric, notes text, paid numeric, pay_date date)),
    o as (insert into public.orders(order_no, client_id, created_at, address, contact_phone, color, status, install_date, closed_at, warranty_until, windows_count, area_m2, calc_cost, contract_price, notes, is_imported)
          select order_no, client_id, created_at, address, contact_phone, color, status, install_date, closed_at, warranty_until, windows_count, area_m2, calc_cost, contract_price, notes, true from src
          on conflict (order_no) do nothing returning id, order_no),
    p as (insert into public.payments(order_id, amount, paid_at, note)
          select o.id, s.paid, s.pay_date, 'Import (REGISTRATSIYA)' from o join src s using (order_no) where s.paid > 0 returning id)
    select (select count(*) from o) as orders, (select count(*) from p) as pays`)
  addedOrders += Number(ins[0].orders)
  addedPays += Number(ins[0].pays)
}
// нумерация продолжается сразу после последнего номера (без дыры)
await sql(`select setval('public.order_no_seq', (select max(order_no) from public.orders) + 1, false)`)
console.log(`заказов добавлено: ${addedOrders}; оплат: ${addedPays}`)
console.log('следующий номер заказа:', (await sql(`select last_value from public.order_no_seq`))[0].last_value)
