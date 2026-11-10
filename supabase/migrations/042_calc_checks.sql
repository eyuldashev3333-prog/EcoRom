-- ECOROM 042 (блок 5 плана исправлений): калькуляция — серверные проверки (M2).
-- Размеры окон в разумных пределах; отправка в цех с нулевой ценой блокируется (можно подтвердить отдельно, p_force).
alter table public.order_items drop constraint if exists order_items_values_chk;
alter table public.order_items add constraint order_items_values_chk check (
  qty between 1 and 1000 and width_mm between 100 and 10000 and height_mm between 100 and 10000 and cost >= 0 and area_m2 >= 0);

drop function if exists public.send_to_shop(uuid);
CREATE OR REPLACE FUNCTION public.send_to_shop(p_order uuid, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v orders; v_resend boolean;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  select * into v from orders where id = p_order;
  if v.id is null then raise exception 'Buyurtma topilmadi'; end if;
  if v.status not in ('new', 'in_production') then raise exception 'Bu holatdagi buyurtma zavodga yuborilmaydi'; end if;
  if not exists (select 1 from order_items where order_id = p_order) then raise exception 'Buyurtmada oyna yo''q'; end if;
  if not coalesce(p_force, false) and (coalesce(v.calc_cost, 0) <= 0 or coalesce(v.contract_price, 0) <= 0) then
    raise exception 'NARX_NOL: tannarx yoki shartnoma narxi 0 — avval katalogga narxlarni kiriting';
  end if;
  v_resend := v.shop_sent_at is not null;
  update orders set status = 'in_production', shop_sent_at = now(), shop_sent_by = public.my_id(),
                    shop_reminded_at = null, shop_escalated_at = null
  where id = p_order;
  perform public.order_consume(p_order);
  perform public.notify('ishlab', null,
    case when v_resend then '🔁 Buyurtma o''zgardi — qayta tekshiring' else '🆕 Yangi buyurtma' end || E'\n'
    || public.shop_order_text(p_order) || E'\n\nSizda material yetadimi?',
    jsonb_build_object('kind', 'material_check', 'order_id', p_order));
  return jsonb_build_object('ok', true, 'resend', v_resend,
    'recipients', (select count(*) from employees where role = 'ishlab' and is_active and telegram_id is not null));
end $function$;

CREATE OR REPLACE FUNCTION public.save_order(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_client uuid := nullif(p->'client'->>'id', '')::uuid;
  v_order uuid := nullif(p->>'id', '')::uuid;
  v_no bigint;
  v_item uuid;
  it jsonb;
  keep uuid[] := '{}';
  v_status text; v_paid numeric; v_before text; v_after text; v_resend boolean := false;
  v_hash text := $h$select md5(coalesce(string_agg(i.id::text || '|' || i.width_mm || '|' || i.height_mm || '|' || i.qty || '|' || i.design::text || '|' || i.options::text || '|' || i.materials::text, ';' order by i.id), '')) from order_items i where i.order_id = $1$h$;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar buyurtma saqlay oladi'; end if;
  if coalesce(trim(p->'client'->>'full_name'), '') = '' then raise exception 'Mijoz ismi kiritilmagan'; end if;
  if jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 and not exists (select 1 from orders where id = nullif(p->>'id', '')::uuid and status not in ('new', 'in_production')) then raise exception 'Kamida bitta oyna qo''shing'; end if;
  if v_order is not null then
    select status into v_status from orders where id = v_order for update;
    if v_status is null then raise exception 'Buyurtma topilmadi'; end if;
  end if;
  if v_client is null then
    insert into clients(full_name, phone, address, created_by)
    values (trim(p->'client'->>'full_name'), nullif(p->'client'->>'phone', ''), nullif(p->'client'->>'address', ''), public.my_id())
    returning id into v_client;
  else
    update clients set full_name = trim(p->'client'->>'full_name'), phone = nullif(p->'client'->>'phone', ''), address = nullif(p->'client'->>'address', '')
    where id = v_client;
  end if;
  if v_order is null then
    insert into orders(client_id, address, contact_phone, color, deadline, notes, windows_count, area_m2,
                       calc_cost, markup, calc_suggested, discount_pct, contract_price, created_by)
    values (v_client, nullif(p->>'address', ''), nullif(p->>'contact_phone', ''), nullif(p->>'color', ''), nullif(p->>'deadline', '')::date,
            nullif(p->>'notes', ''), coalesce((p->>'windows_count')::int, 0), coalesce((p->>'area_m2')::numeric, 0),
            coalesce((p->>'calc_cost')::numeric, 0), coalesce((p->>'markup')::numeric, 0.37), coalesce((p->>'calc_suggested')::numeric, 0),
            coalesce((p->>'discount_pct')::numeric, 0), coalesce((p->>'contract_price')::numeric, 0), public.my_id())
    returning id, order_no into v_order, v_no;
  elsif v_status not in ('new', 'in_production') then
    -- заказ дальше цеха/закрыт/отменён: меняем только контактные данные и примечание (цена и окна неприкосновенны)
    update orders set client_id = v_client, address = nullif(p->>'address', ''), contact_phone = nullif(p->>'contact_phone', ''),
           deadline = nullif(p->>'deadline', '')::date, notes = nullif(p->>'notes', '')
    where id = v_order returning order_no into v_no;
    return jsonb_build_object('id', v_order, 'order_no', v_no, 'locked', true);
  else
    select coalesce(sum(amount), 0) into v_paid from payments where order_id = v_order;
    if coalesce((p->>'contract_price')::numeric, 0) < v_paid then
      raise exception 'Shartnoma narxi to''langan summadan (%) kam bo''lishi mumkin emas', to_char(v_paid, 'FM999G999G999G990');
    end if;
    if v_status = 'in_production' and jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then
      raise exception 'Zavoddagi buyurtmadan barcha oynalarni olib tashlab bo''lmaydi';
    end if;
    execute v_hash into v_before using v_order;
    update orders set client_id = v_client, address = nullif(p->>'address', ''), contact_phone = nullif(p->>'contact_phone', ''),
           color = nullif(p->>'color', ''), deadline = nullif(p->>'deadline', '')::date, notes = nullif(p->>'notes', ''),
           windows_count = coalesce((p->>'windows_count')::int, 0), area_m2 = coalesce((p->>'area_m2')::numeric, 0),
           calc_cost = coalesce((p->>'calc_cost')::numeric, 0), markup = coalesce((p->>'markup')::numeric, 0.37),
           calc_suggested = coalesce((p->>'calc_suggested')::numeric, 0), discount_pct = coalesce((p->>'discount_pct')::numeric, 0),
           contract_price = coalesce((p->>'contract_price')::numeric, 0)
    where id = v_order
    returning order_no into v_no;
  end if;
  for it in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) loop
    v_item := nullif(it->>'id', '')::uuid;
    if v_item is null then
      insert into order_items(order_id, pos, title, width_mm, height_mm, qty, design, options, materials, calc, cost, area_m2, note)
      values (v_order, (it->>'pos')::int, nullif(it->>'title', ''), (it->>'width_mm')::int, (it->>'height_mm')::int, coalesce((it->>'qty')::int, 1),
              coalesce(it->'design', '{}'), coalesce(it->'options', '{}'), coalesce(it->'materials', '{}'), coalesce(it->'calc', '{}'),
              coalesce((it->>'cost')::numeric, 0), coalesce((it->>'area_m2')::numeric, 0), nullif(it->>'note', ''))
      returning id into v_item;
    else
      if exists (select 1 from item_stage_marks m where m.order_item_id = v_item)
         and exists (select 1 from order_items x where x.id = v_item and x.order_id = v_order and (
               x.width_mm is distinct from (it->>'width_mm')::int or x.height_mm is distinct from (it->>'height_mm')::int
               or x.qty is distinct from coalesce((it->>'qty')::int, 1)
               or x.design is distinct from coalesce(it->'design', '{}') or x.options is distinct from coalesce(it->'options', '{}'))) then
        raise exception '% -pozitsiyada ish boshlangan: o''lcham, son va sozlamalarni o''zgartirib bo''lmaydi (avval zavod belgilarini olib tashlang)', (it->>'pos');
      end if;
      update order_items set pos = (it->>'pos')::int, title = nullif(it->>'title', ''), width_mm = (it->>'width_mm')::int,
             height_mm = (it->>'height_mm')::int, qty = coalesce((it->>'qty')::int, 1), design = coalesce(it->'design', '{}'),
             options = coalesce(it->'options', '{}'), materials = coalesce(it->'materials', '{}'), calc = coalesce(it->'calc', '{}'),
             cost = coalesce((it->>'cost')::numeric, 0), area_m2 = coalesce((it->>'area_m2')::numeric, 0), note = nullif(it->>'note', '')
      where id = v_item and order_id = v_order;
    end if;
    keep := keep || v_item;
  end loop;
  if exists (select 1 from order_items i join item_stage_marks m on m.order_item_id = i.id
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
  return jsonb_build_object('id', v_order, 'order_no', v_no, 'resent', v_resend);
end $function$;
