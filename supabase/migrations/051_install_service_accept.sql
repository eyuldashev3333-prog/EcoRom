-- ECOROM 051 (24.11.2026, замечания Asad, п. 9): монтаж и сервис — «кто первый принял, тот ответственный».
-- Монтаж: бригада назначается руководителем (вся команда монтажников или выбранные), принимает любой из бригады — первый записывается.
-- Сервис: заявка без исполнителя уходит всем монтажникам, первый принявший становится исполнителем. Опоздавшие нажатия — в журнале.

alter table public.install_jobs
  add column if not exists accepted_by uuid references public.employees(id),
  add column if not exists accepted_at timestamptz;

create table if not exists public.accept_late (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('install', 'service')),
  ref_id uuid not null,
  employee_id uuid not null references public.employees(id),
  winner_id uuid references public.employees(id),
  created_at timestamptz not null default now()
);
create index if not exists accept_late_ref on public.accept_late (ref_id, created_at);
alter table public.accept_late enable row level security;
revoke all on public.accept_late from anon, authenticated;
grant select on public.accept_late to authenticated;
drop policy if exists accept_late_read on public.accept_late;
create policy accept_late_read on public.accept_late for select to authenticated using (public.is_rahbar());

-- монтажник видит свои задания; принявший и время
create or replace view public.w_install_jobs as
  select j.id, j.order_id, j.plan_date, j.status, j.note,
         j.accepted_at, (select e.full_name from public.employees e where e.id = j.accepted_by) as accepted_name
  from public.install_jobs j
  where public.my_role() = 'montajchi'
    and j.id in (select job_id from public.install_job_members where employee_id = public.my_id());

