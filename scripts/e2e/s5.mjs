import { sql, rpc, get, write, check, info, sleep } from './h.mjs'
import { readFileSync } from 'fs'
const { oid, itemId } = JSON.parse(readFileSync('ctx.json','utf8'))
const R='t_rah'
const cash = async()=>Number((await sql(`select cash from v_cash_balance`))[0].cash)
const st = async()=>(await sql(`select status, contract_price, closed_at, warranty_until from orders where id='${oid}'`))[0]
// откатить мусорные платежи: найти 50M, 1, 1, 1 и дубль 500k
const ps = await sql(`select id, amount::numeric a from payments where order_id='${oid}' and reverses_id is null order by created_at`)
for (const x of ps) if (Number(x.a)===50000000 || Number(x.a)===1 || (Number(x.a)===500000 && x===ps[2])) { const r = await rpc(R,'reverse_payment',{p_payment:x.id}); console.log('reverse',x.a,r.ok,r.err||'') }
const d = (await sql(`select debt from v_order_paid where order_id='${oid}'`))[0].debt; info('X0','долг после отката мусора', d)
// закрыть с долгом
let c = await rpc(R,'set_order_status',{p_order:oid,p_status:'closed'}); check('X1','закрытие с долгом блокируется', !c.ok, c.err)
// двойной откат
const first = ps[0]; let rr = await rpc(R,'reverse_payment',{p_payment:first.id}); const rr2 = await rpc(R,'reverse_payment',{p_payment:first.id}); check('X2','повторная отмена той же оплаты блокируется', rr.ok && !rr2.ok, rr2.err)
// вернуть платёж обратно
await rpc(R,'record_payment',{p_order:oid,p_amount:1000000})
const debt = Number((await sql(`select debt from v_order_paid where order_id='${oid}'`))[0].debt); info('X3','долг', debt)
await rpc(R,'record_payment',{p_order:oid,p_amount:debt})
c = await rpc(R,'set_order_status',{p_order:oid,p_status:'closed'}); check('X4','закрытие при долге 0', c.ok, c.err||'')
console.log(await st())
// отмена оплаты у закрытого
const lastp = (await sql(`select id from payments where order_id='${oid}' and reverses_id is null and not exists (select 1 from payments r where r.reverses_id=payments.id) order by created_at desc limit 1`))[0].id
await rpc(R,'reverse_payment',{p_payment:lastp}); check('X5','отмена оплаты закрытого заказа → installed', (await st()).status==='installed', JSON.stringify(await st()))
// статусная машина — произвольные переходы
const trans = [['installed','new'],['new','closed'],['closed','new'],['new','in_production'],['in_production','closed'],['closed','cancelled'],['cancelled','installed'],['installed','ready']]
for (const [from,to] of trans) { const r = await rpc(R,'set_order_status',{p_order:oid,p_status:to}); console.log(`  →${to}: ${r.ok?'ПРИНЯТО':'отказ '+r.err}  (стало ${(await st()).status})`) }
