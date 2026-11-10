import { sql, rpc, get, write, check, info, sleep, SVC, URL_ } from './h.mjs'
const R='t_rah'
const it=(o={})=>({pos:1,title:'a',width_mm:1000,height_mm:1000,qty:1,area_m2:2,cost:100,...o})
// ---- M1 фото
const o=(await rpc(R,'save_order',{p:{client:{full_name:'TEST Photo'},contract_price:1000,calc_cost:500,items:[it(),it({pos:2})]}})).data
await rpc(R,'send_to_shop',{p_order:o.id}); await sql(`update orders set status='ready' where id='${o.id}'`)
const m1=(await sql(`select id from employees where login='test_montaj1'`))[0].id; await rpc(R,'assign_install',{p_order:o.id,p_date:'2026-11-22',p_members:[m1]})
const itms=(await get(R,`order_items?order_id=eq.${o.id}&select=id&order=pos`)).data
let r=await rpc('test_montaj1','mark_install',{p_item:itms[0].id,p_part:'frame',p_done:true,p_photo:`${o.id}/FAKE.jpg`}); check('Q1','фейковый путь фото отклонён', !r.ok&&/topilmadi/.test(r.err), r.err||'')
const up=await fetch(`${URL_}/storage/v1/object/install-photos/${o.id}/real.jpg`,{method:'POST',headers:{apikey:SVC,Authorization:`Bearer ${SVC}`,'Content-Type':'image/jpeg'},body:Buffer.from('/9j/4AAQSkZJRg==','base64')}); console.log('upload',up.status)
r=await rpc('test_montaj1','mark_install',{p_item:itms[0].id,p_part:'frame',p_done:true,p_photo:`${o.id}/real.jpg`}); check('Q2','реально загруженное фото принято', r.ok, r.err||'')
r=await rpc('test_montaj1','record_breakage',{p_item:itms[0].id,p_pieces:1,p_reason:'TEST',p_photo:`${o.id}/FAKE2.jpg`}); check('Q3','бой с фейковым фото отклонён', !r.ok, r.err||'')
await fetch(`${URL_}/storage/v1/object/install-photos/${o.id}/real.jpg`,{method:'DELETE',headers:{apikey:SVC,Authorization:`Bearer ${SVC}`}})
// ---- M3 этап без ставки
const i1=(await sql(`select id from employees where login='test_ishlab1'`))[0].id
await rpc('test_ishlab1','mark_stage',{p_item:itms[0].id,p_stage:3,p_done:true})
let up2=await rpc(R,'payroll_unpriced',{p_month:'2026-11-01'}); console.log(JSON.stringify(up2.data)); check('Q4','этап без ставки виден в payroll_unpriced', up2.ok&&up2.data.some(x=>/Sex 1/.test(x.employee)||x.employee), JSON.stringify(up2.data))
await sql(`insert into pay_rules(employee_id,stage_code,basis,amount,valid_from) values ('${i1}','glass_fit','per_m2',10000,current_date-5)`)
up2=await rpc(R,'payroll_unpriced',{p_month:'2026-11-01'}); check('Q5','после добавления ставки этап «Shisha» больше не в предупреждении', up2.data.every(x=>x.stage!=='Shisha / furnitura'), JSON.stringify(up2.data))
const w=await rpc('test_ishlab1','payroll_unpriced',{p_month:'2026-11-01'}); check('Q6','цех не видит payroll_unpriced', !w.ok||w.data.length===0, w.status)
// штраф за бой в месяц решения
const br=await sql(`select id from glass_breakages limit 1`)
if (br[0]) { await sql(`update glass_breakages set created_at = date_trunc('month', now()) - interval '10 days' where id='${br[0].id}'`); await rpc(R,'resolve_breakage',{p_id:br[0].id,p_payer:'installer',p_amount:70000,p_employee:m1})
  const cur=await sql(`select amount from payroll_lines(date_trunc('month', now())::date) where kind='breakage'`); const prev=await sql(`select amount from payroll_lines((date_trunc('month', now()) - interval '1 month')::date) where kind='breakage'`)
  check('Q7','штраф за бой попал в месяц РЕШЕНИЯ, не создания', cur.length===1&&prev.length===0, JSON.stringify({cur,prev})) }
// ---- M5 доставка в стоимость
const sup=(await write(R,'POST','suppliers',{name:'TEST Sup',city:'x'})).data[0]; const cat=(await write(R,'POST','catalog_items',{kind:'misc',name:'TEST part',unit:'pcs',price:1000,stock_tracked:true})).data[0]
const p=await rpc(R,'record_purchase',{p:{supplier_id:sup.id,lines:[{item_id:cat.id,qty:100,unit_cost:2000}],delivery_cost:50000}})
const sm=(await sql(`select unit_cost::numeric uc from stock_movements where purchase_id='${p.data}'`))[0]; check('Q8','стоимость склада включает доставку: 2000×(1+50000/200000)=2500', Number(sm.uc)===2500, JSON.stringify(sm))
const pi=(await sql(`select unit_cost::numeric uc from purchase_items where purchase_id='${p.data}'`))[0]; check('Q8b','цена в накладной остаётся 2000', Number(pi.uc)===2000)
// ---- M9 таблицы
const A=(await rpc(R,'save_order',{p:{client:{full_name:'TEST Shared',phone:'+998911111111'},contract_price:1000000,calc_cost:1,items:[it()]}})).data
const Bq=(await rpc(R,'save_order',{p:{client:{id:(await sql(`select client_id from orders where id='${A.id}'`))[0].client_id,full_name:'TEST Shared',phone:'+998911111111'},contract_price:500000,calc_cost:1,items:[it()]}})).data
await rpc(R,'registratsiya_set',{p_order:A.id,p_field:'ismi',p_value:'TEST Renamed'})
const names=await sql(`select o.order_no, c.full_name from orders o join clients c on c.id=o.client_id where o.id in ('${A.id}','${Bq.id}') order by 1`); check('Q9','переименование строки не трогает другой заказ клиента', names[0].full_name==='TEST Renamed'&&names[1].full_name==='TEST Shared', JSON.stringify(names))
await rpc(R,'record_payment',{p_order:A.id,p_amount:600000})
r=await rpc(R,'registratsiya_set',{p_order:A.id,p_field:'dogovor',p_value:'100000'}); check('Q10','договор ниже оплаченного через таблицу отклонён', !r.ok, r.err)
r=await rpc(R,'registratsiya_set',{p_order:A.id,p_field:'sana',p_value:'2099-01-01'}); check('Q11','дата в будущем через таблицу отклонена', !r.ok, r.err)
const ad=await rpc(R,'registratsiya_add',{p:{full_name:'TEST TableRow',alyumin:'3',plast:'2',dogovor:'5000000',berdi:'1000000'}}); check('Q12','строка из таблицы: статус unknown', ad.ok&&(await sql(`select status from orders where id='${ad.data.id}'`))[0].status==='unknown', ad.err||'')
await rpc(R,'registratsiya_set',{p_order:ad.data.id,p_field:'termo',p_value:'4'}); const ar=(await sql(`select area_m2::numeric a from orders where id='${ad.data.id}'`))[0]; check('Q13','м² строки синхронизируются (3+2+4=9)', Number(ar.a)===9, JSON.stringify(ar))
r=await rpc(R,'registratsiya_add',{p:{full_name:'TEST TableOver',dogovor:'1000',berdi:'5000'}}); check('Q14','оплата больше договора в строке таблицы отклонена', !r.ok, r.err||'')
await write(R,'DELETE',`catalog_items?id=eq.${cat.id}`).catch(()=>{})
