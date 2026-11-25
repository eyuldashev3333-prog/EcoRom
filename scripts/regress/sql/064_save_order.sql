-- Блок «заказ»: save_order не верит браузеру. Требует миграцию 064.
do $$
declare v_rah text := (select login from public.employees where role = 'rahbar' and is_active order by login limit 1);
        v_cat uuid; r jsonb; r2 jsonb; v_id uuid; v_ver text; v_n int; v_o jsonb; v_req uuid := gen_random_uuid();
begin
  select id into v_cat from catalog_items where kind not in ('system') order by id limit 1;
  perform pg_temp.as_login(v_rah);

  -- 1. нормальный заказ: шапка пересчитана по позициям, не по присланным цифрам
  v_o := pg_temp.order_json('REGRESS Save A', 1000000) || jsonb_build_object('windows_count', 77, 'area_m2', 999, 'calc_cost', 99999999);
  r := save_order(v_o);
  perform pg_temp.t('save returns id/version/items', r->>'id' is not null and r->>'version' is not null and jsonb_array_length(r->'items') = 1, r::text);
  perform pg_temp.t('header recomputed from items', (select windows_count = 1 and area_m2 = 1.2 and calc_cost = 100 from orders where id = (r->>'id')::uuid));
  perform pg_temp.t('warning below_cost when price < cost', (pg_temp.order_json('REGRESS Save B', 50) || '{}'::jsonb) is not null);
  r2 := save_order(pg_temp.order_json('REGRESS Save B', 50));
  perform pg_temp.t('below_cost warning', r2->'warnings' ? 'below_cost', r2::text);
  r2 := save_order(pg_temp.order_json('REGRESS Save C', 0));
  perform pg_temp.t('price_zero warning', r2->'warnings' ? 'price_zero', r2::text);

  -- 2. плохие данные отклоняются
  perform pg_temp.err('empty design rejected', format($f$select save_order(%L::jsonb)$f$, jsonb_set(pg_temp.order_json('REGRESS Bad1'), '{items,0,design}', '{}'::jsonb)), 'chizma');
  perform pg_temp.err('design/width mismatch rejected', format($f$select save_order(%L::jsonb)$f$, jsonb_set(pg_temp.order_json('REGRESS Bad2'), '{items,0,width_mm}', '3000')), 'chizmaga');
  perform pg_temp.err('qty 0 rejected', format($f$select save_order(%L::jsonb)$f$, jsonb_set(pg_temp.order_json('REGRESS Bad3'), '{items,0,qty}', '0')), 'soni');
  perform pg_temp.err('negative cost rejected', format($f$select save_order(%L::jsonb)$f$, jsonb_set(pg_temp.order_json('REGRESS Bad4'), '{items,0,cost}', '-5')), 'narx');
  perform pg_temp.err('fake material item rejected', format($f$select save_order(%L::jsonb)$f$, jsonb_set(pg_temp.order_json('REGRESS Bad5'), '{items,0,materials,items}', '[{"item_id":"00000000-0000-0000-0000-000000000000","part":"","qty":1}]'::jsonb)), 'katalogda yo');
  perform pg_temp.err('negative material qty rejected', format($f$select save_order(%L::jsonb)$f$, jsonb_set(pg_temp.order_json('REGRESS Bad6'), '{items,0,materials,items}', jsonb_build_array(jsonb_build_object('item_id', v_cat, 'part', '', 'qty', -3)))), 'miqdori');
  perform pg_temp.err('material not in calc lines rejected', format($f$select save_order(%L::jsonb)$f$,
      jsonb_set(jsonb_set(pg_temp.order_json('REGRESS Bad7'), '{items,0,materials,items}', jsonb_build_array(jsonb_build_object('item_id', v_cat, 'part', '', 'qty', 5))),
                '{items,0,calc,lines}', jsonb_build_array(jsonb_build_object('item_id', v_cat, 'part', '', 'qty', 1, 'sum', 1)))), 'hisob-kitobga');
  perform pg_temp.okq('valid material within lines accepted', format($f$select save_order(%L::jsonb)$f$,
      jsonb_set(jsonb_set(pg_temp.order_json('REGRESS Good7'), '{items,0,materials,items}', jsonb_build_array(jsonb_build_object('item_id', v_cat, 'part', '', 'qty', 1))),
                '{items,0,calc,lines}', jsonb_build_array(jsonb_build_object('item_id', v_cat, 'part', '', 'qty', 1, 'sum', 1)))));

  -- 3. дубль клиента по имени+телефону не создаётся (регистр/формат телефона не важны)
  perform save_order(pg_temp.order_json('REGRESS Dup Client') || jsonb_build_object('client', jsonb_build_object('full_name', 'REGRESS Dup Client', 'phone', '+998 90 111 22 33')));
  perform save_order(pg_temp.order_json('REGRESS Dup Client') || jsonb_build_object('client', jsonb_build_object('full_name', ' regress dup client ', 'phone', '998901112233')));
  select count(*) into v_n from clients where lower(btrim(full_name)) = 'regress dup client';
  perform pg_temp.t('client deduped by name+phone', v_n = 1, v_n::text);

  -- 4. идемпотентность: тот же request_id → тот же заказ, один заказ и один клиент
  r := save_order(pg_temp.order_json('REGRESS Req Client') || jsonb_build_object('request_id', v_req));
  r2 := save_order(pg_temp.order_json('REGRESS Req Client') || jsonb_build_object('request_id', v_req));
  perform pg_temp.t('replay returns same order', r->>'id' = r2->>'id' and (r2->>'dup')::boolean, r2::text);
  select count(*) into v_n from orders where request_id = v_req;
  perform pg_temp.t('one order per request_id', v_n = 1);

  -- 5. версия: устаревшая вкладка получает ZAKAZ_YANGILANGAN и ничего не стирает; актуальная версия проходит
  v_id := (r->>'id')::uuid; v_ver := r->>'version';
  r2 := save_order(pg_temp.order_json('REGRESS Req Client') || jsonb_build_object('id', v_id, 'client', jsonb_build_object('id', r->>'client_id', 'full_name', 'REGRESS Req Client', 'phone', '+998900000000'), 'version', v_ver, 'address', 'tab A'));
  perform pg_temp.t('current version accepted, new version returned', r2->>'version' is not null);
  -- в одной транзакции now() не меняется — имитируем «другая вкладка сохранила позже»: сдвигаем updated_at вручную (триггер на время отключаем)
  perform pg_temp.as_postgres();
  alter table orders disable trigger trg_orders_upd;
  update orders set updated_at = updated_at + interval '5 seconds' where id = v_id;
  alter table orders enable trigger trg_orders_upd;
  perform pg_temp.as_login(v_rah);
  perform pg_temp.err('stale version rejected', format($f$select save_order(%L::jsonb)$f$,
      pg_temp.order_json('REGRESS Req Client') || jsonb_build_object('id', v_id, 'client', jsonb_build_object('id', r->>'client_id', 'full_name', 'REGRESS Req Client', 'phone', '+998900000000'), 'version', v_ver, 'address', 'tab B')), 'ZAKAZ_YANGILANGAN');
  perform pg_temp.t('stale save changed nothing', (select address from orders where id = v_id) = 'tab A');
end $$;