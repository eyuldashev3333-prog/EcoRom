// Ежедневный отчёт руководителям в 23:00 (Ташкент) — решение Asad 26.11.2026: только ключевое
// (продажи за день и их оплата, выручка с 1-го числа, расходы за день и с 1-го числа) + запуск бэкапа.
// Вызывается из базы (pg_cron → daily_report_send) с X-Ecorom-Secret. Тело (только с секретом):
//   {}                       — обычный запуск: отчёт всем руководителям + бэкап
//   { dry: true }            — только вернуть текст (ничего не отправлять)
//   { to: [chatId], backup } — пробная отправка только в эти чаты (бэкап — только если backup: true)
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const BOT = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const INTERNAL = Deno.env.get('ECOROM_INTERNAL_SECRET') ?? ''
const GH_TOKEN = Deno.env.get('GITHUB_TOKEN') ?? ''
const GH_REPO = Deno.env.get('GITHUB_REPO') ?? ''

const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr']
const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(Number(n))).replace(/\s/g, ' ')
const sum = (n: number) => `${fmt(n)} so‘m`

interface Report {
  day: string
  month_start: string
  today: { orders: number; sum: number; paid: number }
  month: { orders: number; sum: number }
  other_in?: { today: number; month: number } // Moliya → Kirim: продажа со склада и свободный приход (в кассу, не в прибыль)
  expenses_today: { expenses: number; purchases: number; total: number }
  expenses_month: { expenses: number; purchases: number; total: number }
}

export function reportText(r: Report, backup: 'ok' | 'fail' | 'none') {
  const [y, mo, d] = r.day.split('-').map(Number)
  const period = `${MONTHS[mo - 1]} 1–${d}`
  const t = r.today
  const pct = Number(t.sum) > 0 ? Math.round((Number(t.paid) / Number(t.sum)) * 100) : 0
  const lines = [
    `📊 <b>ECOROM · ${String(d).padStart(2, '0')}.${String(mo).padStart(2, '0')}.${y} hisoboti</b>`,
    '',
    Number(t.orders) > 0
      ? `🛒 <b>Bugun: ${t.orders} ta buyurtma · ${sum(t.sum)}</b>\n      To‘langan: ${sum(t.paid)} (${pct}%)`
      : '🛒 <b>Bugun buyurtma yo‘q</b>',
    `📈 <b>${period}: ${r.month.orders} ta buyurtma · ${sum(r.month.sum)}</b>`,
    ...(Number(r.other_in?.today ?? 0) !== 0 || Number(r.other_in?.month ?? 0) !== 0
      ? [`💵 <b>Boshqa kirim: bugun ${sum(r.other_in?.today ?? 0)}</b> · ${period}: ${sum(r.other_in?.month ?? 0)}`]
      : []),
    '',
    `💸 <b>Bugungi xarajat: ${sum(r.expenses_today.total)}</b>\n      xarajatlar ${fmt(r.expenses_today.expenses)} · xomashyo xaridi ${fmt(r.expenses_today.purchases)}`,
    `💸 <b>${period}: ${sum(r.expenses_month.total)}</b>\n      xarajatlar ${fmt(r.expenses_month.expenses)} · xomashyo xaridi ${fmt(r.expenses_month.purchases)}`,
    '',
    'ℹ️ <i>Ish haqi xarajatga kirmaydi — bu majburiyat.</i>',
  ]
  if (backup === 'ok') lines.push('💾 Bekap — keyingi xabarda.')
  if (backup === 'fail') lines.push('⚠️ Bekap ishga tushmadi — dasturchiga xabar bering.')
  return lines.join('\n')
}

Deno.serve(async (req) => {
  if (!INTERNAL || req.headers.get('X-Ecorom-Secret') !== INTERNAL) return new Response('forbidden', { status: 403 })
  const body = await req.json().catch(() => ({}))
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  const { data: r, error } = await admin.rpc('daily_report_core')
  if (error || !r) return new Response(JSON.stringify({ error: error?.message ?? 'no data' }), { status: 500 })

  const test = Array.isArray(body.to) && body.to.length > 0
  if (body.dry) return new Response(JSON.stringify({ text: reportText(r, 'ok'), data: r }), { headers: { 'Content-Type': 'application/json' } })

  // бэкап: тот же проверенный scripts/backup.mjs через GitHub (запуск сразу, файлы приходят через 1–2 минуты)
  let backup: 'ok' | 'fail' | 'none' = 'none'
  if (!test || body.backup) {
    try {
      const g = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/workflows/backup.yml/dispatches`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'ecorom-daily-report', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: 'main' }),
      })
      backup = g.status === 204 ? 'ok' : 'fail'
      if (backup === 'fail') console.error('backup dispatch', g.status, await g.text())
    } catch (e) {
      console.error('backup dispatch', e)
      backup = 'fail'
    }
  }

  // получатели: активные руководители с Telegram (тестовые логины t*_… — нет); в пробном запуске — только указанные чаты
  let chats: string[]
  if (test) chats = body.to.map(String)
  else {
    const { data: bosses } = await admin.from('employees').select('login, telegram_id').eq('role', 'rahbar').eq('is_active', true).not('telegram_id', 'is', null)
    chats = [...new Set((bosses ?? []).filter((b) => !/^t[a-z0-9]*_/i.test(b.login ?? '')).map((b) => String(b.telegram_id)))]
  }
  const text = (test ? '🧪 SINOV\n' : '') + reportText(r, backup)
  const sent: string[] = []
  const failed: string[] = []
  for (const chat of chats) {
    const t = await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML' }),
    }).then((x) => x.json())
    if (t.ok) sent.push(chat)
    else failed.push(`${chat}: ${t.description}`)
  }
  return new Response(JSON.stringify({ sent: sent.length, failed, backup }), { headers: { 'Content-Type': 'application/json' } })
})
