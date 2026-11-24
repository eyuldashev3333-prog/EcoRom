// Готовит тестовый заказ «Tayyor» с назначенной установкой (для скриншота экрана монтажника). Потом cleanup-e2e.mjs.
import { sql, rpc } from './h.mjs'
const id = async (login) => (await sql(`select id from employees where login = '${login}'`))[0].id
const [i1, m1] = await Promise.all(['test_ishlab1', 'test_mont1'].map(id))
const item = (pos) => ({ pos, title: 'w' + pos, width_mm: 1000, height_mm: 1500, qty: 1, area_m2: 1.5, cost: 100, design: { width: 1000, height: 1500, shape: 'rect', root: { kind: 'leaf', id: 'a', opening: 'tt_r' } }, options: {}, materials: { items: [], panes: [{ w: 900, h: 1400 }], legend: ['Tizim: 6000-Kuatro (Ok)', 'Oyna paket: Paket (Ok+Ok)', 'Rang: oq'], color: '#f4f4f2' } })
const o = (await rpc('t_rah', 'save_order', { p: { client: { full_name: 'TEST F1 ready' }, contract_price: 1000000, calc_cost: 500000, items: [item(1)] } })).data.id
await rpc('t_rah', 'send_to_shop', { p_order: o, p_workers: [i1] })
await rpc('test_ishlab1', 'shop_answer_web', { p_order: o, p_result: 'enough' })
await rpc('test_ishlab1', 'shop_ready', { p_order: o })
const today = (await sql(`select current_date::text d`))[0].d
const r = await rpc('t_rah', 'assign_install', { p_order: o, p_date: today, p_members: [m1] })
console.log('ready order', o, r.ok ? 'assigned' : r.err)
