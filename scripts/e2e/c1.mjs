// Сквозной сценарий жизненного цикла заказа (тест №2, 13.11.2026). Запуск из scripts/e2e: node c1.mjs ; потом node cleanup-e2e.mjs
import { sql, ensureUser, rpc, get, write, check, info, URL_, SVC } from './h.mjs'
const R = 't_rah', W = 'test_ishlab1', M = 'test_montaj1'
await ensureUser(R, 'TEST Rahbar', 'rahbar', 900000005)
await ensureUser(W, 'TEST Sex 1', 'ishlab', 900000001)
await ensureUser(M, 'TEST Montajchi 1', 'montajchi', 900000003)
await ensureUser('test_montaj2', 'TEST Montajchi 2', 'montajchi', 900000004)
// реальным людям ничего не отправлять
await sql(`update employees set telegram_id=null where login in ('elyor','mahmudjon')`)
const cash = async () => Number((await sql(`select cash from v_cash_balance`))[0].cash)
const n = (x) => Number(x)
const ids = {}
for (const l of [R, W, M]) ids[l] = (await sql(`select id from employees where login='${l}'`))[0].id

// ---------- каталог: учитываемый материал
const mat = (await write(R, 'POST', 'catalog_items', { kind: 'misc', name: 'TEST mat', unit: 'pcs', price: 1000, stock_tracked: true })).data[0]
const sup = (await write(R, 'POST', 'suppliers', { name: 'TEST Supplier', city: 'x' })).data[0]
const item = (pos, qty, per, opts = {}) => ({ pos, title: 'w' + pos, width_mm: 1500, height_mm: 1400, qty, area_m2: 2.1, cost: 400000, design: { width: 1500, height: 1400 }, options: opts,
  materials: { items: [{ item_id: mat.id, name: 'TEST mat', unit: 'pcs', qty: per }] }, calc: { lines: [] } })
const cash0 = await cash()

// ---------- 1. создание заказа и повторное сохранение
const payload = { client: { full_name: 'TEST Cycle', phone: '+998901112233' }, address: 'Test street 1', contact_phone: '+998901112233', windows_count: 3, area_m2: 6.3, calc_cost: 1200000, markup: 37, calc_suggested: 1644000, discount_pct: 0, contract_price: 3000000,
  items: [item(1, 2, 3, { sill: 'x' }), item(2, 1, 5)] }
const o1 = await rpc(R, 'save_order', { p: payload }); check('L1', 'заказ сохранён', o1.ok, o1.err || '')
const ord = o1.data
const noBefore = n((await sql(`select count(*) c from orders where order_no=${ord.order_no}`))[0].c)
check('L1b', 'номер заказа 2435 первый и уникальный', ord.order_no === 2435 && noBefore === 1, String(ord.order_no))
let its = (await get(R, `order_items?order_id=eq.${ord.id}&select=id,pos&order=pos`)).data
check('L1c', '2 позиции записаны', its.length === 2)
// повторное сохранение (как нажатие «Saqlash» ещё раз) — без дублей
const cid0 = (await sql(`select client_id from orders where id='${ord.id}'`))[0].client_id
const again = await rpc(R, 'save_order', { p: { ...payload, client: { id: cid0, full_name: 'TEST Cycle', phone: '+998901112233' }, id: ord.id, items: payload.items.map((x, i) => ({ ...x, id: its[i].id })) } })
check('L2', 'повторное сохранение проходит', again.ok, again.err || '')
const cnt = (await sql(`select (select count(*) from order_items where order_id='${ord.id}') items, (select count(*) from clients where full_name='TEST Cycle') cl, (select count(*) from orders where client_id=(select client_id from orders where id='${ord.id}')) ords`))[0]
check('L2b', 'после повторного сохранения нет дублей (2 позиции, 1 клиент, 1 заказ)', n(cnt.items) === 2 && n(cnt.cl) === 1 && n(cnt.ords) === 1, JSON.stringify(cnt))
// вторая отправка с тем же клиентом (по id) — клиент не дублируется, номер +1
const cid = cid0
const o2 = (await rpc(R, 'save_order', { p: { ...payload, client: { id: cid, full_name: 'TEST Cycle', phone: '+998901112233' }, items: [item(1, 1, 1)], windows_count: 1, contract_price: 500000, calc_cost: 200000 } })).data
check('L3', 'второй заказ того же клиента: номер +1, клиент один', o2.order_no === ord.order_no + 1 && n((await sql(`select count(*) c from clients where full_name='TEST Cycle'`))[0].c) === 1, JSON.stringify(o2))
// сохранение с тем же клиентом БЕЗ id (как новый ввод) — дубль клиента? (инфо)
const o3 = (await rpc(R, 'save_order', { p: { ...payload, items: [item(1, 1, 1)], windows_count: 1, contract_price: 100000, calc_cost: 50000 } })).data
const dupC = n((await sql(`select count(*) c from clients where full_name='TEST Cycle'`))[0].c)
check('L3b', 'СЕРВЕР: клиент без id с тем же именем+телефоном не создаёт дубль (защита только в интерфейсе?)', dupC === 1, `клиентов «TEST Cycle»: ${dupC}`)
const orphanCl = n((await sql(`select count(*) c from clients c where c.full_name='TEST Cycle' and not exists (select 1 from orders o where o.client_id=c.id)`))[0].c)
info('L3c', 'клиентов без заказов (осиротевшие после id-less сохранения)', String(orphanCl))

