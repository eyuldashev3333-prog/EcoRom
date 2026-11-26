// Живой тест ИИ-расходов в боте (боевая база!): тестовый руководитель t_rah, выдуманный chat id.
// Сообщение → карточка (bot_batches) → «Bekor qilish» → ничего не записано; снова → «Tasdiqlash» → касса −, омбор +;
// повторное «Tasdiqlash» — без дублей; «↩» → касса и омбор вернулись. В конце все тестовые записи удаляются точечно по id.
// Запуск из корня: node scripts/e2e/bot_ai_live_test.mjs
import { ensureUser, sql, URL_ } from './h.mjs'
import { env } from 'file:///D:/Eco Rom/scripts/env.mjs'

const FAKE = 9100778
let fails = 0
const check = (name, ok, info = '') => { console.log(ok ? 'OK  ' : 'FAIL', name, info); if (!ok) fails++ }
const post = (body) =>
  fetch(`${URL_}/functions/v1/tg-bot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': env('TG_WEBHOOK_SECRET') },
    body: JSON.stringify({ update_id: Date.now(), ...body }),
  }).then((r) => r.status)
const say = (text) => post({ message: { message_id: 1, date: 0, text, chat: { id: FAKE, type: 'private' }, from: { id: FAKE, is_bot: false, first_name: 'T' } } })
const press = (data) => post({ callback_query: { id: String(Date.now()), data, from: { id: FAKE, is_bot: false, first_name: 'T' }, message: { message_id: 1, chat: { id: FAKE, type: 'private' }, text: 'card' } } })
const one = async (q) => (await sql(q))[0]
const cash = async () => Number((await one(`select public.bot_cash() c`)).c)
const OTLIV = `(select item_id from v_stock_balance where name = 'Otliv oq 200' and part = '')`
const stock = async () => Number((await one(`select coalesce(sum(qty),0) q from stock_movements where item_id = ${OTLIV} and part = ''`)).q)
const lastBatch = async () => one(`select id, status, lines, usage from bot_batches where telegram_id = ${FAKE} order by created_at desc limit 1`)

const MSG = 'obed 150000\nxarid otlif oq 200 10 m 200000\nkley 5 litr 50000'
const supBefore = await one(`select id from suppliers where name = 'Bot / noma''lum'`)
let me
try {
  await ensureUser('t_rah', 'TEST Rahbar', 'rahbar')
  me = (await one(`update employees set telegram_id = ${FAKE} where login = 't_rah' returning id`)).id
  const c0 = await cash(), s0 = await stock()
  console.log('касса до:', c0, '· Otliv oq 200 в омборе до:', s0)

  // 1) карточка и «Bekor qilish»
  check('сообщение принято', (await say(MSG)) === 200)
  let b = await lastBatch()
  const kinds = (b?.lines ?? []).map((l) => `${l.kind}${l.amount ? ':' + l.amount : ''}${l.qty ? ':' + l.qty : ''}`)
  console.log('   ИИ понял:', JSON.stringify(b?.lines?.map((l) => ({ kind: l.kind, text: l.text, amount: l.amount, category: l.category, name: l.name, qty: l.qty, reason: l.reason }))))
  console.log('   токены:', JSON.stringify(b?.usage))
  check('карточка: расход 150000, закупка Otliv oq 200 10 m 200000, клей — «нет в омборе»',
    JSON.stringify(kinds) === JSON.stringify(['expense:150000', 'purchase:200000:10', 'unclear']) && b.lines[1].name === 'Otliv oq 200' && b.lines[2].reason === "omborda yo'q", JSON.stringify(kinds))
  await press(`bb:no:${b.id}`)
  b = await one(`select status from bot_batches where id = '${b.id}'`)
  check('«Bekor qilish»: черновик отменён', b.status === 'cancelled')
  check('после «Bekor qilish» касса и омбор не изменились', (await cash()) === c0 && (await stock()) === s0)

  // 2) снова → «Tasdiqlash»
  await say(MSG)
  b = await lastBatch()
  await press(`bb:ok:${b.id}`)
  const st = await one(`select status, result from bot_batches where id = '${b.id}'`)
  const c1 = await cash(), s1 = await stock()
  check('«Tasdiqlash»: записано', st.status === 'done' && st.result.expenses.length === 1 && st.result.purchases.length === 1, JSON.stringify(st.result))
  check('касса уменьшилась ровно на 350 000', c0 - c1 === 350000, `${c0} → ${c1}`)
  check('омбор: Otliv oq 200 +10 m', s1 - s0 === 10, `${s0} → ${s1}`)
  const e = await one(`select amount, source, (select name from expense_categories where id = category_id) cat from expenses where id = '${st.result.expenses[0].id}'`)
  check('расход в журнале: 150000, PITANIYA, telegram', Number(e.amount) === 150000 && e.cat === 'PITANIYA' && e.source === 'telegram', JSON.stringify(e))

  // 3) повторное нажатие — без дублей
  await press(`bb:ok:${b.id}`)
  check('повторное «Tasdiqlash» не пишет второй раз', (await cash()) === c1 && (await stock()) === s1)

  // 4) «↩ Bekor qilish» после записи
  await press(`bb:undo:${b.id}`)
  check('«↩»: касса вернулась', (await cash()) === c0, String(await cash()))
  check('«↩»: омбор вернулся', (await stock()) === s0, String(await stock()))
  await press(`bb:undo:${b.id}`)
  check('повторное «↩» ничего не меняет', (await cash()) === c0 && (await stock()) === s0)

  // 5) не руководитель не может нажать чужую кнопку
  const r = await post({ callback_query: { id: '9', data: `bb:ok:${b.id}`, from: { id: FAKE + 5, is_bot: false, first_name: 'X' }, message: { message_id: 1, chat: { id: FAKE + 5, type: 'private' }, text: 'x' } } })
  check('чужой Telegram не может подтвердить', r === 200 && (await cash()) === c0)
} finally {
  // уборка: точечно по id всё, что создал тестовый руководитель (журналы защищены от удаления — отключаем триггеры только в этой сессии)
  if (me) {
    const q = `set session_replication_role = replica;
      delete from audit_log where actor in (select auth_user_id from employees where id = '${me}') or row_id in (
        select id::text from expenses where created_by = '${me}' union all select id::text from purchases where created_by = '${me}'
        union all select id::text from supplier_payments where created_by = '${me}' union all select id::text from stock_movements where created_by = '${me}'
        union all select pi.id::text from purchase_items pi join purchases p on p.id = pi.purchase_id where p.created_by = '${me}');
      delete from purchase_items where purchase_id in (select id from purchases where created_by = '${me}');
      delete from stock_movements where created_by = '${me}';
      delete from supplier_payments where created_by = '${me}';
      delete from purchases where created_by = '${me}';
      delete from expenses where created_by = '${me}';
      ${supBefore ? '' : `delete from suppliers where name = 'Bot / noma''lum' and not exists (select 1 from purchases p where p.supplier_id = suppliers.id) and not exists (select 1 from supplier_payments s where s.supplier_id = suppliers.id);`}
      set session_replication_role = origin;`
    await sql(q)
  }
  await sql(`delete from bot_batches where telegram_id between ${FAKE} and ${FAKE + 5}`)
  await sql(`update employees set telegram_id = null, is_active = false where login = 't_rah'`)
  const left = await one(`select (select count(*) from expenses where created_by = '${me}')::int e, (select count(*) from purchases where created_by = '${me}')::int p, (select count(*) from supplier_payments where created_by = '${me}')::int s, (select count(*) from stock_movements where created_by = '${me}')::int m`)
  console.log('уборка: осталось тестовых записей', JSON.stringify(left), '· касса', await cash(), '· t_rah выключен')
}
console.log(fails ? `ОШИБОК: ${fails}` : 'ВСЁ OK')
process.exit(fails ? 1 : 0)
