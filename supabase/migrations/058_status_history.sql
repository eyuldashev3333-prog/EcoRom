-- 058 — время смены статуса, история статусов, «Mening ishlarim» (24.11.2026).

-- ---------- время последней смены статуса ----------
alter table orders add column if not exists status_at timestamptz;
update orders set status_at = coalesce(updated_at, created_at) where status_at is null;
alter table orders alter column status_at set default now();

create or replace function public.orders_set_status_at() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.status_at := coalesce(new.status_at, now());
  elsif new.status is distinct from old.status then new.status_at := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_orders_status_at on orders;
create trigger trg_orders_status_at before insert or update of status on orders for each row execute function public.orders_set_status_at();

-- ---------- история статусов: кто и когда ----------
create table if not exists order_status_log (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  status text not null,
  at timestamptz not null default now(),
  by_employee uuid references employees(id) on delete set null
);
create index if not exists order_status_log_order on order_status_log(order_id, at);
alter table order_status_log enable row level security;
drop policy if exists osl_rahbar on order_status_log;
create policy osl_rahbar on order_status_log for select to authenticated using (public.is_rahbar());

create or replace function public.orders_log_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into order_status_log(order_id, status, at, by_employee) values (new.id, new.status, now(), public.my_id());
  end if;
  return new;
end $$;
drop trigger if exists trg_orders_log_status on orders;
create trigger trg_orders_log_status after insert or update of status on orders for each row execute function public.orders_log_status();

-- уже существующие заказы: одна запись «сейчас в этом статусе»
insert into order_status_log(order_id, status, at)
select o.id, o.status, coalesce(o.status_at, o.created_at) from orders o where not exists (select 1 from order_status_log l where l.order_id = o.id);

-- ---------- цех и монтажник видят время смены статуса; цех открывает и завершённые заказы ----------
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
    o.shop_accepted_at,
    o.status_at
   FROM (orders o
     LEFT JOIN clients c ON ((c.id = o.client_id)))
  WHERE (((my_role() = 'ishlab'::text) AND (o.shop_sent_at IS NOT NULL) AND (o.status = ANY (ARRAY['in_production'::text, 'ready'::text, 'installing'::text, 'installed'::text, 'closed'::text])) AND ((EXISTS ( SELECT 1
           FROM order_shop_workers w
          WHERE ((w.order_id = o.id) AND (w.employee_id = my_id())))) OR (NOT (EXISTS ( SELECT 1
           FROM order_shop_workers w
          WHERE (w.order_id = o.id)))))) OR ((my_role() = 'montajchi'::text) AND (EXISTS ( SELECT 1
           FROM (install_jobs j
             JOIN install_job_members m ON ((m.job_id = j.id)))
          WHERE ((j.order_id = o.id) AND (m.employee_id = my_id()))))));

-- ---------- «Mening ishlarim»: мои заказы (в работе и выполненные) и мои сервисные заявки ----------
create or replace function public.my_work(p_month date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := public.my_id(); v_role text := public.my_role(); d1 date; d2 date; v_orders jsonb; v_service jsonb := '[]'::jsonb;
begin
  if v_me is null or v_role not in ('ishlab', 'montajchi') then raise exception 'Bu amal sizga ruxsat etilmagan'; end if;
  d1 := date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Tashkent')::date))::date;
  d2 := (d1 + interval '1 month')::date;
  with mine as (
    select o.* from orders o
     where not o.is_imported and o.status not in ('new', 'cancelled', 'unknown') and (
       (v_role = 'ishlab' and (
          exists (select 1 from order_shop_workers w where w.order_id = o.id and w.employee_id = v_me)
          or exists (select 1 from item_stage_marks m join order_items i on i.id = m.order_item_id where i.order_id = o.id and m.done_by = v_me)))
       or (v_role = 'montajchi' and exists (select 1 from install_jobs j join install_job_members jm on jm.job_id = j.id where j.order_id = o.id and jm.employee_id = v_me)))
  ), rows as (
    select m.*,
           (select min(l.at) from order_status_log l where l.order_id = m.id
             and l.status = case when v_role = 'ishlab' then 'ready' else 'installed' end) as done_at
      from mine m
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'order_no', r.order_no, 'status', r.status, 'status_at', r.status_at, 'deadline', r.deadline,
      'windows_count', r.windows_count, 'area_m2', r.area_m2, 'done_at', r.done_at,
      'items_count', (select count(*) from order_items i where i.order_id = r.id),
      'design', (select i.design from order_items i where i.order_id = r.id order by i.pos limit 1),
      'client_name', case when v_role = 'montajchi' then (select c.full_name from clients c where c.id = r.client_id) end,
      'phone', case when v_role = 'montajchi' then coalesce(r.contact_phone, (select c.phone from clients c where c.id = r.client_id)) end,
      'address', case when v_role = 'montajchi' then r.address end
    ) order by coalesce(r.done_at, r.status_at) desc), '[]'::jsonb)
    into v_orders
    from rows r
   where r.done_at is null or (r.done_at at time zone 'Asia/Tashkent')::date >= d1 and (r.done_at at time zone 'Asia/Tashkent')::date < d2;
  if v_role = 'montajchi' then
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'order_no', o.order_no, 'client_name', c.full_name, 'address', o.address, 'description', t.description, 'work_done_at', t.work_done_at
      ) order by t.work_done_at desc), '[]'::jsonb)
      into v_service
      from service_tickets t join orders o on o.id = t.order_id join clients c on c.id = o.client_id
     where t.work_done_by = v_me and t.work_done_at is not null
       and (t.work_done_at at time zone 'Asia/Tashkent')::date >= d1 and (t.work_done_at at time zone 'Asia/Tashkent')::date < d2;
  end if;
  return jsonb_build_object('orders', v_orders, 'service', v_service);
end $$;
grant execute on function public.my_work(date) to authenticated;
