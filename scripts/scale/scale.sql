-- Нагрузочный тест: N заказов (по умолчанию подставляет run.mjs), считаем главные экраны и отчёты. Всё в одной транзакции с откатом — боевые данные не меняются.
-- Заменяется: __N__ — число заказов.
create temp table _t (name text, ms numeric);
grant all on _t to public;
create or replace function pg_temp.time(p_name text, p_sql text) returns void language plpgsql as $$
declare t0 timestamptz := clock_timestamp(); r record;
begin
  for r in execute p_sql loop null; end loop;
  insert into _t values (p_name, round(extract(epoch from clock_timestamp() - t0) * 1000, 1));
end $$;
grant execute on function pg_temp.time(text, text) to public;

do $$
declare n int := __N__; v_rah text := (select login from public.employees where role = 'rahbar' and is_active order by login limit 1);
        v_auth uuid; v_sys uuid[]; v_cl uuid[]; v_cat int; v_sup uuid; v_stage_shop int; v_stage_inst int; v_emps uuid[]; t0 timestamptz := clock_timestamp(); v_m text := to_char(now() at time zone 'Asia/Tashkent', 'YYYY-MM') || '-01';
begin
  -- служебные триггеры (аудит, лог статусов, уведомления) отключаем только на время наполнения — иначе вставка 100k строк идёт минуты
  alter table orders disable trigger user; alter table order_items disable trigger user; alter table clients disable trigger user; alter table payments disable trigger user;
  alter table expenses disable trigger user; alter table purchases disable trigger user; alter table purchase_items disable trigger user; alter table stock_movements disable trigger user;
  alter table supplier_payments disable trigger user; alter table salary_payouts disable trigger user; alter table item_stage_marks disable trigger user; alter table notifications disable trigger user;

  insert into catalog_items(kind, name, unit, price, params) select 'system', 'SCALE sys ' || s, 'm', 0, jsonb_build_object('series', s) from unnest(array['aluminium', 'plastic', 'thermo']) s;
  select array_agg(id) into v_sys from catalog_items where name like 'SCALE sys %';
  insert into clients(full_name, phone) select 'SCALE C' || g, '+99890' || lpad(g::text, 7, '0') from generate_series(1, greatest(n / 3, 1)) g;
  select array_agg(id) into v_cl from clients where full_name like 'SCALE C%';
  select id into v_cat from expense_categories order by id limit 1;
  insert into suppliers(name) select 'SCALE sup ' || g from generate_series(1, 50) g;
  select id into v_sup from suppliers where name = 'SCALE sup 1';
  select array_agg(id) into v_emps from employees where is_active;
  select id into v_stage_shop from stages where code = 'shop_ready'; select id into v_stage_inst from stages where code = 'install';

  -- номера заказов задаём явно (9 000 000+): общий счётчик order_no_seq НЕ расходуется (он не откатывается вместе с транзакцией и ломал бы нумерацию настоящих заказов)
  insert into orders(order_no, client_id, address, contact_phone, status, windows_count, area_m2, calc_cost, contract_price, markup, created_at, status_at, deadline, install_date, shop_sent_at, is_imported)
  select 9000000 + g, v_cl[1 + g % array_length(v_cl, 1)], 'SCALE addr ' || g, '+99890' || lpad((g % 1000)::text, 7, '0'),
         case when g % 100 < 94 then 'closed' when g % 100 < 96 then 'cancelled' else (array['new','in_production','ready','installing','installed'])[1 + g % 5] end, -- ~4% активных, как в реальной работе
         2, 4.5, 2000000, 3000000 + (g % 50) * 10000, 0.37, now() - (g % 730 || ' days')::interval - (g % 24 || ' hours')::interval, now() - (g % 700 || ' days')::interval,
         (current_date + ((g % 40) - 20)), (current_date - (g % 700)), now() - (g % 5 || ' days')::interval, false
    from generate_series(1, n) g;
  insert into order_items(order_id, pos, title, width_mm, height_mm, qty, design, options, materials, calc, cost, area_m2, glass_status)
  select o.id, p.pos, 'SCALE w' || p.pos, 1500, 1500, 1, '{"width":1500,"height":1500,"shape":"rect","root":{"kind":"leaf","id":"a","opening":"fixed"}}'::jsonb,
         jsonb_build_object('system', v_sys[1 + (o.order_no + p.pos) % 3]::text), '{}', '{}', 1000000, 2.25, 'none'
    from orders o join (values (1), (2)) p(pos) on true where o.address like 'SCALE addr %';
  -- платежи: закрытые — полностью, остальные — частично
  insert into payments(order_id, amount, paid_at)
  select o.id, case when o.status = 'closed' then o.contract_price else round(o.contract_price * 0.4) end, (o.created_at at time zone 'Asia/Tashkent')::date from orders o where o.address like 'SCALE addr %' and o.status <> 'cancelled';
  insert into expenses(category_id, amount, spent_at, source, confirmed, note) select v_cat, 10000 + (g % 90) * 1000, current_date - (g % 700), 'web', true, 'SCALE' from generate_series(1, n / 2) g;
  insert into purchases(supplier_id, purchased_at, total, delivery_cost) select (select id from suppliers where name = 'SCALE sup ' || (1 + g % 50)), current_date - (g % 700), 500000 + g, 0 from generate_series(1, greatest(n / 10, 1)) g;
  insert into supplier_payments(supplier_id, amount, paid_at) select (select id from suppliers where name = 'SCALE sup ' || (1 + g % 50)), 400000, current_date - (g % 700) from generate_series(1, greatest(n / 10, 1)) g;
  insert into item_stage_marks(order_item_id, stage_id, done_by, done_at)
  select i.id, s.id, v_emps[1 + i.pos % array_length(v_emps, 1)], o.created_at + interval '3 days'
    from order_items i join orders o on o.id = i.order_id cross join (select v_stage_shop id union all select v_stage_inst) s where o.address like 'SCALE addr %' and o.status in ('closed', 'installed');
  insert into notifications(employee_id, text, sent_at, created_at) select v_emps[1], 'SCALE n', now(), now() - (g % 300 || ' days')::interval from generate_series(1, n / 2) g;
  alter table orders enable trigger user; alter table order_items enable trigger user; alter table clients enable trigger user; alter table payments enable trigger user;
  alter table expenses enable trigger user; alter table purchases enable trigger user; alter table purchase_items enable trigger user; alter table stock_movements enable trigger user;
  alter table supplier_payments enable trigger user; alter table salary_payouts enable trigger user; alter table item_stage_marks enable trigger user; alter table notifications enable trigger user;
  analyze orders; analyze order_items; analyze payments; analyze expenses; analyze item_stage_marks; analyze clients; analyze purchases; analyze supplier_payments;
  insert into _t values ('SEED (' || n || ' orders)', round(extract(epoch from clock_timestamp() - t0) * 1000, 1));

  -- замеры: под Rahbar (authenticated, с RLS), как реально
  select auth_user_id into v_auth from employees where login = v_rah;
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform pg_temp.time('home_summary', 'select public.home_summary()');
  perform pg_temp.time('monthly_report(current)', format('select public.monthly_report(%L)', v_m));
  perform pg_temp.time('savdo_month(current)', format('select public.savdo_month(%L)', v_m));
  perform pg_temp.time('leaks_report', 'select public.leaks_report()');
  perform pg_temp.time('workshop_state', 'select public.workshop_state()');
  perform pg_temp.time('payroll_summary', format('select * from public.payroll_summary(%L)', v_m));
  perform pg_temp.time('v_order_paid (all rows)', 'select order_id, debt from v_order_paid');
  perform pg_temp.time('orders kanban list (active, with items)', $q$select o.id, o.order_no, o.status, i.design from orders o left join order_items i on i.order_id = o.id where o.status in ('new','in_production','ready','installing','installed') order by o.order_no desc$q$);
  perform pg_temp.time('orders list (all, order_no desc)', 'select id, order_no, status, created_at, contract_price from orders order by order_no desc');
  perform pg_temp.time('v_registratsiya (one month)', format($q$select * from v_registratsiya where oy = %L$q$, to_char(now() at time zone 'Asia/Tashkent', 'YYYY-MM')));
  perform pg_temp.time('v_stock_balance', 'select * from v_stock_balance');
  perform pg_temp.time('v_supplier_debt', 'select * from v_supplier_debt');
  perform pg_temp.time('v_cash_balance', 'select * from v_cash_balance');
  perform pg_temp.time('expenses month (summary)', format('select public.expenses_month_summary(%L)', v_m));
  perform pg_temp.time('record_payment single (lookup by order)', $q$select 1 from payments where order_id = (select id from orders where address = 'SCALE addr 777')$q$);
  -- части monthly_report_core по отдельности (профилирование)
  perform pg_temp.time('  part: orders of month (count/sum)', format($q$select count(*), sum(contract_price), sum(windows_count), sum(area_m2), sum(calc_cost) from orders where status <> 'cancelled' and (created_at at time zone 'Asia/Tashkent')::date >= %L::date and (created_at at time zone 'Asia/Tashkent')::date < (%L::date + interval '1 month')$q$, v_m, v_m));
  perform pg_temp.time('  part: works of month (order_items jsonb)', format($q$select sum(oi.qty * (select coalesce(sum((l->>'sum')::numeric), 0) from jsonb_array_elements(coalesce(oi.calc->'lines', '[]')) l where l->>'kind' = 'work')) from order_items oi join orders o on o.id = oi.order_id where o.status <> 'cancelled' and (o.created_at at time zone 'Asia/Tashkent')::date >= %L::date and (o.created_at at time zone 'Asia/Tashkent')::date < (%L::date + interval '1 month')$q$, v_m, v_m));
  perform pg_temp.time('  part: by_series of month', format($q$select coalesce(c.params->>'series', 'unknown'), sum(oi.area_m2 * oi.qty) from order_items oi join orders o on o.id = oi.order_id left join catalog_items c on c.id::text = oi.options->>'system' where o.status <> 'cancelled' and (o.created_at at time zone 'Asia/Tashkent')::date >= %L::date and (o.created_at at time zone 'Asia/Tashkent')::date < (%L::date + interval '1 month') group by 1$q$, v_m, v_m));
  perform pg_temp.time('  part: registratsiya sum (month)', format($q$select sum(dogovor - foyda) from v_registratsiya where oy = %L and status <> 'cancelled'$q$, to_char(v_m::date, 'YYYY-MM')));
  perform pg_temp.time('  part: l_cancel (cancelled orders movements)', format($q$select coalesce(sum(-m.qty * coalesce(m.unit_cost, 0)), 0) from stock_movements m join orders o on o.id = m.order_id where o.status = 'cancelled' and m.kind in ('consume', 'return') and (o.status_at at time zone 'Asia/Tashkent')::date >= %L::date$q$, v_m));
  perform pg_temp.time('  part: l_stock (adjust of month)', format($q$select coalesce(sum(-qty * coalesce(unit_cost, 0)), 0) from stock_movements where kind = 'adjust' and qty < 0 and (created_at at time zone 'Asia/Tashkent')::date >= %L::date$q$, v_m));
  perform pg_temp.time('  part: debts (clients + suppliers)', $q$select (select coalesce(sum(greatest(p.debt, 0)), 0) from v_order_paid p join orders o on o.id = p.order_id where o.status <> 'cancelled'), (select coalesce(sum(greatest(debt, 0)), 0) from v_supplier_debt)$q$);  reset role;
  perform pg_temp.time('  part: payroll_total(month)', format('select * from public.payroll_total(%L)', v_m));
  perform pg_temp.time('  part: payroll_lines(month)', format('select * from public.payroll_lines(%L)', v_m));
  perform pg_temp.time('integrity_check', 'select public.integrity_check()');
  raise exception 'RESULT: %', (select jsonb_agg(jsonb_build_object('name', name, 'ms', ms) order by ctid) from _t);
end $$;
