// Бот @ecorombot: (1) вебхук Telegram — /start, кнопка «открыть систему», ответы цеха «Qabul qildim / Material yetmaydi» и причина;
// (2) внутренний вызов из базы — отправить уведомление из таблицы notifications.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import { parseExpense } from './parse-expense.ts'
import { isPurchase, parsePurchase } from './parse-purchase.ts'
import { askAi, doneText, draftText, undoText, type AiResult, type CheckedLine, type DoneResult, type StockRow } from './ai-expense.ts'

const BOT = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const SECRET = Deno.env.get('TG_WEBHOOK_SECRET')! // вебхук Telegram (X-Telegram-Bot-Api-Secret-Token)
const INTERNAL = Deno.env.get('ECOROM_INTERNAL_SECRET') ?? '' // рассылка из базы (X-Ecorom-Secret) — отдельный секрет, не тот же, что у вебхука
const TRANSITION = false // переход завершён: рассылка из базы только по ECOROM_INTERNAL_SECRET
const APP_URL = 'https://eyuldashev3333-prog.github.io/EcoRom/'
const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY') ?? '' // ИИ-разбор расходов/закупок руководителя

const tg = (method: string, payload: unknown) =>
  fetch(`https://api.telegram.org/bot${BOT}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((r) => r.json())

const openButton = { inline_keyboard: [[{ text: 'ECOROM tizimini ochish', web_app: { url: APP_URL } }]] }
// кнопки цеха — как на карточке в системе: «Qabul qildim» / «Material yetmaydi» (+ причина)
const ANSWERS: Record<string, string> = { enough: '✅ Qabul qildim', not_enough: '❌ Material yetmaydi' }
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
  // рейс водителя: «Qabul qildim» / «Yetkazib berdim» (номер, адрес и телефон — в тексте уведомления)
  if (payload.kind === 'delivery' && payload.job_id)
    return {
      inline_keyboard: [
        [
          { text: '✅ Qabul qildim', callback_data: `dv:accept:${payload.job_id}` },
          { text: '📦 Yetkazib berdim', callback_data: `dv:delivered:${payload.job_id}` },
        ],
        openButton.inline_keyboard[0],
      ],
    }
  if (payload.leaks && role === 'rahbar') return { inline_keyboard: [[{ text: 'Teshiklar ekrani', web_app: { url: `${APP_URL}#/leaks` } }]] }
  if (payload.service_id && role === 'montajchi')
    return { inline_keyboard: [[{ text: 'Zayavkani ochish', web_app: { url: `${APP_URL}#/servis/${payload.service_id}` } }]] }
  if (payload.service_id && role === 'rahbar') return { inline_keyboard: [[{ text: 'Servis zayavkalari', web_app: { url: `${APP_URL}#/service` } }]] }
  if (role === 'rahbar' && payload.order_id)
    return { inline_keyboard: [[{ text: 'Buyurtmani ochish', web_app: { url: `${APP_URL}#/orders/${payload.order_id}` } }]] }
  if (role === 'ishlab' && payload.order_id)
    return { inline_keyboard: [[{ text: 'Buyurtmani ochish', web_app: { url: `${APP_URL}#/shop/${payload.order_id}` } }]] }
  if (role === 'montajchi' && payload.order_id)
    return { inline_keyboard: [[{ text: 'Montajni ochish', web_app: { url: `${APP_URL}#/install/${payload.order_id}` } }]] }
  return openButton
}

