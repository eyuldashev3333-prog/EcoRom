import { sql, rpc, get, write, check, info, sleep, results } from './h.mjs'
const R='t_rah'
// каталог TEST
let cat = await write(R,'POST','catalog_items',{kind:'misc',name:'TEST detal',unit:'pcs',price:1000,stock_tracked:true})
console.log('cat', cat.status, JSON.stringify(cat.data).slice(0,200))
const itemId = cat.data[0]?.id
const mk = (over={}) => ({ client:{full_name:'TEST Mijoz A', phone:'+998901112233'}, address:'TEST addr', deadline:'2026-12-01', windows_count:3, area_m2:5.4,
  calc_cost:3000000, markup:0.37, calc_suggested:4110000, discount_pct:0, contract_price:4000000,
  items:[{pos:1,title:'W1',width_mm:1500,height_mm:1200,qty:2,area_m2:3.6,cost:2000000,materials:{items:[{item_id:itemId,name:'TEST detal',qty:3,part:''}]}},
         {pos:2,title:'W2',width_mm:1000,height_mm:1000,qty:1,area_m2:1,cost:1000000,materials:{items:[{item_id:itemId,name:'TEST detal',qty:2,part:''}]}}], ...over })
const s = await rpc(R,'save_order',{p:mk()})
check('O1','save_order создаёт заказ', s.ok && s.data.order_no, JSON.stringify(s.data))
const oid = s.data.id
let o = (await get(R,`orders?id=eq.${oid}&select=*`)).data[0]
check('O2','новый заказ: статус new и не показан цеху', o.status==='new')
const w1 = await get('test_ishlab1','w_orders?select=*'); 
check('O3','цех не видит заказ до отправки', !(w1.data||[]).some(x=>x.id===oid), 'w_orders rows='+(w1.data||[]).length)
const direct = await get('test_ishlab1','orders?select=id&limit=3'); check('O4','цех не читает orders напрямую (цены)', Array.isArray(direct.data)&&direct.data.length===0, JSON.stringify(direct.data).slice(0,100))
const cl = await get('test_ishlab1','clients?select=id&limit=3'); check('O5','цех не читает clients', Array.isArray(cl.data)&&cl.data.length===0)
const pay = await get('test_ishlab1','payments?select=id&limit=3'); check('O6','цех не читает payments', Array.isArray(pay.data)&&pay.data.length===0)
const pm = await get('test_montaj1','payments?select=id&limit=3'); check('O7','монтажник не читает payments', Array.isArray(pm.data)&&pm.data.length===0)
const ex = await get('test_ishlab1','expenses?select=id&limit=3'); check('O8','цех не читает expenses', Array.isArray(ex.data)&&ex.data.length===0)
const sal = await get('test_ishlab1','salary_payouts?select=id&limit=9'); check('O9','цех не читает чужие salary_payouts', Array.isArray(sal.data)&&sal.data.length===0, JSON.stringify(sal.data).slice(0,100))
const cat2 = await get('test_ishlab1','catalog_items?select=price&limit=2'); check('O10','цех не читает каталог (цены)', Array.isArray(cat2.data)&&cat2.data.length===0)
// пытается записать
const w = await write('test_ishlab1','PATCH',`orders?id=eq.${oid}`,{contract_price:1}); check('O11','цех не может менять orders', !w.ok || (Array.isArray(w.data)&&w.data.length===0), JSON.stringify(w.data).slice(0,100))
const ins = await write('test_ishlab1','POST','payments',{order_id:oid,amount:5}); check('O12','цех не может вставить payments', !ins.ok, JSON.stringify(ins.data).slice(0,100))
// anon
const an = await fetch(process.env.SUPA+'/rest/v1/orders?select=id&limit=1',{headers:{apikey:process.env.ANON}}).catch(()=>null)
// отправка в цех
const before = (await sql(`select count(*) n from notifications`))[0].n
const sh = await rpc(R,'send_to_shop',{p_order:oid}); console.log('send', JSON.stringify(sh.data))
check('N1','send_to_shop успешно', sh.ok)
await sleep(6000)
const nots = await sql(`select id, target_role, employee_id, sent_at, error, left(text,40) t from notifications order by created_at desc limit 3`)
console.log(nots)
info('N2','уведомление цеху — результат доставки', JSON.stringify(nots[0]))
const w2 = await get('test_ishlab1','w_orders?select=*'); check('N3','цех видит заказ после отправки', (w2.data||[]).some(x=>x.id===oid), JSON.stringify(Object.keys(w2.data?.[0]||{})))
console.log('w_orders cols', Object.keys(w2.data?.[0]||{}).join(','))
const wi = await get('test_ishlab1',`w_order_items?order_id=eq.${oid}&select=*`); console.log('w_order_items cols', Object.keys(wi.data?.[0]||{}).join(','), wi.data?.length)
const mats = JSON.stringify(wi.data); check('N4','w_order_items без цен (cost/materials price)', !/"cost"|"price"|unit_cost/.test(mats), Object.keys(wi.data?.[0]||{}).join(','))
// склад
const st = await sql(`select kind, qty, part from stock_movements where order_id='${oid}'`); console.log(st)
check('S1','авторасход: 3×2+2=8', st.reduce((a,x)=>a+Number(x.qty),0)===-8, JSON.stringify(st))
globalThis.__ctx = { oid, itemId }
await import('fs').then(f=>f.writeFileSync('ctx.json', JSON.stringify({oid,itemId})))
