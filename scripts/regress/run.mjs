// Регрессионные тесты базы: node scripts/regress/run.mjs [часть-имени-файла]
// Каждый файл scripts/regress/sql/*.sql выполняется в ОДНОЙ транзакции вместе с _lib.sql и завершается исключением RESULT: [...] — откат всегда,
// данные боевой базы не меняются. Код выхода 1, если хоть одна проверка не прошла.
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runSql } from '../run-sql.mjs'

const dir = dirname(fileURLToPath(import.meta.url))
const lib = readFileSync(join(dir, '_lib.sql'), 'utf8')
const filter = process.argv[2] || ''
const files = readdirSync(join(dir, 'sql')).filter((f) => f.endsWith('.sql') && f.includes(filter)).sort()

let failed = 0
let total = 0
for (const f of files) {
  const body = readFileSync(join(dir, 'sql', f), 'utf8').replace(/^﻿/, '')
  let res
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await runSql(`begin;\n${lib}\n${body}\nselect pg_temp.finish();`)
      res = { error: 'тест не вернул RESULT' }
    } catch (e) {
      let msg = String(e.message)
      try {
        msg = JSON.parse(msg.slice(msg.indexOf('{'))).message // тело ответа API: {"message": "...ERROR: P0001: RESULT: [...]\nCONTEXT: ..."}
      } catch {
        /* оставляем как есть */
      }
      const m = msg.match(/RESULT: (\[[\s\S]*\])\s*(\nCONTEXT|$)/)
      if (m) {
        res = { rows: JSON.parse(m[1]) }
      } else if (/502|503|504|429|fetch failed|timeout/i.test(String(e.message))) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
        continue
      } else res = { error: String(e.message).slice(0, 600) }
    }
    break
  }
  if (!res || res.error) {
    failed++
    console.log(`✗ ${f}: ${res?.error ?? 'нет ответа'}`)
    continue
  }
  const bad = res.rows.filter((r) => !r.ok)
  total += res.rows.length
  failed += bad.length
  console.log(`${bad.length ? '✗' : '✓'} ${f}: ${res.rows.length - bad.length}/${res.rows.length}`)
  for (const b of bad) console.log(`    FAIL ${b.name} — ${b.detail}`)
}
console.log(`\nИтого проверок: ${total}, не прошло: ${failed}`)
process.exit(failed ? 1 : 0)
