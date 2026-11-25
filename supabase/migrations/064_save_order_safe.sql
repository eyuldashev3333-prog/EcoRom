-- ECOROM 064: save_order — сервер больше не верит браузеру.
-- Тест №3 (A-1…A-9): принимались выдуманные материалы и несуществующие позиции склада, отрицательное количество («возврат» из ничего), 77 окон при одной позиции,
-- width_mm не совпадающая с чертежом, чертёж неверной структуры (белый экран), дубль клиента, два заказа при потере ответа, устаревшая вкладка стирала окна.
-- Теперь: шапка (windows_count, area_m2, calc_cost) считается на сервере по позициям; проверяются размеры, чертёж, материалы (существуют в каталоге, количество в пределах
-- расчётных строк); клиент находится по имени+телефону (без дублей); повтор запроса с тем же request_id возвращает тот же заказ; версия заказа (updated_at) защищает от
-- перезаписи устаревшей вкладкой. Цена ниже себестоимости или нулевая — не запрет, а предупреждение в ответе (warnings).
-- Откат: восстановить прежний save_order из 042/049 (+ флаг ecorom.rpc из 060); колонку request_id можно оставить.

alter table public.orders add column if not exists request_id uuid;
create unique index if not exists orders_request_id_key on public.orders (request_id) where request_id is not null;

create or replace function public.norm_phone(p text) returns text language sql immutable as $$
  select case when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) >= 7 then right(regexp_replace(p, '\D', '', 'g'), 9) end
$$;
create index if not exists clients_phone_norm_idx on public.clients (public.norm_phone(phone));

