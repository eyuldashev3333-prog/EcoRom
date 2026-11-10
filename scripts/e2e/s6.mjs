import { sql, rpc, get, write, check, info, sleep } from './h.mjs'
import { readFileSync } from 'fs'
const { oid, itemId } = JSON.parse(readFileSync('ctx.json','utf8'))
const R='t_rah'
const cur = (await get(R,`orders?id=eq.${oid}&select=*,order_items(*)`)).data[0]
const nB = (await sql(`select count(*) n from notifications`))[0].n
const stockSum = async()=>Number((await sql(`select coalesce(sum(qty),0) s from stock_movements where order_id='${oid}'`))[0].s)
info('E0','расход склада до правки', await stockSum())
const items = cur.order_items.sort((a,b)=>a.pos-b.pos).map(i=>({id:i.id,pos:i.pos,title:i.title,width_mm:i.width_mm,height_mm:i.height_mm,qty:i.qty,area_m2:i.area_m2,cost:i.cost,design:i.design,options:i.options,materials:i.materials,calc:i.calc}))
// правка в статусе ready: цена вниз, размеры другие, qty 2→1, материалы x10
items[0].qty=1; items[0].width_mm=3000; items[0].materials={items:[{item_id:itemId,name:'TEST detal',qty:30,part:''}]}
const body = { id:oid, client:{id:cur.client_id, full_name:'TEST Mijoz A', phone:'+998901112233'}, address:cur.address, deadline:cur.deadline, windows_count:2, area_m2:4, calc_cost:1, markup:0.37, calc_suggested:1, discount_pct:0, contract_price:100, items }
let s = await rpc(R,'save_order',{p:body}); check('E1','save_order на заказе в работе (ready): принят молча', s.ok, s.err||'контракт 4 000 000 → 100 без предупреждений')
const o2 = (await get(R,`orders?id=eq.${oid}&select=status,contract_price,windows_count,shop_sent_at`)).data[0]; console.log(o2)
info('E2','склад после правки (должен был измениться)', await stockSum())
await sleep(3000)
const nA = (await sql(`select count(*) n from notifications`))[0].n; check('E3','цех уведомлён об изменении заказа в работе', nA>nB, `уведомлений: было ${nB}, стало ${nA}`)
const wi = (await get('test_ishlab1',`w_order_items?order_id=eq.${oid}&select=pos,width_mm,qty`)).data; console.log('цех видит теперь', JSON.stringify(wi))
// пустой заказ / нулевые
let z = await rpc(R,'save_order',{p:{...body, id:undefined, client:{full_name:'TEST Z'}, items:[]}}); info('E4','заказ без позиций сохраняется?', z.ok?'да, order_no '+z.data.order_no:z.err)
z = await rpc(R,'save_order',{p:{...body, id:undefined, client:{full_name:'TEST Z2'}, contract_price:-1000000, discount_pct:500, items:[{pos:1,title:'x',width_mm:-5,height_mm:0,qty:-3,area_m2:-1,cost:-5}]}}); info('E5','отрицательные цена/qty/размеры принимаются?', z.ok?'ДА принято '+JSON.stringify(z.data):z.err)
// два заказа одновременно: номера
const [p1,p2] = await Promise.all([1,2].map(i=>rpc(R,'save_order',{p:{client:{full_name:'TEST Race '+i},contract_price:1,items:[{pos:1,title:'a',width_mm:1000,height_mm:1000,qty:1}]}}))); check('E6','параллельное создание — разные номера', p1.data.order_no!==p2.data.order_no, p1.data.order_no+' / '+p2.data.order_no)
// дубликат клиента по телефону
const a = await rpc(R,'save_order',{p:{client:{full_name:'TEST Dup',phone:'+998901112233'},contract_price:1,items:[{pos:1,title:'a',width_mm:1000,height_mm:1000,qty:1}]}})
const cc = await sql(`select count(*) n from clients where phone='+998901112233'`); info('E7','клиентов с одним телефоном', cc[0].n)
await import('fs').then(f=>f.writeFileSync('extra.json', JSON.stringify({ids:[z.data?.id,p1.data.id,p2.data.id,a.data.id].filter(Boolean)})))
