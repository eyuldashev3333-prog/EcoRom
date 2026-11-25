-- Блок «права»: монтажник и закрытые заказы/фото. Требует миграцию 062.
do $$
declare v_rah text := (select login from public.employees where role = 'rahbar' and is_active order by login limit 1);
        v_mon text := (select login from public.employees where role = 'montajchi' and is_active order by login limit 1);
        v_mon_id uuid; v_o uuid; v_n int; v_row record; v_ok boolean;
begin
  select id into v_mon_id from employees where login = v_mon;
  perform pg_temp.as_login(v_rah);
  select (save_order(pg_temp.order_json('REGRESS Photo Client', 900000))->>'id')::uuid into v_o;
  perform pg_temp.as_postgres();
  update orders set status = 'ready', address = 'REGRESS manzil' where id = v_o;
  perform pg_temp.as_login(v_rah);
  perform assign_install(v_o, (now() at time zone 'Asia/Tashkent')::date, array[v_mon_id], null);

  -- активный заказ: монтажник видит клиента, телефон, адрес
  perform pg_temp.as_login(v_mon);
  select client_name, contact_phone, address into v_row from w_orders where id = v_o;
  perform pg_temp.t('active order shows client to installer', v_row.client_name is not null and v_row.contact_phone is not null and v_row.address is not null);

  -- загрузка фото в активный заказ: до 6 файлов, 7-й отклонён
  for v_n in 1..6 loop
    begin insert into storage.objects(bucket_id, name) values ('install-photos', v_o::text || '/install/t' || v_n || '.jpg'); v_ok := true; exception when others then v_ok := false; end;
    perform pg_temp.t('upload ' || v_n || ' allowed', v_ok);
  end loop;
  perform pg_temp.err('upload 7 rejected (limit)', format($f$insert into storage.objects(bucket_id, name) values ('install-photos', '%s/install/t7.jpg')$f$, v_o));
  perform pg_temp.t('photo_exists own file', photo_exists(v_o::text || '/install/t1.jpg'));
  perform pg_temp.t('photo_exists foreign path false', not photo_exists(gen_random_uuid()::text || '/install/x.jpg'));
  perform pg_temp.err('install_done > 3 photos', format($f$select install_done(%L, true, array['a','b','c','d'])$f$, v_o), '3 tadan');

  -- закрытый заказ: клиент/телефон/адрес скрыты, загрузка запрещена
  perform pg_temp.as_postgres();
  update orders set status = 'closed' where id = v_o;
  perform pg_temp.as_login(v_mon);
  select client_name, contact_phone, address into v_row from w_orders where id = v_o;
  perform pg_temp.t('closed order hides client from installer', v_row.client_name is null and v_row.contact_phone is null and v_row.address is null);
  perform pg_temp.err('upload to closed order rejected', format($f$insert into storage.objects(bucket_id, name) values ('install-photos', '%s/install/late.jpg')$f$, v_o));

  -- order_has_install_photo: чужой заказ не зондируется монтажником, аноним не вызывает
  perform pg_temp.t('order_has_install_photo foreign = false', not order_has_install_photo(gen_random_uuid()));
  perform pg_temp.as_anon();
  perform pg_temp.err('anon order_has_install_photo', format($f$select order_has_install_photo(%L)$f$, v_o), 'permission denied');
  perform pg_temp.as_postgres();
end $$;
