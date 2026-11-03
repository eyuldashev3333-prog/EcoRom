-- ECOROM 014: бой стекла. Записывает рабочий (цех/монтажник) или Rahbar: окно, сколько штук, причина, фото.
-- Rahbar сразу получает сообщение; потом решает, кто платит (монтажник / завод / клиент) и сумму.
-- Касса не трогается (это потеря, не выход денег): суммы — в экран утечек и зарплату (Фаза 4).
-- Бой → стекло этого окна снова «Buyurtma qilinmagan» (надо заказать заново).
alter table public.glass_breakages
  add column if not exists pieces int not null default 1 check (pieces > 0),
  add column if not exists decided boolean not null default false,
  add column if not exists decided_by uuid references public.employees(id),
  add column if not exists decided_at timestamptz;
create index if not exists glass_breakages_order on public.glass_breakages (order_id, created_at);

-- фото боя: цех — только в подпапку <заказ>/breakage/, монтажник — куда угодно в своём заказе
drop policy if exists install_photos_insert on storage.objects;
drop policy if exists install_photos_select on storage.objects;
create policy install_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'install-photos' and (public.is_rahbar()
    or (public.my_role() = 'montajchi' and (storage.foldername(name))[1] in (select id::text from public.w_orders))
    or (public.my_role() = 'ishlab' and (storage.foldername(name))[2] = 'breakage' and (storage.foldername(name))[1] in (select id::text from public.w_orders))));
create policy install_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'install-photos' and (public.is_rahbar()
    or (public.my_role() = 'montajchi' and (storage.foldername(name))[1] in (select id::text from public.w_orders))
    or (public.my_role() = 'ishlab' and (storage.foldername(name))[2] = 'breakage' and (storage.foldername(name))[1] in (select id::text from public.w_orders))));

create or replace function public.record_breakage(p_item uuid, p_pieces int, p_reason text, p_photo text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.my_id(); v_role text := public.my_role(); v_item order_items; v_order orders; v_id uuid;
        v_unit numeric; v_who text; v_client text;
begin
  if v_me is null or v_role not in ('rahbar', 'ishlab', 'montajchi') then raise exception 'Bu amal sizga ruxsat etilmagan'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Sababini yozing'; end if;
  select * into v_item from order_items where id = p_item;
  if v_item.id is null then raise exception 'Pozitsiya topilmadi'; end if;
  select * into v_order from orders where id = v_item.order_id for update;
  if v_role = 'montajchi' and not exists (select 1 from w_orders where id = v_order.id) then raise exception 'Bu buyurtma sizga biriktirilmagan'; end if;
  if v_order.status not in ('in_production', 'ready', 'installing', 'installed') then raise exception 'Bu holatdagi buyurtmada qayd etib bo''lmaydi'; end if;
  if coalesce(p_pieces, 1) < 1 or coalesce(p_pieces, 1) > v_item.qty then raise exception 'Miqdor 1 dan % gacha bo''lishi kerak', v_item.qty; end if;
  if p_photo is not null and split_part(p_photo, '/', 1) <> v_order.id::text then raise exception 'Foto yo''li noto''g''ri'; end if;

  select coalesce(sum((l->>'sum')::numeric), 0) into v_unit
    from jsonb_array_elements(coalesce(v_item.calc->'lines', '[]')) l where l->>'kind' = 'glass';
  insert into glass_breakages(order_id, order_item_id, employee_id, reason, photo_path, payer, amount, pieces, created_by)
  values (v_order.id, p_item, case when v_role <> 'rahbar' then v_me end, trim(p_reason), p_photo, 'factory',
          round(v_unit * coalesce(p_pieces, 1), 2), coalesce(p_pieces, 1), v_me)
  returning id into v_id;

  update order_items set glass_status = 'none', glass_status_at = now(), glass_status_by = v_me where id = p_item and glass_status <> 'none';

  select full_name into v_who from employees where id = v_me;
  select c.full_name into v_client from clients c where c.id = v_order.client_id;
  if v_role <> 'rahbar' then
    perform public.notify('rahbar', null,
      '🪟 Oyna sindi · №' || v_order.order_no || ' ' || v_client || E'\n' || v_item.pos || ') ' || v_item.width_mm || '×' || v_item.height_mm
      || ' · ' || coalesce(p_pieces, 1) || ' ta' || E'\n' || v_who || ': ' || trim(p_reason),
      jsonb_build_object('order_id', v_order.id));
  end if;
  return v_id;
end $$;

-- Rahbar: кто платит, сколько, кто разбил
create or replace function public.resolve_breakage(p_id uuid, p_payer text, p_amount numeric, p_employee uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if p_payer not in ('installer', 'factory', 'client') then raise exception 'To''lovchi noto''g''ri'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'Summa noto''g''ri'; end if;
  if p_payer = 'installer' and p_employee is null and not exists (select 1 from glass_breakages where id = p_id and employee_id is not null) then
    raise exception 'Kim to''laydi — xodimni tanlang';
  end if;
  update glass_breakages set payer = p_payer, amount = round(p_amount, 2), employee_id = coalesce(p_employee, employee_id),
         decided = true, decided_by = public.my_id(), decided_at = now()
   where id = p_id;
  if not found then raise exception 'Yozuv topilmadi'; end if;
end $$;

revoke all on function public.record_breakage(uuid, int, text, text), public.resolve_breakage(uuid, text, numeric, uuid) from public, anon;
grant execute on function public.record_breakage(uuid, int, text, text), public.resolve_breakage(uuid, text, numeric, uuid) to authenticated;
