// Импорт накладных расходов и зарплат прошлых месяцев из «SAVDO BOLIMI.xlsx» (для месячных отчётов до запуска системы).
// Проверка без записи:  node import-savdo.mjs "<файл.xlsx>"
// Запись в базу:        node import-savdo.mjs "<файл.xlsx>" --apply
// Повтор безопасен: уже импортированные (месяц + категория) пропускаются.
//
// Что берём (расходы записываются в журнал expenses с source='import', датой — последний день месяца):
//   • постоянные (строка 24/25): SOLIQ, OFIS ARENDA, KREDIT, SVET, DAMAS ARENDA(→TRANSPORT), MEDIYA/MABILOGRF(→REKLAMA),
//     OYNA* — стекло из магазина (→OYNA), MAXSULOT-1/2 — расходники цеха (→MAHSULOT);
//   • ежедневные (строки 32–59): PITANIYA, LABO, KOCHA KIRA, KUT-HARAJAT — суммы считаем сами по строкам и сверяем с итогом таблицы;
//   • зарплаты: сумма «JAMI OLDI» всех работников (строки 4–23) → категория «ISH HAQI (tarix)».
// Так считает таблица владельца: «SOF-FOYDA» = прибыль с заказов (колонка FOYDA = наша маржа) − ровно эти расходы
// (проверено: расходы и прибыль считаются по таблице до сума, см. сверку при запуске).
// НЕ берём колонку MAHSULOT (закупки профиля у поставщиков по дням): таблица тоже её не вычитает — материал уже в себестоимости заказов.
// Месяц, в котором таблица ещё не подведена (нет итога HIZMAT), пропускаем: иначе отчёт покажет завышенную прибыль.
// Все эти даты раньше cash_start_date → в кассу не попадают, влияют только на отчёты прошлых месяцев.
import ExcelJS from 'exceljs'
import { env } from './env.mjs'

const file = process.argv[2]
if (!file) throw new Error('укажите xlsx')
const APPLY = process.argv.includes('--apply')

const sql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${env('SUPABASE_PROJECT_REF')}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${env('SUPABASE_ACCESS_TOKEN')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })
  const t = await r.text()
  if (!r.ok) throw new Error(t)
  return JSON.parse(t)
}

const MONTHS = { YANVAR: 1, FEVRAL: 2, FEBRAL: 2, MART: 3, APREL: 4, MAY: 5, IYUN: 6, IYUL: 7, AVGUST: 8, SENTABR: 9, OKTABR: 10, NOYABR: 11, DEKABR: 12 }
const sheetMonth = (name) => {
  const m = name.toUpperCase().replace(/\s/g, '').match(/^([A-Z]+)-?(\d{4})?$/)
  return m && MONTHS[m[1]] ? `${m[2] ?? '2024'}-${String(MONTHS[m[1]]).padStart(2, '0')}` : null
}
const lastDay = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) }

const raw = (c) => { const v = c.value; if (v == null) return null; if (typeof v === 'object') { if ('result' in v) return v.result; if ('richText' in v) return v.richText.map((x) => x.text).join(''); return null } return v }
const txt = (c) => { const v = raw(c); return typeof v === 'string' ? v.trim().toUpperCase() : '' }
const num = (c) => { const v = raw(c); return typeof v === 'number' && Number.isFinite(v) ? v : null }
const cell = (ws, a) => ws.getCell(a)

// заголовок постоянного расхода → наша категория
const FIXED = { SOLIQ: 'SOLIQ', 'OFIS ARENDA': 'OFIS ARENDA', KREDIT: 'KREDIT', KRIDIT: 'KREDIT', SVET: 'SVET', 'DAMAS ARENDA': 'TRANSPORT', MEDIYA: 'REKLAMA', MABILOGRF: 'REKLAMA' }
const catOf = (h) => (h in FIXED ? FIXED[h] : h.startsWith('OYNA') ? 'OYNA' : h.startsWith('MAXSULOT') || h.startsWith('MAHSULOT') ? 'MAHSULOT' : null)
const NEW_CATEGORIES = {
  REKLAMA: 'Реклама, медиа, мобилография (из SAVDO)',
  OYNA: 'Стекло из магазина (из SAVDO, до запуска системы)',
  'ISH HAQI (tarix)': 'Зарплаты из таблицы SAVDO до запуска системы',
}

