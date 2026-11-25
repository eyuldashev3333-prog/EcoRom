// Нагрузочный тест: node scripts/scale/run.mjs [N заказов]   (по умолчанию 5000)
// Создаёт в ОДНОЙ транзакции N заказов с позициями, платежами, расходами, закупками, отметками цеха и уведомлениями, замеряет главные экраны/отчёты
// и откатывает всё — боевая база не меняется (транзакция заканчивается исключением).
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runSql } from '../run-sql.mjs'

const n = Number(process.argv[2] || 5000)
const dir = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(join(dir, 'scale.sql'), 'utf8').replace(/__N__/g, String(n))
try {
  await runSql(`begin;\n${sql}`)
} catch (e) {
  let msg = String(e.message)
  try {
    msg = JSON.parse(msg.slice(msg.indexOf('{'))).message
  } catch {
    /* как есть */
  }
  const m = msg.match(/RESULT: (\[[\s\S]*\])\s*(\nCONTEXT|$)/)
  if (!m) {
    console.error(msg.slice(0, 1500))
    process.exit(1)
  }
  const rows = JSON.parse(m[1])
  console.log(`N = ${n} заказов`)
  for (const r of rows) console.log(`${String(r.ms).padStart(10)} ms   ${r.name}`)
}
