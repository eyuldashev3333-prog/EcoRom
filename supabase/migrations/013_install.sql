-- ECOROM 013: монтаж. Rahbar назначает монтаж (люди + дата) → монтажник видит «что сегодня» и отмечает по каждому окну
-- Rama / Shisha / Podokonnik-otliv с фото. Все нужные отметки окна → этап «Montaj» и стекло «O'rnatildi»; все окна → заказ «O'rnatildi» + Rahbar.
-- Фото — закрытое хранилище install-photos (сжатые на телефоне), путь начинается с id заказа.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('install-photos', 'install-photos', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists install_photos_insert on storage.objects;
drop policy if exists install_photos_select on storage.objects;
drop policy if exists install_photos_delete on storage.objects;
create policy install_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'install-photos' and (public.is_rahbar() or (public.my_role() = 'montajchi' and (storage.foldername(name))[1] in (select id::text from public.w_orders))));
create policy install_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'install-photos' and (public.is_rahbar() or (public.my_role() = 'montajchi' and (storage.foldername(name))[1] in (select id::text from public.w_orders))));
create policy install_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'install-photos' and public.is_rahbar());

insert into public.app_settings (key, value) values ('install_photo_required', 'true') on conflict (key) do nothing;
create index if not exists install_jobs_order on public.install_jobs (order_id);

-- что видит монтажник (только свои назначения)
create or replace view public.w_install_jobs as
  select j.id, j.order_id, j.plan_date, j.status, j.note
  from public.install_jobs j
  where public.my_role() = 'montajchi'
    and j.id in (select job_id from public.install_job_members where employee_id = public.my_id());
create or replace view public.w_install_marks as
  select m.id, m.order_item_id, m.part, m.done_by, m.done_at, m.photo_path, e.full_name as done_by_name
  from public.install_marks m join public.employees e on e.id = m.done_by
  where m.order_item_id in (select id from public.w_order_items);
revoke all on public.w_install_jobs, public.w_install_marks from anon, authenticated;
grant select on public.w_install_jobs, public.w_install_marks to authenticated;

-- какие части нужны окну: рама и стекло всегда, подоконник/отлив — если выбраны в позиции
create or replace function public.install_parts_needed(p_options jsonb) returns int language sql immutable as $$
  select 2 + case when p_options ? 'sill' or p_options ? 'ebb' then 1 else 0 end
$$;

