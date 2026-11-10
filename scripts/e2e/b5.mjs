import { sql, rpc, get, write, check, info } from './h.mjs'
const R='t_rah'
const it=(o={})=>({pos:1,title:'a',width_mm:1000,height_mm:1000,qty:1,area_m2:1,cost:100,...o})
let o=(await rpc(R,'save_order',{p:{client:{full_name:'TEST Zero'},contract_price:0,calc_cost:0,items:[it()]}})).data
let r=await rpc(R,'send_to_shop',{p_order:o.id}); check('C1','отправка в цех с нулевой ценой блокируется', !r.ok&&/NARX_NOL/.test(r.err), r.err)
r=await rpc(R,'send_to_shop',{p_order:o.id,p_force:true}); check('C2','с подтверждением (p_force) уходит', r.ok, r.err||'')
r=await rpc(R,'save_order',{p:{client:{full_name:'TEST Zero2'},contract_price:100,calc_cost:50,items:[]}}); check('C3','заказ без позиций не сохраняется', !r.ok, r.err)
r=await rpc(R,'save_order',{p:{client:{full_name:'TEST Zero3'},contract_price:100,calc_cost:50,items:[it({width_mm:50})]}}); check('C4','ширина 50 мм отклонена', !r.ok, r.err)
r=await rpc(R,'save_order',{p:{client:{full_name:'TEST Zero4'},contract_price:100,calc_cost:50,items:[it({qty:5000})]}}); check('C5','количество 5000 отклонено', !r.ok, r.err)
r=await rpc(R,'save_order',{p:{client:{full_name:'TEST Zero5'},contract_price:100,calc_cost:50,items:[it({height_mm:20000})]}}); check('C6','высота 20 000 отклонена', !r.ok, r.err)
const ok=await rpc(R,'save_order',{p:{client:{full_name:'TEST Ok'},contract_price:1000,calc_cost:500,items:[it()]}}); const r2=await rpc(R,'send_to_shop',{p_order:ok.data.id}); check('C7','нормальная цена отправляется без force', r2.ok, r2.err||'')
// заказ в работе: правка с нулевой ценой не блокируется повторной отправкой
r=await rpc(R,'save_order',{p:{id:o.id,client:{full_name:'TEST Zero'},contract_price:0,calc_cost:0,items:[{...it(),id:(await get(R,`order_items?order_id=eq.${o.id}&select=id`)).data[0].id,width_mm:1500}]}}); check('C8','правка заказа в цеху (с ранее подтверждённой нулевой ценой) проходит', r.ok&&r.data.resent, r.err||JSON.stringify(r.data))
