-- ECOROM 079: список месяцев для REGISTRATSIYA одним запросом (таблица грузит только выбранный месяц, а не все заказы за всё время).
-- Откат: drop function public.registratsiya_months().
create or replace function public.registratsiya_months() returns table(oy text, n bigint)
language sql stable set search_path = public as $$
  select to_char(created_at at time zone 'Asia/Tashkent', 'YYYY-MM') as oy, count(*) as n from orders group by 1 order by 1 desc
$$;
revoke all on function public.registratsiya_months() from public, anon;
grant execute on function public.registratsiya_months() to authenticated;