// e2e миграции 058: время смены статуса, история статусов, «Mening ishlarim» (my_work), завершённые заказы у цеха.
// Запуск: из scripts/e2e → node f4.mjs ; потом node cleanup-e2e.mjs
import { ensureUser, sql, rpc, get, check, URL_, SVC } from './h.mjs'

const real = await sql(`select id, telegram_id from employees where role = 'rahbar' and login not like 't\\_%' and telegram_id is not null`)
await sql(`update employees set telegram_id = null where role = 'rahbar' and login not like 't\\_%'`)
const restore = async () => { for (const r of real) await sql(`update employees set telegram_id = ${r.telegram_id} where id = '${r.id}'`) }

try {
  await ensureUser('t_rah', 'T Rahbar', 'rahbar', 9100001)
  for (const [l, n, r, tg] of [['test_ishlab1', 'T Ishlab 1', 'ishlab', 9100002], ['test_ishlab2', 'T Ishlab 2', 'ishlab', 9100003], ['test_mont1', 'T Mont 1', 'montajchi', 9100005], ['test_mont2', 'T Mont 2', 'montajchi', 9100006]]) await ensureUser(l, n, r, tg)
  const R = 't_rah'
  const id = async (login) => (await sql(`select id from employees where login = '${login}'`))[0].id
  const [i1, i2, m1] = await Promise.all(['test_ishlab1', 'test_ishlab2', 'test_mont1'].map(id))
  const item = (pos) => ({ pos, title: 'w' + pos, width_mm: 1000, height_mm: 1500, qty: 1, area_m2: 1.5, cost: 100, design: { width: 1000, height: 1500, shape: 'rect', root: { kind: 'leaf', id: 'a', opening: 'tt_r' } }, options: {}, materials: { items: [], panes: [{ w: 900, h: 1400 }], legend: ['Tizim: TEST'], color: '#f4f4f2' } })
  const o = (await rpc(R, 'save_order', { p: { client: { full_name: 'TEST F4 Mijoz', phone: '+998901112233' }, address: 'TEST manzil', contract_price: 1000000, calc_cost: 500000, windows_count: 2, area_m2: 3, items: [item(1), item(2)] } })).data.id

  const st0 = (await sql(`select status, status_at from orders where id='${o}'`))[0]
  check('H1', 'у нового заказа есть status_at', !!st0.status_at, JSON.stringify(st0))
  const lg0 = await sql(`select status, by_employee from order_status_log where order_id='${o}' order by at`)
  check('H2', 'в истории запись «new» с автором', lg0.length === 1 && lg0[0].status === 'new', JSON.stringify(lg0))

  await new Promise((r) => setTimeout(r, 1200))
  await rpc(R, 'send_to_shop', { p_order: o, p_workers: [i1] })
  const st1 = (await sql(`select status, status_at from orders where id='${o}'`))[0]
  check('H3', 'после отправки в цех status_at обновился', new Date(st1.status_at) > new Date(st0.status_at), `${st0.status_at} → ${st1.status_at}`)
  await rpc('test_ishlab1', 'shop_answer_web', { p_order: o, p_result: 'enough' })
  await rpc('test_ishlab1', 'shop_ready', { p_order: o })
  const lg = await sql(`select l.status, e.login from order_status_log l left join employees e on e.id = l.by_employee where l.order_id='${o}' order by l.at`)
  check('H4', 'история: new → in_production (Rahbar) → ready (цех)', lg.map((x) => x.status).join(',') === 'new,in_production,ready' && lg[2].login === 'test_ishlab1', JSON.stringify(lg))
  check('H5', 'Rahbar читает историю, цех — нет', (await get(R, `order_status_log?order_id=eq.${o}&select=id`)).data.length === 3 && (await get('test_ishlab1', `order_status_log?order_id=eq.${o}&select=id`)).data.length === 0)
  const w = (await get('test_ishlab1', `w_orders?id=eq.${o}&select=status,status_at,client_name`)).data
  check('H6', 'цех видит status_at, имени клиента нет', w[0]?.status_at && w[0].client_name === null, JSON.stringify(w))

  // «Mening ishlarim»
  let r = await rpc('test_ishlab1', 'my_work', { p_month: null })
  let mine = r.data?.orders ?? []
  const row = mine.find((x) => x.id === o)
  check('W1', 'мастер: выполненный заказ в «Mening ishlarim» (с временем «Bajarildi»)', r.ok && row && row.done_at && row.client_name === null && row.phone === null && row.address === null, r.err || JSON.stringify(row))
  r = await rpc('test_ishlab2', 'my_work', { p_month: null })
  check('W2', 'другой мастер чужую работу не видит', r.ok && !(r.data.orders ?? []).some((x) => x.id === o), JSON.stringify(r.data))
  r = await rpc(R, 'my_work', { p_month: null })
  check('W3', 'Rahbar «my_work» недоступен', !r.ok)
  const prev = (await sql(`select to_char(date_trunc('month', current_date) - interval '1 month', 'YYYY-MM-01') d`))[0].d
  r = await rpc('test_ishlab1', 'my_work', { p_month: prev })
  check('W4', 'за прошлый месяц выполненного заказа нет', r.ok && !(r.data.orders ?? []).some((x) => x.id === o))

  // монтаж
  await rpc(R, 'order_glass', { p_order: o, p_status: 'ordered' })
  const job = (await rpc(R, 'assign_install', { p_order: o, p_date: '2026-12-01', p_members: [m1] })).data
  await rpc('test_mont1', 'install_accept', { p_job: job })
  r = await rpc('test_mont1', 'my_work', { p_month: null })
  const mrow = (r.data?.orders ?? []).find((x) => x.id === o)
  check('W5', 'монтажник: заказ в работе (done_at пуст), имя/телефон/адрес есть', mrow && mrow.done_at === null && mrow.client_name === 'TEST F4 Mijoz' && mrow.phone && mrow.address === 'TEST manzil', JSON.stringify(mrow))
  const path = `${o}/install/f4_${Date.now()}.jpg`
  await fetch(`${URL_}/storage/v1/object/install-photos/${path}`, { method: 'POST', headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'image/jpeg' }, body: new Uint8Array([255, 216, 255, 217]) })
  r = await rpc('test_mont1', 'install_done', { p_order: o, p_glass: true, p_photos: [path] })
  check('W6', 'монтажник: «O\'rnatildi» проходит', r.ok, r.err)
  r = await rpc('test_mont1', 'my_work', { p_month: null })
  const mrow2 = (r.data?.orders ?? []).find((x) => x.id === o)
  check('W7', 'монтажник: заказ в «Bajarilgan» (done_at есть)', mrow2 && mrow2.done_at, JSON.stringify(mrow2))
  const wi = (await get('test_ishlab1', `w_orders?id=eq.${o}&select=status`)).data
  check('W8', 'мастер открывает завершённый заказ (w_orders: installed)', wi[0]?.status === 'installed', JSON.stringify(wi))

  // статистика
  const month = (await sql(`select to_char(current_date, 'YYYY-MM-01') m`))[0].m
  r = await rpc('test_ishlab1', 'worker_stats', { p_month: month })
  check('S1', 'worker_stats мастера: 1 заказ, 2 окна', r.ok && r.data.length === 1 && r.data[0].orders === 1 && r.data[0].windows === 2, JSON.stringify(r.data))
  r = await rpc('test_mont1', 'worker_stats', { p_month: month })
  check('S2', 'worker_stats монтажника: 1 заказ', r.ok && r.data.length === 1 && r.data[0].orders === 1, JSON.stringify(r.data))
} finally {
  await restore()
}
