import { sql, rpc, get, write, check, info, sleep } from './h.mjs'
import { readFileSync } from 'fs'
const { oid } = JSON.parse(readFileSync('ctx.json','utf8'))
const R='t_rah'
const last = async (n=3)=> sql(`select target_role, employee_id, sent_at is not null sent, left(coalesce(error,''),60) err, left(text,60) t from notifications order by created_at desc limit ${n}`)
// ответы цеха
let a = await rpc('svc','shop_answer',{p_tg:900000001,p_order:oid,p_result:'enough'}); check('M1','ishlab1 отвечает «хватает»', a.ok&&a.data.ok, JSON.stringify(a.data))
a = await rpc('svc','shop_answer',{p_tg:900000002,p_order:oid,p_result:'not_enough'}); check('M2','ishlab2 «не хватает» → нужна причина', a.ok&&a.data.need_reason, JSON.stringify(a.data))
let r = await rpc('svc','shop_reason',{p_tg:900000002,p_text:'TEST: tugadi profil'}); console.log('shop_reason', JSON.stringify(r.data))
await sleep(5000); console.log(await last(3))
// посторонний
a = await rpc('svc','shop_answer',{p_tg:123,p_order:oid,p_result:'enough'}); check('M3','посторонний telegram_id отклонён', a.ok&&a.data.ok===false, JSON.stringify(a.data))
// монтажник отвечает на материал
a = await rpc('svc','shop_answer',{p_tg:900000003,p_order:oid,p_result:'enough'}); check('M4','монтажник не может отвечать за материал', a.ok&&a.data.ok===false, JSON.stringify(a.data))
// ishlab1 пытается ответить через сайт-токен
a = await rpc('test_ishlab1','shop_answer',{p_tg:900000001,p_order:oid,p_result:'enough'}); check('M5','shop_answer недоступен с токеном пользователя (иначе можно подделать чужой tg)', !a.ok||a.data?.ok===false, a.status+' '+JSON.stringify(a.data).slice(0,100))
// отметки
const items = (await get('test_ishlab1',`w_order_items?order_id=eq.${oid}&select=id,pos,qty&order=pos`)).data
const stg = (await get('test_ishlab1','stages?select=id,code,role,is_active,name&order=sort')).data; console.log(JSON.stringify(stg))
const S = Object.fromEntries(stg.map(s=>[s.code,s.id]))
let m = await rpc('test_ishlab1','mark_stage',{p_item:items[0].id,p_stage:S.cut,p_done:true}); check('P1','ishlab1 отмечает Kesish поз.1', m.ok, JSON.stringify(m.data))
m = await rpc('test_ishlab2','mark_stage',{p_item:items[0].id,p_stage:S.cut,p_done:true}); check('P2','повторная отметка чужого этапа отклонена', !m.ok, m.err)
m = await rpc('test_ishlab2','mark_stage',{p_item:items[0].id,p_stage:S.cut,p_done:false}); check('P3','снять чужую отметку нельзя', !m.ok, m.err)
m = await rpc('test_montaj1','mark_stage',{p_item:items[0].id,p_stage:S.cut,p_done:true}); check('P4','монтажник не отмечает этап цеха', !m.ok, m.err)
m = await rpc('test_ishlab1','mark_stage',{p_item:items[0].id,p_stage:S.install,p_done:true}); check('P5','цех не отмечает Montaj', !m.ok, m.err)
for (const code of ['cut','assemble','glass_fit']) for (const it of items) { if(code==='cut'&&it===items[0]) continue; m = await rpc('test_ishlab1','mark_stage',{p_item:it.id,p_stage:S[code],p_done:true}); if(!m.ok) console.log('ERR',code,it.pos,m.err) }
let st = (await get(R,`orders?id=eq.${oid}&select=status`)).data[0].status; check('P6','все этапы цеха → ready', st==='ready', st)
await sleep(4000); console.log(await last(2))
// снять отметку → in_production
m = await rpc('test_ishlab1','mark_stage',{p_item:items[1].id,p_stage:S.glass_fit,p_done:false}); st = (await get(R,`orders?id=eq.${oid}&select=status`)).data[0].status; check('P7','снятие отметки → in_production', st==='in_production', st)
await rpc('test_ishlab1','mark_stage',{p_item:items[1].id,p_stage:S.glass_fit,p_done:true})
// отметка по позиции чужого (старого, закрытого) заказа
const old = (await get(R,`order_items?select=id&limit=1`)).data[0]
console.log('order_items total for rahbar', (await get(R,'order_items?select=id')).data.length)
// установка: назначение
const ij = await rpc(R,'assign_install',{p_order:oid,p_members:[(await sql(`select id from employees where login='test_montaj1'`))[0].id],p_date:'2026-11-12',p_note:'TEST'}); console.log('assign_install', ij.status, JSON.stringify(ij.data).slice(0,200))
await sleep(4000); console.log(await last(2))