// роль → что бот присылает этому человеку (и чего не присылает)
const ROLE_NAMES: Record<string, string> = { rahbar: 'Rahbar', ishlab: 'Ishlab chiqarish', montajchi: "O'rnatuvchi", haydovchi: 'Haydovchi', xodim: 'Xodim' }
const NO_MONEY = 'Narxlar, kassa, savdo va xarajatlar sizga yuborilmaydi.'
function roleInfo(role: string) {
  switch (role) {
    case 'rahbar':
      return 'Sizga keladi: barcha buyurtmalar holati, zavod va montaj javoblari, servis, pul va oylik hisobotlar, har kungi bekap.\nBotga xarajat yozishingiz mumkin: «obed 150000», xarid: «xarid Otliv oq 200 30 m 600000».'
    case 'ishlab':
      return `Sizga keladi: zavodga yuborilgan yangi buyurtmalar (o'lchamlar, narxsiz), material so'rovi va o'z ish haqingiz.\n${NO_MONEY}`
    case 'montajchi':
      return `Sizga keladi: montaj va servis vazifalari (manzil, sana), ertalabki ro'yxat va o'z ish haqingiz.\n${NO_MONEY}`
    case 'haydovchi':
      return `Sizga keladi: reyslar (manzil, telefon, sana) va o'z ish haqingiz.\n${NO_MONEY}`
    default:
      return `Sizga keladi: o'z ish haqingiz haqidagi xabarlar.\n${NO_MONEY}`
  }
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

// закупка («xarid …»): карточка с материалом со склада; если материал не определился — выбор кнопками или «новый материал»
interface PurchaseDraft {
  id: string
  name: string
  qty: number
  unit: string | null
  total: number
  unit_price: number
  item: { id: string; part: string; name: string; unit: string; qty: number } | null
  candidates: { name: string; unit: string }[]
}
const normUnit = (u: string | null) => {
  const x = (u ?? '').trim().toLowerCase().replace('²', '2')
  if (['m', 'metr', 'м', 'метр', 'mp'].includes(x)) return 'm'
  if (['m2', 'kv', 'kv.m', 'м2'].includes(x)) return 'm2'
  if (['pcs', 'dona', 'ta', 'шт', 'sht'].includes(x)) return 'pcs'
  return x
}
function purchaseCard(d: PurchaseDraft) {
  const unitTxt = d.item?.unit ?? d.unit ?? ''
  let text =
    `🛒 Xarid: ${d.name}\n` +
    `Miqdor: ${d.qty}${d.unit ? ` ${d.unit}` : ''}\n` +
    `Summa: ${fmtSum(Number(d.total))} so‘m (narx: ${fmtSum(Number(d.unit_price))}${unitTxt ? ` / ${unitTxt}` : ''})\n` +
    (d.item ? `Ombor: ${d.item.name} (hozir ${d.item.qty} ${d.item.unit})` : '❓ Omborda aniq material topilmadi — tanlang')
  if (d.item && d.unit && normUnit(d.unit) !== normUnit(d.item.unit)) text += `\n⚠️ Birlik farq qiladi: xabarda «${d.unit}», omborda «${d.item.unit}»`
  const rows: { text: string; callback_data: string }[][] = []
  if (d.item) rows.push([{ text: '✅ Tasdiqlash', callback_data: `px:ok:${d.id}` }])
  else {
    d.candidates.forEach((c, i) => rows.push([{ text: `${c.name} (${c.unit})`.slice(0, 60), callback_data: `px:pick:${d.id}:${i}` }]))
    rows.push([{ text: '➕ Yangi material yaratish', callback_data: `px:new:${d.id}` }])
  }
  rows.push([{ text: '❌ Bekor', callback_data: `px:no:${d.id}` }])
  return { text, reply_markup: { inline_keyboard: rows } }
}

const tashkentTime = () => new Date().toLocaleTimeString('ru-RU', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit' })

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  // --- уведомление из базы ---
  if (req.headers.get('X-Ecorom-Secret')) {
    const got = req.headers.get('X-Ecorom-Secret')
    if (!(INTERNAL && got === INTERNAL) && !(TRANSITION && got === SECRET)) return new Response('forbidden', { status: 403 })
    const { notification_id } = await req.json()
    const { data: n } = await admin.from('notifications').select('*').eq('id', notification_id).maybeSingle()
    if (!n) return new Response('not found', { status: 404 })
    let q = admin.from('employees').select('full_name, telegram_id, role').eq('is_active', true).not('telegram_id', 'is', null)
    q = n.employee_id ? q.eq('id', n.employee_id) : q.eq('role', n.target_role)
    const { data: people } = await q
    // повторная отправка: тем, кому уже дошло, второй раз не шлём
    const done = new Set<number>((n.delivered_tg ?? []).map(Number))
    const permanent: string[] = []
    const transient: string[] = []
    const PERMANENT = /chat not found|bot was blocked|user is deactivated|chat_id is empty|PEER_ID_INVALID/i
    // фото установленных окон: временные ссылки на закрытые файлы → альбом (подпись — текст уведомления)
    const photos: string[] = Array.isArray(n.payload?.photos) ? n.payload.photos.slice(0, 10) : []
    const urls: string[] = []
    for (const path of photos) {
      const { data: s } = await admin.storage.from('install-photos').createSignedUrl(path, 600)
      if (s?.signedUrl) urls.push(s.signedUrl)
    }
    for (const p of (people ?? []).filter((x) => !done.has(Number(x.telegram_id)))) {
      let r: { ok: boolean; description?: string }
      try {
        r = urls.length
          ? await tg('sendMediaGroup', { chat_id: p.telegram_id, media: urls.map((u, i) => ({ type: 'photo', media: u, ...(i === 0 ? { caption: n.text } : {}) })) })
          : await tg('sendMessage', { chat_id: p.telegram_id, text: n.text, reply_markup: keyboard(p.role, n.payload ?? {}) })
      } catch (e) {
        r = { ok: false, description: `network: ${e instanceof Error ? e.message : e}` }
      }
      if (r.ok) done.add(Number(p.telegram_id))
      else (PERMANENT.test(r.description ?? '') ? permanent : transient).push(`${p.full_name} (${p.telegram_id}): ${r.description}`)
    }
    const attempts = (n.attempts ?? 0) + 1
    const final = transient.length === 0 || attempts >= 5 // временные ошибки повторяет база (notify_retry), до 5 попыток
    const noRecipients = !(people ?? []).length
    const failures = [...permanent, ...transient]
    await admin
      .from('notifications')
      .update({
        delivered_tg: [...done],
        attempts,
        last_attempt_at: new Date().toISOString(),
        sent_at: final ? new Date().toISOString() : null,
        error: failures.length ? failures.join('; ') : noRecipients ? 'qabul qiluvchi yo‘q' : null,
      })
      .eq('id', notification_id)
    // не дошло → Rahbar узнаёт (на сами предупреждения предупреждений не шлём)
    if (final && n.payload?.kind !== 'alert' && (failures.length || (noRecipients && (n.employee_id || n.target_role !== 'rahbar')))) {
      let who = ''
      if (noRecipients) {
        if (n.employee_id) {
          const { data: e } = await admin.from('employees').select('full_name').eq('id', n.employee_id).maybeSingle()
          who = e?.full_name ?? ''
        } else {
          const { data: es } = await admin.from('employees').select('full_name').eq('role', n.target_role).eq('is_active', true)
          who = (es ?? []).map((x) => x.full_name).join(', ')
        }
      }
      const head = String(n.text).split('\n')[0].slice(0, 80)
      const alertText = `⚠️ Xabar yetib bormadi: «${head}»\n` + (noRecipients ? `Qabul qiluvchi yo‘q — botga ulanmagan${who ? `: ${who}` : ''}.` : failures.join('\n'))
      // одинаковое предупреждение не чаще раза в 6 часов (раньше каждое сообщение при «мёртвом» чате давало ещё одно)
      const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString()
      const { data: dup } = await admin.from('notifications').select('id').eq('target_role', 'rahbar').eq('text', alertText).gte('created_at', since).limit(1)
      if (!dup?.length)
        await admin.rpc('notify', { p_role: 'rahbar', p_employee: null, p_text: alertText, p_payload: { kind: 'alert', order_id: n.payload?.order_id ?? null } })
    }
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
    // в самом сообщении показать свой ответ; ответ первого окончательный (передумать нельзя — при новом материале руководитель отправит заказ в цех заново), поэтому кнопки убираем
    if (cq.message?.text) {
      const base = cq.message.text.split(ANSWER_MARK)[0]
      await tg('editMessageText', {
        chat_id: cq.message.chat.id,
        message_id: cq.message.message_id,
        text: `${base}${ANSWER_MARK} ${ANSWERS[result] ?? '⚠️ Brak'} ·${tashkentTime()}`,
        reply_markup: openButton,
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

  // водитель: «Qabul qildim» / «Yetkazib berdim»
  if (cq?.data?.startsWith('dv:')) {
    const [, action, jobId] = cq.data.split(':')
    const { data: r, error } = await admin.rpc('driver_answer', { p_tg: cq.from.id, p_job: jobId, p_action: action === 'delivered' ? 'delivered' : 'accept' })
    if (error || !r?.ok) {
      await tg('answerCallbackQuery', { callback_query_id: cq.id, text: r?.error ?? 'Xatolik, qayta urinib ko‘ring', show_alert: true })
      return new Response('ok')
    }
    await tg('answerCallbackQuery', { callback_query_id: cq.id, text: action === 'delivered' ? 'Rahmat! Yetkazildi deb belgilandi' : 'Rahmat! Reys qabul qilindi' })
    if (cq.message?.text) {
      const base = cq.message.text.split(ANSWER_MARK)[0]
      await tg('editMessageText', { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: `${base}${ANSWER_MARK} ${action === 'delivered' ? '📦 Yetkazildi' : '✅ Qabul qilindi'} ·${tashkentTime()}`, reply_markup: cq.message.reply_markup })
    }
    return new Response('ok')
  }

  // пачка расходов/закупок от ИИ: Tasdiqlash / Bekor qilish / ↩ (отменить записанное). Текст — только из ответа базы.
  if (cq?.data?.startsWith('bb:')) {
    const [, act, id] = cq.data.split(':')
    const chat = cq.message?.chat?.id
    const mid = cq.message?.message_id
    const draft = (cq.message?.text ?? '').split('\n\n✅')[0]
    const fail = (e: { message?: string } | null) => tg('answerCallbackQuery', { callback_query_id: cq.id, text: e?.message ?? 'Xatolik', show_alert: true })
    const edit = (text: string, reply_markup?: unknown) => tg('editMessageText', { chat_id: chat, message_id: mid, text, reply_markup: reply_markup ?? { inline_keyboard: [] } })
    if (act === 'ok') {
      const { data, error } = await admin.rpc('bot_batch_confirm', { p_tg: cq.from.id, p_id: id })
      if (error) await fail(error)
      else {
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Yozildi' })
        await edit(doneText(data as DoneResult), { inline_keyboard: [[{ text: '↩ Bekor qilish', callback_data: `bb:undo:${id}` }]] })
      }
    } else if (act === 'no') {
      const { error } = await admin.rpc('bot_batch_cancel', { p_tg: cq.from.id, p_id: id })
      if (error) await fail(error)
      else {
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Bekor qilindi' })
        await edit(`${draft}\n\n❌ Bekor qilindi — hech narsa yozilmadi.`)
      }
    } else if (act === 'undo') {
      const { data, error } = await admin.rpc('bot_batch_undo', { p_tg: cq.from.id, p_id: id })
      if (error) await fail(error)
      else {
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Bekor qilindi' })
        await edit(`${cq.message?.text ?? ''}\n\n${undoText(data)}`)
      }
    }
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

  // закупки Rahbar: выбрать материал / создать новый / подтвердить / отменить / отменить уже записанное
  if (cq?.data?.startsWith('px:')) {
    const [, act, id, extra] = cq.data.split(':')
    const chat = cq.message?.chat?.id
    const mid = cq.message?.message_id
    const fail = (e: { message?: string } | null) => tg('answerCallbackQuery', { callback_query_id: cq.id, text: e?.message ?? 'Xatolik', show_alert: true })
    const edit = (text: string, reply_markup?: unknown) => tg('editMessageText', { chat_id: chat, message_id: mid, text, reply_markup: reply_markup ?? { inline_keyboard: [] } })
    if (act === 'ok') {
      const { data, error } = await admin.rpc('purchase_confirm', { p_tg: cq.from.id, p_id: id })
      if (error) await fail(error)
      else {
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Yozildi' })
        await edit(`✅ Xarid yozildi: ${data.name}\n+${data.qty} ${data.unit ?? ''} · ${fmtSum(Number(data.total))} so‘m (kassadan ayrildi, omborga qo‘shildi)`, {
          inline_keyboard: [[{ text: '↩ Bekor qilish', callback_data: `px:undo:${data.purchase_id}` }]],
        })
      }
    } else if (act === 'pick' || act === 'new') {
      const { data, error } = act === 'pick' ? await admin.rpc('purchase_draft_pick', { p_tg: cq.from.id, p_id: id, p_idx: Number(extra) }) : await admin.rpc('purchase_draft_new', { p_tg: cq.from.id, p_id: id })
      if (error) await fail(error)
      else {
        const c = purchaseCard(data as PurchaseDraft)
        await tg('answerCallbackQuery', { callback_query_id: cq.id })
        await edit(c.text, c.reply_markup)
      }
    } else if (act === 'no') {
      await admin.rpc('purchase_discard', { p_tg: cq.from.id, p_id: id })
      await tg('answerCallbackQuery', { callback_query_id: cq.id })
      await edit('❌ Bekor qilindi')
    } else if (act === 'undo') {
      const { error } = await admin.rpc('purchase_undo', { p_tg: cq.from.id, p_purchase: id })
      if (error) await fail(error)
      else {
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Bekor qilindi' })
        await edit(`${cq.message?.text ?? ''}\n\n↩ Bekor qilindi (ombor va kassa qaytarildi)`)
      }
    }
    return new Response('ok')
  }

  const msg = update.message
  if (msg?.text?.startsWith('/start')) {
    // привязка по одноразовой ссылке с главной страницы: /start link_<код>
    const code = msg.text.match(/^\/start\s+link_([A-Za-z0-9]+)/)?.[1]
    if (code && msg.chat.type === 'private') {
      const { data: r, error } = await admin.rpc('tg_link_claim', { p_code: code, p_tg: msg.chat.id })
      const text = error
        ? `Xatolik: ${error.message}`
        : r?.ok
          ? `✅ Telegram ulandi.\nAkkaunt: ${r.login} · ${r.full_name}\nLavozim: ${ROLE_NAMES[r.role] ?? r.role}\n\n${roleInfo(r.role)}`
          : r?.reason === 'inactive'
            ? 'Bu akkaunt faol emas. Rahbarga murojaat qiling.'
            : 'Havola eskirgan yoki ishlatilgan. Tizimda «Telegramni ulash» tugmasini qayta bosing.'
      await tg('sendMessage', { chat_id: msg.chat.id, text, reply_markup: openButton })
      return new Response('ok')
    }
    const { data: emp } = await admin.from('employees').select('full_name, login, role, is_active').eq('telegram_id', msg.chat.id).maybeSingle()
    const text = emp?.is_active
      ? `Assalomu alaykum, ${emp.full_name}!\nAkkaunt: ${emp.login} · ${ROLE_NAMES[emp.role] ?? emp.role}\n\n${roleInfo(emp.role)}\n\nTizimni ochish uchun pastdagi tugmani bosing.`
      : 'Assalomu alaykum! ECOROM tizimi.\nTelegram hali akkauntga ulanmagan: tizimga login-parol bilan kiring va bosh sahifada «Telegramni ulash» tugmasini bosing.'
    await tg('sendMessage', { chat_id: msg.chat.id, text, reply_markup: openButton })
  } else if (msg?.text && msg.from) {
    // причина после «Yetmaydi/Brak» (если бот её ждёт)
    const { data: r } = await admin.rpc('shop_reason', { p_tg: msg.from.id, p_text: msg.text })
    if (r?.ok) {
      await tg('sendMessage', { chat_id: msg.chat.id, text: `Rahmat! №${r.order_no} bo‘yicha rahbarga yuborildi.` })
      return new Response('ok')
    }
    // расходы и закупки Rahbar: ИИ понимает сообщение (одна строка или список) → карточка «Tasdiqlash / Bekor qilish»
    const { data: boss } = await admin.from('employees').select('id').eq('telegram_id', msg.from.id).eq('role', 'rahbar').eq('is_active', true).maybeSingle()
    if (boss && msg.chat.type === 'private') {
      await tg('sendChatAction', { chat_id: msg.chat.id, action: 'typing' })
      let ai: AiResult
      try {
        if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY yo‘q')
        // омбор, категории, сотрудники — каждый раз свежие из базы
        const [{ data: stock }, { data: cats }, { data: people }] = await Promise.all([
          admin.from('v_stock_balance').select('item_id, part, name, unit, kind, sort').order('kind').order('sort').order('name').order('part'),
          admin.from('expense_categories').select('id, name, keywords').eq('is_active', true).order('id'),
          admin.from('employees').select('id, full_name').eq('is_active', true).order('full_name'),
        ])
        ai = await askAi(OPENAI_KEY, msg.text, { stock: (stock ?? []) as StockRow[], cats: cats ?? [], people: people ?? [] })
      } catch (e) {
        console.error('ai', e)
        await tg('sendMessage', { chat_id: msg.chat.id, text: 'Hozir tushuna olmadim (AI ishlamayapti) — hech narsa yozilmadi. Birozdan keyin qayta yozing.' })
        return new Response('ok')
      }
      const { data: b, error } = await admin.rpc('bot_batch_create', { p_tg: msg.from.id, p_text: msg.text, p_lines: ai.lines, p_usage: ai.usage })
      if (error) {
        await tg('sendMessage', { chat_id: msg.chat.id, text: `Xatolik: ${error.message} — hech narsa yozilmadi.` })
        return new Response('ok')
      }
      const lines = (b.lines ?? []) as CheckedLine[]
      const any = lines.some((l) => l.kind !== 'unclear')
      await tg('sendMessage', {
        chat_id: msg.chat.id,
        text: draftText(lines),
        reply_markup: any
          ? { inline_keyboard: [[{ text: '✅ Tasdiqlash', callback_data: `bb:ok:${b.id}` }, { text: '❌ Bekor qilish', callback_data: `bb:no:${b.id}` }]] }
          : undefined,
      })
      return new Response('ok')
    }
    if (boss && isPurchase(msg.text)) {
      const pp = parsePurchase(msg.text)
      if (!pp.ok) {
        await tg('sendMessage', { chat_id: msg.chat.id, text: pp.error })
        return new Response('ok')
      }
      const { data: d, error } = await admin.rpc('purchase_draft_create', { p_tg: msg.from.id, p_name: pp.value.name, p_qty: pp.value.qty, p_unit: pp.value.unit, p_total: pp.value.total })
      if (error) await tg('sendMessage', { chat_id: msg.chat.id, text: `Xatolik: ${error.message}` })
      else {
        const c = purchaseCard(d as PurchaseDraft)
        await tg('sendMessage', { chat_id: msg.chat.id, text: c.text, reply_markup: c.reply_markup })
      }
      return new Response('ok')
    }
    if (boss) {
      const [{ data: cats }, { data: people }] = await Promise.all([
        admin.from('expense_categories').select('id, name, keywords').eq('is_active', true),
        admin.from('employees').select('id, full_name').eq('is_active', true),
      ])
      const p = parseExpense(msg.text, cats ?? [], people ?? [])
      if (p.amount && p.amount > 999_999_999_999) {
        await tg('sendMessage', { chat_id: msg.chat.id, text: 'Summa juda katta.' })
        return new Response('ok')
      }
      if (!p.amount) {
        await tg('sendMessage', { chat_id: msg.chat.id, text: 'Summani topa olmadim. Masalan: «obed 150000», «benzin 200 000», «remont 1,5 mln». Material xaridi uchun «xarid» so‘zi bilan boshlang: «xarid Otliv oq 200 30 m 600000».' })
        return new Response('ok')
      }
      const { data: d, error } = await admin.rpc('expense_draft_create', { p_tg: msg.from.id, p_amount: p.amount, p_category: p.categoryId, p_note: p.note, p_for: p.employeeId })
      if (error) await tg('sendMessage', { chat_id: msg.chat.id, text: `Xatolik: ${error.message}` })
      else {
        const c = draftCard(d as Draft)
        await tg('sendMessage', { chat_id: msg.chat.id, text: c.text, reply_markup: c.reply_markup })
      }
    } else if (msg.chat.type === 'private') {
      // не руководитель: расходы/закупки не принимаются, ничего о деньгах не показываем
      const { data: emp } = await admin.from('employees').select('is_active').eq('telegram_id', msg.from.id).maybeSingle()
      const text = emp?.is_active
        ? 'Botga xarajat va xarid yozish faqat rahbar uchun. Ishingiz bo‘yicha xabarlar shu yerga keladi; tizimni ochish uchun tugmani bosing.'
        : 'Telegram hali akkauntga ulanmagan: tizimga kiring va bosh sahifada «Telegramni ulash» tugmasini bosing.'
      await tg('sendMessage', { chat_id: msg.chat.id, text, reply_markup: openButton })
    }
  }
  return new Response('ok')
})
