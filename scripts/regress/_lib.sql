-- Общие функции регрессионных тестов (вставляются в начало каждого теста; всё во временной схеме, ничего не остаётся в базе).
-- Каждый тест выполняется в одной транзакции и заканчивается исключением RESULT: … — поэтому откатывается ВСЕГДА, боевые данные не меняются.
create temp table _res (n serial, name text, ok boolean, detail text) on commit drop;
-- счётчик номеров заказов (order_no_seq) не откатывается вместе с транзакцией: запоминаем и в finish() возвращаем, иначе каждый прогон тестов «съедает» номера настоящих заказов
create temp table _seq on commit drop as select last_value as lv, is_called as ic from public.order_no_seq;
grant all on _res to public;
grant usage on sequence _res_n_seq to public;

-- записать результат проверки
create or replace function pg_temp.t(p_name text, p_ok boolean, p_detail text default '') returns void language plpgsql as $$
begin insert into _res(name, ok, detail) values (p_name, coalesce(p_ok, false), left(coalesce(p_detail, ''), 300)); end $$;

-- войти как сотрудник (по логину) с ролью authenticated; as_postgres() — вернуться
create or replace function pg_temp.as_login(p_login text) returns void language plpgsql as $$
declare v_auth uuid;
begin
  reset role;
  select auth_user_id into v_auth from public.employees where login = p_login;
  if v_auth is null then raise exception 'нет сотрудника %', p_login; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;
create or replace function pg_temp.as_postgres() returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claims', '', true); end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true); set local role anon; end $$;

-- ожидаем ошибку, текст которой содержит p_pattern (любой регистр); p_sql выполняется от текущей роли
create or replace function pg_temp.err(p_name text, p_sql text, p_pattern text default '') returns void language plpgsql as $$
begin
  execute p_sql;
  perform pg_temp.t(p_name, false, 'ожидалась ошибка, но запрос прошёл');
exception when others then
  perform pg_temp.t(p_name, p_pattern = '' or sqlerrm ilike '%' || p_pattern || '%', 'ошибка: ' || sqlerrm);
end $$;

-- ожидаем успех
create or replace function pg_temp.okq(p_name text, p_sql text) returns void language plpgsql as $$
begin
  execute p_sql;
  perform pg_temp.t(p_name, true);
exception when others then
  perform pg_temp.t(p_name, false, 'ошибка: ' || sqlerrm);
end $$;

-- завершение: вернуть результаты (через исключение — транзакция откатывается)
create or replace function pg_temp.finish() returns void language plpgsql as $$
declare r jsonb;
begin
  reset role;
  -- вернуть счётчик, если за время теста не появилось настоящего (не тестового) заказа с большим номером
  if not exists (select 1 from public.orders o join public.clients c on c.id = o.client_id where c.full_name not ilike 'REGRESS%' and o.order_no > (select lv from _seq) and o.order_no < 9000000) then
    perform setval('public.order_no_seq', (select lv from _seq), (select ic from _seq));
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'ok', ok, 'detail', detail) order by n), '[]') into r from _res;
  raise exception 'RESULT: %', r;
end $$;

-- пример заказа для save_order (одна позиция); p_client — имя клиента
create or replace function pg_temp.order_json(p_client text, p_price numeric default 1000000) returns jsonb language sql as $$
  select jsonb_build_object(
    'id', null, 'client', jsonb_build_object('full_name', p_client, 'phone', '+998900000000', 'address', 'regress'), 'address', 'regress', 'contact_phone', '+998900000000',
    'deadline', '', 'notes', '', 'windows_count', 1, 'area_m2', 1.2, 'calc_cost', 100, 'markup', 0.37, 'calc_suggested', 137, 'discount_pct', 0, 'contract_price', p_price,
    'items', jsonb_build_array(jsonb_build_object('pos', 1, 'title', 'regress w1', 'width_mm', 1000, 'height_mm', 1200, 'qty', 1,
      'design', jsonb_build_object('width', 1000, 'height', 1200, 'shape', 'rect', 'root', jsonb_build_object('kind', 'leaf', 'id', 'a', 'opening', 'fixed')),
      'options', '{}'::jsonb, 'materials', jsonb_build_object('items', '[]'::jsonb), 'calc', jsonb_build_object('lines', '[]'::jsonb), 'cost', 100, 'area_m2', 1.2, 'note', '')));
$$;
