-- 057 — правки по проверке аккаунтов usta / ornatuvchi (24.11.2026):
-- цеху не показываем имя клиента; «Oyna sindi» без обязательной причины; фото установки — в системе (не в боте); стекло нельзя «установить», пока не заказано.

-- ---------- цех не видит имя клиента (телефон и адрес и так только у монтажника) ----------
create or replace view public.w_orders as
 SELECT o.id,
    o.order_no,
    o.status,
    o.deadline,
    o.color,
    o.windows_count,
    o.area_m2,
        CASE
            WHEN o.is_imported THEN NULL::text
            ELSE o.notes
        END AS notes,
    o.install_date,
        CASE
            WHEN (my_role() = 'montajchi'::text) THEN o.address
            ELSE NULL::text
        END AS address,
        CASE
            WHEN (my_role() = 'montajchi'::text) THEN COALESCE(o.contact_phone, c.phone)
            ELSE NULL::text
        END AS contact_phone,
        CASE
            WHEN (my_role() = 'montajchi'::text) THEN c.full_name
            ELSE NULL::text
        END AS client_name,
    o.shop_accepted_at
   FROM (orders o
     LEFT JOIN clients c ON ((c.id = o.client_id)))
  WHERE (((my_role() = 'ishlab'::text) AND (o.shop_sent_at IS NOT NULL) AND (o.status = ANY (ARRAY['in_production'::text, 'ready'::text, 'installing'::text])) AND ((EXISTS ( SELECT 1
           FROM order_shop_workers w
          WHERE ((w.order_id = o.id) AND (w.employee_id = my_id())))) OR (NOT (EXISTS ( SELECT 1
           FROM order_shop_workers w
          WHERE (w.order_id = o.id)))))) OR ((my_role() = 'montajchi'::text) AND (EXISTS ( SELECT 1
           FROM (install_jobs j
             JOIN install_job_members m ON ((m.job_id = j.id)))
          WHERE ((j.order_id = o.id) AND (m.employee_id = my_id()))))));

-- Telegram-текст цеху: только номер заказа (без имени клиента)
create or replace function public.shop_order_text(p_order uuid)
returns text language sql stable security definer set search_path = public as $$
  select concat_ws(E'\n',
    'Buyurtma №' || o.order_no,
    case when o.deadline is not null then 'Muddat: ' || to_char(o.deadline, 'DD.MM.YYYY') end,
    (select string_agg(i.pos || ') ' || coalesce(i.title || ': ', '') || i.width_mm || '×' || i.height_mm || ', ' || i.qty || ' ta'
                       || coalesce(' — ' || s.name, ''), E'\n' order by i.pos)
       from order_items i left join catalog_items s on s.id::text = i.options->>'system'
      where i.order_id = o.id),
    (select E'\nMateriallar:\n' || string_agg('• ' || m.name || ': ' || fmt_qty(m.qty) || ' '
                       || case m.unit when 'm' then 'm' when 'm2' then 'm²' else 'ta' end, E'\n' order by m.name)
       from (select x->>'name' as name, x->>'unit' as unit, sum((x->>'qty')::numeric * i.qty) as qty
               from order_items i, jsonb_array_elements(coalesce(i.materials->'items', '[]')) x
              where i.order_id = o.id group by 1, 2) m),
    case when o.notes is not null then E'\nIzoh: ' || o.notes end)
  from orders o where o.id = p_order
$$;

