// Выполнить SQL через Management API. Запуск: node scripts/run-sql.mjs supabase/migrations/034_my_cabinet.sql
import { readFileSync } from 'node:fs'
import { env } from './env.mjs'

export async function runSql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${env('SUPABASE_PROJECT_REF')}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('SUPABASE_ACCESS_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`SQL → ${r.status} ${t}`)
  return JSON.parse(t)
}

if (process.argv[2]) {
  console.log(JSON.stringify(await runSql(readFileSync(process.argv[2], 'utf8')), null, 2))
}