// ---------- 2. цех: отправка, склад, ответы
const stock = async () => n((await sql(`select coalesce(sum(qty),0) q from stock_movements where item_id='${mat.id}'`))[0].q)
const consumed = async () => n((await sql(`select coalesce(-sum(qty),0) q from stock_movements where item_id='${mat.id}' and order_id='${ord.id}'`))[0].q)
let s = await rpc(R, 'send_to_shop', { p_order: ord.id }); check('L4', 'отправка в цех', s.ok, s.err || '')
check('L4b', 'списание материала = 3×2 + 5×1 = 11', (await consumed()) === 11, String(await consumed()))
await rpc(R, 'send_to_shop', { p_order: ord.id })
check('L4c', 'повторная отправка не списывает второй раз', (await consumed()) === 11, String(await consumed()))
check('L4d', 'статус in_production', (await sql(`select status from orders where id='${ord.id}'`))[0].status === 'in_production')
const wv = (await get(W, 'w_orders?select=order_no,notes,address,contact_phone')).data
check('L5', 'цех видит заказ (и только его)', wv.length === 1 && wv[0].order_no === ord.order_no, JSON.stringify(wv))
const wi = await get(W, `w_order_items?order_id=eq.${ord.id}&select=*`)
check('L5b', 'у цеха в позициях нет цены/себестоимости', wi.ok && wi.data.length === 2 && !('cost' in wi.data[0]) && !('calc' in wi.data[0]), Object.keys(wi.data?.[0] || {}).join(','))
const wo = await get(W, `orders?select=contract_price,calc_cost&id=eq.${ord.id}`); check('L5c', 'цех не читает orders напрямую', !wo.ok || (Array.isArray(wo.data) && wo.data.length === 0), JSON.stringify(wo.data).slice(0, 80))
const wp = await get(W, 'payments?select=id'); check('L5d', 'цех не видит оплаты', !wp.ok || wp.data.length === 0)
const wc = await get(W, 'v_cash_balance?select=cash'); check('L5e', 'цех не видит реальную кассу (допустим 0 из-за RLS)', !wc.ok || wc.data.length === 0 || n(wc.data[0].cash) === 0, JSON.stringify(wc.data))
// ответы цеха через функцию бота
await rpc('svc', 'shop_answer', { p_tg: 900000001, p_order: ord.id, p_result: 'not_enough' })
await rpc('svc', 'shop_answer', { p_tg: 900000001, p_order: ord.id, p_result: 'enough' })
const chk = await sql(`select result from order_material_checks where order_id='${ord.id}' order by created_at`)
check('L6', 'ответы цеха сохранены по порядку (not_enough → enough)', chk.length === 2 && chk[0].result === 'not_enough' && chk[1].result === 'enough', JSON.stringify(chk))
const nrah = await sql(`select text from notifications where text like '✅%endi material yetadi%'`)
check('L6b', 'Rahbar уведомлён «endi yetadi» ровно один раз', nrah.length === 1, String(nrah.length))

