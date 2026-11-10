import { sql, rpc, get, write, check, info, sleep } from './h.mjs'
import { readFileSync } from 'fs'
const { oid } = JSON.parse(readFileSync('ctx.json','utf8'))
const R='t_rah'
const cash = async()=>Number((await sql(`select cash from v_cash_balance`))[0].cash)
const debt = async()=>Number((await sql(`select debt, paid from v_order_paid where order_id='${oid}'`))[0].debt)
const c0 = await cash(); info('C0','касса до', c0)
let p = await rpc(R,'record_payment',{p_order:oid,p_amount:1000000}); check('MP1','платёж 1 000 000', p.ok, p.err||'')
check('MP2','касса +1 000 000', (await cash())-c0===1000000)
// двойной клик
const [a,b] = await Promise.all([rpc(R,'record_payment',{p_order:oid,p_amount:500000}), rpc(R,'record_payment',{p_order:oid,p_amount:500000})])
check('MP3','два одинаковых платежа подряд (двойной клик) — система защищает?', !(a.ok&&b.ok), `a=${a.ok} b=${b.ok} — оба прошли = нет защиты от дубля`)
// переплата
const d1 = await debt(); info('MP4','долг сейчас', d1)
p = await rpc(R,'record_payment',{p_order:oid,p_amount:50000000}); check('MP5','платёж 50 000 000 при долге '+d1+' — отклонён?', !p.ok, p.ok?'ПРИНЯТ, долг теперь '+(await debt()):p.err)
// мусор
for (const [n,v] of [['0',0],['-5',-5],['null',null],['1e20',1e20],['0.001',0.001],['1e15',1e15]]) { const x = await rpc(R,'record_payment',{p_order:oid,p_amount:v}); console.log('  amount',n,'→',x.ok?'ПРИНЯТ':'отклонён',x.err||'') }
for (const dt of ['1900-01-01','2099-01-01','2026-10-01']) { const x = await rpc(R,'record_payment',{p_order:oid,p_amount:1,p_date:dt}); console.log('  date',dt,'→',x.ok?'ПРИНЯТ':'отклонён',x.err||'') }
console.log('cash delta', (await cash())-c0, 'debt', await debt())
// все платежи заказа
const pays = (await sql(`select amount::numeric, paid_at, reverses_id is not null rev from payments where order_id='${oid}' order by created_at`)); console.log(JSON.stringify(pays))