const firstOrderMonth = (await sql(`select to_char(min(created_at at time zone 'Asia/Tashkent'), 'YYYY-MM') m from orders`))[0].m
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(file)
const out = [] // {month, cat, amount}
const report = []
const unknown = []
for (const ws of wb.worksheets) {
  const ym = sheetMonth(ws.name)
  if (!ym) continue
  const flags = []
  const add = (cat, amount) => amount > 0 && out.push({ month: ym, cat, amount: Math.round(amount) })

  // постоянные: заголовки L..Q строки 24, значения строки 25
  const fixed = {}
  const skippedCogs = 0
  for (const col of ['L', 'M', 'N', 'O', 'P', 'Q']) {
    const h = txt(cell(ws, `${col}24`)), v = num(cell(ws, `${col}25`))
    if (!h) continue
    const cat = catOf(h)
    if (!cat) { unknown.push(`${ws.name}!${col}24 «${h}» = ${v}`); continue }
    if (v) fixed[cat] = (fixed[cat] ?? 0) + v
  }
  for (const [cat, v] of Object.entries(fixed)) add(cat, v)

  // ежедневные: суммы по строкам 32..59, сверка с итогом строки 61
  const daily = { PITANIYA: 'M', LABO: 'N', 'KOCHA KIRA': 'O', 'KUT-HARAJAT': 'P' }
  let income = 0
  for (const [cat, col] of Object.entries(daily)) {
    let s = 0
    for (let r = 32; r <= 59; r++) s += num(cell(ws, `${col}${r}`)) ?? 0
    const sheetTotal = num(cell(ws, `${col}61`))
    if (sheetTotal !== null && Math.abs(sheetTotal - s) > 1) flags.push(`${cat}: строки ${s} ≠ итог таблицы ${sheetTotal}`)
    add(cat, s)
  }
  for (let r = 32; r <= 59; r++) income += num(cell(ws, `L${r}`)) ?? 0

  // зарплаты: «JAMI OLDI» (R) по строкам 4..23; если там формула без значения — сумма этапов N..Q
  let salary = 0
  for (let r = 4; r <= 23; r++) {
    const rr = num(cell(ws, `R${r}`))
    salary += rr ?? ['N', 'O', 'P', 'Q'].reduce((a, c) => a + (num(cell(ws, `${c}${r}`)) ?? 0), 0)
  }
  const sheetSalary = num(cell(ws, 'R25'))
  if (sheetSalary !== null && Math.abs(sheetSalary - salary) > 1) flags.push(`ish haqi: строки ${salary} ≠ «JAMI OYLIK» ${sheetSalary}`)
  add('ISH HAQI (tarix)', salary)

  const hizmat = num(cell(ws, 'M65'))
  if (ym < firstOrderMonth) {
    // до первого заказа в базе (REGISTRATSIYA начинается позже): расходы без выручки показали бы выдуманный убыток
    for (let i = out.length - 1; i >= 0; i--) if (out[i].month === ym) out.splice(i, 1)
    report.push({ ym, sheet: ws.name, skipped: true, flags: [`в базе нет заказов за этот месяц (первый — ${firstOrderMonth}) — пропущен`] })
    continue
  }
  if (hizmat === null) {
    // месяц не подведён в таблице (нет итога HIZMAT) — не импортируем, чтобы не занизить расходы
    for (let i = out.length - 1; i >= 0; i--) if (out[i].month === ym) out.splice(i, 1)
    report.push({ ym, sheet: ws.name, skipped: true, flags: ['таблица за этот месяц ещё не подведена (нет итога HIZMAT) — пропущен'] })
    continue
  }
  report.push({ ym, sheet: ws.name, fixed, salary, income, skippedCogs, hizmat, sheetExpenses: num(cell(ws, 'N65')), sheetProfit: num(cell(ws, 'O65')), flags })
}

