-- ECOROM 054: исправление типа в worker_stats (дни пропусков — numeric). Та же функция, что в 049.
-- ===== статистика по сотрудникам (не зависит от типа оплаты) =====
create or replace function public.worker_stats(p_month date, p_employee uuid default null)
returns table(employee_id uuid, full_name text, role text, orders int, windows int, m2 numeric, services int, absence_days numeric, absence_hours numeric, accrued numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_emp uuid := case when public.is_rahbar() then p_employee else public.my_id() end;
begin
  if public.my_id() is null then raise exception 'Kirish kerak'; end if;
  return query
  with b as (select date_trunc('month', p_month)::date as d1, (date_trunc('month', p_month) + interval '1 month')::date as d2),
  done as (
    select distinct w.emp, oi.id as item_id, o.id as order_id, oi.qty, oi.area_m2 * oi.qty as m2
      from b cross join item_stage_marks m join stages s on s.id = m.stage_id
      join order_items oi on oi.id = m.order_item_id join orders o on o.id = oi.order_id
      cross join lateral public.mark_workers(o.id, s.code, m.done_by) as w(emp)
     where (m.done_at at time zone 'Asia/Tashkent')::date >= b.d1 and (m.done_at at time zone 'Asia/Tashkent')::date < b.d2
  ),
  agg as (select d.emp, count(distinct d.order_id)::int as orders, sum(d.qty)::int as windows, sum(d.m2) as m2 from done d group by d.emp),
  svc as (select t.work_done_by as emp, count(*)::int as n from service_tickets t, b
           where t.work_done_at is not null and (t.work_done_at at time zone 'Asia/Tashkent')::date >= b.d1 and (t.work_done_at at time zone 'Asia/Tashkent')::date < b.d2 group by t.work_done_by),
  ab as (select a.employee_id as emp, coalesce(sum(case when a.hours is null then 1 end), 0)::numeric as days, coalesce(sum(a.hours), 0) as hrs
           from attendance_absences a, b
          where a.reverses_id is null and a.day >= b.d1 and a.day < b.d2 and not exists (select 1 from attendance_absences x where x.reverses_id = a.id)
          group by a.employee_id),
  pay as (select l.employee_id as emp, sum(l.amount) as s from public.payroll_lines(p_month) l group by l.employee_id)
  select e.id, e.full_name, e.role, coalesce(agg.orders, 0), coalesce(agg.windows, 0), coalesce(round(agg.m2, 2), 0), coalesce(svc.n, 0),
         coalesce(ab.days, 0), coalesce(ab.hrs, 0), coalesce(pay.s, 0)
    from employees e left join agg on agg.emp = e.id left join svc on svc.emp = e.id left join ab on ab.emp = e.id left join pay on pay.emp = e.id
   where e.role in ('ishlab', 'montajchi') and (v_emp is null or e.id = v_emp)
     and (e.is_active or agg.emp is not null or svc.emp is not null or pay.emp is not null)
   order by e.role, e.full_name;
end $$;
revoke all on function public.worker_stats(date, uuid) from public, anon;
grant execute on function public.worker_stats(date, uuid) to authenticated;

notify pgrst, 'reload schema';