// ---------- 3. этапы цеха
its = (await get(R, `order_items?order_id=eq.${ord.id}&select=id,pos&order=pos`)).data
let r = await rpc(W, 'mark_stage', { p_item: its[0].id, p_stage: 1, p_done: true }); check('L7', 'цех отметил «Kesish» по поз.1', r.ok, r.err || '')
r = await rpc(W, 'mark_stage', { p_item: its[0].id, p_stage: 1, p_done: true }); check('L7b', 'двойная отметка того же этапа отклонена', !r.ok, r.err || '')
r = await rpc(W, 'mark_stage', { p_item: its[0].id, p_stage: 4, p_done: true }); check('L7c', 'цех не может ставить «Montaj»', !r.ok, r.err || '')
r = await rpc(M, 'mark_stage', { p_item: its[0].id, p_stage: 2, p_done: true }); check('L7d', 'монтажник не ставит этапы цеха', !r.ok, r.err || '')
for (const it of its) for (const st of [1, 2, 3]) await rpc(W, 'mark_stage', { p_item: it.id, p_stage: st, p_done: true })
const marks = n((await sql(`select count(*) c from item_stage_marks where order_item_id in ('${its[0].id}','${its[1].id}')`))[0].c)
check('L8', 'отметок цеха ровно 6 (2 поз × 3 этапа), без дублей', marks === 6, String(marks))
check('L8b', 'все этапы цеха → статус ready', (await sql(`select status from orders where id='${ord.id}'`))[0].status === 'ready')
const pct = (await get(R, `v_order_progress?order_id=eq.${ord.id}&select=*`)).data[0]; info('L8c', 'прогресс заказа после цеха (ожидаем ~75%: Montaj входит в %)', JSON.stringify(pct))
// правка заказа в ready: цена/окна заперты
const ed = await rpc(R, 'save_order', { p: { ...payload, id: ord.id, items: payload.items.map((x, i) => ({ ...x, id: its[i].id, width_mm: 999 })) } })
const w999 = n((await sql(`select count(*) c from order_items where order_id='${ord.id}' and width_mm=999`))[0].c)
check('L9', 'в статусе ready размеры окон не меняются задним числом', w999 === 0, JSON.stringify(ed.data || ed.err))