// ---- сверка с таблицей: маржа заказов (база) ↔ HIZMAT; расходы (наши) ↔ FAQAT-RASXOD; прибыль (наша) ↔ SOF-FOYDA ----
const dbMargin = Object.fromEntries((await sql(`select to_char(created_at at time zone 'Asia/Tashkent', 'YYYY-MM') m, sum(contract_price - calc_cost) s from orders where status <> 'cancelled' group by 1`)).map((x) => [x.m, Number(x.s)]))
const fmt = (n) => (n == null ? '—' : Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' '))
const spend = (ym) => out.filter((o) => o.month === ym).reduce((s, o) => s + o.amount, 0)

console.log('месяц   | зарплата    | расходы к импорту | FAQAT-RASXOD (таблица) Δ | маржа в базе ↔ HIZMAT Δ | наша прибыль ↔ SOF-FOYDA таблицы Δ | флаги')
for (const r of report) {
  if (r.skipped) { console.log(`${r.ym} | ПРОПУЩЕН: ${r.flags[0]}`); continue }
  const ours = spend(r.ym), margin = dbMargin[r.ym]
  const dExp = r.sheetExpenses != null ? ours - r.sheetExpenses : null
  const dMar = margin != null ? margin - r.hizmat : null
  const profit = margin != null ? margin - ours : null
  const dProfit = profit != null && r.sheetProfit != null ? profit - r.sheetProfit : null
  console.log(`${r.ym} | ${fmt(r.salary).padStart(11)} | ${fmt(ours).padStart(17)} | ${fmt(r.sheetExpenses).padStart(14)} Δ${fmt(dExp).padStart(11)} | ${fmt(margin).padStart(12)} ↔ ${fmt(r.hizmat).padStart(12)} Δ${fmt(dMar).padStart(11)} | ${fmt(profit).padStart(12)} ↔ ${fmt(r.sheetProfit).padStart(12)} Δ${fmt(dProfit).padStart(11)} | ${r.flags.join('; ')}`)
}
if (unknown.length) console.log('\nНЕ ОПОЗНАНЫ заголовки (пропущены):\n  ' + unknown.join('\n  '))
const total = out.reduce((s, o) => s + o.amount, 0)
console.log(`\nК импорту: ${out.length} записей на ${fmt(total)} сум за ${report.filter((r) => !r.skipped).length} месяцев.`)

if (!APPLY) { console.log('\nПроверка без записи. Для записи добавьте --apply'); process.exit(0) }

// ---- запись ----
for (const [name, note] of Object.entries(NEW_CATEGORIES)) await sql(`insert into expense_categories(name, note) values ('${name}', '${note.replace(/'/g, "''")}') on conflict (name) do nothing`)
const cats = Object.fromEntries((await sql(`select id, name from expense_categories`)).map((c) => [c.name, c.id]))
const have = new Set((await sql(`select note from expenses where source = 'import' and note like 'SAVDO %'`)).map((x) => x.note))
// одним запросом (Management API ограничивает частоту): всё или ничего
const fresh = out.filter((o) => !have.has(`SAVDO ${o.month} · ${o.cat}`))
for (const o of fresh) if (!cats[o.cat]) throw new Error('нет категории ' + o.cat)
const n = fresh.length
if (n) {
  const values = fresh.map((o) => `(${cats[o.cat]}, ${o.amount}, '${lastDay(o.month)}', 'SAVDO ${o.month} · ${o.cat.replace(/'/g, "''")}', 'import', true)`).join(',\n')
  await sql(`insert into expenses(category_id, amount, spent_at, note, source, confirmed) values\n${values}`)
}
console.log(`\nЗаписано: ${n} (пропущено уже существующих: ${out.length - n})`)
