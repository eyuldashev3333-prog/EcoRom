import { sql, rpc, get, write, check, info } from './h.mjs'
import { readFileSync } from 'fs'
const [A,B,C] = JSON.parse(readFileSync('ctx_b1.json','utf8')).ids
const R='t_rah'
const cash = async()=>Number((await sql(`select cash from v_cash_balance`))[0].cash)
const stat = async(id)=>(await sql(`select status, warranty_until from orders where id='${id}'`))[0]
// контракт A = 1 000 000
let p = await rpc(R,'record_payment',{p_order:A,p_amount:400000}); check('P1','оплата 400 000', p.ok, p.err||'')
let r = await rpc(R,'record_payment',{p_order:A,p_amount:700000}); check('P2','переплата 700 000 при долге 600 000 отклонена', !r.ok, r.err)
r = await rpc(R,'record_payment',{p_order:A,p_amount:400000}); check('P3','дубль (та же сумма за 2 мин) отклонён', !r.ok, r.err)
const [x,y] = await Promise.all([rpc(R,'record_payment',{p_order:A,p_amount:100000}),rpc(R,'record_payment',{p_order:A,p_amount:100000})]); check('P4','одновременный двойной клик — прошёл ровно один', [x.ok,y.ok].filter(Boolean).length===1, `x=${x.ok} y=${y.ok} ${x.err||y.err||''}`)
r = await rpc(R,'record_payment',{p_order:A,p_amount:500000}); check('P5','платёж = остатку 500 000 принят', r.ok, r.err||'')
r = await rpc(R,'record_payment',{p_order:A,p_amount:1000,p_advance:false}); check('P6','после полной оплаты любой платёж без avans отклонён', !r.ok, r.err)
r = await rpc(R,'record_payment',{p_order:A,p_amount:1000,p_advance:true}); check('P7','avans принят и помечен в примечании', r.ok, r.err||''); console.log((await sql(`select note, amount from payments where order_id='${A}' order by created_at desc limit 1`))[0])
for (const dt of ['2099-01-01','1900-01-01']) { r = await rpc(R,'record_payment',{p_order:B,p_amount:5,p_date:dt}); check('P8-'+dt,'дата '+dt+' отклонена', !r.ok, r.err) }
const ins = await write(R,'POST','payments',{order_id:B,amount:5}); check('P9','прямая вставка в payments запрещена', !ins.ok, ins.status)
const ins2 = await write(R,'PATCH','payments?amount=gt.0',{amount:1}); check('P10','прямая правка payments запрещена', !ins2.ok, ins2.status)
// закрытие/переоткрытие
await sql(`update orders set status='installed' where id='${A}'`)
// правка суммы платежа сверх
const pid=(await sql(`select id from payments where order_id='${A}' and reverses_id is null order by created_at limit 1`))[0].id
r = await rpc(R,'payment_correct',{p_id:pid,p_field:'amount',p_value:'5000000'}); check('P11','исправление суммы сверх договора отклонено', !r.ok, r.err)
r = await rpc(R,'payment_correct',{p_id:pid,p_field:'date',p_value:'2099-01-01'}); check('P12','исправление даты в будущее отклонено', !r.ok, r.err)
r = await rpc(R,'payment_correct',{p_id:pid,p_field:'bogus',p_value:'1'}); check('P13','исправление неизвестного поля отклонено', !r.ok, r.err)
// avans reverse → debt? contract 1 000 000 paid 1 001 000 → debt<0, close allowed? debt>0 only blocks
r = await rpc(R,'set_order_status',{p_order:A,p_status:'closed'}); check('P14','закрытие при оплате ≥ договор', r.ok, r.err||''); console.log(await stat(A))
const last=(await sql(`select id from payments where order_id='${A}' and reverses_id is null order by created_at limit 1`))[0].id
await rpc(R,'reverse_payment',{p_payment:last}); const s=await stat(A); check('P15','отмена оплаты закрытого → installed и гарантия сброшена', s.status==='installed'&&s.warranty_until===null, JSON.stringify(s))
// статусы
const tr = [[C,'installed',false],[C,'closed',false],[C,'in_production',false],[C,'cancelled',true],[C,'installed',false],[C,'new',true],[A,'new',false],[A,'cancelled',false],[A,'closed',false],[A,'new',false],[A,'installed',true]]
for (const [id,to,exp] of tr) { const x = await rpc(R,'set_order_status',{p_order:id,p_status:to}); check(`ST ${id===C?'C':'A'}→${to}`,`переход → ${to} ${exp?'разрешён':'запрещён'}`, x.ok===exp, x.err||'') }
// CHECK
let c = await write(R,'PATCH',`orders?id=eq.${B}`,{contract_price:-1}); check('K1','contract_price < 0 отклонён', !c.ok, c.status)
c = await write(R,'PATCH',`orders?id=eq.${B}`,{discount_pct:90}); check('K2','скидка 90% отклонена', !c.ok, c.status)
c = await write(R,'PATCH',`order_items?order_id=eq.${B}`,{qty:0}); check('K3','qty=0 отклонён', !c.ok, c.status)
c = await rpc(R,'save_order',{p:{client:{full_name:'TEST neg'},contract_price:1,items:[{pos:1,title:'x',width_mm:1000,height_mm:1000,qty:-3}]}}); check('K4','save_order с qty -3 отклонён базой', !c.ok, c.err)
c = await rpc(R,'save_order',{p:{client:{full_name:'TEST neg2'},contract_price:-1000,items:[{pos:1,title:'x',width_mm:1000,height_mm:1000,qty:1}]}}); check('K5','save_order с отрицательной ценой отклонён', !c.ok, c.err)
// возврат после отмены
const o = (await rpc(R,'save_order',{p:{client:{full_name:'TEST refund'},contract_price:1000000,items:[{pos:1,title:'x',width_mm:1000,height_mm:1000,qty:1}]}})).data
const pay = await rpc(R,'record_payment',{p_order:o.id,p_amount:600000}); await rpc(R,'set_order_status',{p_order:o.id,p_status:'cancelled'})
const c0=await cash(); r = await rpc(R,'refund_payment',{p_payment:pay.data,p_amount:250000}); check('RF','возврат 250 000 работает, касса −250 000', r.ok && (await cash())-c0===-250000, r.err||'')
