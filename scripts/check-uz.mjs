import { runSql } from './run-sql.mjs'
const cols = await runSql("select table_name t, column_name c from information_schema.columns where table_schema='public' and data_type in ('text','jsonb','character varying') and table_name in (select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE') order by 1,2")
const skip = new Set(['audit_log', 'notifications', 'bot_pending'])
let found = 0
for (const x of cols) {
  if (skip.has(x.t)) continue
  try {
    const r = await runSql(`select count(*)::int n, min(${x.c}::text) s from public.${x.t} where ${x.c}::text ~ '[А-Яа-яЁё]'`)
    if (r[0].n > 0) { found++; console.log(`${x.t}.${x.c}: ${r[0].n} | ${String(r[0].s).slice(0, 80)}`) }
  } catch (e) {}
}
console.log('колонок с кириллицей:', found)
