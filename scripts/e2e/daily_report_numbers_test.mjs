// Проверка цифр daily_report_core на тестовых данных — всё внутри одной транзакции с ROLLBACK (в базе ничего не остаётся).
// Номера тестовых заказов заданы вручную — счётчик order_no_seq не трогается. Запуск: node scripts/e2e/daily_report_numbers_test.mjs
import { runSql } from 'file:///D:/Eco Rom/scripts/run-sql.mjs'
import { readFileSync } from 'node:fs'

const core = readFileSync('D:/Eco Rom/supabase/migrations/082_daily_report.sql', 'utf8').match(/create or replace function public\.daily_report_core[\s\S]*?end \$\$;/)[0]
const D = `(now() at time zone 'Asia/Tashkent')::date`
const before = await runSql(`select (select count(*) from orders)::int o, (select last_value from order_no_seq) seq`)
const q = `begin;
${core}
set local session_replication_role = replica;
with c as (insert into clients(full_name) values ('TEST hisobot') returning id),
 o as (insert into orders(order_no, client_id, status, contract_price, created_at) select x.no, c.id, x.st, x.price, x.at from c, (values
   (999901, 'new', 10000000, (${D} + time '12:00') at time zone 'Asia/Tashkent'),
   (999902, 'cancelled', 5000000, (${D} + time '12:00') at time zone 'Asia/Tashkent'),
   (999903, 'new', 20000000, (date_trunc('month', ${D})::date + 2 + time '12:00') at time zone 'Asia/Tashkent'),
   (999904, 'new', 7000000, (date_trunc('month', ${D})::date - 1 + time '12:00') at time zone 'Asia/Tashkent')) x(no, st, price, at) returning id, order_no)
insert into payments(order_id, amount, paid_at) select o.id, x.a, ${D} from o join (values (999901, 3000000), (999902, 1000000), (999903, 2000000)) x(no, a) on x.no = o.order_no;
with e1 as (insert into expenses(category_id, amount, spent_at, source, confirmed) values (6, 120000, ${D}, 'telegram', true) returning id)
insert into expenses(category_id, amount, spent_at, source, confirmed, reverses_id) select 6, -120000, ${D}, 'telegram', true, id from e1; -- записан и отменён — 0
insert into expenses(category_id, amount, spent_at, source, confirmed) values
  (6, 100000, ${D}, 'telegram', true), (6, 400000, date_trunc('month', ${D})::date + 4, 'web', true),
  (20, 999, ${D}, 'breakage', true), (6, 777, ${D}, 'web', false), (6, 888, date_trunc('month', ${D})::date - 1, 'web', true);
insert into supplier_payments(supplier_id, amount, paid_at) select id, x.a, x.d from (select id from suppliers limit 1) s,
  (values (600000, ${D}), (1000000, date_trunc('month', ${D})::date + 9), (5000, date_trunc('month', ${D})::date - 2)) x(a, d);
insert into salary_payouts(employee_id, amount, paid_at) select id, 300000, ${D} from employees where login = 'usta';
select public.daily_report_core() r;`
let res
try {
  res = await runSql(q + '\nrollback;')
} catch (e) { await runSql('rollback;').catch(() => {}); throw e }
const r = (Array.isArray(res) ? res.find((x) => x?.r) ?? res : res).r ?? res[0]?.r
console.log(JSON.stringify(r))
const exp = { today: { orders: 1, sum: 10000000, paid: 3000000 }, month: { orders: 2, sum: 30000000 }, expenses_today: { expenses: 100000, purchases: 600000, total: 700000 }, expenses_month: { expenses: 500000, purchases: 1600000, total: 2100000 } }
let bad = 0
for (const [k, v] of Object.entries(exp)) for (const [kk, vv] of Object.entries(v)) { const got = Number(r?.[k]?.[kk]); const ok = got === vv; if (!ok) bad++; console.log(ok ? 'OK  ' : 'FAIL', `${k}.${kk}`, got, ok ? '' : `(ждали ${vv})`) }
const after = await runSql(`select (select count(*) from orders)::int o, (select last_value from order_no_seq) seq, (select count(*) from pg_proc where proname = 'daily_report_core')::int fn`)
console.log('база до:', JSON.stringify(before), '· после:', JSON.stringify(after))
console.log(bad ? `ОШИБОК: ${bad}` : 'ВСЁ OK')
