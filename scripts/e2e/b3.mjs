import { sql, rpc, get, check, info, sleep } from './h.mjs'
const R='t_rah'
const items=(n)=>Array.from({length:n},(_,i)=>({pos:i+1,title:'w'+i,width_mm:1000+i*100,height_mm:1200,qty:1,area_m2:1.2,cost:100,design:{w:1},options:{},materials:{items:[]}}))
const mk=(id,over={})=>({id,client:{full_name:'TEST Edit'},contract_price:1000000,calc_cost:500000,items:items(2),...over})
const nots=async()=>Number((await sql(`select count(*) n from notifications`))[0].n)
// новый заказ: свободная правка
let o=(await rpc(R,'save_order',{p:mk(null)})).data; const id=o.id
let it=(await get(R,`order_items?order_id=eq.${id}&select=id,pos&order=pos`)).data
let r=await rpc(R,'save_order',{p:mk(id,{items:items(2).map((x,i)=>({...x,id:it[i].id,width_mm:2000}))})}); check('E1','статус new: свободная правка размеров', r.ok&&!r.data.resent, r.err||JSON.stringify(r.data))
// в цех
await rpc(R,'send_to_shop',{p_order:id}); const n0=await nots()
// только заголовок/название — без повторной отправки
r=await rpc(R,'save_order',{p:mk(id,{notes:'x',items:items(2).map((x,i)=>({...x,id:it[i].id,width_mm:2000,title:'new title'}))})}); check('E2','in_production: смена примечания/названия НЕ шлёт повторно', r.ok&&!r.data.resent&&(await nots())===n0, r.err||JSON.stringify(r.data))
// изменение размера — авто-повтор
r=await rpc(R,'save_order',{p:mk(id,{items:items(2).map((x,i)=>({...x,id:it[i].id,width_mm:i===0?3000:2000}))})}); check('E3','in_production: смена размера → повторная отправка цеху', r.ok&&r.data.resent, r.err||JSON.stringify(r.data))
await sleep(3000); const nt=(await sql(`select left(text,60) t, left(error,60) e from notifications order by created_at desc limit 1`))[0]; check('E4','цех получил «Buyurtma o\'zgardi»', /o'zgardi/.test(nt.t), JSON.stringify(nt))
// договор ниже оплаты
await rpc(R,'record_payment',{p_order:id,p_amount:600000})
r=await rpc(R,'save_order',{p:mk(id,{contract_price:100000,items:items(2).map((x,i)=>({...x,id:it[i].id,width_mm:i===0?3000:2000}))})}); check('E5','договор ниже оплаченного отклонён', !r.ok, r.err)
// отметка этапа и попытка менять окно
const w=(await get('test_ishlab1',`w_order_items?order_id=eq.${id}&select=id,pos&order=pos`)).data
await rpc('test_ishlab1','mark_stage',{p_item:w[0].id,p_stage:1,p_done:true})
r=await rpc(R,'save_order',{p:mk(id,{items:items(2).map((x,i)=>({...x,id:it[i].id,width_mm:i===0?3500:2000}))})}); check('E6','окно с отметкой нельзя менять', !r.ok, r.err)
r=await rpc(R,'save_order',{p:mk(id,{items:items(2).map((x,i)=>({...x,id:it[i].id,width_mm:i===0?3000:2500}))})}); check('E7','окно без отметок менять можно (повтор отправки)', r.ok&&r.data.resent, r.err||JSON.stringify(r.data))
r=await rpc(R,'save_order',{p:mk(id,{items:[]})}); check('E8','нельзя убрать все окна у заказа в цеху', !r.ok, r.err)
// блокировка после ready
await sql(`update orders set status='ready' where id='${id}'`)
r=await rpc(R,'save_order',{p:mk(id,{address:'New addr',notes:'n',contract_price:5,items:items(1)})}); check('E9','ready: сохранён только контакт, цена и окна не тронуты', r.ok&&r.data.locked, r.err||JSON.stringify(r.data))
const after=(await sql(`select contract_price, address, (select count(*) from order_items where order_id='${id}') n from orders where id='${id}'`))[0]; check('E10','цена 1 000 000 и 2 окна сохранены, адрес обновлён', Number(after.contract_price)===1000000&&Number(after.n)===2&&after.address==='New addr', JSON.stringify(after))
