-- Все функции, которыми экраны пишут деньги/склад (SECURITY INVOKER + флаг ecorom.rpc), продолжают работать после закрытия прямой записи.
select pg_temp.as_login((select login from public.employees where role = 'rahbar' and is_active order by login limit 1));

do $$
declare v_sup uuid; v_item uuid; v_pur uuid; v_pay uuid; v_exp uuid; v_ord uuid; v_cat int; v_today date := (now() at time zone 'Asia/Tashkent')::date;
begin
  perform pg_temp.as_postgres();
  insert into suppliers(name) values ('REGRESS supplier') returning id into v_sup;
  select id into v_item from catalog_items where stock_tracked limit 1;
  select id into v_cat from expense_categories order by id limit 1;
  perform pg_temp.as_login((select login from public.employees where role = 'rahbar' and is_active order by login limit 1));

  -- закупка + оплата поставщику + отмена
  begin
    v_pur := record_purchase(jsonb_build_object('supplier_id', v_sup, 'purchased_at', v_today, 'delivery_cost', 0, 'paid_now', 0, 'lines', jsonb_build_array(jsonb_build_object('item_id', v_item, 'part', '', 'qty', 10, 'unit_cost', 1000))));
    perform pg_temp.t('record_purchase', v_pur is not null);
  exception when others then perform pg_temp.t('record_purchase', false, sqlerrm); end;
  perform pg_temp.okq('record_supplier_payment', format($f$select record_supplier_payment(%L, 1000, %L, 'regress')$f$, v_sup, v_today));
  perform pg_temp.okq('reverse_purchase', format($f$select reverse_purchase(%L, 'regress')$f$, v_pur));
  select id into v_pay from supplier_payments where supplier_id = v_sup and reverses_id is null limit 1;
  perform pg_temp.okq('reverse_supplier_payment', format($f$select reverse_supplier_payment(%L, 'regress')$f$, v_pay));

  -- расход + исправление + отмена
  v_exp := record_expense(v_cat, 5000, v_today, 'regress', null, null);
  perform pg_temp.t('record_expense', v_exp is not null);
  perform pg_temp.okq('expense_correct', format($f$select expense_correct(%L, 'note', 'regress 2')$f$, v_exp));
  select id into v_exp from expenses where note ilike 'regress%' and reverses_id is null and not exists (select 1 from expenses r where r.reverses_id = expenses.id) order by created_at desc limit 1;
  perform pg_temp.okq('reverse_expense', format($f$select reverse_expense(%L, 'regress')$f$, v_exp));

  -- заказ: registratsiya_add, registratsiya_set, платежи, сторно
  begin
    perform registratsiya_add(jsonb_build_object('full_name', 'REGRESS Reg', 'phone', '+998911111111', 'dogovor', 500000, 'berdi', 100000, 'sana', v_today));
    perform pg_temp.t('registratsiya_add', true);
  exception when others then perform pg_temp.t('registratsiya_add', false, sqlerrm); end;
  select id into v_ord from orders where contact_phone = '+998911111111' order by created_at desc limit 1;
  if v_ord is not null then
    perform pg_temp.okq('registratsiya_set manzil', format($f$select registratsiya_set(%L, 'manzil', 'regress addr')$f$, v_ord));
    select id into v_pay from payments where order_id = v_ord limit 1;
    if v_pay is not null then perform pg_temp.okq('reverse_payment', format($f$select reverse_payment(%L, 'regress')$f$, v_pay)); end if;
  end if;

  -- инвентаризация
  perform pg_temp.okq('stock_count', format($f$select stock_count(jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('item_id', %L, 'part', '', 'fact', 7)), 'note', 'regress'))$f$, v_item));
end $$;
