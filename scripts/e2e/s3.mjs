import { sql, rpc, get, write, check, info, sleep } from './h.mjs'
import { readFileSync } from 'fs'
const { oid } = JSON.parse(readFileSync('ctx.json','utf8'))
const R='t_rah'
const last = async (n=3)=> sql(`select target_role, employee_id, sent_at is not null sent, left(coalesce(error,''),50) err, left(text,70) t from notifications order by created_at desc limit ${n}`)
const items = (await get('test_ishlab1',`w_order_items?order_id=eq.${oid}&select=id,pos,qty&order=pos`)).data
const j = await get('test_montaj2','w_orders?select=order_no'); check('I1','монтажник2 не видит чужой заказ', !(j.data||[]).some(x=>x.order_no===2441), JSON.stringify(j.data))
const j1 = await get('test_montaj1','w_orders?select=order_no,address,contact_phone,client_name'); check('I2','монтажник1 видит свой', (j1.data||[]).some(x=>x.order_no===2441), JSON.stringify(j1.data))
// не назначенный пытается отметить
let m = await rpc('test_montaj2','mark_install',{p_item:items[0].id,p_part:'frame',p_done:true}); check('I3','чужой монтажник не отмечает', !m.ok, m.err)
// назначенный
m = await rpc('test_montaj1','mark_install',{p_item:items[0].id,p_part:'frame',p_done:true}); console.log('mark frame no photo', m.ok, m.err||JSON.stringify(m.data))
// поддельное фото
m = await rpc('test_montaj1','mark_install',{p_item:items[0].id,p_part:'glass',p_done:true,p_photo:`${oid}/FAKE-does-not-exist.jpg`}); check('I4','фото-проверка: несуществующий файл принят?', !m.ok, m.ok?'ПРИНЯТО фейковое фото: '+JSON.stringify(m.data):m.err)
const parts = (await sql(`select part, photo_path from install_marks`)); console.log(parts)
// бой стекла
let b = await rpc('test_montaj1','record_breakage',{p_item:items[0].id,p_pieces:1,p_reason:'TEST razbil'}); check('B1','бой стекла записан монтажником', b.ok, b.err||'')
await sleep(3500); console.log(await last(2))
b = await rpc('test_montaj1','record_breakage',{p_item:items[0].id,p_pieces:5,p_reason:'TEST too many'}); check('B2','бой > qty отклонён', !b.ok, b.err)
// остальное монтаж
for (const it of items) for (const part of ['frame','glass']) { const x = await rpc('test_montaj1','mark_install',{p_item:it.id,p_part:part,p_done:true,p_photo:`${oid}/f-${it.pos}.jpg`}); if(!x.ok && !/Allaqachon/.test(x.err)) console.log('mark',it.pos,part,x.err) }
const o = (await get(R,`orders?id=eq.${oid}&select=status,install_date,contract_price`)).data[0]; console.log('order', o)
await sleep(3500); console.log(await last(3))
info('I5','итоговый статус после всех отметок', o.status)
