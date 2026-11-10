import { sql, rpc, check } from './h.mjs'
import { readFileSync } from 'fs'
const [A,B,C] = JSON.parse(readFileSync('ctx_b1.json','utf8')).ids
const R='t_rah'; const cash=async()=>Number((await sql(`select cash from v_cash_balance`))[0].cash)
let r = await rpc(R,'create_service',{p_order:C,p_item:null,p_description:'x'}); check('V1','сервис на неустановленном заказе отклонён', !r.ok, r.err)
r = await rpc(R,'create_service',{p_order:A,p_item:null,p_description:'TEST'}); check('V2','сервис на установленном принят', r.ok, r.err||'')
const item=(await sql(`select id from order_items where order_id='${A}' limit 1`))[0].id
const b = await rpc(R,'record_breakage',{p_item:item,p_pieces:1,p_reason:'TEST'}); check('V3','бой записан', b.ok, b.err||'')
const c0=await cash(); r = await rpc(R,'resolve_breakage',{p_id:b.data,p_payer:'factory',p_amount:300000}); check('V4','бой «завод» 300 000 — касса не меняется (расход при закупке стекла)', r.ok&&(await cash())===c0, r.err||String((await cash())-c0))
