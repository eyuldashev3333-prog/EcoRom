// Восстановление из ecorom-backup-*.json.gz в пустую базу (или в тестовую схему).
// Запуск: node restore.mjs <файл.json.gz> [--schema public]
// Триггеры (журналы/аудит/внешние ключи) на время вставки отключаются, затем сдвигаются счётчики номеров.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { TABLES, env } from './env.mjs'

const file = process.argv[2]
if (!file) throw new Error('укажите файл бэкапа')
const si = process.argv.indexOf('--schema')
const schema = si > 0 ? process.argv[si + 1] : 'public'
const dump = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'))

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${env('SUPABASE_PROJECT_REF')}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('SUPABASE_ACCESS_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(t)
  return JSON.parse(t)
}

const tag = (s) => `$ecorom_${Math.random().toString(36).slice(2, 8)}$`
for (const t of TABLES) {
  const rows = dump.tables[t] ?? []
  if (rows.length === 0) continue
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = JSON.stringify(rows.slice(i, i + 500))
    const q = tag()
    await sql(
      `set session_replication_role = replica;
       insert into ${schema}.${t} select * from json_populate_recordset(null::${schema}.${t}, ${q}${chunk}${q}) on conflict do nothing;
       set session_replication_role = origin;`,
    )
  }
  console.log(`${t}: ${rows.length}`)
}
if (schema === 'public') {
  await sql(`select setval('public.order_no_seq', greatest((select coalesce(max(order_no), 2499) from public.orders), 2499) + 1, false);
             select setval(pg_get_serial_sequence('public.stages','id'), greatest((select coalesce(max(id),0) from public.stages),1));
             select setval(pg_get_serial_sequence('public.expense_categories','id'), greatest((select coalesce(max(id),0) from public.expense_categories),1));
             select setval(pg_get_serial_sequence('public.audit_log','id'), greatest((select coalesce(max(id),0) from public.audit_log),1));`)
}
console.log(`restore done from ${dump.created_at} into schema ${schema}`)