-- ===== назначение монтажа =====
create or replace function public.assign_install(p_order uuid, p_date date, p_members uuid[], p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v orders; v_job install_jobs; v_old uuid[]; v_new uuid[]; e uuid; v_text text; v_date_changed boolean := false;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  select * into v from orders where id = p_order;
  if v.id is null then raise exception 'Buyurtma topilmadi'; end if;
  if v.status not in ('in_production', 'ready', 'installing') then raise exception 'Bu holatdagi buyurtmaga montaj tayinlanmaydi'; end if;
  if p_date is null then raise exception 'Sanani kiriting'; end if;
  if coalesce(array_length(p_members, 1), 0) = 0 then raise exception 'Kamida bitta o''rnatuvchini tanlang'; end if;
  if exists (select 1 from unnest(p_members) m where not exists (select 1 from employees where id = m and role = 'montajchi' and is_active)) then
    raise exception 'Faqat faol o''rnatuvchilarni tanlash mumkin';
  end if;

  select * into v_job from install_jobs where order_id = p_order and status <> 'done' order by created_at desc limit 1;
  if v_job.id is null then
    insert into install_jobs(order_id, plan_date, note, created_by) values (p_order, p_date, nullif(trim(p_note), ''), public.my_id()) returning * into v_job;
    v_old := '{}';
  else
    v_date_changed := v_job.plan_date is distinct from p_date;
    select coalesce(array_agg(employee_id), '{}') into v_old from install_job_members where job_id = v_job.id;
    update install_jobs set plan_date = p_date, note = nullif(trim(p_note), ''), status = case when status = 'postponed' then 'planned' else status end where id = v_job.id;
  end if;
  delete from install_job_members where job_id = v_job.id and not (employee_id = any(p_members));
  insert into install_job_members(job_id, employee_id) select v_job.id, m from unnest(p_members) m on conflict do nothing;

  select 'Montaj №' || v.order_no || ' · ' || c.full_name || E'\nSana: ' || to_char(p_date, 'DD.MM.YYYY')
         || coalesce(E'\nManzil: ' || v.address, '') || coalesce(E'\nTelefon: ' || coalesce(v.contact_phone, c.phone), '')
         || coalesce(E'\nIzoh: ' || nullif(trim(p_note), ''), '')
    into v_text from clients c where c.id = v.client_id;
  foreach e in array p_members loop
    if e <> all(v_old) or array_length(v_old, 1) is null then
      perform public.notify(null, e, '🔧 ' || v_text, jsonb_build_object('order_id', p_order));
    elsif v_date_changed then
      perform public.notify(null, e, '📅 Sana o''zgardi' || E'\n' || v_text, jsonb_build_object('order_id', p_order));
    end if;
  end loop;
  return v_job.id;
end $$;

-- ===== отметки монтажа =====
create or replace function public.mark_install(p_item uuid, p_part text, p_done boolean, p_photo text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.my_id(); v_role text := public.my_role(); v_item order_items; v_order orders; v_mark install_marks;
        v_need_photo boolean; v_stage int; v_left int; v_who text;
begin
  if v_me is null or v_role not in ('rahbar', 'montajchi') then raise exception 'Bu amal sizga ruxsat etilmagan'; end if;
  if p_part not in ('frame', 'glass', 'sill_ebb') then raise exception 'Qism noto''g''ri'; end if;
  select * into v_item from order_items where id = p_item;
  if v_item.id is null then raise exception 'Pozitsiya topilmadi'; end if;
  select * into v_order from orders where id = v_item.order_id for update;
  if v_role = 'montajchi' and not exists (select 1 from w_orders where id = v_order.id) then raise exception 'Bu buyurtma sizga biriktirilmagan'; end if;
  if p_part = 'sill_ebb' and not (v_item.options ? 'sill' or v_item.options ? 'ebb') then raise exception 'Bu oynada podokonnik/otliv yo''q'; end if;
  select id into v_stage from stages where code = 'install';
  select * into v_mark from install_marks where order_item_id = p_item and part = p_part;

  if p_done then
    if v_order.status in ('new', 'in_production') then raise exception 'Buyurtma hali sexdan chiqmagan'; end if;
    if v_order.status not in ('ready', 'installing') then raise exception 'Buyurtma yopilgan, o''rnatilgan yoki bekor qilingan'; end if;
    if v_mark.id is not null then
      select full_name into v_who from employees where id = v_mark.done_by;
      raise exception 'Allaqachon belgilangan: %', v_who;
    end if;
    select coalesce((value #>> '{}')::boolean, true) into v_need_photo from app_settings where key = 'install_photo_required';
    if v_role = 'montajchi' and coalesce(v_need_photo, true) and p_photo is null then raise exception 'Foto kerak'; end if;
    if p_photo is not null and split_part(p_photo, '/', 1) <> v_order.id::text then raise exception 'Foto yo''li noto''g''ri'; end if;
    insert into install_marks(order_item_id, part, done_by, photo_path) values (p_item, p_part, v_me, p_photo);
    if p_part = 'glass' then
      update order_items set glass_status = 'installed', glass_status_at = now(), glass_status_by = v_me where id = p_item;
    end if;
    update orders set status = 'installing' where id = v_order.id and status = 'ready';
    update install_jobs set status = 'in_progress' where order_id = v_order.id and status in ('planned', 'postponed');
    if (select count(*) from install_marks where order_item_id = p_item) >= public.install_parts_needed(v_item.options) then
      insert into item_stage_marks(order_item_id, stage_id, done_by) values (p_item, v_stage, v_me) on conflict do nothing;
    end if;
    select count(*) into v_left from order_items i
     where i.order_id = v_order.id and public.install_parts_needed(i.options) > (select count(*) from install_marks m where m.order_item_id = i.id);
    if v_left = 0 then
      update orders set status = 'installed', install_date = coalesce(install_date, current_date) where id = v_order.id;
      update install_jobs set status = 'done' where order_id = v_order.id and status <> 'done';
      perform public.notify('rahbar', null, '🏁 №' || v_order.order_no || ' o''rnatildi — barcha oynalar belgilandi',
                            jsonb_build_object('order_id', v_order.id));
    end if;
  else
    if v_mark.id is null then raise exception 'Belgi yo''q'; end if;
    if v_mark.done_by <> v_me and v_role <> 'rahbar' then raise exception 'Faqat o''z belgingizni olib tashlay olasiz'; end if;
    if v_order.status not in ('installing', 'installed') then raise exception 'Buyurtma yopilgan yoki bekor qilingan — o''zgartirib bo''lmaydi'; end if;
    delete from install_marks where id = v_mark.id;
    delete from item_stage_marks where order_item_id = p_item and stage_id = v_stage;
    if p_part = 'glass' then update order_items set glass_status = 'arrived', glass_status_at = now(), glass_status_by = v_me where id = p_item and glass_status = 'installed'; end if;
    if v_order.status = 'installed' then
      update orders set status = 'installing', install_date = null where id = v_order.id;
      update install_jobs set status = 'in_progress' where order_id = v_order.id and status = 'done';
    end if;
  end if;
  return jsonb_build_object('status', (select status from orders where id = v_order.id),
                            'percent', (select percent from v_order_progress where order_id = v_order.id));
end $$;

-- «Montaj» из таблицы этапов монтажник сам не ставит — только через отметки с фото (Rahbar может вручную)
create or replace function public.mark_stage(p_item uuid, p_stage int, p_done boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.my_id(); v_role text := public.my_role(); v_stage stages; v_order orders;
        v_mark item_stage_marks; v_who text; v_left int; v_pct numeric;
begin
  if v_me is null then raise exception 'Kirish kerak'; end if;
  select * into v_stage from stages where id = p_stage and is_active;
  if v_stage.id is null then raise exception 'Bosqich topilmadi'; end if;
  if v_role <> 'rahbar' and v_role <> v_stage.role then raise exception 'Bu bosqich sizniki emas'; end if;
  if v_role = 'montajchi' then raise exception 'Montajni qismlar bo''yicha foto bilan belgilang'; end if;
  select o.* into v_order from orders o join order_items i on i.order_id = o.id where i.id = p_item for update of o;
  if v_order.id is null then raise exception 'Pozitsiya topilmadi'; end if;
  if v_order.status = 'new' then raise exception 'Buyurtma hali sexga yuborilmagan'; end if;
  if v_order.status not in ('in_production', 'ready', 'installing') then raise exception 'Buyurtma yopilgan yoki bekor qilingan — belgilab bo''lmaydi'; end if;

  select * into v_mark from item_stage_marks where order_item_id = p_item and stage_id = p_stage;
  if p_done then
    if v_mark.id is not null then
      select full_name into v_who from employees where id = v_mark.done_by;
      raise exception 'Allaqachon belgilangan: %', v_who;
    end if;
    insert into item_stage_marks(order_item_id, stage_id, done_by) values (p_item, p_stage, v_me);
  else
    if v_mark.id is null then raise exception 'Belgi yo''q'; end if;
    if v_mark.done_by <> v_me and v_role <> 'rahbar' then raise exception 'Faqat o''z belgingizni olib tashlay olasiz'; end if;
    delete from item_stage_marks where id = v_mark.id;
  end if;

  select count(*) into v_left from order_items i cross join stages s
   where i.order_id = v_order.id and s.is_active and s.role = 'ishlab'
     and not exists (select 1 from item_stage_marks m where m.order_item_id = i.id and m.stage_id = s.id);
  if v_left = 0 and v_order.status = 'in_production' then
    update orders set status = 'ready' where id = v_order.id;
    perform public.notify('rahbar', null, '✅ №' || v_order.order_no || ' tayyor — sex barcha bosqichlarni tugatdi',
                          jsonb_build_object('order_id', v_order.id));
  elsif v_left > 0 and v_order.status = 'ready' then
    update orders set status = 'in_production' where id = v_order.id;
  end if;

  select percent into v_pct from v_order_progress where order_id = v_order.id;
  return jsonb_build_object('percent', v_pct, 'status', (select status from orders where id = v_order.id));
end $$;

-- утреннее напоминание «что сегодня» (07:00 Ташкент = 02:00 UTC)
create or replace function public.install_morning() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select m.employee_id,
           string_agg('• №' || o.order_no || ' ' || c.full_name || coalesce(' — ' || o.address, ''), E'\n' order by o.order_no) as list
      from install_jobs j join install_job_members m on m.job_id = j.id
      join orders o on o.id = j.order_id join clients c on c.id = o.client_id
     where j.plan_date = (now() at time zone 'Asia/Tashkent')::date and j.status in ('planned', 'in_progress')
       and o.status in ('in_production', 'ready', 'installing')
     group by m.employee_id
  loop
    perform public.notify(null, r.employee_id, '☀️ Bugungi montaj:' || E'\n' || r.list, '{}'::jsonb);
  end loop;
end $$;

revoke all on function public.install_morning() from public, anon, authenticated;
revoke all on function public.assign_install(uuid, date, uuid[], text), public.mark_install(uuid, text, boolean, text) from public, anon;
grant execute on function public.assign_install(uuid, date, uuid[], text), public.mark_install(uuid, text, boolean, text) to authenticated;
revoke all on function public.mark_stage(uuid, int, boolean) from public, anon;
grant execute on function public.mark_stage(uuid, int, boolean) to authenticated;

select cron.unschedule('install_morning') where exists (select 1 from cron.job where jobname = 'install_morning');
select cron.schedule('install_morning', '0 2 * * *', 'select public.install_morning()');
