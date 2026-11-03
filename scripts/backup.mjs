// Ежедневный бэкап: все таблицы → .xlsx (для людей) + .json.gz (для точного восстановления) → Telegram.
// Запуск: node backup.mjs [--no-send]
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import ExcelJS from 'exceljs'
import { ROOT, TABLES, env } from './env.mjs'

const URL_ = env('SUPABASE_URL')
const KEY = env('SUPABASE_SERVICE_ROLE_KEY')
const BOT = env('TELEGRAM_BOT_TOKEN')
// получатели: из BACKUP_CHAT_IDS + все активные Rahbar с привязанным Telegram (добавляются сами)
const CHATS = env('BACKUP_CHAT_IDS').split(',').map((s) => s.trim()).filter(Boolean)
const send = !process.argv.includes('--no-send')

async function fetchAll(table) {
  const rows = []
  const step = 1000
  for (let from = 0; ; from += step) {
    const r = await fetch(`${URL_}/rest/v1/${table}?select=*`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from + step - 1}`, 'Range-Unit': 'items' },
    })
    if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`)
    const page = await r.json()
    rows.push(...page)
    if (page.length < step) return rows
  }
}

async function tg(method, form) {
  const r = await fetch(`https://api.telegram.org/bot${BOT}/${method}`, { method: 'POST', body: form })
  const j = await r.json()
  if (!j.ok) throw new Error(`telegram ${method}: ${j.description}`)
}

const stamp = new Date().toISOString().slice(0, 10)
const dump = { created_at: new Date().toISOString(), project: env('SUPABASE_PROJECT_REF'), tables: {} }
const book = new ExcelJS.Workbook()
const counts = []

try {
  for (const t of TABLES) {
    const rows = await fetchAll(t)
    dump.tables[t] = rows
    counts.push(`${t}: ${rows.length}`)
    const sheet = book.addWorksheet(t.slice(0, 31))
    const cols = rows.length ? Object.keys(rows[0]) : []
    sheet.addRow(cols)
    for (const row of rows) sheet.addRow(cols.map((c) => (row[c] !== null && typeof row[c] === 'object' ? JSON.stringify(row[c]) : row[c])))
  }

  for (const e of dump.tables.employees ?? []) {
    if (e.role === 'rahbar' && e.is_active && e.telegram_id && !CHATS.includes(String(e.telegram_id))) CHATS.push(String(e.telegram_id))
  }

  const outDir = join(ROOT, 'scripts', 'out')
  mkdirSync(outDir, { recursive: true })
  const xlsxPath = join(outDir, `ecorom-backup-${stamp}.xlsx`)
  const jsonPath = join(outDir, `ecorom-backup-${stamp}.json.gz`)
  await book.xlsx.writeFile(xlsxPath)
  const gz = gzipSync(Buffer.from(JSON.stringify(dump)))
  writeFileSync(jsonPath, gz)
  const total = Object.values(dump.tables).reduce((s, r) => s + r.length, 0)
  console.log(`backup ${stamp}: ${total} rows → ${xlsxPath}`)

  if (send) {
    if (!BOT || CHATS.length === 0) throw new Error('нет TELEGRAM_BOT_TOKEN или BACKUP_CHAT_IDS')
    const xlsx = await book.xlsx.writeBuffer()
    for (const chat of CHATS) {
      const f1 = new FormData()
      f1.append('chat_id', chat)
      f1.append('caption', `ECOROM bekap ${stamp}\nJami yozuvlar: ${total}`)
      f1.append('document', new Blob([xlsx]), `ecorom-backup-${stamp}.xlsx`)
      await tg('sendDocument', f1)
      const f2 = new FormData()
      f2.append('chat_id', chat)
      f2.append('caption', 'Tiklash uchun fayl (restore)')
      f2.append('document', new Blob([gz]), `ecorom-backup-${stamp}.json.gz`)
      await tg('sendDocument', f2)
    }
    console.log(`sent to ${CHATS.length} chat(s)`)
  }
} catch (e) {
  console.error(e)
  // о сбое бэкапа тоже сообщаем в Telegram
  if (send && BOT) {
    for (const chat of CHATS) {
      const f = new FormData()
      f.append('chat_id', chat)
      f.append('text', `⚠️ ECOROM bekap ${stamp} ishlamadi: ${String(e.message ?? e).slice(0, 300)}`)
      await tg('sendMessage', f).catch(() => {})
    }
  }
  process.exit(1)
}
