-- ECOROM 015: сервис и гарантия. Rahbar создаёт заявку по заказу (описание, окно, фото, срок, исполнитель) → монтажник получает её в Telegram,
-- «Boshladim» / «Bajarildi» (заметка + фото) → Rahbar закрывает: причина, кто платит, стоимость. Ежедневные напоминания до закрытия.
-- Гарантия: orders.warranty_until (закрытие) или дата монтажа + warranty_years; на заявке запоминается «в гарантии» на день создания.
alter table public.service_tickets
  add column if not exists work_done_at timestamptz,
  add column if not exists work_done_by uuid references public.employees(id),
  add column if not exists work_note text,
  add column if not exists work_photo_paths text[] not null default '{}';
create index if not exists service_tickets_order on public.service_tickets (order_id);
create index if not exists service_tickets_open on public.service_tickets (status) where status <> 'closed';

-- что видит монтажник: только свои незакрытые заявки + адрес/телефон
create or replace view public.w_service_tickets as
  select t.id, t.order_id, t.order_item_id, t.description, t.photo_paths, t.due_date, t.status, t.work_done_at, t.work_note, t.work_photo_paths, t.created_at,
         o.order_no, c.full_name as client_name, o.address, coalesce(o.contact_phone, c.phone) as contact_phone
  from public.service_tickets t join public.orders o on o.id = t.order_id join public.clients c on c.id = o.client_id
  where public.my_role() = 'montajchi' and t.assigned_to = public.my_id() and t.status <> 'closed';
revoke all on public.w_service_tickets from anon, authenticated;
grant select on public.w_service_tickets to authenticated;

-- доступ к фото: Rahbar — всё; монтажник — свои заказы и свои сервис-заявки; цех — только бой стекла
create or replace function public.can_access_photo(p_name text) returns boolean
language plpgsql stable security definer set search_path = public, storage as $$
declare f1 text := (storage.foldername(p_name))[1]; f2 text := (storage.foldername(p_name))[2]; r text := public.my_role();
begin
  if r = 'rahbar' then return true; end if;
  if r = 'montajchi' then
    return f1 in (select id::text from w_orders) or (f2 = 'service' and f1 in (select order_id::text from w_service_tickets));
  end if;
  if r = 'ishlab' then return f2 = 'breakage' and f1 in (select id::text from w_orders); end if;
  return false;
end $$;
revoke all on function public.can_access_photo(text) from public, anon;
grant execute on function public.can_access_photo(text) to authenticated;
drop policy if exists install_photos_insert on storage.objects;
drop policy if exists install_photos_select on storage.objects;
create policy install_photos_insert on storage.objects for insert to authenticated with check (bucket_id = 'install-photos' and public.can_access_photo(name));
create policy install_photos_select on storage.objects for select to authenticated using (bucket_id = 'install-photos' and public.can_access_photo(name));

