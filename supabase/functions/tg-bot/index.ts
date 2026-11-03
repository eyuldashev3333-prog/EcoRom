// Бот @ecorombot: (1) вебхук Telegram — /start, кнопка «открыть систему», ответы цеха «Yetadi/Yetmaydi/Brak» и причина;
// (2) внутренний вызов из базы — отправить уведомление из таблицы notifications.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import { parseExpense } from './parse-expense.ts'

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

const fmtSum = (n: number) => new Intl.NumberFormat('ru-RU').format(n).replace(/ /g, ' ')
interface Draft {
  id: string
  amount: number
  note: string | null
  category_id: number | null
  category: string | null
  employee: string | null
}
// текст и кнопки подтверждения расхода
function draftCard(d: Draft) {
  const text =
    `💸 ${fmtSum(Number(d.amount))} so‘m\n` +
    `Kategoriya: ${d.category ?? '❓ tanlanmagan'}` +
    (d.employee ? `\nXodim: ${d.employee}` : '') +
    (d.note ? `\n«${d.note}»` : '')
  const row = [] as { text: string; callback_data: string }[]
  if (d.category_id) row.push({ text: '✅ Tasdiqlash', callback_data: `ex:ok:${d.id}` })
  row.push({ text: d.category_id ? '🔁 Kategoriya' : '📂 Kategoriyani tanlang', callback_data: `ex:cat:${d.id}` })
  return { text, reply_markup: { inline_keyboard: [row, [{ text: '❌ Bekor', callback_data: `ex:no:${d.id}` }]] } }
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

  // расходы Rahbar: подтвердить / сменить категорию / отменить / отменить уже записанное
  if (cq?.data?.startsWith('ex:')) {
    const [, act, id, extra] = cq.data.split(':')
    const chat = cq.message?.chat?.id
    const mid = cq.message?.message_id
    const fail = (e: { message?: string } | null) => tg('answerCallbackQuery', { callback_query_id: cq.id, text: e?.message ?? 'Xatolik', show_alert: true })
    const edit = (text: string, reply_markup?: unknown) => tg('editMessageText', { chat_id: chat, message_id: mid, text, reply_markup: reply_markup ?? { inline_keyboard: [] } })
    if (act === 'ok') {
      const { data, error } = await admin.rpc('expense_confirm', { p_tg: cq.from.id, p_id: id })
      if (error) await fail(error)
      else {
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Yozildi' })
        await edit(`✅ Yozildi: ${fmtSum(Number(data.amount))} so‘m · ${data.category}${data.employee ? ` · ${data.employee}` : ''}${data.note ? `\n«${data.note}»` : ''}`, {
          inline_keyboard: [[{ text: '↩ Bekor qilish', callback_data: `ex:undo:${data.expense_id}` }]],
        })
      }
    } else if (act === 'cat') {
      const { data: cats } = await admin.from('expense_categories').select('id, name').eq('is_active', true).order('name')
      const rows = []
      for (let i = 0; i < (cats ?? []).length; i += 2) rows.push((cats ?? []).slice(i, i + 2).map((c: { id: number; name: string }) => ({ text: c.name, callback_data: `ex:set:${id}:${c.id}` })))
      await tg('answerCallbackQuery', { callback_query_id: cq.id })
      await tg('editMessageReplyMarkup', { chat_id: chat, message_id: mid, reply_markup: { inline_keyboard: rows } })
    } else if (act === 'set') {
      const { data, error } = await admin.rpc('expense_draft_set', { p_tg: cq.from.id, p_id: id, p_category: Number(extra) })
      if (error) await fail(error)
      else {
        const c = draftCard(data as Draft)
        await tg('answerCallbackQuery', { callback_query_id: cq.id })
        await edit(c.text, c.reply_markup)
      }
    } else if (act === 'no') {
      await admin.rpc('expense_discard', { p_tg: cq.from.id, p_id: id })
      await tg('answerCallbackQuery', { callback_query_id: cq.id })
      await edit('❌ Bekor qilindi')
    } else if (act === 'undo') {
      const { error } = await admin.rpc('expense_undo', { p_tg: cq.from.id, p_expense: id })
      if (error) await fail(error)
      else {
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Bekor qilindi' })
        await edit(`${cq.message?.text ?? ''}\n\n↩ Bekor qilindi`)
      }
    }
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
    if (r?.ok) {
      await tg('sendMessage', { chat_id: msg.chat.id, text: `Rahmat! №${r.order_no} bo‘yicha rahbarga yuborildi.` })
      return new Response('ok')
    }
    // расход от Rahbar: «obed 150000» → черновик с кнопками (запись — только после «Tasdiqlash»)
    const { data: boss } = await admin.from('employees').select('id').eq('telegram_id', msg.from.id).eq('role', 'rahbar').eq('is_active', true).maybeSingle()
    if (boss) {
      const [{ data: cats }, { data: people }] = await Promise.all([
        admin.from('expense_categories').select('id, name').eq('is_active', true),
        admin.from('employees').select('id, full_name').eq('is_active', true),
      ])
      const p = parseExpense(msg.text, cats ?? [], people ?? [])
      if (!p.amount) {
        await tg('sendMessage', { chat_id: msg.chat.id, text: 'Summani topa olmadim. Masalan: «obed 150000», «benzin 200 000», «remont 1,5 mln».' })
        return new Response('ok')
      }
      const { data: d, error } = await admin.rpc('expense_draft_create', { p_tg: msg.from.id, p_amount: p.amount, p_category: p.categoryId, p_note: p.note, p_for: p.employeeId })
      if (error) await tg('sendMessage', { chat_id: msg.chat.id, text: `Xatolik: ${error.message}` })
      else {
        const c = draftCard(d as Draft)
        await tg('sendMessage', { chat_id: msg.chat.id, text: c.text, reply_markup: c.reply_markup })
      }
    }
  }
  return new Response('ok')
})
