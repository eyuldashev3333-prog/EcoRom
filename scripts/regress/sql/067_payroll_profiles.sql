-- Блок «зарплата»: ставка за м² по типу профиля (alyumin / plast / termo), смешанный заказ, оклад, бонус, сервис не платится, бригада — полные м² каждому.
-- Эталонные ставки Asad (25.11.2026): Islom aka (монтажник) A/P 20 000, T 32 000; Abdumajit (уста) 16 000 / 18 000 / 32 000; оклады shogird 4 000 000 / 2 500 000.
do $$
declare v_rah text := (select login from public.employees where role = 'rahbar' and is_active order by login limit 1);
        v_m date := date_trunc('month', (now() at time zone 'Asia/Tashkent'))::date; v_today date := (now() at time zone 'Asia/Tashkent')::date;
        sa uuid; sp uuid; st uuid;                    -- системы (алюмин / пласт / термо)
        islom uuid; islom2 uuid; abdu uuid; nodir uuid; v_o1 uuid; v_o2 uuid; i1 uuid; i2 uuid; i3 uuid; v_stage_shop int; v_stage_inst int; v_job uuid;
        r record; v_sum numeric;
begin
  perform pg_temp.as_postgres();
  insert into catalog_items(kind, name, unit, price, params) values ('system', 'REGRESS Alyumin', 'm', 0, '{"series":"aluminium"}') returning id into sa;
  insert into catalog_items(kind, name, unit, price, params) values ('system', 'REGRESS Plast', 'm', 0, '{"series":"plastic"}') returning id into sp;
  insert into catalog_items(kind, name, unit, price, params) values ('system', 'REGRESS Termo', 'm', 0, '{"series":"thermo"}') returning id into st;
  insert into employees(full_name, role, is_active, login) values ('REGRESS Islom', 'montajchi', true, 'regress_islom') returning id into islom;
  insert into employees(full_name, role, is_active, login) values ('REGRESS Islom 2', 'montajchi', true, 'regress_islom2') returning id into islom2;
  insert into employees(full_name, role, is_active, login) values ('REGRESS Abdumajit', 'ishlab', true, 'regress_abdu') returning id into abdu;
  insert into employees(full_name, role, is_active, login, hired_at) values ('REGRESS Nodirbek', 'ishlab', true, 'regress_nodir', v_m) returning id into nodir; -- оклад идёт со дня приёма (hired_at): при вводе сотрудников указывайте дату приёма
  -- ставки
  insert into pay_rules(employee_id, basis, series, amount, valid_from) values (islom, 'per_m2', 'aluminium', 20000, v_m), (islom, 'per_m2', 'plastic', 20000, v_m), (islom, 'per_m2', 'thermo', 32000, v_m),
                                                                        (islom2, 'per_m2', 'aluminium', 20000, v_m), (islom2, 'per_m2', 'plastic', 20000, v_m),
                                                                        (abdu, 'per_m2', 'aluminium', 16000, v_m), (abdu, 'per_m2', 'plastic', 18000, v_m), (abdu, 'per_m2', 'thermo', 32000, v_m),
                                                                        (nodir, 'salary', null, 4000000, v_m);
  select id into v_stage_shop from stages where code = 'shop_ready';
  select id into v_stage_inst from stages where code = 'install';

  -- заказ 1: 20 м² алюмина + 20 м² пласта (два типа профиля в одном заказе); монтаж: Islom + Islom 2 (бригада), цех: Abdumajit
  perform pg_temp.as_login(v_rah);
  select (save_order(pg_temp.order_json('REGRESS Payroll 1', 5000000))->>'id')::uuid into v_o1;
  perform pg_temp.as_postgres();
  update order_items set options = jsonb_build_object('system', sa::text), area_m2 = 20, qty = 1 where order_id = v_o1;
  insert into order_items(order_id, pos, width_mm, height_mm, qty, design, options, materials, calc, cost, area_m2)
  select v_o1, 2, width_mm, height_mm, 1, design, jsonb_build_object('system', sp::text), '{}', '{}', 0, 20 from order_items where order_id = v_o1 and pos = 1;
  update orders set status = 'installed', install_date = v_today, windows_count = 2, area_m2 = 40 where id = v_o1;
  insert into order_shop_workers(order_id, employee_id) values (v_o1, abdu);
  insert into install_jobs(order_id, status) values (v_o1, 'done') returning id into v_job;
  insert into install_job_members(job_id, employee_id) values (v_job, islom), (v_job, islom2);
  insert into item_stage_marks(order_item_id, stage_id, done_by) select id, v_stage_shop, abdu from order_items where order_id = v_o1;
  insert into item_stage_marks(order_item_id, stage_id, done_by) select id, v_stage_inst, islom from order_items where order_id = v_o1;

  -- заказ 2: 10 м² термо
  perform pg_temp.as_login(v_rah);
  select (save_order(pg_temp.order_json('REGRESS Payroll 2', 3000000))->>'id')::uuid into v_o2;
  perform pg_temp.as_postgres();
  update order_items set options = jsonb_build_object('system', st::text), area_m2 = 10, qty = 1 where order_id = v_o2;
  update orders set status = 'installed', install_date = v_today, area_m2 = 10 where id = v_o2;
  insert into order_shop_workers(order_id, employee_id) values (v_o2, abdu);
  insert into install_jobs(order_id, status) values (v_o2, 'done') returning id into v_job;
  insert into install_job_members(job_id, employee_id) values (v_job, islom);
  insert into item_stage_marks(order_item_id, stage_id, done_by) select id, v_stage_shop, abdu from order_items where order_id = v_o2;
  insert into item_stage_marks(order_item_id, stage_id, done_by) select id, v_stage_inst, islom from order_items where order_id = v_o2;

  -- монтажник Islom: заказ 1 = 20×20000 + 20×20000 = 800 000; заказ 2 термо = 10×32000 = 320 000
  select coalesce(sum(amount), 0) into v_sum from payroll_lines(v_m) where employee_id = islom;
  perform pg_temp.t('Islom: mixed order 20A+20P + 10T = 1 120 000', v_sum = 1120000, v_sum::text);
  -- бригада: Islom 2 получает те же м² заказа 1 полностью (не делится): 800 000
  select coalesce(sum(amount), 0) into v_sum from payroll_lines(v_m) where employee_id = islom2;
  perform pg_temp.t('crew: Islom 2 gets full m2 of order 1 = 800 000', v_sum = 800000, v_sum::text);
  -- уста Abdumajit: заказ 1 = 20×16000 + 20×18000 = 680 000; заказ 2 = 10×32000 = 320 000
  select coalesce(sum(amount), 0) into v_sum from payroll_lines(v_m) where employee_id = abdu;
  perform pg_temp.t('Abdumajit: 680 000 + 320 000 = 1 000 000', v_sum = 1000000, v_sum::text);
  -- shogird: только оклад 4 000 000, не зависит от заказов
  select coalesce(sum(amount), 0) into v_sum from payroll_lines(v_m) where employee_id = nodir;
  perform pg_temp.t('shogird: salary 4 000 000 regardless of orders', v_sum = 4000000, v_sum::text);

  -- сервис не платится
  perform pg_temp.as_login(v_rah);
  perform close_service(create_service(v_o1, null, 'regress', null, islom, '{}'), 'cause', 'factory', 10000, null);
  perform pg_temp.as_postgres();
  select coalesce(sum(amount), 0) into v_sum from payroll_lines(v_m) where employee_id = islom;
  perform pg_temp.t('service adds nothing to installer pay', v_sum = 1120000, v_sum::text);

  -- бонус: отдельная строка, остальное не меняется
  insert into pay_rules(employee_id, basis, amount, valid_from, note) values (islom, 'bonus', 500000, v_today, 'regress bonus');
  select coalesce(sum(amount), 0) into v_sum from payroll_lines(v_m) where employee_id = islom;
  perform pg_temp.t('bonus 500 000 added as a separate line', v_sum = 1620000, v_sum::text);
  perform pg_temp.t('bonus line kind', exists (select 1 from payroll_lines(v_m) where employee_id = islom and kind = 'bonus' and amount = 500000));
  perform pg_temp.t('integrity ok after payroll', (integrity_check()->>'ok')::boolean, (integrity_check()->'failed')::text);
end $$;
