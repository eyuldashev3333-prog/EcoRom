-- ECOROM 034: личный кабинет цеха и монтажников — «сколько я сделал за месяц».
-- Человек видит только СВОИ отметки этапов (item_stage_marks.done_by = он сам). Цены и оплаты клиентов не затрагиваются.
-- Деньги (начислено / выплачено / остаток / список выплат) берутся из payroll_summary и payroll_payouts (017).
create or replace function public.my_output(p_month date)
returns table(stage_code text, stage_name text, windows bigint, m2 numeric, orders bigint)
language sql stable security definer set search_path = public as $$
  select s.code, s.name, coalesce(sum(oi.qty), 0)::bigint, coalesce(sum(oi.area_m2 * oi.qty), 0)::numeric, count(distinct oi.order_id)::bigint
    from item_stage_marks m
    join stages s on s.id = m.stage_id
    join order_items oi on oi.id = m.order_item_id
   where m.done_by = public.my_id()
     and (m.done_at at time zone 'Asia/Tashkent')::date >= date_trunc('month', p_month)::date
     and (m.done_at at time zone 'Asia/Tashkent')::date <  (date_trunc('month', p_month) + interval '1 month')::date
   group by s.id, s.code, s.name, s.sort
   order by s.sort
$$;
revoke all on function public.my_output(date) from public, anon;
grant execute on function public.my_output(date) to authenticated;
