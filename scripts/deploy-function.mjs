// Деплой Edge Function через Management API (CLI Supabase не нужен).
// Запуск: node scripts/deploy-function.mjs admin-users
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/%20/g, ' ')
const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env.local'), 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const slug = process.argv[2]
if (!slug) throw new Error('укажите имя функции')
const verifyJwt = process.argv[3] !== '--no-verify-jwt'

// index.ts + соседние .ts-файлы функции (например, parse-expense.ts)
const dir = join(ROOT, 'supabase', 'functions', slug)
const form = new FormData()
form.append('metadata', JSON.stringify({ entrypoint_path: 'index.ts', name: slug, verify_jwt: verifyJwt }))
for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
  form.append('file', new Blob([readFileSync(join(dir, f))], { type: 'application/typescript' }), f)
}

const r = await fetch(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/functions/deploy?slug=${slug}`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` },
  body: form,
})
const t = await r.text()
if (!r.ok) throw new Error(`deploy ${slug} → ${r.status} ${t}`)
const j = JSON.parse(t)
console.log(`OK ${slug} v${j.version} status=${j.status} verify_jwt=${j.verify_jwt}`)
