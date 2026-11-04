// Итоги месяцев из SAVDO BOLIMI.xlsx → таблица legacy_savdo (для сверки в ERP). Повтор безопасен (upsert).
// Запуск: node scripts/import-savdo-totals.mjs "D:\Eco Rom\eco-rom\SAVDO BOLIMI.xlsx" [--apply]
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ExcelJS from 'exceljs'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/%20/g, ' ')
const env = Object.fromEntries(readFileSync(join(ROOT, '.env.local'), 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const file = process.argv[2]
const APPLY = process.argv.includes('--apply')
if (!file) throw new Error('укажите xlsx')
const sql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })
  const t = await r.text()
  if (!r.ok) throw new Error(t)
  return JSON.parse(t)
}
const MONTHS = { YANVAR: 1, FEVRAL: 2, FEBRAL: 2, MART: 3, APREL: 4, MAY: 5, IYUN: 6, IYUL: 7, AVGUST: 8, SENTABR: 9, OKTABR: 10, NOYABR: 11, DEKABR: 12 }
const sheetMonth = (name) => {
  const m = name.toUpperCase().replace(/\s/g, '').match(/^([A-Z]+)-?(\d{4})?$/)
  return m && MONTHS[m[1]] ? `${m[2] ?? '2024'}-${String(MONTHS[m[1]]).padStart(2, '0')}` : null
}
const raw = (c) => { const v = c.value; if (v == null) return null; if (typeof v === 'object') return 'result' in v ? v.result : null; return v }
const num = (ws, a) => { const v = raw(ws.getCell(a)); return typeof v === 'number' && Number.isFinite(v) ? v : null }

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(file)
const rows = []
for (const ws of wb.worksheets) {
  const ym = sheetMonth(ws.name)
  if (!ym) continue
  const hizmat = num(ws, 'M65')
  if (hizmat === null) { console.log(`${ym}: не подведён в таблице — пропуск`); continue }
  rows.push({ month: ym, hizmat, faqat: num(ws, 'N65'), sof: num(ws, 'O65'), prixod: num(ws, 'L61'), rasxod: num(ws, 'R65'), ostatka: num(ws, 'S65'), sheet: ws.name })
}
const f = (n) => (n == null ? '—' : Math.round(n).toLocaleString('ru-RU'))
for (const r of rows) console.log(`${r.month} HIZMAT ${f(r.hizmat)} · FAQAT-RASXOD ${f(r.faqat)} · SOF-FOYDA ${f(r.sof)} · PRIXOD ${f(r.prixod)}`)
if (!APPLY) { console.log(`\n${rows.length} месяцев. Проверка без записи. Для записи добавьте --apply`); process.exit(0) }
const n = (v) => (v == null ? 'null' : String(v))
const values = rows.map((r) => `('${r.month}', ${n(r.hizmat)}, ${n(r.faqat)}, ${n(r.sof)}, ${n(r.prixod)}, ${n(r.rasxod)}, ${n(r.ostatka)}, '${r.sheet.replace(/'/g, "''")}')`).join(',\n')
await sql(`insert into legacy_savdo(month, hizmat, faqat_rasxod, sof_foyda, prixod, rasxod_kassa, ostatka, sheet) values\n${values}\non conflict (month) do update set hizmat = excluded.hizmat, faqat_rasxod = excluded.faqat_rasxod, sof_foyda = excluded.sof_foyda, prixod = excluded.prixod, rasxod_kassa = excluded.rasxod_kassa, ostatka = excluded.ostatka, sheet = excluded.sheet, imported_at = now()`)
console.log(`\nЗаписано месяцев: ${rows.length}`)