// ---------- 4. монтаж
const asg = await rpc(R, 'assign_install', { p_order: ord.id, p_date: '2026-11-20', p_members: [ids[M]] }); check('L10', 'монтаж назначен', asg.ok, asg.err || '')
const mv = (await get(M, 'w_orders?select=order_no,address')).data; check('L10b', 'монтажник видит заказ (только его)', mv.length === 1 && mv[0].order_no === ord.order_no, JSON.stringify(mv))
r = await rpc(M, 'mark_install', { p_item: its[1].id, p_part: 'frame', p_done: true }); check('L11', 'первая часть окна без фото принимается (фото нужно на последней)', r.ok, r.err || '')
r = await rpc(M, 'mark_install', { p_item: its[1].id, p_part: 'glass', p_done: true }); check('L11b', 'последняя часть окна без фото отклонена', !r.ok && /foto/i.test(r.err), r.err || '')
const up =async (name) => (await fetch(`${URL_}/storage/v1/object/install-photos/${ord.id}/${name}`, { method: 'POST', headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'image/jpeg' }, body: Buffer.from('/9j/4AAQSkZJRg==', 'base64') })).status
for (const [i, it] of its.entries()) {
  await up(`p${i}.jpg`)
  for (const part of (i === 0 ? ['frame', 'glass', 'sill_ebb'] : ['glass'])) {
    r = await rpc(M, 'mark_install', { p_item: it.id, p_part: part, p_done: true, p_photo: `${ord.id}/p${i}.jpg` })
    if (!r.ok) check('L12-' + i + part, `монтаж: ${part} поз.${i + 1}`, false, r.err)
  }
}
const st4 = (await sql(`select status, install_date from orders where id='${ord.id}'`))[0]
check('L12', 'после всех частей: статус installed + дата монтажа', st4.status === 'installed' && !!st4.install_date, JSON.stringify(st4))
const im = n((await sql(`select count(*) c from install_marks where order_item_id in ('${its[0].id}','${its[1].id}')`))[0].c)
check('L12b', 'отметок монтажа 5 (3 + 2), без дублей', im === 5, String(im))
r = await rpc(M, 'mark_install', { p_item: its[0].id, p_part: 'frame', p_done: true, p_photo: `${ord.id}/p0.jpg` }); check('L12c', 'повторная отметка той же части отклонена', !r.ok, r.err || '')
const gl = (await sql(`select glass_status from order_items where id='${its[0].id}'`))[0].glass_status; check('L12d', 'стекло автоматически «installed» по отметке монтажа', gl === 'installed', gl)
const pct2 = (await get(R, `v_order_progress?order_id=eq.${ord.id}&select=percent`)).data[0]; check('L12e', 'прогресс 100% после монтажа', n(pct2.percent) === 100, JSON.stringify(pct2))

// ---------- 5. деньги клиента
const c1 = await cash()
let p = await rpc(R, 'record_payment', { p_order: ord.id, p_amount: 1500000, p_note: '50%' }); check('L13', 'оплата 50%', p.ok, p.err || '')
const dd = await rpc(R, 'record_payment', { p_order: ord.id, p_amount: 1500000, p_note: '50%' }); check('L13b', 'дубль той же оплаты отклонён', !dd.ok, dd.err || '')
const debt = async () => n((await sql(`select o.contract_price - coalesce((select sum(amount) from payments where order_id=o.id),0) d from orders o where o.id='${ord.id}'`))[0].d)
check('L13c', 'долг = договор − оплаты = 1 500 000', (await debt()) === 1500000, String(await debt()))
r = await rpc(R, 'set_order_status', { p_order: ord.id, p_status: 'closed' }); check('L14', 'закрыть с долгом нельзя', !r.ok, r.err || '')
const same = await rpc(R, 'record_payment', { p_order: ord.id, p_amount: 1500000, p_note: 'qoldiq (shu summa)' })
info('L14a', 'остаток на ТУ ЖЕ сумму сразу после первой оплаты (защита от двойного клика)', same.ok ? 'принят' : 'ОТКЛОНЁН: ' + same.err)
if (!same.ok) { await rpc(R, 'record_payment', { p_order: ord.id, p_amount: 1000000, p_note: 'qoldiq 1' }); await rpc(R, 'record_payment', { p_order: ord.id, p_amount: 500000, p_note: 'qoldiq 2' }) }
check('L14b', 'долг 0 после остатка', (await debt()) === 0)
r = await rpc(R, 'set_order_status', { p_order: ord.id, p_status: 'closed' }); check('L14c', 'закрытие при долге 0', r.ok, r.err || '')
const cl = (await sql(`select status, warranty_until, closed_at from orders where id='${ord.id}'`))[0]; check('L14d', 'гарантия +5 лет и closed_at заполнены', !!cl.warranty_until && !!cl.closed_at && cl.warranty_until.startsWith('2031'), JSON.stringify(cl))
check('L15', 'касса выросла ровно на 3 000 000', (await cash()) - c1 === 3000000, String((await cash()) - c1))
const sumPay = n((await sql(`select sum(amount) s from payments where order_id='${ord.id}'`))[0].s); check('L15b', 'Σ оплат заказа = 3 000 000', sumPay === 3000000, String(sumPay))

