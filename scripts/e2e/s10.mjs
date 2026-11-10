import { sql, rpc, get, write, check, info, sleep } from './h.mjs'
import { readFileSync } from 'fs'
const { oid } = JSON.parse(readFileSync('ctx.json','utf8'))
const R='t_rah'
const cash = async()=>Number((await sql(`select cash from v_cash_balance`))[0].cash)
const c0 = await cash()
const bk = (await sql(`select id, payer, amount, decided from glass_breakages where order_id='${oid}'`))[0]; console.log('breakage', JSON.stringify(bk))
let r = await rpc(R,'resolve_breakage',{p_id:bk.id,p_payer:'factory',p_amount:500000}); check('BR1','бой «платит завод» 500 000', r.ok, r.err||'')
check('BR2','касса −500 000', (await cash())-c0===-500000, String((await cash())-c0))
r = await rpc(R,'resolve_breakage',{p_id:bk.id,p_payer:'client',p_amount:500000}); check('BR3','смена на «клиент» → расход отменён', (await cash())-c0===0, String((await cash())-c0))
r = await rpc(R,'resolve_breakage',{p_id:bk.id,p_payer:'installer',p_amount:700000,p_employee:(await sql(`select id from employees where login='test_montaj1'`))[0].id}); check('BR4','платит монтажник — удержание', r.ok, r.err||'')
const pl = await sql(`select kind,label,amount from payroll_lines('2026-11-01') pl join employees e on e.id=pl.employee_id where e.login='test_montaj1' and kind='breakage'`); console.log(pl)
// сервис
const item = (await sql(`select id from order_items where order_id='${oid}' order by pos limit 1`))[0].id
let s = await rpc(R,'create_service',{p_order:oid,p_item:item,p_description:'TEST ruchka'}); check('SV1','заявка создана', s.ok, s.err||'')
const m1 = (await sql(`select id from employees where login='test_montaj1'`))[0].id
const sid = s.data
r = await rpc(R,'assign_service',{p_id:sid,p_assignee:m1}); check('SV2','назначен исполнитель', r.ok, r.err||'')
r = await rpc('test_montaj2','service_work',{p_id:sid,p_action:'start'}); check('SV3','чужой монтажник не может начать работу', !r.ok, r.err||JSON.stringify(r.data))
r = await rpc('test_montaj1','service_work',{p_id:sid,p_action:'start'}); check('SV4','исполнитель начинает', r.ok, r.err||'')
r = await rpc('test_montaj1','service_work',{p_id:sid,p_action:'done',p_note:'ok'}); check('SV5','исполнитель завершает', r.ok, r.err||'')
r = await rpc('test_montaj1','close_service',{p_id:sid,p_cause:'x',p_payer:'factory',p_cost:1}); check('SV6','монтажник не может закрыть заявку (деньги)', !r.ok, r.err||'')
const c1 = await cash()
r = await rpc(R,'close_service',{p_id:sid,p_cause:'TEST sabab',p_payer:'factory',p_cost:200000}); check('SV7','закрытие, платит завод 200 000', r.ok, r.err||'')
check('SV8','касса −200 000', (await cash())-c1===-200000, String((await cash())-c1))
r = await rpc(R,'close_service',{p_id:sid,p_cause:'again',p_payer:'factory',p_cost:200000}); check('SV9','повторное закрытие блокируется (нет двойного расхода)', !r.ok, r.err||'')
// сервис на неустановленном заказе
const fresh = (await sql(`select id from orders where order_no=2442`))[0].id
r = await rpc(R,'create_service',{p_order:fresh,p_item:null,p_description:'TEST on empty order'}); info('SV10','сервис на заказе в статусе new принимается?', r.ok?'ДА принято':r.err)
// возврат предоплаты
const o = await rpc(R,'save_order',{p:{client:{full_name:'TEST Refund'},contract_price:1000000,items:[{pos:1,title:'a',width_mm:1000,height_mm:1000,qty:1}]}}); const rid=o.data.id
const pay = await rpc(R,'record_payment',{p_order:rid,p_amount:600000})
const cr = await cash()
r = await rpc(R,'refund_payment',{p_payment:pay.data,p_amount:100000}); check('RF1','возврат только у отменённого', !r.ok, r.err||'')
await rpc(R,'set_order_status',{p_order:rid,p_status:'cancelled'})
r = await rpc(R,'refund_payment',{p_payment:pay.data,p_amount:700000}); check('RF2','возврат больше платежа отклонён', !r.ok, r.err||'')
r = await rpc(R,'refund_payment',{p_payment:pay.data,p_amount:250000}); check('RF3','частичный возврат 250 000', r.ok, r.err||'')
r = await rpc(R,'refund_payment',{p_payment:pay.data,p_amount:100000}); check('RF4','второй возврат того же платежа блокируется', !r.ok, r.err||'')
check('RF5','касса −250 000', (await cash())-cr===-250000, String((await cash())-cr))
const v = (await sql(`select contract_price, paid, debt from v_order_paid where order_id='${rid}'`))[0]; info('RF6','отменённый заказ: договор/оплачено/долг', JSON.stringify(v))
const dd = await rpc(R,'set_order_status',{p_order:rid,p_status:'new'}); info('RF7','отменённый заказ можно вернуть в new', dd.ok?'да':dd.err)
await import('fs').then(f=>f.writeFileSync('ctx3.json', JSON.stringify({rid, sid})))
