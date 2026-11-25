-- Блок «цифры»: сторно/возвраты в другом месяце, отменённые заказы, расходы, закупки — все экраны сходятся с отчётом и integrity_check() зелёный.
do $$
declare v_rah text := (select login from public.employees where role = 'rahbar' and is_active order by login limit 1);
        v_o1 uuid; v_o2 uuid; v_p1 uuid; v_p2 uuid; v_p3 uuid; v_e1 uuid; v_prev date := (date_trunc('month', (now() at time zone 'Asia/Tashkent')) - interval '10 days')::date;
        v_cur date := (now() at time zone 'Asia/Tashkent')::date; v_chk jsonb; v_s jsonb; v_a numeric; v_b numeric; v_cat int; v_sup uuid;
begin
  perform pg_temp.as_login(v_rah);
  select (save_order(pg_temp.order_json('REGRESS Integr A', 2000000))->>'id')::uuid into v_o1;
  select (save_order(pg_temp.order_json('REGRESS Integr B', 1000000))->>'id')::uuid into v_o2;
  select id into v_cat from expense_categories order by id limit 1;
  perform pg_temp.as_postgres();

  -- заказ A (создан в прошлом месяце): платёж в прошлом месяце, сторно этого платежа в ТЕКУЩЕМ месяце, новый платёж в текущем
  update orders set created_at = v_prev + time '12:00' where id = v_o1;
  insert into payments(order_id, amount, paid_at) values (v_o1, 700000, v_prev) returning id into v_p1;
  insert into payments(order_id, amount, paid_at, reverses_id, note) values (v_o1, -700000, v_cur, v_p1, 'Bekor qilindi');
  insert into payments(order_id, amount, paid_at) values (v_o1, 900000, v_cur);
  -- заказ B: платёж 400000 и частичный возврат 150000 после отмены заказа
  insert into payments(order_id, amount, paid_at) values (v_o2, 400000, v_cur) returning id into v_p2;
  update orders set status = 'cancelled' where id = v_o2;
  insert into payments(order_id, amount, paid_at, reverses_id, note) values (v_o2, -150000, v_cur, v_p2, 'Qaytarildi (qisman)');
  -- расход прошлого месяца, отменённый в текущем
  insert into expenses(category_id, amount, spent_at, source, confirmed, note) values (v_cat, 80000, v_prev, 'web', true, 'regress') returning id into v_e1;
  insert into expenses(category_id, amount, spent_at, source, confirmed, reverses_id, note) values (v_cat, -80000, v_cur, 'web', true, v_e1, 'regress reverse');
  insert into expenses(category_id, amount, spent_at, source, confirmed, note) values (v_cat, 30000, v_cur, 'web', true, 'regress keep');
  -- закупка и оплата поставщику
  insert into suppliers(name) values ('REGRESS Integr sup') returning id into v_sup;
  insert into purchases(supplier_id, purchased_at, total, delivery_cost) values (v_sup, v_cur, 500000, 20000);
  insert into supplier_payments(supplier_id, amount, paid_at) values (v_sup, 120000, v_cur);

  perform pg_temp.as_login(v_rah);
  v_chk := integrity_check();
  perform pg_temp.t('integrity_check ok on scenario', (v_chk->>'ok')::boolean, (v_chk->'failed')::text);

  -- Savdo текущего и прошлого месяца: сумма строк = итог; отчёт = Savdo
  for v_a in 0..1 loop
    v_s := savdo_month(date_trunc('month', v_cur - (v_a::int * 31))::date);
    perform pg_temp.t('savdo prixod rows = itog (m-' || v_a || ')', (select coalesce(sum((x->>'amount')::numeric), 0) from jsonb_array_elements(v_s->'prixod') x) = (v_s->'itog'->>'prixod')::numeric);
    perform pg_temp.t('savdo rasxod rows = itog (m-' || v_a || ')', (select coalesce(sum((x->>'amount')::numeric), 0) from jsonb_array_elements(v_s->'rasxod') x) = (v_s->'itog'->>'rasxod')::numeric);
    perform pg_temp.t('savdo ostatka = report net (m-' || v_a || ')', (v_s->'itog'->>'ostatka')::numeric = ((monthly_report(date_trunc('month', v_cur - (v_a::int * 31))::date))->'cash'->>'net')::numeric);
  end loop;

  -- отменённый заказ не в списке Savdo и не в долгах
  v_s := savdo_month(v_cur);
  perform pg_temp.t('cancelled order not in savdo list', not exists (select 1 from jsonb_array_elements(v_s->'orders') x where (x->>'id')::uuid = v_o2));
  v_a := (home_summary()->>'client_debt')::numeric;
  perform pg_temp.t('home debt includes A only: 2000000-900000 (+ other real orders)', v_a >= 1100000, v_a::text);

  -- расходы месяца: серверный итог = сумма строк
  v_s := expenses_month_summary(v_cur);
  perform pg_temp.t('expenses summary total = sum of rows', (v_s->>'total')::numeric = (select coalesce(sum(amount), 0) from expenses where spent_at >= date_trunc('month', v_cur)::date and spent_at < (date_trunc('month', v_cur) + interval '1 month')::date));

  -- окна времени убраны
  perform pg_temp.t('leak_window_days = 0 (all time)', (select (value #>> '{}')::int from app_settings where key = 'leak_window_days') = 0);
end $$;
