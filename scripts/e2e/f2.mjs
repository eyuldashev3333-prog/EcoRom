// e2e миграции 056: приход на складе «+ Kirim» (stock_receive / stock_receive_undo).
// Запуск: из scripts/e2e → node f2.mjs ; потом node cleanup-e2e.mjs
import { ensureUser, sql, rpc, get, check } from './h.mjs'

await ensureUser('t_rah', 'T Rahbar', 'rahbar', 9100001)
await ensureUser('test_ishlab1', 'T Ishlab 1', 'ishlab', 9100002)
const [it] = await sql(`select id from catalog_items where name = 'Otliv oq 200' and kind = 'ebb' limit 1`)
const bal = async () => Number((await sql(`select coalesce(sum(qty),0) q from stock_movements where item_id='${it.id}' and part=''`))[0].q)
const cash = async () => Number((await sql(`select cash from v_cash_balance`))[0].cash)
const q0 = await bal(), c0 = await cash()

let r = await rpc('test_ishlab1', 'stock_receive', { p_item: it.id, p_part: '', p_qty: 10, p_total: 500000, p_note: 'TEST kirim' })
check('R1', 'не-Rahbar приход не пишет', !r.ok, r.err)
r = await rpc('t_rah', 'stock_receive', { p_item: it.id, p_part: '', p_qty: 0, p_total: 500000 })
check('R2', 'нулевое количество — отказ', !r.ok, r.err)
r = await rpc('t_rah', 'stock_receive', { p_item: it.id, p_part: '', p_qty: 10, p_total: 0 })
check('R3', 'нулевая сумма — отказ', !r.ok, r.err)

r = await rpc('t_rah', 'stock_receive', { p_item: it.id, p_part: '', p_qty: 10, p_total: 500000, p_note: 'TEST kirim' })
check('R4', 'приход записан', r.ok && typeof r.data === 'string', r.err)
const p = r.data
check('R5', 'остаток +10', (await bal()) === q0 + 10)
check('R6', 'касса −500 000', (await cash()) === c0 - 500000, `${c0} → ${await cash()}`)
const row = (await get('t_rah', `v_stock_balance?item_id=eq.${it.id}&part=eq.&select=qty`)).data
check('R7', 'v_stock_balance показывает новый остаток', Number(row[0]?.qty) === q0 + 10, JSON.stringify(row))
const pi = await sql(`select qty, unit_cost from purchase_items where purchase_id='${p}'`)
check('R8', 'цена за единицу = сумма / количество (50 000)', Number(pi[0]?.unit_cost) === 50000, JSON.stringify(pi))

r = await rpc('t_rah', 'stock_receive_undo', { p_purchase: p })
check('U1', 'отмена прихода', r.ok, r.err)
check('U2', 'остаток вернулся', (await bal()) === q0)
check('U3', 'касса вернулась', (await cash()) === c0, `${await cash()} vs ${c0}`)
r = await rpc('t_rah', 'stock_receive_undo', { p_purchase: p })
check('U4', 'повторная отмена — отказ', !r.ok, r.err)
