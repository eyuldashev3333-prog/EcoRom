-- Блок «Kirim» (миграция 083): приход мимо заказов — свободный и продажа со склада. Касса растёт, прибыль не меняется, склад уменьшается,
-- продать больше остатка нельзя, отмена возвращает кассу и склад, прямая запись закрыта, сверка integrity_check проходит.
select pg_temp.as_login((select login from public.employees where role = 'rahbar' and is_active order by login limit 1));

do $$
declare
  v_today date := (now() at time zone 'Asia/Tashkent')::date; v_m date := date_trunc('month', (now() at time zone 'Asia/Tashkent')::date)::date;
  v_item uuid; v_part text; v_bal0 numeric; v_bal numeric; c0 numeric; c1 numeric; p0 numeric; p1 numeric; l0 numeric; l1 numeric;
  v_free uuid; v_sale uuid; v_rev uuid; r jsonb; s jsonb; d0 jsonb; d1 jsonb; v_n int;
begin
  -- материал со склада: любой учитываемый; кладём на склад 10 через «+ Kirim» склада (это закупка — касса уменьшится, считаем по разнице)
  select id into v_item from catalog_items where stock_tracked and is_active and kind <> 'system' order by name limit 1;
  v_part := '';
  perform pg_temp.t('есть материал для теста', v_item is not null);
  perform stock_receive(v_item, v_part, 10, 50000, 'regress kirim');

  select cash into c0 from v_cash_balance;
  select coalesce(sum(qty), 0) into v_bal0 from stock_movements where item_id = v_item and part = v_part;
  perform pg_temp.as_postgres();
  r := monthly_report_core(v_m); p0 := (r->>'profit')::numeric; l0 := (r->'losses'->>'total')::numeric;
  d0 := daily_report_core(v_today);
  perform pg_temp.as_login((select login from public.employees where role = 'rahbar' and is_active order by login limit 1));

  -- 1. свободный приход
  v_free := record_income('free', 123000, v_today, 'REGRESS eski mijoz', 'regress izoh');
  select cash into c1 from v_cash_balance;
  perform pg_temp.t('free: касса +123 000', c1 - c0 = 123000, format('было %s стало %s', c0, c1));
  perform pg_temp.err('free: двойное нажатие', format($f$select record_income('free', 123000, %L, 'REGRESS eski mijoz', 'regress izoh')$f$, v_today), 'hozirgina');
  perform pg_temp.err('free: без «Nima uchun»', format($f$select record_income('free', 5000, %L, '  ', 'x')$f$, v_today), 'Nima uchun');
  perform pg_temp.err('free: сумма 0', format($f$select record_income('free', 0, %L, 'REGRESS x', null)$f$, v_today), 'Summani');
  perform pg_temp.err('free: дата 2099', $f$select record_income('free', 7000, date '2099-01-01', 'REGRESS x', null)$f$, 'sana');
  perform pg_temp.err('free: дата до старта кассы', $f$select record_income('free', 7000, date '2021-01-01', 'REGRESS x', null)$f$, 'kassa boshlangan');

  -- 2. продажа со склада: 4 из 10
  v_sale := record_income('stock', 200000, v_today, null, 'regress sotuv', v_item, v_part, 4);
  select coalesce(sum(qty), 0) into v_bal from stock_movements where item_id = v_item and part = v_part;
  perform pg_temp.t('stock: склад −4', v_bal0 - v_bal = 4, format('было %s стало %s', v_bal0, v_bal));
  select cash into c1 from v_cash_balance;
  perform pg_temp.t('stock: касса +200 000 (итого +323 000)', c1 - c0 = 323000, format('разница %s', c1 - c0));
  perform pg_temp.t('stock: название материала подставлено', (select title from incomes where id = v_sale) is not null and (select kind from incomes where id = v_sale) = 'stock');
  perform pg_temp.t('stock: движение kind=sale', exists (select 1 from stock_movements where income_id = v_sale and kind = 'sale' and qty = -4));
  perform pg_temp.err('stock: больше остатка', format($f$select record_income('stock', 1000, %L, null, null, %L, %L, %s)$f$, v_today, v_item, v_part, v_bal + 1), 'Omborda faqat');
  perform pg_temp.err('stock: без количества', format($f$select record_income('stock', 1000, %L, null, null, %L, %L, 0)$f$, v_today, v_item, v_part), 'Miqdor');
  perform pg_temp.err('stock: без материала', format($f$select record_income('stock', 1000, %L, null, null, null, '', 1)$f$, v_today), 'Material');

  -- 3. прибыль и потери не изменились; Savdo и отчёт видят приход
  perform pg_temp.as_postgres();
  r := monthly_report_core(v_m); p1 := (r->>'profit')::numeric; l1 := (r->'losses'->>'total')::numeric;
  perform pg_temp.t('прибыль месяца не изменилась', p1 = p0, format('%s → %s', p0, p1));
  perform pg_temp.t('потери склада не изменились', l1 = l0, format('%s → %s', l0, l1));
  perform pg_temp.t('отчёт: cash.other ≥ 323 000', (r->'cash'->>'other')::numeric >= 323000, r->>'cash');
  s := savdo_month_core(v_m);
  perform pg_temp.t('savdo: строки prixod = итог', (select coalesce(sum((x->>'amount')::numeric), 0) from jsonb_array_elements(s->'prixod') x) = (s->'itog'->>'prixod')::numeric);
  perform pg_temp.t('savdo: строка Kirim есть', exists (select 1 from jsonb_array_elements(s->'prixod') x where x->>'id' = v_free::text and x->>'src' = 'income'));
  perform pg_temp.t('savdo: prixod = received + other', (s->'itog'->>'prixod')::numeric = (r->'cash'->>'received')::numeric + (r->'cash'->>'other')::numeric);
  perform pg_temp.t('savdo: ostatka = net', (s->'itog'->>'ostatka')::numeric = (r->'cash'->>'net')::numeric);
  d1 := daily_report_core(v_today);
  perform pg_temp.t('отчёт 23:00: Boshqa kirim +323 000 сегодня', (d1->'other_in'->>'today')::numeric - (d0->'other_in'->>'today')::numeric = 323000, d1->>'other_in');
  perform pg_temp.t('bot_cash = касса', bot_cash() = c1, format('%s / %s', bot_cash(), c1));
  perform pg_temp.as_login((select login from public.employees where role = 'rahbar' and is_active order by login limit 1));

  -- 4. отмена: касса и склад возвращаются; повторно — нельзя
  v_rev := reverse_income(v_sale, 'regress bekor');
  select coalesce(sum(qty), 0) into v_bal from stock_movements where item_id = v_item and part = v_part;
  perform pg_temp.t('отмена продажи: склад вернулся', v_bal = v_bal0, format('%s / %s', v_bal, v_bal0));
  perform reverse_income(v_free, 'regress bekor');
  select cash into c1 from v_cash_balance;
  perform pg_temp.t('отмена обеих: касса как до', c1 = c0, format('%s / %s', c1, c0));
  perform pg_temp.err('повторная отмена', format($f$select reverse_income(%L, 'x')$f$, v_sale), 'Allaqachon');
  perform pg_temp.err('отмена строки отмены', format($f$select reverse_income(%L, 'x')$f$, v_rev), 'bekor qilish yozuvi');

  -- 5. прямая запись мимо функций закрыта
  perform pg_temp.err('прямой insert incomes', $f$insert into incomes(kind, amount, title) values ('free', 1, 'REGRESS direct')$f$, 'yozib bo''lmaydi');
  -- update/delete: политики на изменение нет — строка не меняется и не удаляется (а у владельца базы — запрет журнала, см. ниже)
  begin
    execute format($f$update incomes set amount = 1 where id = %L$f$, v_free);
    execute format($f$delete from incomes where id = %L$f$, v_free);
  exception when others then null;
  end;
  perform pg_temp.t('прямой update/delete incomes ничего не меняет', (select amount from incomes where id = v_free) = 123000);

  -- 6. сверка цифр
  perform pg_temp.as_postgres();
  perform pg_temp.err('update incomes от владельца — журнал неизменяем', format($f$update incomes set amount = 1 where id = %L$f$, v_free), '');
  r := integrity_check();
  perform pg_temp.t('integrity_check ok', (r->>'ok')::boolean, r->>'failed');
  select count(*) into v_n from jsonb_array_elements(r->'checks') x where x->>'name' = 'income_stock_movements' and (x->>'ok')::boolean;
  perform pg_temp.t('проверка income_stock_movements есть и ok', v_n = 1);
end $$;

-- 7. аноним и цех не пишут и не видят
select pg_temp.as_anon();
select pg_temp.err('anon record_income', $$select record_income('free', 1000, null, 'x', null)$$, 'permission denied');
select pg_temp.as_postgres();
select pg_temp.as_login((select login from public.employees where role = 'ishlab' and is_active order by login limit 1));
select pg_temp.err('ishlab record_income', $$select record_income('free', 1000, null, 'x', null)$$, 'Faqat rahbar');
select pg_temp.t('ishlab не видит incomes', (select count(*) from incomes) = 0);
select pg_temp.as_postgres();
