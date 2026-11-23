// Проверка в базе: что создали тестовые прогоны ws*.mjs
import { runSql } from 'file:///D:/Eco Rom/scripts/run-sql.mjs'
const r = await runSql(`select o.order_no, o.status, o.address, o.deadline, o.windows_count, o.area_m2, o.calc_cost, o.calc_suggested, o.contract_price, o.markup, (select count(*) from order_items i where i.order_id = o.id) as items, c.full_name, c.phone from orders o join clients c on c.id = o.client_id where c.full_name like 'TEST WS%' order by o.created_at desc limit 8`)
console.log(JSON.stringify(r, null, 1))
console.log(JSON.stringify(await runSql(`select count(*) as n from clients where full_name like 'TEST WS%'`)))
