// Живая проверка привязки Telegram по ссылке с главной (на тестовом t_rah, потом он снова выключается).
// Запуск из корня: node scripts/e2e/tg_link_test.mjs
import { ensureUser, sql, URL_, ANON, PW } from './h.mjs'
import { env } from 'file:///D:/Eco Rom/scripts/env.mjs'

const FAKE = 9100777 // выдуманный chat id (бот ответить не сможет — это нормально)
const BOT_URL = `${URL_}/functions/v1/tg-bot`
let fails = 0
const check = (name, ok, info = '') => { console.log(ok ? 'OK  ' : 'FAIL', name, info); if (!ok) fails++ }

const hook = (text, chat = FAKE) =>
  fetch(BOT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': env('TG_WEBHOOK_SECRET') },
    body: JSON.stringify({ update_id: 1, message: { message_id: 1, date: 0, text, chat: { id: chat, type: 'private' }, from: { id: chat, is_bot: false, first_name: 'Test' } } }),
  }).then((r) => r.status)

try {
  await ensureUser('t_rah', 'TEST Rahbar', 'rahbar')
  await sql(`update employees set telegram_id = null where login = 't_rah'`)
  const tok = (await (await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 't_rah@ecorom.app', password: PW }) })).json()).access_token
  const rpc = async (fn, body = {}, key = tok) => (await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()

  const s0 = await rpc('tg_link_status')
  check('статус до привязки: логин, имя, роль, не привязан', s0.login === 't_rah' && s0.full_name === 'TEST Rahbar' && s0.role === 'rahbar' && s0.linked === false, JSON.stringify(s0))
  const anonCode = await rpc('tg_link_code', {}, ANON)
  check('без входа код не выдаётся', typeof anonCode !== 'string', JSON.stringify(anonCode).slice(0, 100))
  const claimByUser = await rpc('tg_link_claim', { p_code: 'x', p_tg: 1 })
  check('пользователь сам не может вызвать tg_link_claim', claimByUser?.code !== undefined || claimByUser?.message, JSON.stringify(claimByUser).slice(0, 100))

  const code = await rpc('tg_link_code')
  check('код выдан', typeof code === 'string' && code.length >= 20, code)
  check('вебхук /start link_… принят', (await hook(`/start link_${code}`)) === 200)
  const tg = (await sql(`select telegram_id from employees where login = 't_rah'`))[0].telegram_id
  check('telegram_id привязан к t_rah', Number(tg) === FAKE, String(tg))
  const s1 = await rpc('tg_link_status')
  check('статус после: привязан', s1.linked === true)

  // повтор того же кода другим Telegram — не должен перепривязать
  await hook(`/start link_${code}`, FAKE + 1)
  const tg2 = (await sql(`select telegram_id from employees where login = 't_rah'`))[0].telegram_id
  check('повтор использованного кода отклонён', Number(tg2) === FAKE, String(tg2))
  // просроченный код
  const c2 = await rpc('tg_link_code')
  await sql(`update tg_link_codes set expires_at = now() - interval '1 minute' where code = '${c2}'`)
  await hook(`/start link_${c2}`, FAKE + 2)
  const tg3 = (await sql(`select telegram_id from employees where login = 't_rah'`))[0].telegram_id
  check('просроченный код отклонён', Number(tg3) === FAKE, String(tg3))
  check('обычный /start и текст отвечают 200', (await hook('/start')) === 200 && (await hook('salom')) === 200)
  const w = await (await fetch(`https://api.telegram.org/bot${env('TELEGRAM_BOT_TOKEN')}/getWebhookInfo`)).json()
  check('вебхук Telegram без ошибок', !w.result.last_error_message || w.result.last_error_date * 1000 < Date.now() - 600_000, w.result.last_error_message ?? '')
} finally {
  await sql(`update employees set telegram_id = null, is_active = false where login = 't_rah'`)
  await sql(`delete from tg_link_codes where employee_id = (select id from employees where login = 't_rah')`)
  console.log('уборка: t_rah выключен, telegram_id снят, коды удалены')
}
console.log(fails ? `ОШИБОК: ${fails}` : 'ВСЁ OK')
process.exit(fails ? 1 : 0)
