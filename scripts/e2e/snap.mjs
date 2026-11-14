import { runSql } from '../run-sql.mjs'
const q = async (s)=>JSON.stringify(await runSql(s))
console.log('counts', await q(`select (select count(*) from orders) orders,(select count(*) from clients) clients,(select count(*) from catalog_items) catalog,(select count(*) from employees) emp,(select count(*) from payments) pay,(select count(*) from expenses) exp,(select count(*) from notifications) notif,(select count(*) from audit_log) audit,(select last_value from order_no_seq) seq`))
console.log('emp', await q(`select login,role,is_active,telegram_id,auth_user_id is not null as has_auth from employees order by login`))
