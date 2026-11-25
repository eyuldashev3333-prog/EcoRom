-- Блок «деньги и склад». Требует миграцию 069.
do $$
declare v_rah text := (select login from public.employees where role = 'rahbar' and is_active order by login limit 1);
        v_today date := (now() at time zone 'Asia/Tashkent')::date; v_m date := date_trunc('month', (now() at time zone 'Asia/Tashkent'))::date;
        v_item uuid; v_item2 uuid; v_cat int; v_sup uuid; v_emp uuid; v_off uuid; v_o uuid; v_p uuid; v_p2 uuid; v_o2 uuid; r jsonb; v_rate numeric; v_price numeric; n numeric;
        c0 numeric; l0 numeric; v_stage int; it uuid; v_debt numeric;
begin
  perform pg_temp.as_postgres();
  select id into v_item from catalog_items where stock_tracked and price > 0 and kind <> 'system' order by id limit 1;
  select id into v_item2 from catalog_items where stock_tracked and price > 0 and kind <> 'system' and id <> v_item order by id limit 1;
  select id into v_cat from expense_categories order by id limit 1;
  insert into suppliers(name) values ('REGRESS money sup') returning id into v_sup;
  insert into employees(full_name, role, is_active, login, hired_at) values ('REGRESS Money emp', 'ishlab', true, 'regress_money', v_m) returning id into v_emp;
  insert into employees(full_name, role, is_active, login) values ('REGRESS Money off', 'ishlab', false, 'regress_money_off') returning id into v_off;
  insert into pay_rules(employee_id, basis, amount, valid_from) values (v_emp, 'salary', 1000000, v_m);
  v_rate := (select (value #>> '{}')::numeric from app_settings where key = 'currency_rate');
  perform pg_temp.as_login(v_rah);

  -- 1. цена каталога в so'm
  select price into v_price from catalog_items where id = v_item;
  perform pg_temp.t('part_price is in so''m (price x rate)', (select part_price(i, '') from catalog_items i where i.id = v_item) = v_price * v_rate, v_price::text || ' x ' || v_rate::text);

  -- 2. REGISTRATSIYA: введён только sbor → себестоимость = mahsulot + sbor
  select (save_order(pg_temp.order_json('REGRESS Reg Cost', 5000000))->>'id')::uuid into v_o;
  perform registratsiya_set(v_o, 'sbor', '400000');
  perform pg_temp.t('registratsiya: sbor-only counted in jami_tani', (select jami_tani = mahsulot + sbor and sbor = 400000 from v_registratsiya where id = v_o), (select jami_tani::text || ' / ' || mahsulot::text || ' / ' || sbor::text from v_registratsiya where id = v_o));

  -- 3. выплата зарплаты: больше остатка — только avans; отключённому — только остаток
  perform pg_temp.okq('payout within accrued accepted', format($f$select record_salary_payout(%L, 1000, null, %L, 'x')$f$, v_emp, to_char(v_today, 'YYYY-MM')) );
  perform pg_temp.err('payout above accrued needs avans', format($f$select record_salary_payout(%L, 5000000, null, %L, 'x')$f$, v_emp, to_char(v_today, 'YYYY-MM')), 'AVANS');
  perform pg_temp.okq('payout as avans accepted', format($f$select record_salary_payout(%L, 5000000, null, %L, 'x', true)$f$, v_emp, to_char(v_today, 'YYYY-MM')));
  perform pg_temp.err('payout to inactive employee rejected', format($f$select record_salary_payout(%L, 100, null, %L, 'x', true)$f$, v_off, to_char(v_today, 'YYYY-MM')), 'faol emas');

  -- 4. дубль расхода
  perform record_expense(v_cat, 7777, v_today, 'regress dup', null, null);
  perform pg_temp.err('duplicate expense rejected', format($f$select record_expense(%L, 7777, %L, 'regress dup', null, null)$f$, v_cat, v_today), 'hozirgina');

  -- 5. закупки: доставка, оплата больше стоимости, оплата больше долга
  perform pg_temp.err('negative delivery rejected', format($f$select record_purchase(%L::jsonb)$f$, jsonb_build_object('supplier_id', v_sup, 'purchased_at', v_today, 'delivery_cost', -5, 'paid_now', 0, 'lines', jsonb_build_array(jsonb_build_object('item_id', v_item, 'part', '', 'qty', 5, 'unit_cost', 1000)))), 'manfiy');
  perform pg_temp.err('paid more than purchase rejected', format($f$select record_purchase(%L::jsonb)$f$, jsonb_build_object('supplier_id', v_sup, 'purchased_at', v_today, 'delivery_cost', 0, 'paid_now', 999999, 'lines', jsonb_build_array(jsonb_build_object('item_id', v_item, 'part', '', 'qty', 5, 'unit_cost', 1000)))), 'ko''p');
  v_p := record_purchase(jsonb_build_object('supplier_id', v_sup, 'purchased_at', v_today, 'delivery_cost', 0, 'paid_now', 0, 'lines', jsonb_build_array(jsonb_build_object('item_id', v_item, 'part', '', 'qty', 5, 'unit_cost', 1000))));
  perform pg_temp.err('supplier payment above debt needs avans', format($f$select record_supplier_payment(%L, 9000, %L, 'x')$f$, v_sup, v_today), 'AVANS');
  perform pg_temp.okq('supplier payment within debt ok', format($f$select record_supplier_payment(%L, 3000, %L, 'x')$f$, v_sup, v_today));
  perform pg_temp.okq('supplier payment as avans ok', format($f$select record_supplier_payment(%L, 9000, %L, 'x', true)$f$, v_sup, v_today));

  -- 6. «Ombor kirim»: двойной клик, отмена вместе с платежом, платёж отдельно не отменяется, израсходованный материал не отменить
  v_p2 := stock_receive(v_item2, '', 10, 50000, 'regress receive');
  perform pg_temp.err('double receive rejected', format($f$select stock_receive(%L, '', 10, 50000, 'regress receive')$f$, v_item2), 'hozirgina');
  select id into v_off from supplier_payments where note = 'Ombor kirim ' || v_p2::text and reverses_id is null;
  perform pg_temp.err('Ombor payment cannot be reversed alone', format($f$select reverse_supplier_payment(%L, 'x')$f$, v_off), 'Ombor');
  perform pg_temp.okq('reverse_purchase on Ombor kirim delegates to undo', format($f$select reverse_purchase(%L, 'x')$f$, v_p2));
  select coalesce(sum(total + delivery_cost), 0) - coalesce((select sum(amount) from supplier_payments where supplier_id = s.id), 0) into v_debt from purchases pp join suppliers s on s.id = pp.supplier_id where s.name = 'Ombor / to''g''ridan-to''g''ri' group by s.id;
  perform pg_temp.t('Ombor supplier debt not negative after undo', coalesce(v_debt, 0) >= 0, coalesce(v_debt, 0)::text);
  -- израсходованный материал: приход нельзя отменить
  v_p2 := stock_receive(v_item2, '', 3, 30000, 'regress receive 2');
  perform pg_temp.as_postgres();
  insert into stock_movements(item_id, part, qty, kind, unit_cost, note) values (v_item2, '', -(select coalesce(sum(qty), 0) from stock_movements where item_id = v_item2 and part = '') + 1, 'adjust', 1, 'regress consume');
  perform pg_temp.as_login(v_rah);
  perform pg_temp.err('cannot reverse receipt if material already used', format($f$select stock_receive_undo(%L)$f$, v_p2), 'ishlatilgan');

  -- 7. отмена заказа после «Tayyor»: материал — потеря компании в отчёте; склад: shortage при нехватке
  select (save_order(jsonb_set(jsonb_set(pg_temp.order_json('REGRESS Cancel Loss', 2000000), '{items,0,materials,items}',
         jsonb_build_array(jsonb_build_object('item_id', v_item, 'part', '', 'qty', 2))),
         '{items,0,calc,lines}', jsonb_build_array(jsonb_build_object('item_id', v_item, 'part', '', 'qty', 2, 'sum', 1))))->>'id')::uuid into v_o2;
  l0 := (monthly_report(v_today)->'losses'->>'cancelled')::numeric;
  r := send_to_shop(v_o2, true, null);
  perform pg_temp.t('send_to_shop returns shortage key', r ? 'shortage', r::text);
  perform pg_temp.as_postgres();
  select id into v_stage from stages where code = 'shop_ready';
  insert into item_stage_marks(order_item_id, stage_id, done_by) select id, v_stage, (select id from employees where role = 'ishlab' limit 1) from order_items where order_id = v_o2;
  perform pg_temp.as_login(v_rah);
  perform set_order_status(v_o2, 'cancelled');
  n := (monthly_report(v_today)->'losses'->>'cancelled')::numeric;
  perform pg_temp.t('cancelled order material counted as loss', abs(n - (l0 + 2 * (select part_price(i, '') from catalog_items i where i.id = v_item))) < 1, n::text || ' vs ' || l0::text);
  perform pg_temp.t('integrity ok after money scenarios', (integrity_check()->>'ok')::boolean, (integrity_check()->'failed')::text);
end $$;
