-- Блок «водитель» и «бонус». Требует миграцию 067.
do $$
declare v_rah text := (select login from public.employees where role = 'rahbar' and is_active order by login limit 1);
        v_mon uuid := (select id from public.employees where role = 'montajchi' and is_active order by login limit 1);
        v_au uuid := gen_random_uuid(); v_au2 uuid := gen_random_uuid(); v_drv uuid; v_drv2 uuid; v_x uuid; v_o uuid; v_job uuid; r jsonb; v_n int; v_row record; v_m date := date_trunc('month', (now() at time zone 'Asia/Tashkent'))::date;
begin
  perform pg_temp.as_postgres();
  insert into auth.users(id, email) values (v_au, 'regress-driver@ecorom.app'), (v_au2, 'regress-driver2@ecorom.app');
  insert into employees(full_name, role, is_active, login, auth_user_id, hired_at) values ('REGRESS Haydovchi', 'haydovchi', true, 'regress_drv', v_au, v_m) returning id into v_drv;
  insert into employees(full_name, role, is_active, login, auth_user_id) values ('REGRESS Haydovchi 2', 'haydovchi', true, 'regress_drv2', v_au2) returning id into v_drv2;
  insert into employees(full_name, role, is_active, login) values ('REGRESS Oshpaz', 'xodim', true, 'regress_cook') returning id into v_x;
  perform pg_temp.t('role xodim accepted', v_x is not null);

  perform pg_temp.as_login(v_rah);
  select (save_order(pg_temp.order_json('REGRESS Driver Client', 700000) || jsonb_build_object('address', 'REGRESS Manzil 5', 'contact_phone', '+998901234567'))->>'id')::uuid into v_o;
  perform pg_temp.as_postgres();
  update orders set status = 'ready' where id = v_o;
  perform pg_temp.as_login(v_rah);

  -- назначить бригаду и водителя; не-водитель в роли водителя отклоняется
  perform pg_temp.err('non-driver as driver rejected', format($f$select assign_install(%L, current_date, array[%L::uuid], null, %L)$f$, v_o, v_mon, v_mon), 'haydovchi');
  v_job := assign_install(v_o, (now() at time zone 'Asia/Tashkent')::date, array[v_mon], 'regress', v_drv);
  perform pg_temp.t('driver assigned on job', (select driver_id from install_jobs where id = v_job) = v_drv);
  perform pg_temp.as_postgres();
  select count(*) into v_n from notifications where employee_id = v_drv and text like '%Reys%' and text like '%REGRESS Manzil 5%' and text like '%+998901234567%' and payload->>'kind' = 'delivery';
  perform pg_temp.t('driver got delivery notification with number/address/phone', v_n = 1, v_n::text);

  -- водитель: видит только свой рейс (номер, адрес, телефон), никаких денег и чужих данных
  perform pg_temp.as_login('regress_drv');
  select * into v_row from w_deliveries;
  perform pg_temp.t('driver sees own delivery with address and phone', v_row.address = 'REGRESS Manzil 5' and v_row.contact_phone = '+998901234567' and v_row.order_no is not null);
  select count(*) into v_n from w_orders; perform pg_temp.t('driver sees no w_orders', v_n = 0);
  select count(*) into v_n from orders; perform pg_temp.t('driver sees no orders table', v_n = 0);
  select count(*) into v_n from payments; perform pg_temp.t('driver sees no payments', v_n = 0);
  select count(*) into v_n from clients; perform pg_temp.t('driver sees no clients', v_n = 0);
  perform pg_temp.t('driver does not see cash', (select cash from v_cash_balance) = 0 or (select cash from v_cash_balance) is null);
  perform pg_temp.err('driver cannot change order status', format($f$select set_order_status(%L, 'installed')$f$, v_o), 'rahbar');

  -- действия водителя
  r := driver_action(v_job, 'accept');
  perform pg_temp.t('driver accepts', (r->>'ok')::boolean, r::text);
  r := driver_action(v_job, 'delivered');
  perform pg_temp.t('driver delivers', (r->>'ok')::boolean, r::text);
  perform pg_temp.as_postgres();
  perform pg_temp.t('timestamps set', (select driver_accepted_at is not null and driver_delivered_at is not null from install_jobs where id = v_job));
  select count(*) into v_n from notifications where target_role = 'rahbar' and text like '%yetkazib berdi%';
  perform pg_temp.t('rahbar notified about delivery', v_n >= 1);
  -- чужой водитель не может действовать
  perform pg_temp.as_login('regress_drv2');
  r := driver_action(v_job, 'accept');
  perform pg_temp.t('other driver rejected', not (r->>'ok')::boolean, r::text);
  select count(*) into v_n from w_deliveries; perform pg_temp.t('other driver sees nothing', v_n = 0);

  -- закрытый заказ: адрес и телефон скрыты
  perform pg_temp.as_postgres();
  update orders set status = 'closed' where id = v_o;
  perform pg_temp.as_login('regress_drv');
  select * into v_row from w_deliveries;
  perform pg_temp.t('closed order hides address/phone from driver', v_row.address is null and v_row.contact_phone is null);

  -- бонус
  perform pg_temp.as_login(v_rah);
  perform give_bonus(v_x, 500000, null, 'regress bonus');
  perform pg_temp.as_postgres();
  select count(*) into v_n from payroll_lines(v_m) where employee_id = v_x and kind = 'bonus' and amount = 500000;
  perform pg_temp.t('bonus appears in payroll', v_n = 1, v_n::text);
  select count(*) into v_n from notifications where employee_id = v_x and text like '%Mukofot%';
  perform pg_temp.t('employee notified about bonus', v_n = 1);
  perform pg_temp.as_login(v_rah);
  perform pg_temp.err('bonus amount must be positive', format($f$select give_bonus(%L, 0)$f$, v_x), 'Summa');
  perform pg_temp.err('bonus date in future rejected', format($f$select give_bonus(%L, 1000, current_date + 30)$f$, v_x), 'Sana');
  perform pg_temp.as_postgres();
  insert into payroll_months(month, closed_at) values (date_trunc('month', (now() at time zone 'Asia/Tashkent') - interval '2 months')::date, now());
  perform pg_temp.as_login(v_rah);
  perform pg_temp.err('bonus into closed month rejected', format($f$select give_bonus(%L, 1000, %L)$f$, v_x, (date_trunc('month', (now() at time zone 'Asia/Tashkent') - interval '2 months')::date + 3)), 'yopilgan');
  perform pg_temp.as_postgres();
  perform pg_temp.as_login('regress_drv');
  perform pg_temp.err('driver cannot give bonus', format($f$select give_bonus(%L, 1000)$f$, v_x), 'rahbar');
end $$;