-- на сколько заказ в гарантии: до какой даты и на сегодня ли (null — не знаем: нет даты монтажа)
create or replace function public.order_warranty(p_order uuid) returns date
language sql stable security definer set search_path = public as $$
  select coalesce(o.warranty_until,
                  case when o.install_date is not null then o.install_date + make_interval(years => coalesce((select (value #>> '{}')::int from app_settings where key = 'warranty_years'), 5)) end)
  from orders o where o.id = p_order
$$;
revoke all on function public.order_warranty(uuid) from public, anon;
grant execute on function public.order_warranty(uuid) to authenticated;

create or replace function public.service_notify_text(p_id uuid, p_head text) returns text
language sql stable security definer set search_path = public as $$
  select p_head || ' №' || o.order_no || ' · ' || c.full_name || coalesce(E'\nManzil: ' || o.address, '')
         || coalesce(E'\nTelefon: ' || coalesce(o.contact_phone, c.phone), '')
         || E'\n' || t.description || coalesce(E'\nMuddat: ' || to_char(t.due_date, 'DD.MM.YYYY'), '')
  from service_tickets t join orders o on o.id = t.order_id join clients c on c.id = o.client_id where t.id = p_id
$$;
revoke all on function public.service_notify_text(uuid, text) from public, anon, authenticated;

create or replace function public.create_service(p_order uuid, p_item uuid, p_description text, p_due date default null, p_assignee uuid default null, p_photos text[] default '{}') returns uuid
language plpgsql security definer set search_path = public as $$
declare v orders; v_id uuid; v_w date;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if coalesce(trim(p_description), '') = '' then raise exception 'Muammoni yozing'; end if;
  select * into v from orders where id = p_order;
  if v.id is null then raise exception 'Buyurtma topilmadi'; end if;
  if v.status = 'cancelled' then raise exception 'Bekor qilingan buyurtmaga servis ochilmaydi'; end if;
  if p_item is not null and not exists (select 1 from order_items where id = p_item and order_id = p_order) then raise exception 'Pozitsiya topilmadi'; end if;
  if p_assignee is not null and not exists (select 1 from employees where id = p_assignee and role = 'montajchi' and is_active) then raise exception 'Faqat faol o''rnatuvchini tanlash mumkin'; end if;
  if exists (select 1 from unnest(coalesce(p_photos, '{}')) f where split_part(f, '/', 1) <> p_order::text) then raise exception 'Foto yo''li noto''g''ri'; end if;
  v_w := public.order_warranty(p_order);
  insert into service_tickets(order_id, order_item_id, description, photo_paths, assigned_to, due_date, in_warranty, created_by)
  values (p_order, p_item, trim(p_description), coalesce(p_photos, '{}'), p_assignee, p_due, case when v_w is null then null else v_w >= current_date end, public.my_id())
  returning id into v_id;
  if p_assignee is not null then
    perform public.notify(null, p_assignee, public.service_notify_text(v_id, '🛠 Servis'), jsonb_build_object('service_id', v_id, 'order_id', p_order));
  end if;
  return v_id;
end $$;

create or replace function public.assign_service(p_id uuid, p_assignee uuid, p_due date default null) returns void
language plpgsql security definer set search_path = public as $$
declare v service_tickets;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  select * into v from service_tickets where id = p_id;
  if v.id is null then raise exception 'Zayavka topilmadi'; end if;
  if v.status = 'closed' then raise exception 'Zayavka yopilgan'; end if;
  if p_assignee is null or not exists (select 1 from employees where id = p_assignee and role = 'montajchi' and is_active) then raise exception 'Faqat faol o''rnatuvchini tanlash mumkin'; end if;
  update service_tickets set assigned_to = p_assignee, due_date = p_due where id = p_id;
  if v.assigned_to is distinct from p_assignee or v.due_date is distinct from p_due then
    perform public.notify(null, p_assignee, public.service_notify_text(p_id, case when v.assigned_to is distinct from p_assignee then '🛠 Servis' else '📅 Servis muddati o''zgardi' end),
                          jsonb_build_object('service_id', p_id, 'order_id', v.order_id));
  end if;
end $$;

-- исполнитель: 'start' — приступил, 'done' — работа выполнена (заметка + фото) → Rahbar закрывает
create or replace function public.service_work(p_id uuid, p_action text, p_note text default null, p_photos text[] default '{}') returns void
language plpgsql security definer set search_path = public as $$
declare v service_tickets; v_me uuid := public.my_id(); v_role text := public.my_role(); v_who text; v_ord orders;
begin
  if v_me is null or v_role not in ('rahbar', 'montajchi') then raise exception 'Bu amal sizga ruxsat etilmagan'; end if;
  select * into v from service_tickets where id = p_id;
  if v.id is null then raise exception 'Zayavka topilmadi'; end if;
  if v_role = 'montajchi' and v.assigned_to is distinct from v_me then raise exception 'Bu zayavka sizga biriktirilmagan'; end if;
  if v.status = 'closed' then raise exception 'Zayavka yopilgan'; end if;
  if p_action = 'start' then
    update service_tickets set status = 'in_progress' where id = p_id;
  elsif p_action = 'done' then
    if exists (select 1 from unnest(coalesce(p_photos, '{}')) f where split_part(f, '/', 1) <> v.order_id::text) then raise exception 'Foto yo''li noto''g''ri'; end if;
    update service_tickets set status = 'in_progress', work_done_at = now(), work_done_by = v_me, work_note = nullif(trim(p_note), ''), work_photo_paths = coalesce(p_photos, '{}')
     where id = p_id;
    select * into v_ord from orders where id = v.order_id;
    select full_name into v_who from employees where id = v_me;
    perform public.notify('rahbar', null, '✅ Servis bajarildi · №' || v_ord.order_no || E'\n' || v_who || ': ' || coalesce(nullif(trim(p_note), ''), v.description) || E'\nYopish uchun tizimni oching.',
                          jsonb_build_object('service_id', p_id, 'order_id', v.order_id));
  else
    raise exception 'Amal noto''g''ri';
  end if;
end $$;

create or replace function public.close_service(p_id uuid, p_cause text, p_payer text, p_cost numeric, p_in_warranty boolean default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if p_payer not in ('installer', 'factory', 'client') then raise exception 'To''lovchi noto''g''ri'; end if;
  if p_cost is null or p_cost < 0 then raise exception 'Summa noto''g''ri'; end if;
  if coalesce(trim(p_cause), '') = '' then raise exception 'Sababini yozing'; end if;
  update service_tickets set status = 'closed', closed_at = now(), cause = trim(p_cause), payer = p_payer, cost = round(p_cost, 2),
         in_warranty = coalesce(p_in_warranty, in_warranty)
   where id = p_id and status <> 'closed';
  if not found then raise exception 'Zayavka topilmadi yoki allaqachon yopilgan'; end if;
end $$;

-- каждое утро 07:05 Ташкент: исполнителям — их незавершённые заявки; Rahbar — сводка (без исполнителя / ждут закрытия / просрочены)
create or replace function public.service_daily() returns void
language plpgsql security definer set search_path = public as $$
declare r record; v_text text; v_today date := (now() at time zone 'Asia/Tashkent')::date;
begin
  for r in
    select t.assigned_to as emp, string_agg('• №' || o.order_no || ' ' || c.full_name || ' — ' || left(t.description, 60), E'\n' order by t.due_date nulls last) as list
      from service_tickets t join orders o on o.id = t.order_id join clients c on c.id = o.client_id
     where t.status <> 'closed' and t.assigned_to is not null and t.work_done_at is null
     group by t.assigned_to
  loop
    perform public.notify(null, r.emp, '🛠 Servis — bajarilmagan:' || E'\n' || r.list, '{}'::jsonb);
  end loop;
  select string_agg(line, E'\n') into v_text from (
    select '• №' || o.order_no || ' ' || c.full_name || ' — ' || left(t.description, 50)
           || case when t.assigned_to is null then ' [ijrochi yo''q]'
                   when t.work_done_at is not null then ' [yopishni kutmoqda]'
                   when t.due_date < v_today then ' [muddat o''tgan]' else '' end as line
      from service_tickets t join orders o on o.id = t.order_id join clients c on c.id = o.client_id
     where t.status <> 'closed' and (t.assigned_to is null or t.work_done_at is not null or t.due_date < v_today)
     order by t.created_at limit 15) x;
  if v_text is not null then perform public.notify('rahbar', null, '🛠 Servis — e''tibor kerak:' || E'\n' || v_text, '{}'::jsonb); end if;
end $$;

revoke all on function public.service_daily() from public, anon, authenticated;
revoke all on function public.create_service(uuid, uuid, text, date, uuid, text[]), public.assign_service(uuid, uuid, date),
  public.service_work(uuid, text, text, text[]), public.close_service(uuid, text, text, numeric, boolean) from public, anon;
grant execute on function public.create_service(uuid, uuid, text, date, uuid, text[]), public.assign_service(uuid, uuid, date),
  public.service_work(uuid, text, text, text[]), public.close_service(uuid, text, text, numeric, boolean) to authenticated;

select cron.unschedule('service_daily') where exists (select 1 from cron.job where jobname = 'service_daily');
select cron.schedule('service_daily', '5 2 * * *', 'select public.service_daily()');
