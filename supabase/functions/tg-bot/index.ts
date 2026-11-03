// Бот @ecorombot: (1) вебхук Telegram — /start и кнопка «открыть систему»;
// (2) внутренний вызов из базы — отправить уведомление из таблицы notifications.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const BOT = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const SECRET = Deno.env.get('TG_WEBHOOK_SECRET')!
const APP_URL = 'https://eyuldashev3333-prog.github.io/EcoRom/'

const tg = (method: string, payload: unknown) =>
  fetch(`https://api.telegram.org/bot${BOT}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((r) => r.json())

const openButton = { inline_keyboard: [[{ text: 'ECOROM tizimini ochish', web_app: { url: APP_URL } }]] }

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  // --- уведомление из базы ---
  if (req.headers.get('X-Ecorom-Secret')) {
    if (req.headers.get('X-Ecorom-Secret') !== SECRET) return new Response('forbidden', { status: 403 })
    const { notification_id } = await req.json()
    const { data: n } = await admin.from('notifications').select('*').eq('id', notification_id).maybeSingle()
    if (!n) return new Response('not found', { status: 404 })
    let q = admin.from('employees').select('telegram_id').eq('is_active', true).not('telegram_id', 'is', null)
    q = n.employee_id ? q.eq('id', n.employee_id) : q.eq('role', n.target_role)
    const { data: people } = await q
    const errors: string[] = []
    for (const p of people ?? []) {
      const r = await tg('sendMessage', { chat_id: p.telegram_id, text: n.text, reply_markup: openButton })
      if (!r.ok) errors.push(`${p.telegram_id}: ${r.description}`)
    }
    await admin
      .from('notifications')
      .update({ sent_at: new Date().toISOString(), error: errors.length ? errors.join('; ') : (people?.length ? null : 'qabul qiluvchi yo‘q') })
      .eq('id', notification_id)
    return new Response('ok')
  }

  // --- вебхук Telegram ---
  if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== SECRET) return new Response('forbidden', { status: 403 })
  const update = await req.json().catch(() => ({}))
  const msg = update.message
  if (msg?.text?.startsWith('/start')) {
    const { data: emp } = await admin.from('employees').select('full_name, is_active').eq('telegram_id', msg.chat.id).maybeSingle()
    const text = emp?.is_active
      ? `Assalomu alaykum, ${emp.full_name}! Tizimni ochish uchun pastdagi tugmani bosing.`
      : "Assalomu alaykum! ECOROM tizimi. Tugmani bosing va rahbar bergan login-parol bilan bir marta kiring — keyin Telegram orqali avtomatik kirasiz."
    await tg('sendMessage', { chat_id: msg.chat.id, text, reply_markup: openButton })
  }
  return new Response('ok')
})
