-- ECOROM 050: «Ish haqim» → «Bu oy bajarilgan» считается по назначенным на заказ (как зарплата), а не только по тому, кто поставил отметку.
create or replace function public.my_output(p_month date)
returns table(stage_code text, stage_name text, windows bigint, m2 numeric, orders bigint)
language sql stable security definer set search_path = public as $$
  select s.code, s.name, coalesce(sum(oi.qty), 0)::bigint, coalesce(sum(oi.area_m2 * oi.qty), 0)::numeric, count(distinct oi.order_id)::bigint
    from item_stage_marks m
    join stages s on s.id = m.stage_id
    join order_items oi on oi.id = m.order_item_id
   where public.my_id() in (select public.mark_workers(oi.order_id, s.code, m.done_by))
     and (m.done_at at time zone 'Asia/Tashkent')::date >= date_trunc('month', p_month)::date
     and (m.done_at at time zone 'Asia/Tashkent')::date <  (date_trunc('month', p_month) + interval '1 month')::date
   group by s.id, s.code, s.name, s.sort
   order by s.sort
$$;
revoke all on function public.my_output(date) from public, anon;
grant execute on function public.my_output(date) to authenticated;
notify pgrst, 'reload schema';
