-- 055 — простая жизнь заказа (решения Asad 24.11.2026):
-- цех: «Qabul qildim» → Jarayonda → одна кнопка «Tayyor» (без галочек по окнам);
-- стекло заказывается: «Shisha zakaz qilindi» / «Shisha o'rnatildi»;
-- монтаж назначается только готовому заказу; монтажник: «O'rnatildi» + «Shisha o'rnatildimi? Ha/Yo'q»;
-- фото установки — в бота, бот знает, к какому заказу.

-- ---------- этапы: у цеха один итоговый «Tayyor», монтаж остаётся (для зарплаты за м²/окно) ----------
insert into stages(code, name, sort, is_active, role) values ('shop_ready', 'Tayyor', 0, true, 'ishlab')
on conflict (code) do update set name = excluded.name, is_active = true, role = 'ishlab';
update stages set is_active = false where code in ('cut', 'assemble', 'glass_fit');

-- ---------- цех: «Tayyor» ----------
create or replace function public.shop_ready(p_order uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.my_id(); v_role text := public.my_role(); v orders; v_stage int; v_who text;
begin
  if v_me is null then raise exception 'Kirish kerak'; end if;
  select * into v from orders where id = p_order for update;
  if v.id is null then raise exception 'Buyurtma topilmadi'; end if;
  if v_role = 'ishlab' then
    if not exists (select 1 from public.shop_team(p_order) t where t.employee_id = v_me) then raise exception 'Bu buyurtma sizga biriktirilmagan'; end if;
    if v.shop_accepted_at is null then raise exception 'Avval «Qabul qildim» ni bosing'; end if;
  elsif v_role <> 'rahbar' then raise exception 'Bu amal sizga ruxsat etilmagan';
  end if;
  if v.status = 'ready' then return jsonb_build_object('ok', true, 'status', 'ready'); end if;
  if v.status <> 'in_production' then raise exception 'Buyurtma zavodda emas'; end if;
  select id into v_stage from stages where code = 'shop_ready';
  insert into item_stage_marks(order_item_id, stage_id, done_by)
  select i.id, v_stage, v_me from order_items i where i.order_id = p_order
  on conflict (order_item_id, stage_id) do nothing;
  update orders set status = 'ready' where id = p_order;
  select full_name into v_who from employees where id = v_me;
  perform public.notify('rahbar', null, '✅ №' || v.order_no || ' tayyor — ' || coalesce(v_who, ''), jsonb_build_object('order_id', p_order));
  return jsonb_build_object('ok', true, 'status', 'ready');
end $$;
grant execute on function public.shop_ready(uuid) to authenticated;

-- монтаж — только готовому заказу
create or replace function public.assign_install(p_order uuid, p_date date, p_members uuid[], p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v orders; v_job install_jobs; v_old uuid[]; e uuid; v_text text; v_date_changed boolean := false;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  select * into v from orders where id = p_order;
  if v.id is null then raise exception 'Buyurtma topilmadi'; end if;
  if v.status not in ('ready', 'installing') then raise exception 'O''rnatish faqat tayyor buyurtmaga tayinlanadi'; end if;
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

  select 'O''rnatish №' || v.order_no || ' · ' || c.full_name || E'\nSana: ' || to_char(p_date, 'DD.MM.YYYY')
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

-- ---------- фото установки (из бота) ----------
create table if not exists install_order_photos (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  photo_path text not null,
  taken_by uuid references employees(id),
  taken_at timestamptz not null default now()
);
create index if not exists install_order_photos_order on install_order_photos(order_id);
alter table install_order_photos enable row level security;
drop policy if exists iop_read on install_order_photos;
create policy iop_read on install_order_photos for select to authenticated
  using (public.is_rahbar() or order_id in (select id from w_orders));

-- бот ждёт фото: сотрудник × заказ
create table if not exists install_photo_wait (
  employee_id uuid not null references employees(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (employee_id, order_id)
);
alter table install_photo_wait enable row level security;

-- есть ли фото установки у заказа (любое: из бота, старое по окну, старое по отметке)
create or replace function public.order_has_install_photo(p_order uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from install_order_photos where order_id = p_order)
      or exists (select 1 from install_item_photos ip join order_items i on i.id = ip.order_item_id where i.order_id = p_order)
      or exists (select 1 from install_marks m join order_items i on i.id = m.order_item_id where i.order_id = p_order and m.photo_path is not null)
$$;
grant execute on function public.order_has_install_photo(uuid) to authenticated;

-- ---------- монтажник: «O'rnatildi» + «Shisha o'rnatildimi?» ----------
create or replace function public.install_done(p_order uuid, p_glass boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.my_id(); v_role text := public.my_role(); v orders; v_stage int; v_who text; v_client text;
begin
  if v_me is null or v_role not in ('rahbar', 'montajchi') then raise exception 'Bu amal sizga ruxsat etilmagan'; end if;
  select * into v from orders where id = p_order for update;
  if v.id is null then raise exception 'Buyurtma topilmadi'; end if;
  if v_role = 'montajchi' and not exists (select 1 from install_jobs j join install_job_members m on m.job_id = j.id where j.order_id = p_order and m.employee_id = v_me) then
    raise exception 'Bu buyurtma sizga biriktirilmagan';
  end if;
  if v.status = 'installed' then return jsonb_build_object('ok', true, 'status', 'installed'); end if;
  if v.status not in ('ready', 'installing') then raise exception 'Buyurtma hali tayyor emas yoki yopilgan'; end if;
  select id into v_stage from stages where code = 'install';
  insert into item_stage_marks(order_item_id, stage_id, done_by)
  select i.id, v_stage, v_me from order_items i where i.order_id = p_order
  on conflict (order_item_id, stage_id) do nothing;
  if coalesce(p_glass, false) then
    update order_items set glass_status = 'installed', glass_status_at = now(), glass_status_by = v_me where order_id = p_order and glass_status <> 'installed';
  end if;
  update orders set status = 'installed', install_date = coalesce(install_date, current_date) where id = p_order;
  update install_jobs set status = 'done', accepted_by = coalesce(accepted_by, v_me), accepted_at = coalesce(accepted_at, now())
   where order_id = p_order and status <> 'done';
  select full_name into v_who from employees where id = v_me;
  select full_name into v_client from clients where id = v.client_id;
  perform public.notify('rahbar', null, '🏁 №' || v.order_no || ' ' || coalesce(v_client, '') || ' — o''rnatildi (' || coalesce(v_who, '') || ')'
                        || E'\nShisha: ' || case when coalesce(p_glass, false) then 'o''rnatildi' else 'hali o''rnatilmadi' end,
                        jsonb_build_object('order_id', p_order));
  if v_role = 'montajchi' then
    insert into install_photo_wait(employee_id, order_id) values (v_me, p_order) on conflict do nothing;
    perform public.notify(null, v_me, '📷 №' || v.order_no || ' · ' || coalesce(v_client, '') || E'\nO''rnatilgan oynaning fotosini shu chatga yuboring.',
                          jsonb_build_object('kind', 'photo_wait', 'order_id', p_order));
  end if;
  return jsonb_build_object('ok', true, 'status', 'installed');
end $$;
grant execute on function public.install_done(uuid, boolean) to authenticated;

-- ---------- стекло по заказу: «Shisha zakaz qilindi» (rahbar) / «Shisha o'rnatildi» (rahbar или монтажник заказа) ----------
create or replace function public.order_glass(p_order uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.my_id(); v_role text := public.my_role(); v orders; v_who text;
begin
  if v_me is null then raise exception 'Kirish kerak'; end if;
  if p_status not in ('none', 'ordered', 'installed') then raise exception 'Holat noto''g''ri'; end if;
  select * into v from orders where id = p_order for update;
  if v.id is null then raise exception 'Buyurtma topilmadi'; end if;
  if v.status in ('closed', 'cancelled') then raise exception 'Buyurtma yopilgan yoki bekor qilingan'; end if;
  if v_role = 'montajchi' then
    if p_status <> 'installed' then raise exception 'Bu holatni faqat rahbar qo''yadi'; end if;
    if not exists (select 1 from install_jobs j join install_job_members m on m.job_id = j.id where j.order_id = p_order and m.employee_id = v_me) then
      raise exception 'Bu buyurtma sizga biriktirilmagan';
    end if;
  elsif v_role <> 'rahbar' then raise exception 'Bu amal sizga ruxsat etilmagan';
  end if;
  update order_items set glass_status = p_status, glass_status_at = now(), glass_status_by = v_me where order_id = p_order and glass_status <> p_status;
  if p_status = 'installed' and v_role = 'montajchi' then
    select full_name into v_who from employees where id = v_me;
    perform public.notify('rahbar', null, '🪟 №' || v.order_no || ': shisha o''rnatildi — ' || coalesce(v_who, ''), jsonb_build_object('order_id', p_order));
  end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.order_glass(uuid, text) to authenticated;

-- ---------- бот: какие заказы ждут фото от этого человека; записать фото ----------
create or replace function public.bot_photo_waits(p_tg bigint)
returns table(order_id uuid, order_no bigint, client text) language sql stable security definer set search_path = public as $$
  select o.id, o.order_no::bigint, c.full_name
    from install_photo_wait w join employees e on e.id = w.employee_id join orders o on o.id = w.order_id left join clients c on c.id = o.client_id
   where e.telegram_id = p_tg and e.is_active
   order by w.created_at desc
$$;

create or replace function public.bot_install_photo(p_tg bigint, p_order uuid, p_path text)
returns jsonb language plpgsql security definer set search_path = public, storage as $$
declare v_emp employees; v orders; v_client text;
begin
  select * into v_emp from employees where telegram_id = p_tg and is_active;
  if v_emp.id is null then return jsonb_build_object('ok', false, 'error', 'Siz tizimda yo''qsiz'); end if;
  select * into v from orders where id = p_order;
  if v.id is null then return jsonb_build_object('ok', false, 'error', 'Buyurtma topilmadi'); end if;
  if not exists (select 1 from install_photo_wait where employee_id = v_emp.id and order_id = p_order)
     and not exists (select 1 from install_jobs j join install_job_members m on m.job_id = j.id where j.order_id = p_order and m.employee_id = v_emp.id) then
    return jsonb_build_object('ok', false, 'error', 'Bu buyurtma sizga biriktirilmagan');
  end if;
  if split_part(p_path, '/', 1) <> p_order::text or not public.photo_exists(p_path) then
    return jsonb_build_object('ok', false, 'error', 'Foto saqlanmadi, qayta yuboring');
  end if;
  insert into install_order_photos(order_id, photo_path, taken_by) values (p_order, p_path, v_emp.id);
  delete from install_photo_wait where employee_id = v_emp.id and order_id = p_order;
  select full_name into v_client from clients where id = v.client_id;
  perform public.notify('rahbar', null, '📷 №' || v.order_no || ' ' || coalesce(v_client, '') || ' — o''rnatilgan oyna (' || v_emp.full_name || ')',
                        jsonb_build_object('order_id', p_order, 'photos', jsonb_build_array(p_path)));
  return jsonb_build_object('ok', true, 'order_no', v.order_no);
end $$;
revoke execute on function public.bot_photo_waits(bigint) from public, anon, authenticated;
revoke execute on function public.bot_install_photo(bigint, uuid, text) from public, anon, authenticated;

-- закрыть заказ без фото установки нельзя (если фото обязательно)
create or replace function public.set_order_status(p_order uuid, p_status text)
returns void language plpgsql set search_path = public as $$
declare v_debt numeric; v_cur text; v_years int; v_ok boolean; v_imp boolean; v_need_photo boolean;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if p_status not in ('unknown','new','in_production','ready','installing','installed','closed','cancelled') then raise exception 'Holat noto''g''ri'; end if;
  select o.status, o.contract_price - coalesce((select sum(amount) from payments where order_id = o.id), 0), o.is_imported
    into v_cur, v_debt, v_imp from orders o where o.id = p_order for update;
  if v_cur is null then raise exception 'Buyurtma topilmadi'; end if;
  if v_cur = p_status then return; end if;
  v_ok := case v_cur
    when 'new' then p_status in ('cancelled')
    when 'in_production' then p_status in ('ready', 'cancelled')
    when 'ready' then p_status in ('installing', 'installed', 'cancelled')
    when 'installing' then p_status in ('installed')
    when 'installed' then p_status in ('closed')
    when 'closed' then p_status in ('unknown')
    when 'unknown' then p_status in ('closed')
    when 'cancelled' then p_status in ('new')
    else false end;
  if not v_ok then raise exception 'Holatni «%» dan «%» ga o''zgartirib bo''lmaydi', v_cur, p_status; end if;
  if p_status = 'closed' then
    if v_cur not in ('installed', 'unknown') then raise exception 'Avval «O''rnatildi» holatiga o''tkazing'; end if;
    if v_debt > 0 then raise exception 'Qarz bor: %', to_char(v_debt, 'FM999G999G999G990'); end if;
    select coalesce((value #>> '{}')::boolean, true) into v_need_photo from app_settings where key = 'install_photo_required';
    if v_cur = 'installed' and not coalesce(v_imp, false) and coalesce(v_need_photo, true) and not public.order_has_install_photo(p_order) then
      raise exception 'O''rnatish fotosi yo''q — o''rnatuvchi botga foto yuborsin';
    end if;
  end if;
  select coalesce((value #>> '{}')::int, 5) into v_years from app_settings where key = 'warranty_years';
  update orders set
    status = p_status,
    install_date = case when p_status = 'installed' or (p_status = 'closed' and v_cur <> 'unknown') then coalesce(install_date, current_date) else install_date end,
    closed_at = case when p_status = 'closed' then coalesce(closed_at, now()) else null end,
    warranty_until = case when p_status = 'closed' then coalesce(install_date, created_at::date, current_date) + make_interval(years => coalesce(v_years, 5))
                          else null end
  where id = p_order;
  if p_status = 'cancelled' then perform public.order_unconsume(p_order); end if;
end $$;

-- ---------- «Zavod»: участок = Jarayonda / Tayyor вместо этапов по окнам ----------
create or replace function public.workshop_state()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Tashkent')::date; r jsonb;
  v_stuck int := coalesce((select (value #>> '{}')::int from app_settings where key = 'leak_stuck_days'), 3);
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'order_id', o.id, 'order_no', o.order_no, 'client', c.full_name, 'deadline', o.deadline, 'status', o.status,
      'windows', o.windows_count, 'items', (select count(*) from order_items i where i.order_id = o.id),
      'station', case o.status when 'new' then 'new' when 'in_production' then 'work' when 'ready' then 'ready' else 'install' end,
      'accepted', o.shop_accepted_at is not null,
      'done', '{}'::jsonb,
      'percent', case o.status when 'new' then 0 when 'in_production' then 0 when 'ready' then 50 else 75 end,
      'late', coalesce(o.deadline < v_today, false),
      'material', exists (select 1 from order_material_checks m where m.order_id = o.id and o.shop_sent_at is not null and m.created_at >= o.shop_sent_at
                           and m.result in ('not_enough', 'defect')
                           and m.created_at = (select max(m2.created_at) from order_material_checks m2 where m2.order_id = o.id and m2.created_at >= o.shop_sent_at)),
      'stuck', o.status = 'in_production' and o.shop_sent_at < now() - make_interval(days => v_stuck)
    ) order by o.order_no), '[]'::jsonb)
    into r
    from (select * from orders o
           where not o.is_imported and (o.status in ('in_production', 'ready', 'installing') or (o.status = 'new' and o.created_at > now() - interval '30 days'))
           order by o.order_no desc limit 80) o
    join clients c on c.id = o.client_id;
  return jsonb_build_object('orders', r, 'stages', '[]'::jsonb);
end $$;
