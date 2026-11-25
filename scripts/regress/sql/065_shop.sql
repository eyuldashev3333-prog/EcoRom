-- Блок «цех»: ответ только в производстве, команда не меняется после «Tayyor», руководитель не «захватывается» ожиданием причины. Требует миграцию 065.
do $$
declare v_rah text := (select login from public.employees where role = 'rahbar' and is_active order by login limit 1);
        v_ish text := (select login from public.employees where role = 'ishlab' and is_active order by login limit 1);
        v_ish_id uuid; v_rah_id uuid; v_ish2 uuid; v_o uuid; r jsonb; v_n int; v_tg bigint := 9100000000 + (random() * 1000000)::bigint;
begin
  select id into v_ish_id from employees where login = v_ish;
  select id into v_rah_id from employees where login = v_rah;
  perform pg_temp.as_login(v_rah);
  select (save_order(pg_temp.order_json('REGRESS Shop', 800000))->>'id')::uuid into v_o;
  perform pg_temp.as_postgres();
  insert into employees(full_name, role, is_active, login, telegram_id) values ('REGRESS ishlab 2', 'ishlab', true, 'regress_ish2', v_tg) returning id into v_ish2;
  perform pg_temp.as_login(v_rah);
  perform send_to_shop(v_o, false, array[v_ish_id, v_ish2]);

  -- руководитель отвечает «Material yetmaydi» из бота: ожидание причины для него НЕ ставится
  perform pg_temp.as_postgres();
  perform shop_answer_core(v_rah_id, v_o, 'not_enough', 123456789, null);
  select count(*) into v_n from bot_pending where telegram_id = 123456789;
  perform pg_temp.t('rahbar answer does not wait for reason text', v_n = 0, v_n::text);
  -- сотрудник цеха — ожидание ставится, причину принимает только он
  r := shop_answer_core(v_ish2, v_o, 'not_enough', v_tg, null);
  perform pg_temp.t('first answer by rahbar wins; later shop answer is late', coalesce((r->>'ok')::boolean, false) = false and (r->>'taken')::boolean, r::text);

  -- переотправка: новый круг ответов; сотрудник цеха отвечает «yetmaydi» → причину ждём; руководителю текст не уходит в причину
  update orders set shop_sent_at = now() + interval '1 second' where id = v_o;   -- «новая отправка»: прежние ответы недействительны
  delete from order_material_checks where order_id = v_o;
  r := shop_answer_core(v_ish2, v_o, 'not_enough', v_tg, null);
  perform pg_temp.t('shop worker answer accepted and waits for reason', (r->>'ok')::boolean and (r->>'need_reason')::boolean, r::text);
  perform pg_temp.t('reason from rahbar telegram ignored', shop_reason(123456789, 'obed 150000') is null);
  perform pg_temp.t('reason from shop worker accepted', (shop_reason(v_tg, 'oq profil 2 xlist')->>'ok')::boolean);

  -- заказ готов: ответ «Material yetmaydi» отклоняется, команду менять нельзя
  perform pg_temp.as_postgres();
  update orders set status = 'ready' where id = v_o;
  r := shop_answer_core(v_ish_id, v_o, 'not_enough', null, 'test');
  perform pg_temp.t('answer on ready order rejected', not coalesce((r->>'ok')::boolean, false), r::text);
  perform pg_temp.as_login(v_rah);
  perform pg_temp.err('team change after Tayyor rejected', format($f$select shop_set_workers(%L, array[%L::uuid])$f$, v_o, v_ish_id), 'Tayyor buyurtmada');
  perform pg_temp.as_postgres();
  update orders set status = 'in_production' where id = v_o;
  perform pg_temp.as_login(v_rah);
  perform pg_temp.okq('team change while in production allowed', format($f$select shop_set_workers(%L, array[%L::uuid])$f$, v_o, v_ish_id));
end $$;