// ---------- 6. расходы, закупка, поставщик
const c2 = await cash()
const ex = await rpc(R, 'record_expense', { p_category: 1, p_amount: 200000, p_note: 'TEST rent' }); check('L16', 'расход записан', ex.ok, ex.err || '')
check('L16b', 'касса −200 000', c2 - (await cash()) === 200000, String(c2 - (await cash())))
if (ex.ok) { const rv = await rpc(R, 'reverse_expense', { p_id: ex.data, p_note: 'TEST undo' }); check('L16c', 'отмена расхода встречной записью, касса вернулась', rv.ok && (await cash()) === c2, rv.err || '') }
const st0 = await stock()
const pu = await rpc(R, 'record_purchase', { p: { supplier_id: sup.id, lines: [{ item_id: mat.id, qty: 20, unit_cost: 1500 }], paid_now: 10000 } }); check('L17', 'закупка записана', pu.ok, pu.err || '')
check('L17b', 'склад +20 (остаток −11 → 9)', (await stock()) - st0 === 20 && (await stock()) === 9, `${st0} → ${await stock()}`)
const dbt = async () => n((await sql(`select debt from v_supplier_debt where supplier_id='${sup.id}'`))[0].debt)
check('L17c', 'долг поставщику 30 000 − 10 000 = 20 000', (await dbt()) === 20000, String(await dbt()))
const c3 = await cash()
const sp = await rpc(R, 'record_supplier_payment', { p_supplier: sup.id, p_amount: 20000 }); check('L17d', 'оплата поставщику: долг 0, касса −20 000', sp.ok && (await dbt()) === 0 && c3 - (await cash()) === 20000, sp.err || '')
const rp = await rpc(R, 'reverse_purchase', { p_purchase: pu.data, p_note: 'TEST' }); check('L17e', 'отмена закупки возвращает склад (−20)', rp.ok && (await stock()) === -11, rp.err || String(await stock()))

// ---------- 7. сервис и бой
const sv = await rpc(R, 'create_service', { p_order: ord.id, p_item: null, p_description: 'TEST handle', p_assignee: ids[M] }); check('L18', 'сервис-заявка по закрытому заказу', sv.ok, sv.err || '')
if (sv.ok) {
  r = await rpc(M, 'service_work', { p_id: sv.data, p_action: 'start' }); check('L18b', 'монтажник начал заявку', r.ok, r.err || '')
  r = await rpc(M, 'service_work', { p_id: sv.data, p_action: 'done', p_note: 'ok' }); check('L18c', 'монтажник выполнил', r.ok, r.err || '')
  r = await rpc(R, 'close_service', { p_id: sv.data, p_cause: 'TEST', p_payer: 'factory', p_cost: 0 }); check('L18d', 'Rahbar закрыл заявку', r.ok, r.err || '')
}
const c4 = await cash()
const brClosed = await rpc(M, 'record_breakage', { p_item: its[0].id, p_pieces: 1, p_reason: 'TEST' }); check('L19', 'бой на закрытом заказе отклонён (это сервис, а не бой)', !brClosed.ok, brClosed.err || '')
// бой на заказе в работе: второй заказ (2436) → в цех → бой от цеха
const o2items = (await get(R, `order_items?order_id=eq.${o2.id}&select=id`)).data
await rpc(R, 'send_to_shop', { p_order: o2.id })
const br = await rpc(W, 'record_breakage', { p_item: o2items[0].id, p_pieces: 1, p_reason: 'TEST' }); check('L19a', 'бой стекла записан цехом на заказе в работе', br.ok, br.err || '')
const gl2 = (await sql(`select glass_status from order_items where id='${o2items[0].id}'`))[0].glass_status; info('L19b', 'статус стекла после боя (ожидаем «не заказано»)', gl2)
if (br.ok) {
  r = await rpc(R, 'resolve_breakage', { p_id: br.data, p_payer: 'installer', p_amount: 70000, p_employee: ids[M] }); check('L19c', 'бой «платит монтажник» не двигает кассу', r.ok && (await cash()) === c4, r.err || '')
  const cF = await cash(); r = await rpc(R, 'resolve_breakage', { p_id: br.data, p_payer: 'factory', p_amount: 300000 }); info('L19d', 'бой «платит завод» 300 000: изменение кассы', String((await cash()) - cF))
  r = await rpc(R, 'resolve_breakage', { p_id: br.data, p_payer: 'installer', p_amount: 70000, p_employee: ids[M] }); check('L19e', 'смена плательщика обратно: касса вернулась', (await cash()) === cF, String((await cash()) - cF))
}

