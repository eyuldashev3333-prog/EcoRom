-- Блок «обрезки, клиенты из таблицы, инвентаризация». Требует миграцию 072.
do $$
declare v_rah text := (select login from public.employees where role = 'rahbar' and is_active order by login limit 1);
        v_item uuid; v_o uuid; v_oc uuid; v_n int; r jsonb;
begin
  perform pg_temp.as_postgres();
  select id into v_item from catalog_items where kind = 'system' order by id limit 1;
  perform pg_temp.as_login(v_rah);
  select (save_order(pg_temp.order_json('REGRESS Cut A', 900000))->>'id')::uuid into v_o;

  -- обрезки: нормальный раскрой; неверные данные — понятная ошибка
  perform pg_temp.err('bad offcut part rejected', format($f$select apply_cutting(%L, '{}'::uuid[], %L::jsonb)$f$, v_o, jsonb_build_array(jsonb_build_object('item_id', v_item, 'part', 'xxx', 'length_mm', 500))), 'Obrezok ma');
  perform pg_temp.err('huge offcut length rejected', format($f$select apply_cutting(%L, '{}'::uuid[], %L::jsonb)$f$, v_o, jsonb_build_array(jsonb_build_object('item_id', v_item, 'part', 'rama', 'length_mm', 999999))), 'Obrezok ma');
  perform pg_temp.err('unknown offcut id rejected', format($f$select apply_cutting(%L, array[gen_random_uuid()], '[]'::jsonb)$f$, v_o), 'topilmadi');
  perform apply_cutting(v_o, '{}'::uuid[], jsonb_build_array(jsonb_build_object('item_id', v_item, 'part', 'rama', 'length_mm', 800)));
  select id into v_oc from offcuts where source_order_id = v_o limit 1;
  perform pg_temp.t('offcut created', v_oc is not null);

  -- второй заказ берёт этот обрезок; третий не может взять тот же
  select (save_order(pg_temp.order_json('REGRESS Cut B', 900000))->>'id')::uuid into v_o;
  perform apply_cutting(v_o, array[v_oc], '[]'::jsonb);
  perform pg_temp.t('offcut marked used', (select used_at is not null and used_order_id = v_o from offcuts where id = v_oc));
  declare v_o3 uuid;
  begin
    select (save_order(pg_temp.order_json('REGRESS Cut C', 900000))->>'id')::uuid into v_o3;
    perform pg_temp.err('used offcut cannot be taken again', format($f$select apply_cutting(%L, array[%L::uuid], '[]'::jsonb)$f$, v_o3, v_oc), 'allaqachon ishlatilgan');
  end;
  -- заказ B отменён до начала работ → обрезок возвращается
  perform set_order_status(v_o, 'cancelled');
  perform pg_temp.t('cancel returns used offcut to registry', (select used_at is null and used_order_id is null from offcuts where id = v_oc));

  -- клиенты из таблицы: тёзки с разными телефонами — разные люди; тот же телефон — тот же человек
  perform registratsiya_add(jsonb_build_object('full_name', 'REGRESS Tezka', 'phone', '+998901110001', 'dogovor', 1000000));
  perform registratsiya_add(jsonb_build_object('full_name', 'REGRESS Tezka', 'phone', '+998901110002', 'dogovor', 2000000));
  perform registratsiya_add(jsonb_build_object('full_name', 'regress tezka', 'phone', '90 111 00 01', 'dogovor', 3000000));
  select count(*) into v_n from clients where full_name ilike 'REGRESS Tezka';
  perform pg_temp.t('two different people with same name stay separate (2 clients)', v_n = 2, v_n::text);

  -- инвентаризация: пустой факт — понятная ошибка
  perform pg_temp.err('stock_count empty fact', format($f$select stock_count(%L::jsonb)$f$, jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('item_id', v_item, 'part', '')))), 'Haqiqiy qoldiq');
end $$;
