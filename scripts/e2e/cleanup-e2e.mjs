// Уборка после e2e-тестов: удаляет ВСЁ тестовое (пользователи t_*/test_*, клиенты и заказы «TEST …», поставщики/позиции каталога «TEST …»),
// возвращает Telegram Elyor и выключает отладочные настройки. Запуск: node scripts/e2e/cleanup-e2e.mjs
import { runSql } from '../run-sql.mjs'
import { env } from '../env.mjs'
const URL_ = env('SUPABASE_URL'), SVC = env('SUPABASE_SERVICE_ROLE_KEY')
await runSql(`
begin;
alter table payments disable trigger trg_nomut_payments;
alter table expenses disable trigger trg_nomut_expenses;
alter table purchases disable trigger trg_nomut_purchases;
alter table purchase_items disable trigger trg_nomut_purchase_items;
alter table stock_movements disable trigger trg_nomut_stock_movements;
alter table supplier_payments disable trigger trg_nomut_supplier_payments;
alter table salary_payouts disable trigger trg_nomut_salary_payouts;
create temp table _o on commit drop as select o.id from orders o left join clients c on c.id = o.client_id where c.full_name like 'TEST %' or o.order_no >= (select coalesce(min(order_no), 2435) from orders where false) and false;
create temp table _s on commit drop as select id from suppliers where name like 'TEST%';
create temp table _e on commit drop as select id from employees where login like 't\\_%' or login like 'test\\_%';
delete from payments where order_id in (select id from _o);
delete from expenses where order_id in (select id from _o);
delete from stock_movements where order_id in (select id from _o);
delete from purchase_items where purchase_id in (select id from purchases where supplier_id in (select id from _s));
delete from stock_movements where purchase_id in (select id from purchases where supplier_id in (select id from _s));
delete from stock_movements where item_id in (select id from catalog_items where name like 'TEST%');
delete from purchases where supplier_id in (select id from _s);
delete from supplier_payments where supplier_id in (select id from _s);
delete from suppliers where id in (select id from _s);
delete from salary_payouts where employee_id in (select id from _e);
delete from pay_rules where employee_id in (select id from _e);
delete from expenses where for_employee_id in (select id from _e) or created_by in (select id from _e);
delete from orders where id in (select id from _o);
delete from clients c where c.full_name like 'TEST %' and not exists (select 1 from orders o where o.client_id = c.id);
delete from catalog_items where name like 'TEST%';
update orders set created_by = null where created_by in (select id from _e);
update clients set created_by = null where created_by in (select id from _e);
delete from notifications;
delete from employees where id in (select id from _e);
alter table payments enable trigger trg_nomut_payments;
alter table expenses enable trigger trg_nomut_expenses;
alter table purchases enable trigger trg_nomut_purchases;
alter table purchase_items enable trigger trg_nomut_purchase_items;
alter table stock_movements enable trigger trg_nomut_stock_movements;
alter table supplier_payments enable trigger trg_nomut_supplier_payments;
alter table salary_payouts enable trigger trg_nomut_salary_payouts;
update employees set telegram_id = 5620263440 where login = 'elyor';
update app_settings set value = '8'::jsonb where key = 'notify_from_hour';
update app_settings set value = '20'::jsonb where key = 'notify_to_hour';
delete from audit_log;
select setval('order_no_seq', coalesce((select max(order_no) from orders), 2434) + 1, false);
commit;`)
const H = { apikey: SVC, Authorization: `Bearer ${SVC}` }
const u = await (await fetch(`${URL_}/auth/v1/admin/users?per_page=200`, { headers: H })).json()
for (const x of u.users) if (/^(t_|test_)/.test(x.email)) console.log('auth удалён', x.email, (await fetch(`${URL_}/auth/v1/admin/users/${x.id}`, { method: 'DELETE', headers: H })).status)
// файлы тестов в хранилище
for (const b of ['install-photos']) {
  const list = await (await fetch(`${URL_}/storage/v1/object/list/${b}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: '', limit: 1000 }) })).json()
  if (Array.isArray(list) && list.length) console.log('в хранилище остались папки:', list.length)
}
console.log('Готово. Заказов:', (await runSql(`select count(*) n from orders`))[0].n)