create or replace function public.save_order(p jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_client uuid := nullif(p->'client'->>'id', '')::uuid;
  v_order uuid := nullif(p->>'id', '')::uuid;
  v_req uuid := nullif(p->>'request_id', '')::uuid;
  v_no bigint;
  v_item uuid;
  it jsonb; m jsonb;
  keep uuid[] := '{}';
  v_status text; v_paid numeric; v_before text; v_after text; v_resend boolean := false;
  v_win int; v_area numeric; v_cost numeric; v_price numeric;
  v_ver timestamptz; v_cur_ver timestamptz; v_phone text; v_warn jsonb := '[]'::jsonb;
  v_pos int; v_w numeric; v_h numeric; v_qty int; v_cat uuid; v_mq numeric; v_lq numeric;
  v_hash text := $h$select md5(coalesce(string_agg(i.id::text || '|' || i.width_mm || '|' || i.height_mm || '|' || i.qty || '|' || i.design::text || '|' || i.options::text || '|' || i.materials::text, ';' order by i.id), '')) from order_items i where i.order_id = $1$h$;
begin
  perform set_config('ecorom.rpc', '1', true);
  if not public.is_rahbar() then raise exception 'Faqat rahbar buyurtma saqlay oladi'; end if;
  if coalesce(trim(p->'client'->>'full_name'), '') = '' then raise exception 'Mijoz ismi kiritilmagan'; end if;
  if jsonb_typeof(coalesce(p->'items', '[]'::jsonb)) <> 'array' then raise exception 'Oynalar ro''yxati noto''g''ri'; end if;

  -- повтор запроса с тем же request_id (ответ потерялся): отдаём тот же заказ, ничего не создавая
  if v_order is null and v_req is not null then
    select id, order_no into v_order, v_no from orders where request_id = v_req;
    if v_order is not null then
      return jsonb_build_object('id', v_order, 'order_no', v_no, 'dup', true, 'client_id', (select client_id from orders where id = v_order),
        'version', (select updated_at from orders where id = v_order),
        'items', (select coalesce(jsonb_agg(jsonb_build_object('pos', pos, 'id', id) order by pos), '[]') from order_items where order_id = v_order));
    end if;
  end if;

  if jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 and not exists (select 1 from orders where id = nullif(p->>'id', '')::uuid and status <> 'in_production') then raise exception 'Kamida bitta oyna qo''shing'; end if;

  -- ===== проверка позиций (до любой записи) =====
  v_win := 0; v_area := 0; v_cost := 0;
  for it in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) loop
    v_pos := coalesce((it->>'pos')::int, 0);
    v_w := (it->>'width_mm')::numeric; v_h := (it->>'height_mm')::numeric; v_qty := coalesce((it->>'qty')::int, 1);
    if v_pos < 1 then raise exception 'Pozitsiya raqami noto''g''ri'; end if;
    if v_w is null or v_h is null or v_w < 100 or v_h < 100 or v_w > 20000 or v_h > 20000 then raise exception '%-oyna: o''lcham noto''g''ri (100…20000 mm)', v_pos; end if;
    if v_qty < 1 or v_qty > 999 then raise exception '%-oyna: soni 1…999 bo''lsin', v_pos; end if;
    if coalesce((it->>'cost')::numeric, 0) < 0 or coalesce((it->>'cost')::numeric, 0) > 1e10 then raise exception '%-oyna: narx noto''g''ri', v_pos; end if;
    if coalesce((it->>'area_m2')::numeric, 0) < 0 or coalesce((it->>'area_m2')::numeric, 0) > 10000 then raise exception '%-oyna: maydon noto''g''ri', v_pos; end if;
    -- чертёж: объект с корнем leaf/split и теми же размерами (белый экран у цеха/монтажа из-за пустого design больше невозможен)
    if coalesce(jsonb_typeof(it->'design'), '') <> 'object' or coalesce(jsonb_typeof(it->'design'->'root'), '') <> 'object' or coalesce(it->'design'->'root'->>'kind', '') not in ('leaf', 'split') then
      raise exception '%-oyna: chizma noto''g''ri', v_pos;
    end if;
    if abs(coalesce((it->'design'->>'width')::numeric, -1) - v_w) > 1 or abs(coalesce((it->'design'->>'height')::numeric, -1) - v_h) > 1 then
      raise exception '%-oyna: o''lcham chizmaga mos kelmaydi', v_pos;
    end if;
    -- материалы: существуют в каталоге, количество в пределах расчётных строк (выдуманные и отрицательные отклоняются)
    if it ? 'materials' and jsonb_typeof(it->'materials') <> 'object' then raise exception '%-oyna: materiallar noto''g''ri', v_pos; end if;
    if jsonb_typeof(it->'materials'->'items') is not null and jsonb_typeof(it->'materials'->'items') <> 'array' then raise exception '%-oyna: materiallar ro''yxati noto''g''ri', v_pos; end if;
    for m in select * from jsonb_array_elements(coalesce(it->'materials'->'items', '[]'::jsonb)) loop
      v_mq := (m->>'qty')::numeric;
      if v_mq is null or v_mq < 0 or v_mq > 1000000 then raise exception '%-oyna: material miqdori noto''g''ri', v_pos; end if;
      begin v_cat := (m->>'item_id')::uuid; exception when others then raise exception '%-oyna: material kodi noto''g''ri', v_pos; end;
      if not exists (select 1 from catalog_items where id = v_cat) then raise exception '%-oyna: katalogda yo''q material', v_pos; end if;
      if jsonb_array_length(coalesce(it->'calc'->'lines', '[]'::jsonb)) > 0 then
        select coalesce(sum((l->>'qty')::numeric), 0) into v_lq from jsonb_array_elements(it->'calc'->'lines') l
         where l->>'item_id' = m->>'item_id' and coalesce(l->>'part', '') = coalesce(m->>'part', '');
        if v_mq > v_lq + 0.001 then raise exception '%-oyna: material hisob-kitobga mos kelmaydi', v_pos; end if;
      end if;
    end loop;
    v_win := v_win + v_qty;
    v_area := v_area + coalesce((it->>'area_m2')::numeric, 0) * v_qty;
    v_cost := v_cost + coalesce((it->>'cost')::numeric, 0) * v_qty;
  end loop;
  v_area := round(v_area, 2); v_cost := round(v_cost, 2);
  v_price := coalesce((p->>'contract_price')::numeric, 0);
  if v_price < 0 or v_price > 1e12 then raise exception 'Shartnoma narxi noto''g''ri'; end if;
  if coalesce((p->>'markup')::numeric, 0.37) < 0 or coalesce((p->>'markup')::numeric, 0.37) > 10 or coalesce((p->>'discount_pct')::numeric, 0) < 0 or coalesce((p->>'discount_pct')::numeric, 0) > 100 then
    raise exception 'Ustama yoki chegirma noto''g''ri';
  end if;
  if v_price = 0 then v_warn := v_warn || '"price_zero"'::jsonb;
  elsif v_cost > 0 and v_price < v_cost then v_warn := v_warn || '"below_cost"'::jsonb; end if;

  -- ===== заказ и версия =====
  if v_order is not null then
    select status, updated_at into v_status, v_cur_ver from orders where id = v_order for update;
    if v_status is null then raise exception 'Buyurtma topilmadi'; end if;
    if nullif(p->>'version', '') is not null then
      v_ver := (p->>'version')::timestamptz;
      if v_cur_ver is distinct from v_ver then raise exception 'ZAKAZ_YANGILANGAN: buyurtma boshqa joyda o''zgartirilgan — sahifani yangilang'; end if;
    end if;
  end if;

  -- ===== клиент: без дублей по имени + телефону =====
  if v_client is null then
    v_phone := public.norm_phone(p->'client'->>'phone');
    if v_phone is not null then
      select id into v_client from clients where public.norm_phone(phone) = v_phone and lower(btrim(full_name)) = lower(btrim(p->'client'->>'full_name')) order by created_at limit 1;
    end if;
    if v_client is null then
      insert into clients(full_name, phone, address, created_by)
      values (btrim(p->'client'->>'full_name'), nullif(p->'client'->>'phone', ''), nullif(p->'client'->>'address', ''), public.my_id())
      returning id into v_client;
    end if;
  else
    update clients set full_name = btrim(p->'client'->>'full_name'), phone = nullif(p->'client'->>'phone', ''), address = nullif(p->'client'->>'address', '')
    where id = v_client;
  end if;

  if v_order is null then
    insert into orders(client_id, address, contact_phone, color, deadline, notes, windows_count, area_m2,
                       calc_cost, markup, calc_suggested, discount_pct, contract_price, created_by, request_id)
    values (v_client, nullif(p->>'address', ''), nullif(p->>'contact_phone', ''), nullif(p->>'color', ''), nullif(p->>'deadline', '')::date,
            nullif(p->>'notes', ''), v_win, v_area,
            v_cost, coalesce((p->>'markup')::numeric, 0.37), coalesce((p->>'calc_suggested')::numeric, 0),
            coalesce((p->>'discount_pct')::numeric, 0), v_price, public.my_id(), v_req)
    returning id, order_no into v_order, v_no;
  elsif v_status not in ('new', 'in_production') then
    -- заказ дальше цеха/закрыт/отменён: меняем только контактные данные и примечание (цена и окна неприкосновенны)
    update orders set client_id = v_client, address = nullif(p->>'address', ''), contact_phone = nullif(p->>'contact_phone', ''),
           deadline = nullif(p->>'deadline', '')::date, notes = nullif(p->>'notes', '')
    where id = v_order returning order_no into v_no;
    return jsonb_build_object('id', v_order, 'order_no', v_no, 'locked', true, 'client_id', v_client,
      'version', (select updated_at from orders where id = v_order), 'items', '[]'::jsonb, 'warnings', '[]'::jsonb);
  else
    select coalesce(sum(amount), 0) into v_paid from payments where order_id = v_order;
    if v_price < v_paid then
      raise exception 'Shartnoma narxi to''langan summadan (%) kam bo''lishi mumkin emas', to_char(v_paid, 'FM999G999G999G990');
    end if;
    if v_status = 'in_production' and jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then
      raise exception 'Zavoddagi buyurtmadan barcha oynalarni olib tashlab bo''lmaydi';
    end if;
    execute v_hash into v_before using v_order;
    update orders set client_id = v_client, address = nullif(p->>'address', ''), contact_phone = nullif(p->>'contact_phone', ''),
           color = nullif(p->>'color', ''), deadline = nullif(p->>'deadline', '')::date, notes = nullif(p->>'notes', ''),
           windows_count = v_win, area_m2 = v_area,
           calc_cost = v_cost, markup = coalesce((p->>'markup')::numeric, 0.37),
           calc_suggested = coalesce((p->>'calc_suggested')::numeric, 0), discount_pct = coalesce((p->>'discount_pct')::numeric, 0),
           contract_price = v_price
    where id = v_order
    returning order_no into v_no;
  end if;
  for it in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) loop
    v_item := nullif(it->>'id', '')::uuid;
    if v_item is null then
      insert into order_items(order_id, pos, title, width_mm, height_mm, qty, design, options, materials, calc, cost, area_m2, note)
      values (v_order, (it->>'pos')::int, nullif(it->>'title', ''), (it->>'width_mm')::int, (it->>'height_mm')::int, coalesce((it->>'qty')::int, 1),
              it->'design', coalesce(it->'options', '{}'), coalesce(it->'materials', '{}'), coalesce(it->'calc', '{}'),
              coalesce((it->>'cost')::numeric, 0), coalesce((it->>'area_m2')::numeric, 0), nullif(it->>'note', ''))
      returning id into v_item;
    else
      if exists (select 1 from item_stage_marks m2 where m2.order_item_id = v_item)
         and exists (select 1 from order_items x where x.id = v_item and x.order_id = v_order and (
               x.width_mm is distinct from (it->>'width_mm')::int or x.height_mm is distinct from (it->>'height_mm')::int
               or x.qty is distinct from coalesce((it->>'qty')::int, 1)
               or x.design is distinct from it->'design' or x.options is distinct from coalesce(it->'options', '{}'))) then
        raise exception '% -pozitsiyada ish boshlangan: o''lcham, son va sozlamalarni o''zgartirib bo''lmaydi (avval zavod belgilarini olib tashlang)', (it->>'pos');
      end if;
      update order_items set pos = (it->>'pos')::int, title = nullif(it->>'title', ''), width_mm = (it->>'width_mm')::int,
             height_mm = (it->>'height_mm')::int, qty = coalesce((it->>'qty')::int, 1), design = it->'design',
             options = coalesce(it->'options', '{}'), materials = coalesce(it->'materials', '{}'), calc = coalesce(it->'calc', '{}'),
             cost = coalesce((it->>'cost')::numeric, 0), area_m2 = coalesce((it->>'area_m2')::numeric, 0), note = nullif(it->>'note', '')
      where id = v_item and order_id = v_order;
    end if;
    keep := keep || v_item;
  end loop;
  if exists (select 1 from order_items i join item_stage_marks m2 on m2.order_item_id = i.id
             where i.order_id = v_order and not (i.id = any(keep))) then
    raise exception 'Bu pozitsiyada ish boshlangan — o''chirib bo''lmaydi';
  end if;
  delete from order_items where order_id = v_order and not (id = any(keep));
  if v_status = 'in_production' then
    execute v_hash into v_after using v_order;
    if v_after is distinct from v_before then
      perform public.send_to_shop(v_order, true);   -- склад пересчитан, цех уведомлён, старые ответы недействительны
      v_resend := true;
    end if;
  end if;
  return jsonb_build_object('id', v_order, 'order_no', v_no, 'resent', v_resend, 'client_id', v_client,
    'version', (select updated_at from orders where id = v_order),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('pos', pos, 'id', id) order by pos), '[]') from order_items where order_id = v_order),
    'warnings', v_warn);
end $$;
revoke all on function public.save_order(jsonb) from public, anon;
grant execute on function public.save_order(jsonb) to authenticated;