// ---------- 8. зарплата
await sql(`insert into pay_rules(employee_id,stage_code,basis,amount,valid_from) values ('${ids[W]}','cut','per_window',10000,current_date-5)`)
await sql(`insert into pay_rules(employee_id,basis,amount,valid_from) values ('${ids[W]}','bonus',50000,current_date)`)
const pl = await rpc(R, 'payroll_month', { p_month: '2026-11-01', p_employee: ids[W] }); check('L20', 'зарплата месяца считается', pl.ok, pl.err || '')
const cut = (pl.data || []).filter((x) => /cut|Kesish/i.test(x.label + x.kind))
const cutAmt = cut.reduce((a, x) => a + n(x.amount), 0)
info('L20b', 'начисление «Kesish» (3 окна × 10 000 = 30 000 ожидается)', JSON.stringify(pl.data).slice(0, 400))
check('L20c', 'сумма «Kesish» = 3 × 10 000', cutAmt === 30000, String(cutAmt))
const bonus = (pl.data || []).filter((x) => x.kind === 'bonus').reduce((a, x) => a + n(x.amount), 0); check('L20d', 'премия 50 000 учтена', bonus === 50000, String(bonus))
const ws = await rpc(W, 'payroll_month', { p_month: '2026-11-01', p_employee: ids[R] }); check('L20e', 'цех не видит зарплату другого (только свои строки)', !ws.ok || (ws.data || []).every((x) => x.employee_id === ids[W]), JSON.stringify(ws.data).slice(0, 80))
const mine = await rpc(W, 'payroll_month', { p_month: '2026-11-01' }); check('L20f', 'цех видит свою зарплату', mine.ok && (mine.data || []).every((x) => x.employee_id === ids[W]), mine.err || '')
const c5 = await cash()
const po = await rpc(R, 'record_salary_payout', { p_employee: ids[W], p_amount: 20000, p_period: '2026-11' }); check('L21', 'аванс сотруднику, касса −20 000', po.ok && c5 - (await cash()) === 20000, po.err || '')
const ps = (await rpc(R, 'payroll_summary', { p_month: '2026-11-01' })).data?.find((x) => x.employee_id === ids[W]); check('L21b', 'остаток = начислено − выплачено', ps && n(ps.remaining) === n(ps.accrued) - n(ps.paid), JSON.stringify(ps))

// ---------- 9. отчёт сверяется с заказами
const rep = (await rpc(R, 'monthly_report', { p_month: '2026-11-01' })).data
const db = (await sql(`select count(*) c, coalesce(sum(contract_price),0) rev, coalesce(sum(calc_cost),0) cost from orders where status<>'cancelled' and date_trunc('month',created_at)=date_trunc('month',now())`))[0]
check('L22', 'отчёт: число заказов = базе', rep.orders.count === n(db.c), `${rep.orders.count} vs ${db.c}`)
check('L22b', 'отчёт: выручка = Σ договоров', n(rep.orders.revenue) === n(db.rev), `${rep.orders.revenue} vs ${db.rev}`)
check('L22c', 'отчёт: прибыль = выручка − себестоимость (− потери)', Math.abs(n(rep.profit) - (n(db.rev) - n(db.cost))) < 1 || Math.abs(n(rep.margin) - (n(db.rev) - n(db.cost))) < 1, `profit ${rep.profit} margin ${rep.margin} vs ${n(db.rev) - n(db.cost)}`)
check('L22d', 'отчёт: получено денег = Σ оплат месяца', n(rep.cash.received) === n((await sql(`select coalesce(sum(amount),0) s from payments where date_trunc('month',paid_at)=date_trunc('month',now())`))[0].s), String(rep.cash.received))
check('L22e', 'отчёт: баланс кассы = v_cash_balance', n(rep.cash.balance_now) === (await cash()), `${rep.cash.balance_now} vs ${await cash()}`)
// касса целиком: Δ = Σ оплат − расходы − выплаты − поставщикам
const cashEnd = await cash()
const exp = (await sql(`select (select coalesce(sum(amount),0) from payments)  pay, (select coalesce(sum(amount),0) from expenses where confirmed) ex, (select coalesce(sum(amount),0) from salary_payouts) sal, (select coalesce(sum(amount),0) from supplier_payments) sp`))[0]
check('L23', 'касса = Σ оплат − Σ расходов − Σ зарплат − Σ поставщикам (дельта от старта)', cashEnd - cash0 === n(exp.pay) - n(exp.ex) - n(exp.sal) - n(exp.sp), `${cashEnd - cash0} vs ${n(exp.pay) - n(exp.ex) - n(exp.sal) - n(exp.sp)}`)

