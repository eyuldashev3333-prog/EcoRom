-- Блок «бой и сервис»: платит компания → расход и потеря; монтажник/клиент → система ничего не делает; нерешённое не в потерях. Требует миграцию 066.
do $$
declare v_rah text := (select login from public.employees where role = 'rahbar' and is_active order by login limit 1);
        v_o uuid; v_item uuid; b1 uuid; b2 uuid; s1 uuid; s2 uuid; v_today date := (now() at time zone 'Asia/Tashkent')::date;
        c0 numeric; c1 numeric; l0 numeric; l1 numeric; v_n int; v_exp uuid; v_line int;
begin
  perform pg_temp.as_login(v_rah);
  select (save_order(jsonb_set(pg_temp.order_json('REGRESS Breakage', 900000), '{items,0,qty}', '2'))->>'id')::uuid into v_o;
  select id into v_item from order_items where order_id = v_o;
  perform pg_temp.as_postgres();
  update orders set status = 'installed' where id = v_o;
  perform pg_temp.as_login(v_rah);
  c0 := (select cash from v_cash_balance);
  l0 := (monthly_report(v_today)->'losses'->>'breakage')::numeric;

  -- запись боя: по умолчанию НЕ решено — ни в потерях, ни в кассе
  b1 := record_breakage(v_item, 1, 'regress', null);
  perform pg_temp.t('undecided breakage not in losses', (monthly_report(v_today)->'losses'->>'breakage')::numeric = l0);
  perform pg_temp.t('undecided breakage does not move cash', (select cash from v_cash_balance) = c0);

  -- платит компания: расход в кассе и потеря в отчёте ровно на сумму
  perform resolve_breakage(b1, 'factory', 100000, null);
  perform pg_temp.t('factory pays: cash down by amount', (select cash from v_cash_balance) = c0 - 100000);
  perform pg_temp.t('factory pays: loss up by amount', (monthly_report(v_today)->'losses'->>'breakage')::numeric = l0 + 100000);
  select count(*) into v_n from expenses where breakage_id = b1 and reverses_id is null;
  perform pg_temp.t('factory pays: one expense row', v_n = 1);
  select id into v_exp from expenses where breakage_id = b1 and reverses_id is null;
  perform pg_temp.err('breakage expense cannot be reversed separately', format($f$select reverse_expense(%L, 'x')$f$, v_exp), 'sinish/servisdan');

  -- передумал: платит монтажник → расход снимается, потери нет, зарплата не трогается
  perform resolve_breakage(b1, 'installer', 100000, null);
  perform pg_temp.t('installer pays: cash back', (select cash from v_cash_balance) = c0);
  perform pg_temp.t('installer pays: no loss', (monthly_report(v_today)->'losses'->>'breakage')::numeric = l0);
  perform pg_temp.as_postgres();
  select count(*) into v_n from payroll_lines(v_today) where kind = 'breakage';
  perform pg_temp.as_login(v_rah);
  perform pg_temp.t('no payroll deduction for breakage', v_n = 0, v_n::text);
  perform resolve_breakage(b1, 'client', 100000, null);
  perform pg_temp.t('client pays: nothing moves', (select cash from v_cash_balance) = c0 and (monthly_report(v_today)->'losses'->>'breakage')::numeric = l0);

  -- дубль: всего разбитых по позиции не больше количества окон (qty = 2)
  perform pg_temp.err('breakage over qty rejected', format($f$select record_breakage(%L, 2, 'dup', null)$f$, v_item), 'allaqachon');
  perform pg_temp.okq('second piece allowed', format($f$select record_breakage(%L, 1, 'second', null)$f$, v_item));

  -- сервис: платит компания → расход; монтажник/клиент → ничего
  c0 := (select cash from v_cash_balance);
  l0 := (monthly_report(v_today)->'losses'->>'service')::numeric;
  s1 := create_service(v_o, v_item, 'regress service 1', null, null, '{}');
  perform close_service(s1, 'regress cause', 'factory', 50000, null);
  perform pg_temp.t('service factory: cash down', (select cash from v_cash_balance) = c0 - 50000);
  perform pg_temp.t('service factory: loss up', (monthly_report(v_today)->'losses'->>'service')::numeric = l0 + 50000);
  select id into v_exp from expenses where service_id = s1 and reverses_id is null;
  perform pg_temp.err('service expense cannot be reversed separately', format($f$select reverse_expense(%L, 'x')$f$, v_exp), 'sinish/servisdan');
  s2 := create_service(v_o, v_item, 'regress service 2', null, null, '{}');
  perform close_service(s2, 'regress cause', 'installer', 70000, null);
  perform pg_temp.t('service installer: nothing moves', (select cash from v_cash_balance) = c0 - 50000 and (monthly_report(v_today)->'losses'->>'service')::numeric = l0 + 50000);
  perform pg_temp.as_postgres();
  select count(*) into v_n from payroll_lines(v_today) where kind in ('breakage', 'service');
  perform pg_temp.as_login(v_rah);
  perform pg_temp.t('service never accrues payroll', v_n = 0);

  -- итог целостности после всех операций
  perform pg_temp.t('integrity_check ok', (integrity_check()->>'ok')::boolean, (integrity_check()->'failed')::text);
end $$;