create or replace function public.install_accept(p_job uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.my_id(); v_role text := public.my_role(); j install_jobs; v_name text; v_who text; v_no bigint;
begin
  if v_me is null or v_role not in ('rahbar', 'montajchi') then raise exception 'Bu amal sizga ruxsat etilmagan'; end if;
  select * into j from install_jobs where id = p_job for update;
  if j.id is null then raise exception 'Montaj topilmadi'; end if;
  if v_role = 'montajchi' and not exists (select 1 from install_job_members where job_id = p_job and employee_id = v_me) then
    raise exception 'Bu montaj sizga biriktirilmagan';
  end if;
  if j.status = 'done' then return jsonb_build_object('ok', false, 'error', 'Montaj yakunlangan'); end if;
  if j.accepted_by is not null then
    select full_name into v_name from employees where id = j.accepted_by;
    if j.accepted_by <> v_me then insert into accept_late(kind, ref_id, employee_id, winner_id) values ('install', p_job, v_me, j.accepted_by); end if;
    return jsonb_build_object('ok', false, 'taken', true, 'by', v_name, 'error', 'Allaqachon qabul qilingan: ' || coalesce(v_name, '—'));
  end if;
  update install_jobs set accepted_by = v_me, accepted_at = now() where id = p_job;
  select full_name into v_who from employees where id = v_me;
  select order_no into v_no from orders where id = j.order_id;
  perform public.notify('rahbar', null, '✅ Montaj №' || v_no || ': ' || v_who || ' — qabul qildi', jsonb_build_object('order_id', j.order_id));
  return jsonb_build_object('ok', true, 'name', v_who);
end $$;
revoke all on function public.install_accept(uuid) from public, anon;
grant execute on function public.install_accept(uuid) to authenticated;

-- сервис: заявка без исполнителя видна всем монтажникам и принимается первым нажавшим
create or replace view public.w_service_tickets as
  select t.id, t.order_id, t.order_item_id, t.description, t.photo_paths, t.due_date, t.status, t.work_done_at, t.work_note, t.work_photo_paths, t.created_at,
         o.order_no, c.full_name as client_name, o.address, coalesce(o.contact_phone, c.phone) as contact_phone, t.assigned_to
  from public.service_tickets t join public.orders o on o.id = t.order_id join public.clients c on c.id = o.client_id
  where public.my_role() = 'montajchi' and (t.assigned_to = public.my_id() or t.assigned_to is null) and t.status <> 'closed';

create or replace function public.service_accept(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.my_id(); v_role text := public.my_role(); v service_tickets; v_name text; v_who text; v_no bigint;
begin
  if v_me is null or v_role not in ('rahbar', 'montajchi') then raise exception 'Bu amal sizga ruxsat etilmagan'; end if;
  select * into v from service_tickets where id = p_id for update;
  if v.id is null then raise exception 'Zayavka topilmadi'; end if;
  if v.status = 'closed' then return jsonb_build_object('ok', false, 'error', 'Zayavka yopilgan'); end if;
  if v.assigned_to is not null then
    if v.assigned_to = v_me then return jsonb_build_object('ok', true, 'name', (select full_name from employees where id = v_me)); end if;
    select full_name into v_name from employees where id = v.assigned_to;
    insert into accept_late(kind, ref_id, employee_id, winner_id) values ('service', p_id, v_me, v.assigned_to);
    return jsonb_build_object('ok', false, 'taken', true, 'by', v_name, 'error', 'Allaqachon qabul qilingan: ' || coalesce(v_name, '—'));
  end if;
  if v_role = 'rahbar' then raise exception 'Ijrochini «Tayinlash» orqali tanlang'; end if;
  update service_tickets set assigned_to = v_me where id = p_id;
  select full_name into v_who from employees where id = v_me;
  select order_no into v_no from orders where id = v.order_id;
  perform public.notify('rahbar', null, '✅ Servis №' || v_no || ': ' || v_who || ' — qabul qildi', jsonb_build_object('service_id', p_id, 'order_id', v.order_id));
  return jsonb_build_object('ok', true, 'name', v_who);
end $$;
revoke all on function public.service_accept(uuid) from public, anon;
grant execute on function public.service_accept(uuid) to authenticated;

-- создание заявки: без исполнителя — уведомление ВСЕМ монтажникам (первый принявший становится исполнителем)
CREATE OR REPLACE FUNCTION public.create_service(p_order uuid, p_item uuid, p_description text, p_due date DEFAULT NULL::date, p_assignee uuid DEFAULT NULL::uuid, p_photos text[] DEFAULT '{}'::text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v orders; v_id uuid; v_w date;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if coalesce(trim(p_description), '') = '' then raise exception 'Muammoni yozing'; end if;
  select * into v from orders where id = p_order;
  if v.id is null then raise exception 'Buyurtma topilmadi'; end if;
  if v.status not in ('installed', 'closed', 'unknown') then raise exception 'Servis faqat o''rnatilgan buyurtmaga ochiladi'; end if;
  if p_item is not null and not exists (select 1 from order_items where id = p_item and order_id = p_order) then raise exception 'Pozitsiya topilmadi'; end if;
  if p_assignee is not null and not exists (select 1 from employees where id = p_assignee and role = 'montajchi' and is_active) then raise exception 'Faqat faol o''rnatuvchini tanlash mumkin'; end if;
  if exists (select 1 from unnest(coalesce(p_photos, '{}')) f where split_part(f, '/', 1) <> p_order::text) then raise exception 'Foto yo''li noto''g''ri'; end if;
  if exists (select 1 from unnest(coalesce(p_photos, '{}')) f where not public.photo_exists(f)) then raise exception 'Foto serverda topilmadi (yuklash tugamagan?)'; end if;
  v_w := public.order_warranty(p_order);
  insert into service_tickets(order_id, order_item_id, description, photo_paths, assigned_to, due_date, in_warranty, created_by)
  values (p_order, p_item, trim(p_description), coalesce(p_photos, '{}'), p_assignee, p_due, case when v_w is null then null else v_w >= current_date end, public.my_id())
  returning id into v_id;
  if p_assignee is not null then
    perform public.notify(null, p_assignee, public.service_notify_text(v_id, '🛠 Servis'), jsonb_build_object('service_id', v_id, 'order_id', p_order));
  else
    perform public.notify('montajchi', null, public.service_notify_text(v_id, '🛠 Yangi servis (kim qabul qiladi?)'), jsonb_build_object('service_id', v_id, 'order_id', p_order));
  end if;
  return v_id;
end $function$;

notify pgrst, 'reload schema';