// ---------- 10. целостность
const q = async (sqlText) => (await sql(sqlText))
const dupNo = await q(`select order_no, count(*) from orders group by 1 having count(*)>1`); check('I1', 'нет дублей номеров заказов', dupNo.length === 0)
const dupItems = await q(`select order_id,pos,count(*) from order_items group by 1,2 having count(*)>1`); check('I2', 'нет дублей позиций (заказ+pos)', dupItems.length === 0)
const dupMarks = await q(`select order_item_id,stage_id,count(*) from item_stage_marks group by 1,2 having count(*)>1`); check('I3', 'нет дублей отметок этапов', dupMarks.length === 0)
const dupPay = await q(`select order_id,amount,paid_at,count(*) from payments group by 1,2,3 having count(*)>1`); check('I4', 'нет дублей платежей (заказ+сумма+дата)', dupPay.length === 0, JSON.stringify(dupPay))
const orph = await q(`select (select count(*) from order_items i where not exists (select 1 from orders o where o.id=i.order_id)) a, (select count(*) from payments p where not exists (select 1 from orders o where o.id=p.order_id)) b, (select count(*) from orders o where not exists (select 1 from clients c where c.id=o.client_id)) c`)
check('I5', 'нет «сирот» (позиции/оплаты/заказы)', Object.values(orph[0]).every((v) => n(v) === 0), JSON.stringify(orph[0]))
const sumOrd = await q(`select o.order_no, o.windows_count, (select coalesce(sum(qty),0) from order_items where order_id=o.id) q, o.area_m2, (select coalesce(round(sum(area_m2*qty),2),0) from order_items where order_id=o.id) a from orders o where o.id in ('${ord.id}')`)
info('I6', 'заголовок заказа vs Σ позиций (окна/м²) — payload клиента задаёт заголовок, сервер не пересчитывает', JSON.stringify(sumOrd[0]))
const dupNotif = await q(`select text, count(*) c from notifications where created_at > now() - interval '30 minutes' group by text having count(*)>1`); info('I7', 'одинаковые уведомления (возможные дубли)', JSON.stringify(dupNotif.map((x) => [x.text.slice(0, 40), x.c])))
const aud = await q(`select count(*) c from audit_log`); check('I8', 'audit_log пишется', n(aud[0].c) > 0, String(aud[0].c))
const nomig = await q(`select count(*) c from information_schema.tables where table_schema='public'`); info('I9', 'таблиц в схеме public', String(nomig[0].c))
const stk = (await q(`select sum(qty) s from stock_movements where item_id='${mat.id}'`))[0].s; check('I10', 'склад: Σ журнала = остатку в v_stock_balance', n(stk) === n((await q(`select qty from v_stock_balance where item_id='${mat.id}' and part=''`))[0].qty), String(stk))

const fails = (await import('./h.mjs')).results.filter((x) => x.cond === false)
console.log('\nИТОГ: FAIL =', fails.length, fails.map((x) => x.id).join(', '))

