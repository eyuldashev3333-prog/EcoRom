import { rpc, sql } from './h.mjs'
const r = await rpc('t_rah','monthly_report',{p_month:'2026-11-01'}); console.log(JSON.stringify(r.data,null,1).slice(0,3500))
console.log(await sql(`select count(*) n, sum(contract_price) cp, sum(calc_cost) cc, sum(cost_product+cost_service) cs from orders where status<>'cancelled' and created_at>='2026-11-01' and created_at<'2026-12-01'`))
console.log(await sql(`select status, count(*), sum(contract_price) from orders where created_at>='2026-11-01' group by 1`))
