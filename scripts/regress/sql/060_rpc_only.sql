-- Блок «права»: прямая запись мимо функций закрыта, функции работают. Требует миграцию 060.
select pg_temp.as_login((select login from public.employees where role = 'rahbar' and is_active order by login limit 1));

-- 1. прямые вставки в журналы/деньги/склад отклоняются
select pg_temp.err('direct expenses insert', $$insert into expenses(category_id, amount, spent_at, source, confirmed) values (1, 1, current_date, 'web', true)$$, 'yozib bo''lmaydi');
select pg_temp.err('direct salary_payouts insert', $$insert into salary_payouts(employee_id, amount, paid_at, period) select id, 1, current_date, '2026-11' from employees limit 1$$, 'yozib bo''lmaydi');
select pg_temp.err('direct stock_movements insert', $$insert into stock_movements(item_id, qty, kind) select id, 5, 'adjust' from catalog_items where stock_tracked limit 1$$, 'yozib bo''lmaydi');
select pg_temp.err('direct supplier_payments insert', $$insert into supplier_payments(supplier_id, amount, paid_at) select id, 1, current_date from suppliers limit 1$$, 'yozib bo''lmaydi');
select pg_temp.err('direct purchases insert', $$insert into purchases(supplier_id, purchased_at, total) select id, current_date, 1 from suppliers limit 1$$, 'yozib bo''lmaydi');
select pg_temp.err('direct audit_log insert', $$insert into audit_log(actor, table_name, row_id, action) values (null, 'payments', 'x', 'DELETE')$$, 'yozib bo''lmaydi');
select pg_temp.err('direct orders status patch', $$update orders set status = 'closed' where status <> 'closed'$$, 'yozib bo''lmaydi');
select pg_temp.err('direct orders price patch', $$update orders set contract_price = 1$$, 'yozib bo''lmaydi');
select pg_temp.err('direct clients insert', $$insert into clients(full_name) values ('REGRESS direct')$$, 'yozib bo''lmaydi');

-- 2. функции системы работают
select pg_temp.okq('record_expense via rpc', $$select record_expense((select id from expense_categories order by id limit 1), 1000, (now() at time zone 'Asia/Tashkent')::date, 'regress', null, null)$$);
select pg_temp.err('record_expense date 2099', $$select record_expense((select id from expense_categories order by id limit 1), 1000, date '2099-01-01', 'regress', null, null)$$, 'sana');
select pg_temp.okq('save_order creates order', $$select save_order(pg_temp.order_json('REGRESS Client A'))$$);

-- 3. цена ниже оплаченного и закрытие с долгом — отклоняются даже на уровне базы
do $$
declare v_id uuid; v_ord uuid;
begin
  select (save_order(pg_temp.order_json('REGRESS Client B', 1000000))->>'id')::uuid into v_ord;
  perform record_payment(v_ord, 300000, null, 'regress', false);
  perform pg_temp.t('order exists', v_ord is not null);
  perform pg_temp.err('price below paid via registratsiya_set', format($f$select registratsiya_set(%L, 'dogovor', '100000')$f$, v_ord), 'kam');
  perform pg_temp.as_postgres();
  update orders set status = 'installed' where id = v_ord;   -- ставим «установлен» от имени владельца базы, чтобы проверить именно долг
  perform pg_temp.as_login((select login from public.employees where role = 'rahbar' and is_active order by login limit 1));
  perform pg_temp.err('status closed with debt via rpc', format($f$select set_order_status(%L, 'closed')$f$, v_ord), 'Qarz bor');
end $$;

-- 4. легаси-функции для сайта закрыты
select pg_temp.err('mark_stage closed', $$select mark_stage(gen_random_uuid(), 1, true)$$, 'permission denied');
select pg_temp.err('mark_install closed', $$select mark_install(gen_random_uuid(), 'x', true, null)$$, 'permission denied');
select pg_temp.err('set_glass_status closed', $$select set_glass_status(array[gen_random_uuid()], 'ordered')$$, 'permission denied');

-- 5. цех не видит кассу; аноним не может писать
select pg_temp.as_postgres();
select pg_temp.as_anon();
select pg_temp.err('anon record_payment', $$select record_payment(gen_random_uuid(), 1, null, null, false)$$, 'permission denied');
select pg_temp.err('anon stock_receive', $$select stock_receive(gen_random_uuid(), '', 1, 1, null)$$, 'permission denied');
select pg_temp.as_postgres();
