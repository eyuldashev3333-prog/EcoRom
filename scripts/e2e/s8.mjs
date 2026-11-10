import { sql, rpc, get, write, check, info } from './h.mjs'
import { readFileSync } from 'fs'
const { itemId } = JSON.parse(readFileSync('ctx.json','utf8'))
const R='t_rah'
const cash = async()=>Number((await sql(`select cash from v_cash_balance`))[0].cash)
const sup = await write(R,'POST','suppliers',{name:'TEST Supplier',city:'X'}); const sid = sup.data[0].id
const c0 = await cash()
let p = await rpc(R,'record_purchase',{p:{supplier_id:sid,lines:[{item_id:itemId,qty:100,unit_cost:2000}],delivery_cost:50000,paid_now:50000}}); check('Z1','закупка 100×2000 + доставка 50 000, оплачено 50 000', p.ok, p.err||'')
const debt = async()=>(await sql(`select * from v_supplier_debt where supplier_id='${sid}'`))[0]
console.log('debt', JSON.stringify(await debt()))
info('Z2','касса изменилась на', (await cash())-c0)
const stock = async()=>Number((await sql(`select coalesce(sum(qty),0) s from stock_movements where item_id='${itemId}'`))[0].s); info('Z3','остаток TEST detal (−8 расход +100)', await stock())
// отмена закупки двойная
const r1 = await rpc(R,'reverse_purchase',{p_purchase:p.data}); const r2 = await rpc(R,'reverse_purchase',{p_purchase:p.data}); check('Z4','повторная отмена закупки блокируется', r1.ok&&!r2.ok, r2.err)
console.log('debt after reverse', JSON.stringify(await debt()), 'stock', await stock(), 'cash delta', (await cash())-c0)
// оплата поставщику без долга
const sp = await rpc(R,'record_supplier_payment',{p_supplier:sid,p_amount:300000}); check('Z5','оплата поставщику сверх долга (аванс) принимается', sp.ok); console.log('debt', JSON.stringify(await debt()))
// закупка в пустую строку, нулевые
for (const [n,body] of [['пустой',{supplier_id:sid,lines:[]}],['цена 0',{supplier_id:sid,lines:[{item_id:itemId,qty:1,unit_cost:0}]}],['qty -1',{supplier_id:sid,lines:[{item_id:itemId,qty:-1,unit_cost:5}]}],['paid>total',{supplier_id:sid,lines:[{item_id:itemId,qty:1,unit_cost:100}],paid_now:999999}]]) { const x = await rpc(R,'record_purchase',{p:body}); console.log('  purchase',n,x.ok?'ПРИНЯТО':'отказ '+x.err) }
// инвентаризация
const sc = await rpc(R,'stock_count',{p:{lines:[{item_id:itemId,part:'',fact:50}],note:'TEST'}}); console.log('stock_count', JSON.stringify(sc.data), 'остаток', await stock())
await import('fs').then(f=>f.writeFileSync('ctx2.json', JSON.stringify({sid})))
