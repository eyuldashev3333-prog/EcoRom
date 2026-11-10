import { runSql } from 'file:///D:/Eco Rom/scripts/run-sql.mjs'
import { env } from 'file:///D:/Eco Rom/scripts/env.mjs'
export { runSql as sql }
export const URL_ = env('SUPABASE_URL'), ANON = env('SUPABASE_ANON_KEY'), SVC = env('SUPABASE_SERVICE_ROLE_KEY')
import { createHash } from 'node:crypto'
// пароль тестовых пользователей — производный от секретного ключа (в репозитории пароля нет)
export const PW = process.env.E2E_PW || 'Aa1-' + createHash('sha256').update(SVC).digest('hex').slice(0, 12)
const AH = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' }
export async function ensureUser(login, name, role, tg) {
  const ex = await runSql(`select id, auth_user_id from employees where login='${login}'`)
  let auth
  if (ex[0]) {
    auth = ex[0].auth_user_id
    if (auth) await fetch(`${URL_}/auth/v1/admin/users/${auth}`, { method: 'PUT', headers: AH, body: JSON.stringify({ password: PW }) })
  }
  if (!auth) {
    const r = await fetch(`${URL_}/auth/v1/admin/users`, { method: 'POST', headers: AH, body: JSON.stringify({ email: `${login}@ecorom.app`, password: PW, email_confirm: true }) })
    const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j)); auth = j.id
  }
  if (!ex[0]) await runSql(`insert into employees(full_name, role, login, auth_user_id, hired_at) values ('${name}','${role}','${login}','${auth}', current_date-60)`)
  else await runSql(`update employees set auth_user_id='${auth}', is_active=true where login='${login}'`)
  if (tg !== undefined) await runSql(`update employees set telegram_id=${tg} where login='${login}'`)
}
const tokens = {}
export async function login(l) {
  if (tokens[l]) return tokens[l]
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${l}@ecorom.app`, password: PW }) })
  const j = await r.json(); if (!r.ok) throw new Error('login ' + l + ' ' + JSON.stringify(j)); return (tokens[l] = j.access_token)
}
export async function rpc(who, name, args = {}) {
  const tok = who === 'svc' ? SVC : await login(who)
  const r = await fetch(`${URL_}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: who === 'svc' ? SVC : ANON, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) })
  const t = await r.text(); let j; try { j = JSON.parse(t) } catch { j = t }
  return { ok: r.ok, status: r.status, data: j, err: r.ok ? null : (j?.message || t) }
}
export async function get(who, path) {
  const tok = who === 'svc' ? SVC : await login(who)
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: who === 'svc' ? SVC : ANON, Authorization: `Bearer ${tok}` } })
  const t = await r.text(); let j; try { j = JSON.parse(t) } catch { j = t }
  return { ok: r.ok, status: r.status, data: j }
}
export async function write(who, method, path, body) {
  const tok = who === 'svc' ? SVC : await login(who)
  const r = await fetch(`${URL_}/rest/v1/${path}`, { method, headers: { apikey: who === 'svc' ? SVC : ANON, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text(); let j; try { j = JSON.parse(t) } catch { j = t }
  return { ok: r.ok, status: r.status, data: j }
}
export const results = []
export function check(id, title, cond, detail = '') { results.push({ id, title, cond, detail }); console.log((cond ? 'PASS ' : 'FAIL ') + id + ' ' + title + (detail ? ' — ' + detail : '')) }
export function info(id, title, detail = '') { results.push({ id, title, cond: null, detail }); console.log('INFO ' + id + ' ' + title + (detail ? ' — ' + detail : '')) }
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
