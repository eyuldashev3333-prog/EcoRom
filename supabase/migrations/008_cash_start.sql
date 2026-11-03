-- ECOROM 008: касса считается с даты начала учёта + начальный остаток (история оплат из таблиц в кассу не попадает).
insert into public.app_settings(key, value) values ('cash_start_date', to_jsonb(current_date::text)), ('cash_opening_balance', '0')
on conflict (key) do nothing;

create or replace view public.v_cash_balance with (security_invoker = true) as
  with s as (
    select coalesce((select (value #>> '{}')::date from public.app_settings where key = 'cash_start_date'), current_date) as d,
           coalesce((select (value #>> '{}')::numeric from public.app_settings where key = 'cash_opening_balance'), 0) as opening
  )
  select s.opening
       + (select coalesce(sum(amount), 0) from public.payments where paid_at >= s.d)
       - (select coalesce(sum(amount), 0) from public.expenses where confirmed and spent_at >= s.d)
       - (select coalesce(sum(amount), 0) from public.salary_payouts where paid_at >= s.d)
       - (select coalesce(sum(amount), 0) from public.supplier_payments where paid_at >= s.d) as cash,
         s.d as since
  from s;
