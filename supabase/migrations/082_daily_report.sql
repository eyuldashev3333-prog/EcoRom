-- 082: один ежедневный отчёт руководителям в 23:00 (Ташкент) — решение Asad 26.11.2026.
-- Только ключевое: продажи за день и их оплата; выручка с 1-го числа; расходы за день и с 1-го числа
-- (журнал расходов + закупка сырья; себестоимость заказов и зарплата не входят). Остальные отчёты руководителю выключены.

-- цифры отчёта за ташкентский день p_day (по умолчанию — сегодня)
create or replace function public.daily_report_core(p_day date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  d date := coalesce(p_day, (now() at time zone 'Asia/Tashkent')::date);
  m date := date_trunc('month', coalesce(p_day, (now() at time zone 'Asia/Tashkent')::date))::date;
  t_n int; t_sum numeric; t_paid numeric; m_n int; m_sum numeric;
  e_d numeric; p_d numeric; e_m numeric; p_m numeric;
begin
  -- продажи = созданные заказы (без отменённых), как раздел «Savdo»
  select count(*), coalesce(sum(contract_price), 0) into t_n, t_sum
    from orders where status <> 'cancelled' and (created_at at time zone 'Asia/Tashkent')::date = d;
  select coalesce(sum(p.amount), 0) into t_paid
    from payments p join orders o on o.id = p.order_id
   where o.status <> 'cancelled' and (o.created_at at time zone 'Asia/Tashkent')::date = d;
  select count(*), coalesce(sum(contract_price), 0) into m_n, m_sum
    from orders where status <> 'cancelled' and (created_at at time zone 'Asia/Tashkent')::date between m and d;
  -- расходы: журнал (как отчёт сайта: без битого стекла и сервиса — это убытки, а не расходы) + закупка сырья (оплаты поставщикам); встречные отмены — с минусом
  select coalesce(sum(amount) filter (where spent_at = d), 0), coalesce(sum(amount) filter (where spent_at between m and d), 0) into e_d, e_m
    from expenses where confirmed and source not in ('breakage', 'service') and spent_at between m and d;
  select coalesce(sum(amount) filter (where paid_at = d), 0), coalesce(sum(amount) filter (where paid_at between m and d), 0) into p_d, p_m
    from supplier_payments where paid_at between m and d;
  return jsonb_build_object(
    'day', d, 'month_start', m,
    'today', jsonb_build_object('orders', t_n, 'sum', t_sum, 'paid', t_paid),
    'month', jsonb_build_object('orders', m_n, 'sum', m_sum),
    'expenses_today', jsonb_build_object('expenses', e_d, 'purchases', p_d, 'total', e_d + p_d),
    'expenses_month', jsonb_build_object('expenses', e_m, 'purchases', p_m, 'total', e_m + p_m));
end $$;
revoke all on function public.daily_report_core(date) from public, anon, authenticated;
grant execute on function public.daily_report_core(date) to service_role;

-- остальные отчёты руководителю — выключены (обратимо: cron.alter_job(..., active := true))
do $$
declare j text;
begin
  foreach j in array array['leaks_digest', 'expense_evening', 'integrity_nightly', 'monthly_digest'] loop
    perform cron.alter_job(job_id := (select jobid from cron.job where jobname = j), active := false);
  end loop;
end $$;

-- service_daily: монтажникам их незакрытый сервис — остаётся; сводка руководителю убрана (это отчёт)
create or replace function public.service_daily()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not coalesce((select (value #>> '{}')::boolean from public.app_settings where key = 'digests_on'), false) then return; end if;
  for r in
    select t.assigned_to as emp, string_agg('• №' || o.order_no || ' ' || c.full_name || ' — ' || left(t.description, 60), E'\n' order by t.due_date nulls last) as list
      from service_tickets t join orders o on o.id = t.order_id join clients c on c.id = o.client_id
     where t.status <> 'closed' and t.assigned_to is not null and t.work_done_at is null
     group by t.assigned_to
  loop
    perform public.notify(null, r.emp, '🛠 Servis — bajarilmagan:' || E'\n' || r.list, '{}'::jsonb);
  end loop;
end $$;

-- 23:00 Ташкент (18:00 UTC): вызвать функцию отчёта (она же запускает бэкап)
insert into private.config(key, value) values ('daily_report_url', replace((select value from private.config where key = 'tg_bot_url'), '/tg-bot', '/daily-report'))
on conflict (key) do update set value = excluded.value;

create or replace function public.daily_report_send()
returns void language plpgsql security definer set search_path = public, private as $$
declare fn_url text; secret text;
begin
  select value into fn_url from private.config where key = 'daily_report_url';
  select value into secret from private.config where key = 'tg_internal_secret';
  if fn_url is not null then
    perform net.http_post(url := fn_url, headers := jsonb_build_object('Content-Type', 'application/json', 'X-Ecorom-Secret', secret),
      body := '{}'::jsonb, timeout_milliseconds := 60000);
  end if;
end $$;
revoke all on function public.daily_report_send() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'daily_report';
select cron.schedule('daily_report', '0 18 * * *', 'select public.daily_report_send()');