-- ---------- «Oyna sindi»: причина необязательна ----------
create or replace function public.record_breakage(p_item uuid, p_pieces integer, p_reason text default null, p_photo text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.my_id(); v_role text := public.my_role(); v_item order_items; v_order orders; v_id uuid;
        v_unit numeric; v_who text; v_client text; v_reason text := coalesce(nullif(trim(coalesce(p_reason, '')), ''), '—');
begin
  if v_me is null or v_role not in ('rahbar', 'montajchi') then raise exception 'Bu amal sizga ruxsat etilmagan'; end if;
  select * into v_item from order_items where id = p_item;
  if v_item.id is null then raise exception 'Pozitsiya topilmadi'; end if;
  select * into v_order from orders where id = v_item.order_id for update;
  if v_role = 'montajchi' and not exists (select 1 from w_orders where id = v_order.id) then raise exception 'Bu buyurtma sizga biriktirilmagan'; end if;
  if v_order.status not in ('in_production', 'ready', 'installing', 'installed') then raise exception 'Bu holatdagi buyurtmada qayd etib bo''lmaydi'; end if;
  if coalesce(p_pieces, 1) < 1 or coalesce(p_pieces, 1) > v_item.qty then raise exception 'Miqdor 1 dan % gacha bo''lishi kerak', v_item.qty; end if;
  if p_photo is not null and split_part(p_photo, '/', 1) <> v_order.id::text then raise exception 'Foto yo''li noto''g''ri'; end if;
  if p_photo is not null and not public.photo_exists(p_photo) then raise exception 'Foto serverda topilmadi (yuklash tugamagan?)'; end if;
  select coalesce(sum((l->>'sum')::numeric), 0) into v_unit
    from jsonb_array_elements(coalesce(v_item.calc->'lines', '[]')) l where l->>'kind' = 'glass';
  insert into glass_breakages(order_id, order_item_id, employee_id, reason, photo_path, payer, amount, pieces, created_by)
  values (v_order.id, p_item, case when v_role <> 'rahbar' then v_me end, v_reason, p_photo, 'factory',
          round(v_unit * coalesce(p_pieces, 1), 2), coalesce(p_pieces, 1), v_me)
  returning id into v_id;
  update order_items set glass_status = 'none', glass_status_at = now(), glass_status_by = v_me where id = p_item and glass_status <> 'none';
  select full_name into v_who from employees where id = v_me;
  select c.full_name into v_client from clients c where c.id = v_order.client_id;
  if v_role <> 'rahbar' then
    perform public.notify('rahbar', null,
      '🪟 Oyna sindi · №' || v_order.order_no || coalesce(' ' || v_client, '') || E'\n' || v_item.pos || ') ' || v_item.width_mm || '×' || v_item.height_mm
      || ' · ' || coalesce(p_pieces, 1) || ' ta' || E'\n' || coalesce(v_who, '')
      || case when v_reason <> '—' then ': ' || v_reason else '' end,
      jsonb_build_object('order_id', v_order.id) || case when p_photo is not null then jsonb_build_object('photos', jsonb_build_array(p_photo)) else '{}'::jsonb end);
  end if;
  return v_id;
end $$;

-- ---------- фото установки: в системе, а не в боте ----------
drop function if exists public.bot_photo_waits(bigint);
drop function if exists public.bot_install_photo(bigint, uuid, text);
drop table if exists install_photo_wait;

-- альбом руководителям при «installed»: фото из install_order_photos + прежние (по окнам / по отметкам)
create or replace function public.notify_install_photos()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_paths text[]; v_client text;
begin
  select coalesce(array_agg(p), '{}') into v_paths from (
    select ph.photo_path as p from install_order_photos ph where ph.order_id = new.id
    union all
    select ip.photo_path from install_item_photos ip join order_items i on i.id = ip.order_item_id where i.order_id = new.id
    union all
    select m.photo_path from install_marks m join order_items i on i.id = m.order_item_id
     where i.order_id = new.id and m.photo_path is not null
       and not exists (select 1 from install_item_photos ip2 where ip2.order_item_id = i.id)
    limit 10) x;
  if coalesce(array_length(v_paths, 1), 0) = 0 then return new; end if;
  select full_name into v_client from clients where id = new.client_id;
  perform public.notify('rahbar', null, '📷 №' || new.order_no || ' ' || coalesce(v_client, '') || ' — o''rnatilgan oynalar',
                        jsonb_build_object('order_id', new.id, 'photos', to_jsonb(v_paths)));
  return new;
end $$;

drop function if exists public.install_done(uuid, boolean);
create or replace function public.install_done(p_order uuid, p_glass boolean, p_photos text[] default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.my_id(); v_role text := public.my_role(); v orders; v_stage int; v_who text; v_client text; v_need boolean; ph text;
begin
  if v_me is null or v_role not in ('rahbar', 'montajchi') then raise exception 'Bu amal sizga ruxsat etilmagan'; end if;
  select * into v from orders where id = p_order for update;
  if v.id is null then raise exception 'Buyurtma topilmadi'; end if;
  if v_role = 'montajchi' and not exists (select 1 from install_jobs j join install_job_members m on m.job_id = j.id where j.order_id = p_order and m.employee_id = v_me) then
    raise exception 'Bu buyurtma sizga biriktirilmagan';
  end if;
  if v.status = 'installed' then return jsonb_build_object('ok', true, 'status', 'installed'); end if;
  if v.status not in ('ready', 'installing') then raise exception 'Buyurtma hali tayyor emas yoki yopilgan'; end if;
  -- стекло: «установлено» можно сказать только про заказанное
  if coalesce(p_glass, false) and exists (select 1 from order_items where order_id = p_order and glass_status = 'none') then
    raise exception 'Shisha hali zakaz qilinmagan';
  end if;
  -- фото установки: монтажнику обязательно (пока включено в настройках)
  select coalesce((value #>> '{}')::boolean, true) into v_need from app_settings where key = 'install_photo_required';
  foreach ph in array coalesce(p_photos, '{}') loop
    if split_part(ph, '/', 1) <> p_order::text then raise exception 'Foto yo''li noto''g''ri'; end if;
    if not public.photo_exists(ph) then raise exception 'Foto serverda topilmadi (yuklash tugamagan?)'; end if;
  end loop;
  if v_role = 'montajchi' and coalesce(v_need, true) and coalesce(array_length(p_photos, 1), 0) = 0 and not public.order_has_install_photo(p_order) then
    raise exception 'O''rnatilgan oynaning fotosini yuklang';
  end if;
  insert into install_order_photos(order_id, photo_path, taken_by) select p_order, x, v_me from unnest(coalesce(p_photos, '{}')) x;

  select id into v_stage from stages where code = 'install';
  insert into item_stage_marks(order_item_id, stage_id, done_by)
  select i.id, v_stage, v_me from order_items i where i.order_id = p_order
  on conflict (order_item_id, stage_id) do nothing;
  if coalesce(p_glass, false) then
    update order_items set glass_status = 'installed', glass_status_at = now(), glass_status_by = v_me where order_id = p_order and glass_status <> 'installed';
  end if;
  select full_name into v_who from employees where id = v_me;
  select full_name into v_client from clients where id = v.client_id;
  -- статус «installed» → триггер шлёт руководителям фото альбомом; текст про стекло — отдельным сообщением
  update orders set status = 'installed', install_date = coalesce(install_date, current_date) where id = p_order;
  update install_jobs set status = 'done', accepted_by = coalesce(accepted_by, v_me), accepted_at = coalesce(accepted_at, now())
   where order_id = p_order and status <> 'done';
  perform public.notify('rahbar', null, '🏁 №' || v.order_no || ' ' || coalesce(v_client, '') || ' — o''rnatildi (' || coalesce(v_who, '') || ')'
                        || E'\nShisha: ' || case when coalesce(p_glass, false) then 'o''rnatildi' else 'hali o''rnatilmadi' end,
                        jsonb_build_object('order_id', p_order));
  return jsonb_build_object('ok', true, 'status', 'installed');
end $$;
grant execute on function public.install_done(uuid, boolean, text[]) to authenticated;

-- стекло по заказу: «o'rnatildi» только если уже заказано
create or replace function public.order_glass(p_order uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.my_id(); v_role text := public.my_role(); v orders; v_who text;
begin
  if v_me is null then raise exception 'Kirish kerak'; end if;
  if p_status not in ('none', 'ordered', 'installed') then raise exception 'Holat noto''g''ri'; end if;
  select * into v from orders where id = p_order for update;
  if v.id is null then raise exception 'Buyurtma topilmadi'; end if;
  if v.status in ('closed', 'cancelled') then raise exception 'Buyurtma yopilgan yoki bekor qilingan'; end if;
  if p_status = 'installed' and exists (select 1 from order_items where order_id = p_order and glass_status = 'none') then
    raise exception 'Shisha hali zakaz qilinmagan';
  end if;
  if v_role = 'montajchi' then
    if p_status <> 'installed' then raise exception 'Bu holatni faqat rahbar qo''yadi'; end if;
    if not exists (select 1 from install_jobs j join install_job_members m on m.job_id = j.id where j.order_id = p_order and m.employee_id = v_me) then
      raise exception 'Bu buyurtma sizga biriktirilmagan';
    end if;
  elsif v_role <> 'rahbar' then raise exception 'Bu amal sizga ruxsat etilmagan';
  end if;
  -- «zakaz qilindi» ставится только окнам без заказа (уже установленные не откатываются)
  update order_items set glass_status = p_status, glass_status_at = now(), glass_status_by = v_me
   where order_id = p_order and glass_status <> p_status and (p_status <> 'ordered' or glass_status = 'none');
  if p_status = 'installed' and v_role = 'montajchi' then
    select full_name into v_who from employees where id = v_me;
    perform public.notify('rahbar', null, '🪟 №' || v.order_no || ': shisha o''rnatildi — ' || coalesce(v_who, ''), jsonb_build_object('order_id', p_order));
  end if;
  return jsonb_build_object('ok', true);
end $$;
