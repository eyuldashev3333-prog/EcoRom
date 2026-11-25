-- ECOROM 062: монтажник и закрытые заказы, фото.
-- Тест №3 (C-5b/d/f, C-4f/p/q): монтажник навсегда видел клиента/телефон/адрес закрытого заказа и мог грузить файлы в папку закрытого заказа;
-- на сервере не было лимита фото; photo_exists и order_has_install_photo отвечали любому о чужих заказах.
-- Откат: восстановить w_orders из 058/057, can_access_photo / photo_exists / order_has_install_photo из 028/043/058; снять политику загрузки через alter policy.

-- ============ 1. w_orders: контакты клиента — только по активным заказам монтажника (закрытый/отменённый — без клиента, телефона и адреса) ============
create or replace view public.w_orders with (security_invoker = false) as
 select o.id, o.order_no, o.status, o.deadline, o.color, o.windows_count, o.area_m2,
        case when o.is_imported then null::text else o.notes end as notes,
        o.install_date,
        case when my_role() = 'montajchi' and o.status not in ('closed', 'cancelled') then o.address else null::text end as address,
        case when my_role() = 'montajchi' and o.status not in ('closed', 'cancelled') then coalesce(o.contact_phone, c.phone) else null::text end as contact_phone,
        case when my_role() = 'montajchi' and o.status not in ('closed', 'cancelled') then c.full_name else null::text end as client_name,
        o.shop_accepted_at, o.status_at
   from orders o left join clients c on c.id = o.client_id
  where (my_role() = 'ishlab' and o.shop_sent_at is not null and o.status = any (array['in_production', 'ready', 'installing', 'installed', 'closed'])
         and (exists (select 1 from order_shop_workers w where w.order_id = o.id and w.employee_id = my_id())
              or not exists (select 1 from order_shop_workers w where w.order_id = o.id)))
     or (my_role() = 'montajchi' and exists (select 1 from install_jobs j join install_job_members m on m.job_id = j.id where j.order_id = o.id and m.employee_id = my_id()));
grant select on public.w_orders to authenticated;

-- ============ 2. загрузка фото: только в активный заказ и не больше 6 файлов на заказ (3 фото + запас на повторы) ============
create or replace function public.can_upload_photo(p_name text) returns boolean
language plpgsql stable security definer set search_path = public, storage as $$
declare f1 text := (storage.foldername(p_name))[1]; f2 text := (storage.foldername(p_name))[2]; r text := public.my_role(); v_status text;
begin
  if r = 'rahbar' then return true; end if;
  begin select status into v_status from orders where id = f1::uuid; exception when others then return false; end;
  if v_status is null or v_status in ('closed', 'cancelled') then return false; end if;
  if r = 'montajchi' then
    if f2 = 'service' then return f1 in (select order_id::text from w_service_tickets); end if;
    return f1 in (select id::text from w_orders)
           and (select count(*) from storage.objects where bucket_id = 'install-photos' and name like f1 || '/' || coalesce(f2, '') || '/%') < 6;
  end if;
  if r = 'ishlab' then return f2 = 'breakage' and f1 in (select id::text from w_orders); end if;
  return false;
end $$;
revoke all on function public.can_upload_photo(text) from public, anon;
grant execute on function public.can_upload_photo(text) to authenticated;

alter policy install_photos_insert on storage.objects with check (bucket_id = 'install-photos' and public.can_upload_photo(name));

-- ============ 3. photo_exists и order_has_install_photo: только свои ============
create or replace function public.photo_exists(p text) returns boolean
language sql stable security definer set search_path = public, storage as $$
  select public.can_access_photo(p) and exists (select 1 from storage.objects where bucket_id = 'install-photos' and name = p)
$$;
revoke all on function public.photo_exists(text) from public, anon;
grant execute on function public.photo_exists(text) to authenticated;

create or replace function public.order_has_install_photo(p_order uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (public.is_rahbar() or session_user in ('postgres', 'supabase_admin') or p_order in (select id from w_orders))
     and (exists (select 1 from install_order_photos where order_id = p_order)
       or exists (select 1 from install_item_photos ip join order_items i on i.id = ip.order_item_id where i.order_id = p_order)
       or exists (select 1 from install_marks m join order_items i on i.id = m.order_item_id where i.order_id = p_order and m.photo_path is not null))
$$;
revoke all on function public.order_has_install_photo(uuid) from public, anon;
grant execute on function public.order_has_install_photo(uuid) to authenticated;

-- ============ 4. install_done: не больше 3 фото в одном вызове ============
do $$
declare v_src text;
begin
  select pg_get_functiondef('public.install_done(uuid, boolean, text[])'::regprocedure) into v_src;
  if v_src like '%Foto 3 tadan ko%' then return; end if;
  v_src := regexp_replace(v_src, E'\\nbegin\\n', E'\nbegin\n  if coalesce(cardinality(p_photos), 0) > 3 then raise exception ''Foto 3 tadan ko''''p bo''''lmasin''; end if;\n');
  if v_src not like '%Foto 3 tadan ko%' then raise exception 'install_done: не вставил лимит'; end if;
  execute v_src;
end $$;
