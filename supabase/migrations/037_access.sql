-- ECOROM 037 (блок 1 плана исправлений): доступы и безопасность.
-- H1: цех видит только заказы, отправленные в цех и не закрытые; монтажник — назначенные + телефон клиента (M10).
-- H5: журнал аудита — только чтение и добавление (никто, включая Rahbar, не правит и не стирает).
-- H6: нельзя оставить систему без активного Rahbar (отключение, смена роли, удаление).

-- H1 + M10
create or replace view public.w_orders as
select o.id, o.order_no, o.status, o.deadline, o.color, o.windows_count, o.area_m2,
       case when o.is_imported then null else o.notes end as notes,
       o.install_date,
       case when public.my_role() = 'montajchi' then o.address else null end as address,
       case when public.my_role() = 'montajchi' then coalesce(o.contact_phone, c.phone) else null end as contact_phone,
       c.full_name as client_name
  from public.orders o
  left join public.clients c on c.id = o.client_id
 where (public.my_role() = 'ishlab' and o.shop_sent_at is not null and o.status in ('in_production', 'ready', 'installing'))
    or (public.my_role() = 'montajchi' and exists (
          select 1 from public.install_jobs j join public.install_job_members m on m.job_id = j.id
           where j.order_id = o.id and m.employee_id = public.my_id()));

-- H5
revoke update, delete, truncate on public.audit_log from authenticated, anon;
drop policy if exists rahbar_all on public.audit_log;
create policy rahbar_read on public.audit_log for select using (public.is_rahbar());
create policy rahbar_insert on public.audit_log for insert with check (public.is_rahbar());

-- H6
create or replace function public.guard_last_rahbar() returns trigger
language plpgsql set search_path = public as $$
declare v_old employees := old;
begin
  if v_old.role = 'rahbar' and v_old.is_active
     and (tg_op = 'DELETE' or new.role <> 'rahbar' or not new.is_active)
     and not exists (select 1 from employees e where e.role = 'rahbar' and e.is_active and e.id <> v_old.id) then
    raise exception 'Oxirgi faol rahbarni o''chirib yoki o''zgartirib bo''lmaydi';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists trg_guard_last_rahbar on public.employees;
create trigger trg_guard_last_rahbar before update or delete on public.employees
  for each row execute function public.guard_last_rahbar();
