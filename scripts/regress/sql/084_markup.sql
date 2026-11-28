-- Блок «маржа компании» (миграция 084): по умолчанию 35%, ниже минимума нельзя; старые заказы с 0% сохраняются, пока маржу не трогают; импорт не проверяется.
select pg_temp.as_login((select login from public.employees where role = 'rahbar' and is_active order by login limit 1));

select pg_temp.t('настройка markup = 0.35', (select (value #>> '{}')::numeric from app_settings where key = 'markup') = 0.35);
select pg_temp.t('настройка markup_min = 0.35', (select (value #>> '{}')::numeric from app_settings where key = 'markup_min') = 0.35);

select pg_temp.err('новый заказ с маржой 20% — ошибка', $$select save_order(pg_temp.order_json('REGRESS M1') || '{"markup": 0.2}')$$, 'Marja 35%');
select pg_temp.err('новый заказ с маржой 0 — ошибка', $$select save_order(pg_temp.order_json('REGRESS M2') || '{"markup": 0}')$$, 'Marja');
select pg_temp.okq('новый заказ с маржой 35% — ок', $$select save_order(pg_temp.order_json('REGRESS M3') || '{"markup": 0.35}')$$);
select pg_temp.okq('новый заказ с маржой 50% — ок', $$select save_order(pg_temp.order_json('REGRESS M4') || '{"markup": 0.5}')$$);

do $$
declare v_ord uuid; v_old uuid; j jsonb;
begin
  -- поднять и понизить маржу существующего заказа
  j := save_order(pg_temp.order_json('REGRESS M5') || '{"markup": 0.5}');
  v_ord := (j->>'id')::uuid;
  perform pg_temp.okq('поднять маржу 50% → 60%', format($f$select save_order(pg_temp.order_json('REGRESS M5') || jsonb_build_object('id', %L::uuid, 'version', (select updated_at from orders where id = %L), 'markup', 0.6))$f$, v_ord, v_ord));
  perform pg_temp.err('понизить маржу 60% → 30% — ошибка', format($f$select save_order(pg_temp.order_json('REGRESS M5') || jsonb_build_object('id', %L::uuid, 'version', (select updated_at from orders where id = %L), 'markup', 0.3))$f$, v_ord, v_ord), 'Marja');
  perform pg_temp.okq('понизить до 35% — ок', format($f$select save_order(pg_temp.order_json('REGRESS M5') || jsonb_build_object('id', %L::uuid, 'version', (select updated_at from orders where id = %L), 'markup', 0.35))$f$, v_ord, v_ord));

  -- «старый» заказ с маржой 0 (как №2600–2602): ставим 0 от владельца базы, мимо правила
  j := save_order(pg_temp.order_json('REGRESS M6') || '{"markup": 0.35}');
  v_old := (j->>'id')::uuid;
  perform pg_temp.as_postgres();
  alter table orders disable trigger trg_03_order_markup;
  update orders set markup = 0 where id = v_old;
  alter table orders enable trigger trg_03_order_markup;
  perform pg_temp.as_login((select login from public.employees where role = 'rahbar' and is_active order by login limit 1));
  perform pg_temp.okq('старый заказ с 0% сохраняется без смены маржи', format($f$select save_order(pg_temp.order_json('REGRESS M6') || jsonb_build_object('id', %L::uuid, 'version', (select updated_at from orders where id = %L), 'markup', 0, 'notes', 'yangi izoh'))$f$, v_old, v_old));
  perform pg_temp.t('старый заказ: маржа осталась 0', (select markup from orders where id = v_old) = 0);
  perform pg_temp.err('старый заказ: 0% → 10% — ошибка (ниже минимума)', format($f$select save_order(pg_temp.order_json('REGRESS M6') || jsonb_build_object('id', %L::uuid, 'version', (select updated_at from orders where id = %L), 'markup', 0.1))$f$, v_old, v_old), 'Marja');
  perform pg_temp.okq('старый заказ: 0% → 35% — ок', format($f$select save_order(pg_temp.order_json('REGRESS M6') || jsonb_build_object('id', %L::uuid, 'version', (select updated_at from orders where id = %L), 'markup', 0.35))$f$, v_old, v_old));
end $$;

-- импорт истории не проверяется (registratsiya_add), прямое изменение маржи через REST закрыто (rpc-only)
select pg_temp.err('прямой update orders.markup — отклонён', $$update orders set markup = 0.1$$, '');
do $$
declare v uuid;
begin
  v := (save_order(pg_temp.order_json('REGRESS M7') || '{"markup": 0.35}')->>'id')::uuid;
  perform pg_temp.as_postgres();
  perform pg_temp.okq('импорт истории: маржа 0 разрешена', format($f$update orders set is_imported = true, markup = 0 where id = %L$f$, v));
  perform pg_temp.err('не импорт: маржа 0 от владельца базы тоже нельзя', format($f$update orders set is_imported = false, markup = 0.2 where id = %L$f$, v), 'Marja');
end $$;
select pg_temp.as_postgres();
