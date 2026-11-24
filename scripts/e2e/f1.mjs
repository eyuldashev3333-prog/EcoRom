// e2e миграции 055 (простая жизнь заказа): Zavodga yuborish → Qabul qildim / Material yetmaydi → Tayyor → O'rnatish → O'rnatildi (+shisha) → фото из бота → закрытие.
// Запуск: из scripts/e2e → node f1.mjs ; потом ОБЯЗАТЕЛЬНО node cleanup-e2e.mjs
import { ensureUser, sql, rpc, get, check, URL_, SVC } from './h.mjs'

const real = await sql(`select id, telegram_id from employees where role = 'rahbar' and login not like 't\\_%' and telegram_id is not null`)
await sql(`update employees set telegram_id = null where role = 'rahbar' and login not like 't\\_%'`)
const restore = async () => { for (const r of real) await sql(`update employees set telegram_id = ${r.telegram_id} where id = '${r.id}'`) }

try {
  await ensureUser('t_rah', 'T Rahbar', 'rahbar', 9100001)
  for (const [l, n, r, tg] of [['test_ishlab1', 'T Ishlab 1', 'ishlab', 9100002], ['test_ishlab2', 'T Ishlab 2', 'ishlab', 9100003], ['test_mont1', 'T Mont 1', 'montajchi', 9100005], ['test_mont2', 'T Mont 2', 'montajchi', 9100006]]) await ensureUser(l, n, r, tg)
  const R = 't_rah'
  const id = async (login) => (await sql(`select id from employees where login = '${login}'`))[0].id
  const [i1, i2, m1, m2] = await Promise.all(['test_ishlab1', 'test_ishlab2', 'test_mont1', 'test_mont2'].map(id))
  const item = (pos) => ({ pos, title: 'w' + pos, width_mm: 1000, height_mm: 1500, qty: 1, area_m2: 1.5, cost: 100, design: { w: 1 }, options: {}, materials: { items: [], panes: [{ w: 900, h: 1400 }] } })
  const mk = () => ({ client: { full_name: 'TEST F1' }, contract_price: 1000000, calc_cost: 500000, items: [item(1), item(2)] })
  const o1 = (await rpc(R, 'save_order', { p: mk() })).data.id
  const o2 = (await rpc(R, 'save_order', { p: mk() })).data.id

  // этапы
  const st = await sql(`select code from stages where is_active order by sort`)
  check('S1', 'активные этапы: только Tayyor и Montaj', st.map((x) => x.code).join(',') === 'shop_ready,install', JSON.stringify(st))

  // «O'rnatish» нельзя до готовности
  let r = await rpc(R, 'assign_install', { p_order: o1, p_date: '2026-12-01', p_members: [m1] })
  check('A1', 'монтаж новому заказу не назначается', !r.ok && /tayyor/.test(r.err), r.err)

  // Zavodga yuborish → цех
  r = await rpc(R, 'send_to_shop', { p_order: o1, p_workers: [i1, i2] })
  check('Z1', 'Zavodga yuborish → in_production', r.ok && (await sql(`select status from orders where id='${o1}'`))[0].status === 'in_production', r.err)
  r = await rpc('test_ishlab1', 'shop_ready', { p_order: o1 })
  check('Z2', '«Tayyor» до «Qabul qildim» — нельзя', !r.ok && /Qabul qildim/.test(r.err), r.err)
  r = await rpc('test_ishlab1', 'shop_answer_web', { p_order: o1, p_result: 'enough' })
  check('Z3', 'Qabul qildim', r.ok && r.data.ok, JSON.stringify(r.data))
  r = await rpc('test_ishlab2', 'shop_ready', { p_order: o1 })
  check('Z4', '«Tayyor» (любой из команды) → ready', r.ok && (await sql(`select status from orders where id='${o1}'`))[0].status === 'ready', r.err)
  const marks = await sql(`select count(*)::int n from item_stage_marks m join stages s on s.id=m.stage_id join order_items i on i.id=m.order_item_id where i.order_id='${o1}' and s.code='shop_ready'`)
  check('Z5', 'отметка «Tayyor» на каждое окно (для зарплаты)', marks[0].n === 2, JSON.stringify(marks))
  const ws = (await rpc(R, 'workshop_state')).data.orders.find((x) => x.order_id === o1)
  check('Z6', 'workshop_state: участок ready', ws?.station === 'ready', JSON.stringify(ws))

  // второй заказ: «Material yetmaydi» с причиной
  await rpc(R, 'send_to_shop', { p_order: o2, p_workers: [i1] })
  r = await rpc('test_ishlab1', 'shop_answer_web', { p_order: o2, p_result: 'not_enough', p_note: 'oq profil 2 xlist' })
  const s2 = (await rpc(R, 'shop_state', { p_order: o2 })).data
  check('Z7', '«Material yetmaydi» + izoh видно у Rahbar', r.ok && s2.first?.result === 'not_enough' && s2.first?.note === 'oq profil 2 xlist', JSON.stringify(s2.first))
  check('Z8', 'workshop_state: участок work (Jarayonda)', (await rpc(R, 'workshop_state')).data.orders.find((x) => x.order_id === o2)?.station === 'work')

  // стекло: заказано
  r = await rpc('test_mont1', 'order_glass', { p_order: o1, p_status: 'ordered' })
  check('G1', 'монтажник не ставит «zakaz qilindi»', !r.ok, r.err)
  r = await rpc(R, 'order_glass', { p_order: o1, p_status: 'ordered' })
  check('G2', 'Rahbar: Shisha zakaz qilindi (все окна)', r.ok && (await sql(`select count(*)::int n from order_items where order_id='${o1}' and glass_status='ordered'`))[0].n === 2, r.err)

  // O'rnatish
  r = await rpc(R, 'assign_install', { p_order: o1, p_date: '2026-12-01', p_members: [m1, m2] })
  check('A2', 'O\'rnatish готовому заказу', r.ok, r.err)
  r = await rpc('test_mont1', 'install_accept', { p_job: r.data })
  check('A3', 'монтажник: Qabul qildim', r.ok && r.data.ok, JSON.stringify(r.data))
  r = await rpc('test_ishlab1', 'install_done', { p_order: o1, p_glass: true })
  check('A4', 'цех не может «O\'rnatildi»', !r.ok, r.err)
  r = await rpc('test_mont2', 'install_done', { p_order: o1, p_glass: false })
  const o1s = (await sql(`select status, install_date from orders where id='${o1}'`))[0]
  check('A5', 'O\'rnatildi (shisha: yo\'q) → installed', r.ok && o1s.status === 'installed' && !!o1s.install_date, r.err || JSON.stringify(o1s))
  check('A6', 'стекло осталось «zakaz qilindi»', (await sql(`select count(*)::int n from order_items where order_id='${o1}' and glass_status='installed'`))[0].n === 0)
  const wait = await sql(`select count(*)::int n from install_photo_wait where order_id='${o1}' and employee_id='${m2}'`)
  check('A7', 'бот ждёт фото от того, кто нажал', wait[0].n === 1)
  const nt = await sql(`select text from notifications where employee_id='${m2}' order by created_at desc limit 1`)
  check('A8', 'монтажнику ушла просьба прислать фото', /fotosini/.test(nt[0]?.text ?? ''), nt[0]?.text)

  // закрыть без фото нельзя
  r = await rpc(R, 'record_payment', { p_order: o1, p_amount: 1000000, p_date: (await sql(`select current_date::text d`))[0].d, p_note: 'TEST', p_advance: false })
  check('C0', 'оплата полностью (долг 0)', r.ok, r.err)
  r = await rpc(R, 'set_order_status', { p_order: o1, p_status: 'closed' })
  check('C1', 'закрыть без фото установки нельзя', !r.ok && /foto/i.test(r.err), r.err)

  // фото из бота
  const waits = await rpc('svc', 'bot_photo_waits', { p_tg: 9100006 })
  check('B1', 'bot_photo_waits: один заказ ждёт фото', waits.ok && waits.data.length === 1 && waits.data[0].order_id === o1, JSON.stringify(waits.data))
  const path = `${o1}/bot-test.jpg`
  const up = await fetch(`${URL_}/storage/v1/object/install-photos/${path}`, { method: 'POST', headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'image/jpeg' }, body: new Uint8Array([255, 216, 255, 217]) })
  r = await rpc('svc', 'bot_install_photo', { p_tg: 9100006, p_order: o1, p_path: path })
  check('B2', 'фото из бота привязано к заказу', up.ok && r.ok && r.data.ok, r.err || JSON.stringify(r.data))
  check('B3', 'ожидание снято', (await sql(`select count(*)::int n from install_photo_wait where order_id='${o1}'`))[0].n === 0)
  r = await rpc('svc', 'bot_install_photo', { p_tg: 9100002, p_order: o1, p_path: path })
  check('B4', 'чужой (цех) фото к заказу не прикрепит', r.ok && r.data.ok === false, JSON.stringify(r.data))
  check('B5', 'монтажник видит фото своего заказа', (await get('test_mont1', `install_order_photos?order_id=eq.${o1}&select=id`)).data.length === 1)

  // потом стекло поставили
  r = await rpc('test_mont1', 'order_glass', { p_order: o1, p_status: 'installed' })
  check('G3', 'монтажник: Shisha o\'rnatildi', r.ok && (await sql(`select count(*)::int n from order_items where order_id='${o1}' and glass_status='installed'`))[0].n === 2, r.err)
  r = await rpc(R, 'set_order_status', { p_order: o1, p_status: 'closed' })
  check('C2', 'с фото и без долга — закрывается', r.ok && (await sql(`select status from orders where id='${o1}'`))[0].status === 'closed', r.err)
  r = await rpc('test_mont1', 'order_glass', { p_order: o2, p_status: 'installed' })
  check('G4', 'чужой заказ монтажник не трогает', !r.ok, r.err)

  // зарплата и статистика читаются
  const month = (await sql(`select to_char(current_date, 'YYYY-MM-01') m`))[0].m
  const pl = await sql(`select count(*)::int n from payroll_lines('${month}')`).then(() => true).catch((e) => String(e))
  check('P1', 'payroll_lines работает', pl === true, String(pl))
  r = await rpc(R, 'worker_stats', { p_month: month })
  const w1 = r.data?.find?.((x) => x.employee_id === i1)
  check('P2', 'статистика цеха: заказ засчитан по «Tayyor»', r.ok && w1?.orders >= 1, JSON.stringify(w1))
} finally {
  await restore()
}
