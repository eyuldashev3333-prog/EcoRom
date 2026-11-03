// Бот @ecorombot: (1) вебхук Telegram — /start, кнопка «открыть систему», ответы цеха «Yetadi/Yetmaydi/Brak» и причина;
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
const ANSWERS: Record<string, string> = { enough: '✅ Yetadi', not_enough: '❌ Yetmaydi', defect: '⚠️ Brak' }
const ANSWER_MARK = '\n\nSizning javobingiz:'

// кнопки под уведомлением: цеху — ответы о материале; Rahbar — сразу открыть заказ
function keyboard(role: string | null, payload: Record<string, string>) {
  if (payload.kind === 'material_check' && payload.order_id)
    return {
      inline_keyboard: [
        Object.entries(ANSWERS).map(([k, text]) => ({ text, callback_data: `mc:${k}:${payload.order_id}` })),
        openButton.inline_keyboard[0],
      ],
    }
  if (payload.service_id && role === 'montajchi')
    return { inline_keyboard: [[{ text: 'Zayavkani ochish', web_app: { url: `${APP_URL}#/servis/${payload.service_id}` } }]] }
  if (payload.service_id && role === 'rahbar') return { inline_keyboard: [[{ text: 'Servis zayavkalari', web_app: { url: `${APP_URL}#/service` } }]] }
  if (role === 'rahbar' && payload.order_id)
    return { inline_keyboard: [[{ text: 'Buyurtmani ochish', web_app: { url: `${APP_URL}#/orders/${payload.order_id}` } }]] }
  if (role === 'montajchi' && payload.order_id)
    return { inline_keyboard: [[{ text: 'Montajni ochish', web_app: { url: `${APP_URL}#/install/${payload.order_id}` } }]] }
  return openButton
}

const tashkentTime = () => new Date().toLocaleTimeString('ru-RU', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit' })

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  // --- уведомление из базы ---
  if (req.headers.get('X-Ecorom-Secret')) {
    if (req.headers.get('X-Ecorom-Secret') !== SECRET) return new Response('forbidden', { status: 403 })
    const { notification_id } = await req.json()
    const { data: n } = await admin.from('notifications').select('*').eq('id', notification_id).maybeSingle()
    if (!n) return new Response('not found', { status: 404 })
    let q = admin.from('employees').select('telegram_id, role').eq('is_active', true).not('telegram_id', 'is', null)
    q = n.employee_id ? q.eq('id', n.employee_id) : q.eq('role', n.target_role)
    const { data: people } = await q
    const errors: string[] = []
    for (const p of people ?? []) {
      const r = await tg('sendMessage', { chat_id: p.telegram_id, text: n.text, reply_markup: keyboard(p.role, n.payload ?? {}) })
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

  // нажали «Yetadi / Yetmaydi / Brak»
  const cq = update.callback_query
  if (cq?.data?.startsWith('mc:')) {
    const [, result, orderId] = cq.data.split(':')
    const { data: r, error } = await admin.rpc('shop_answer', { p_tg: cq.from.id, p_order: orderId, p_result: result })
    if (error || !r?.ok) {
      await tg('answerCallbackQuery', { callback_query_id: cq.id, text: r?.error ?? 'Xatolik, qayta urinib ko‘ring', show_alert: true })
      return new Response('ok')
    }
    await tg('answerCallbackQuery', { callback_query_id: cq.id, text: r.need_reason ? 'Sababini yozing' : 'Rahmat! Javob yozildi' })
    // в самом сообщении показать свой ответ (кнопки остаются — можно передумать)
    if (cq.message?.text) {
      const base = cq.message.text.split(ANSWER_MARK)[0]
      await tg('editMessageText', {
        chat_id: cq.message.chat.id,
        message_id: cq.message.message_id,
        text: `${base}${ANSWER_MARK} ${ANSWERS[result]} · ${tashkentTime()}`,
        reply_markup: cq.message.reply_markup,
      })
    }
    if (r.need_reason)
      await tg('sendMessage', {
        chat_id: cq.from.id,
        text: `№${r.order_no}: ${result === 'defect' ? 'qanday brak?' : 'nima yetmaydi?'} Bir qatorda yozing (masalan: oq profil 2 xlist).`,
        reply_markup: { force_reply: true, input_field_placeholder: 'Sabab…' },
      })
    return new Response('ok')
  }

  const msg = update.message
  if (msg?.text?.startsWith('/start')) {
    const { data: emp } = await admin.from('employees').select('full_name, is_active').eq('telegram_id', msg.chat.id).maybeSingle()
    const text = emp?.is_active
      ? `Assalomu alaykum, ${emp.full_name}! Tizimni ochish uchun pastdagi tugmani bosing.`
      : "Assalomu alaykum! ECOROM tizimi. Tugmani bosing va rahbar bergan login-parol bilan bir marta kiring — keyin Telegram orqali avtomatik kirasiz."
    await tg('sendMessage', { chat_id: msg.chat.id, text, reply_markup: openButton })
  } else if (msg?.text && msg.from) {
    // причина после «Yetmaydi/Brak» (если бот её ждёт)
    const { data: r } = await admin.rpc('shop_reason', { p_tg: msg.from.id, p_text: msg.text })
    if (r?.ok) await tg('sendMessage', { chat_id: msg.chat.id, text: `Rahmat! №${r.order_no} bo‘yicha rahbarga yuborildi.` })
  }
  return new Response('ok')
})
