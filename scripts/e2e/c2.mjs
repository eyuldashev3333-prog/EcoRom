// e2e блоков C/D/E/F (миграции 049–053): команда заказа, «кто первый», зарплата и статистика, пропуски, монтаж/сервис, склад, закупки бота.
// Запуск: из scripts/e2e → node c2.mjs ; потом ОБЯЗАТЕЛЬНО node cleanup-e2e.mjs (удаляет тестовое и возвращает Telegram Elyor).
import { ensureUser, sql, rpc, get, check, info, sleep } from './h.mjs'

// настоящим Rahbar на время теста Telegram отключаем (чтобы тест не слал им сообщения); cleanup возвращает Elyor, остальных вернёт этот скрипт
const real = await sql(`select id, telegram_id from employees where role = 'rahbar' and login not like 't\\_%' and telegram_id is not null`)
await sql(`update employees set telegram_id = null where role = 'rahbar' and login not like 't\\_%'`)
const restore = async () => { for (const r of real) await sql(`update employees set telegram_id = ${r.telegram_id} where id = '${r.id}'`) }

try {
  await ensureUser('t_rah', 'T Rahbar', 'rahbar', 9100001)
  for (const [l, n, r, tg] of [['test_ishlab1', 'T Ishlab 1', 'ishlab', 9100002], ['test_ishlab2', 'T Ishlab 2', 'ishlab', 9100003], ['test_ishlab3', 'T Ishlab 3', 'ishlab', 9100004], ['test_mont1', 'T Mont 1', 'montajchi', 9100005], ['test_mont2', 'T Mont 2', 'montajchi', 9100006]]) await ensureUser(l, n, r, tg)
  const R = 't_rah'
  const id = async (login) => (await sql(`select id from employees where login = '${login}'`))[0].id
  const [i1, i2, i3, m1, m2] = await Promise.all(['test_ishlab1', 'test_ishlab2', 'test_ishlab3', 'test_mont1', 'test_mont2'].map(id))
  await sql(`delete from pay_rules where employee_id in ('${i1}','${i2}','${i3}','${m1}','${m2}')`)
  await sql(`insert into pay_rules(employee_id, basis, amount, valid_from) values ('${i1}','per_m2',100,current_date-60),('${i2}','per_m2',100,current_date-60),('${m1}','per_order',300000,current_date-60),('${m2}','per_order',300000,current_date-60)`)
  await sql(`insert into pay_rules(employee_id, basis, amount, valid_from, work_days_per_week, work_hours_per_day) values ('${i3}','salary',3000000,current_date-60,6,8)`)
  // шаг этапа «Kesish» (id 1) без цен в каталоге: считаем размеры сами
  const item = (pos) => ({ pos, title: 'w' + pos, width_mm: 1000, height_mm: 2000, qty: 1, area_m2: 2.0, cost: 100, design: { w: 1 }, options: {}, materials: { items: [] } })
  const mk = (over = {}) => ({ client: { full_name: 'TEST C2' }, contract_price: 1000000, calc_cost: 500000, items: [item(1)], ...over })
  const o1 = (await rpc(R, 'save_order', { p: mk() })).data.id
  const o2 = (await rpc(R, 'save_order', { p: mk() })).data.id

  // ---- C: команда заказа ----
  let r = await rpc(R, 'send_to_shop', { p_order: o1, p_workers: [i1, i2] })
  check('C1', 'отправка в цех с выбранными людьми', r.ok && r.data.team_all === false && r.data.workers === 2, r.err || JSON.stringify(r.data))
  const sw = await sql(`select count(*)::int n from order_shop_workers where order_id = '${o1}'`)
  check('C2', 'назначены ровно двое', sw[0].n === 2)
  await sleep(1500)
  const nt = await sql(`select employee_id, target_role from notifications order by created_at desc limit 10`)
  check('C3', 'уведомление только выбранным, не роли', nt.some((x) => x.employee_id === i1) && nt.some((x) => x.employee_id === i2) && !nt.some((x) => x.employee_id === i3) && !nt.some((x) => x.target_role === 'ishlab'), JSON.stringify(nt.slice(0, 4)))
  check('C4', 'невыбранный не видит заказ', (await get('test_ishlab3', `w_orders?id=eq.${o1}&select=id`)).data.length === 0)
  check('C5', 'выбранный видит заказ', (await get('test_ishlab1', `w_orders?id=eq.${o1}&select=id`)).data.length === 1)
  r = await rpc('test_ishlab3', 'shop_answer_web', { p_order: o1, p_result: 'enough' })
  check('C6', 'не назначенный не может ответить', r.ok && r.data.ok === false, JSON.stringify(r.data))
  r = await rpc('test_ishlab1', 'shop_answer_web', { p_order: o1, p_result: 'enough' })
  check('C7', 'первый ответ записан (Qabul qildim)', r.ok && r.data.ok === true, r.err || JSON.stringify(r.data))
  r = await rpc('test_ishlab2', 'shop_answer_web', { p_order: o1, p_result: 'not_enough', p_note: 'kley yo\'q' })
  check('C8', 'второй ответ отклонён: «allaqachon javob berilgan»', r.ok && r.data.ok === false && r.data.taken === true && /T Ishlab 1/.test(r.data.error), JSON.stringify(r.data))
  const st = (await sql(`select shop_accepted_by, (select count(*)::int from order_material_checks where order_id = '${o1}') n_checks, (select count(*)::int from order_shop_late where order_id = '${o1}') n_late from orders where id = '${o1}'`))[0]
  check('C9', 'ответственный = первый; в журнале 1 ответ и 1 опоздавший', st.shop_accepted_by === i1 && st.n_checks === 1 && st.n_late === 1, JSON.stringify(st))
  r = await rpc(R, 'shop_state', { p_order: o1 })
  check('C10', 'shop_state: команда, первый, опоздавшие', r.ok && r.data.team.length === 2 && r.data.first?.name === 'T Ishlab 1' && r.data.late.length === 1, JSON.stringify(r.data))
  r = await rpc(R, 'send_to_shop', { p_order: o2 })
  check('C11', 'без выбора — вся команда', r.ok && r.data.team_all === true && r.data.workers >= 3, r.err || JSON.stringify(r.data))
  r = await rpc(R, 'shop_set_workers', { p_order: o1, p_workers: [i1, i2, i3] })
  check('C12', 'состав можно изменить в цеху', r.ok && (await sql(`select count(*)::int n from order_shop_workers where order_id = '${o1}'`))[0].n === 3, r.err)

  // ---- C2: зарплата ----
  await sql(`update order_shop_workers set order_id = order_id where false`)
  await sql(`delete from order_shop_workers where order_id = '${o1}' and employee_id = '${i3}'`) // вернуть двоих
  const it = (await get('test_ishlab1', `w_order_items?order_id=eq.${o1}&select=id&order=pos`)).data[0].id
  r = await rpc('test_ishlab1', 'mark_stage', { p_item: it, p_stage: 1, p_done: true })
  check('P1', 'этап отмечен', r.ok, r.err)
  const month = (await sql(`select to_char(current_date, 'YYYY-MM-01') m`))[0].m
  const lines = (login) => sql(`select l.kind, l.label, l.amount::numeric a from payroll_lines('${month}') l join employees e on e.id = l.employee_id where e.login = '${login}' order by l.kind`)
  const a1 = await lines('test_ishlab1'), a2 = await lines('test_ishlab2'), a3 = await lines('test_ishlab3')
  check('P2', 'м² начислены обоим назначенным (полная сумма, не делится)', a1.some((x) => x.kind === 'per_m2' && Number(x.a) === 200) && a2.some((x) => x.kind === 'per_m2' && Number(x.a) === 200), JSON.stringify([a1, a2]))
  check('P3', 'у не назначенного (оклад) м² нет', !a3.some((x) => x.kind === 'per_m2'))
  const day = (await sql(`select (date_trunc('month', current_date)::date + case when extract(isodow from date_trunc('month', current_date)) = 7 then 1 else 0 end) d`))[0].d
  r = await rpc(R, 'absence_add', { p_employee: i3, p_day: day, p_hours: null, p_reason: 'sick', p_note: 'test', p_deduct: true })
  check('P4', 'пропуск отмечен', r.ok, r.err)
  const a3b = await lines('test_ishlab3')
  const ab = a3b.find((x) => x.kind === 'absence'), sal = a3b.find((x) => x.kind === 'salary')
  check('P5', 'вычет за пропуск с объяснением (−1 день оклада)', !!ab && Number(ab.a) < 0 && /Kelmadi/.test(ab.label) && /kasal/.test(ab.label) && !!sal, JSON.stringify(a3b))
  info('P5i', 'цена дня', ab ? `${ab.a}` : '')
  r = await rpc(R, 'absence_add', { p_employee: i3, p_day: day, p_hours: 2, p_reason: 'permit', p_note: null, p_deduct: false })
  check('P6', 'пропуск без галочки «вычесть» не уменьшает оклад', r.ok && (await lines('test_ishlab3')).filter((x) => x.kind === 'absence').length === 1, r.err)
  r = await rpc(R, 'worker_stats', { p_month: month })
  const s1 = r.data.find((x) => x.full_name === 'T Ishlab 1'), s3 = r.data.find((x) => x.full_name === 'T Ishlab 3')
  check('P7', 'статистика Rahbar: м² у назначенного, пропуски у окладника', r.ok && Number(s1.m2) === 2 && Number(s1.orders) === 1 && Number(s3.absence_days) === 1 && Number(s3.absence_hours) === 2, JSON.stringify([s1, s3]))
  r = await rpc('test_ishlab1', 'worker_stats', { p_month: month })
  check('P8', 'сотрудник видит только свою строку', r.ok && r.data.length === 1 && r.data[0].full_name === 'T Ishlab 1', JSON.stringify(r.data))
  r = await rpc('test_ishlab1', 'absence_add', { p_employee: i1, p_day: day, p_hours: null, p_reason: 'skip' })
  check('P9', 'не Rahbar не может отмечать пропуски', !r.ok)
  const abid = (await rpc(R, 'absences_list', { p_month: month, p_employee: i3 })).data.find((x) => x.reason === 'sick')
  r = await rpc(R, 'absence_cancel', { p_id: abid.id })
  check('P10', 'отмена пропуска: вычет исчезает', r.ok && !(await lines('test_ishlab3')).some((x) => x.kind === 'absence'), r.err)

  // ---- D: монтаж и сервис ----
  r = await rpc(R, 'assign_install', { p_order: o1, p_date: day, p_members: [m1, m2], p_note: 'test' })
  check('M1', 'монтаж назначен бригаде', r.ok, r.err)
  const job = (await get('test_mont1', 'w_install_jobs?select=id,accepted_name')).data[0]
  r = await rpc('test_mont1', 'install_accept', { p_job: job.id })
  check('M2', 'первый принял монтаж', r.ok && r.data.ok === true, r.err || JSON.stringify(r.data))
  r = await rpc('test_mont2', 'install_accept', { p_job: job.id })
  check('M3', 'второй: «allaqachon qabul qilingan»', r.ok && r.data.ok === false && r.data.taken === true && /T Mont 1/.test(r.data.error), JSON.stringify(r.data))
  check('M4', 'в журнале опоздавший', (await sql(`select count(*)::int n from accept_late where kind = 'install' and ref_id = '${job.id}'`))[0].n === 1)
  await sql(`update orders set status = 'installed', install_date = current_date where id = '${o1}'`)
  await sql(`update install_jobs set status = 'done' where order_id = '${o1}'`)
  const q1 = await lines('test_mont1'), q2 = await lines('test_mont2')
  check('M5', '«за заказ»: каждому из бригады полная сумма', q1.some((x) => x.kind === 'per_order' && Number(x.a) === 300000) && q2.some((x) => x.kind === 'per_order' && Number(x.a) === 300000), JSON.stringify([q1, q2]))
  r = await rpc(R, 'create_service', { p_order: o1, p_item: null, p_description: 'test servis', p_due: null, p_assignee: null, p_photos: [] })
  check('M6', 'сервис без исполнителя создан', r.ok, r.err)
  const tk = r.data
  check('M7', 'монтажники видят заявку без исполнителя', (await get('test_mont2', `w_service_tickets?id=eq.${tk}&select=id`)).data.length === 1)
  r = await rpc('test_mont2', 'service_accept', { p_id: tk })
  check('M8', 'первый принял сервис', r.ok && r.data.ok === true, r.err || JSON.stringify(r.data))
  r = await rpc('test_mont1', 'service_accept', { p_id: tk })
  check('M9', 'второй: «allaqachon qabul qilingan»', r.ok && r.data.ok === false && r.data.taken === true, JSON.stringify(r.data))

  // ---- E: склад ----
  r = await rpc(R, 'add_stock_item', { p_name: 'TEST C2 material 12', p_unit: 'kg', p_qty: 7, p_price: 1000 })
  check('S1', 'свободное добавление сырья (название и единица — любые)', r.ok, r.err)
  const row = (await sql(`select qty::numeric q, unit from v_stock_balance where name = 'TEST C2 material 12'`))[0]
  check('S2', 'на складе: 7 kg', row && Number(row.q) === 7 && row.unit === 'kg', JSON.stringify(row))
  r = await rpc(R, 'add_stock_item', { p_name: 'test c2 MATERIAL 12', p_unit: 'kg' })
  check('S3', 'дубль названия отклонён', !r.ok, r.err)
  r = await rpc('test_ishlab1', 'add_stock_item', { p_name: 'TEST x', p_unit: 'kg' })
  check('S4', 'не Rahbar не может добавлять', !r.ok)

  // ---- F: закупки бота (service_role, как делает функция бота) ----
  const cash0 = Number((await sql(`select cash from v_cash_balance`))[0].cash)
  let d = (await rpc('svc', 'purchase_draft_create', { p_tg: 9100001, p_name: 'TEST C2 material 12', p_qty: 4, p_unit: 'kg', p_total: 80000 })).data
  check('F1', 'материал определён по названию', d?.item?.name === 'TEST C2 material 12', JSON.stringify(d))
  r = await rpc('svc', 'purchase_confirm', { p_tg: 9100001, p_id: d.id })
  check('F2', 'закупка записана', r.ok && Number(r.data.qty) === 4, r.err)
  const after = (await sql(`select qty::numeric q from v_stock_balance where name = 'TEST C2 material 12'`))[0].q
  const cash1 = Number((await sql(`select cash from v_cash_balance`))[0].cash)
  check('F3', 'склад +4, касса −80 000 (один раз)', Number(after) === 11 && cash0 - cash1 === 80000, `qty=${after} cashΔ=${cash0 - cash1}`)
  r = await rpc('svc', 'purchase_undo', { p_tg: 9100001, p_purchase: r.data.purchase_id })
  const cash2 = Number((await sql(`select cash from v_cash_balance`))[0].cash)
  check('F4', 'отмена возвращает склад и кассу', r.ok && Number((await sql(`select qty::numeric q from v_stock_balance where name = 'TEST C2 material 12'`))[0].q) === 7 && cash2 === cash0, r.err)
  d = (await rpc('svc', 'purchase_draft_create', { p_tg: 9100001, p_name: 'TEST C2 neizvestno ZZ', p_qty: 1, p_unit: 'dona', p_total: 5000 })).data
  check('F5', 'неизвестный материал: нужен выбор', d.item === null)
  d = (await rpc('svc', 'purchase_draft_new', { p_tg: 9100001, p_id: d.id })).data
  check('F6', '«Yangi material» создаёт позицию склада', d.item?.name === 'TEST C2 neizvestno ZZ' && d.item.unit === 'dona', JSON.stringify(d))
  r = await rpc('svc', 'purchase_draft_create', { p_tg: 1, p_name: 'x', p_qty: 1, p_unit: null, p_total: 1000 })
  check('F7', 'не Rahbar в Telegram не может писать закупки', !r.ok)
} finally {
  await restore()
}
console.log('Готово. Теперь: node cleanup-e2e.mjs')
