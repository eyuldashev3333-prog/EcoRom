-- ECOROM 059: цифры всегда верные.
--  1. home_summary() — касса, долги, число заказов ОДНИМ запросом с сервера (раньше Home/ZavodKpis суммировали в браузере выборки, обрезанные PostgREST max_rows=1000).
--  2. expenses_month_summary(month) — итог и разбивка расходов за месяц с сервера (раньше сумма первых 1000 строк в браузере).
--  3. savdo_month_core / savdo_month — таблица Savdo читает ТЕ ЖЕ проводки, что касса и отчёт:
--       * «Prixod» и «Rasxod» — это все проводки месяца со знаком (сторно и возвраты — отдельными строками), сумма строк = итог;
--       * зарплата в «kassa_rasxod / ostatka» — по дате выплаты (как в кассе и monthly_report_core), а не по периоду;
--       * отменённые заказы не входят в список и в «hizmat».
--  4. Скрытые окна по времени убраны: «низкая маржа» и «закуплено дороже каталога» по умолчанию за ВСЁ время (leak_window_days=0 → без окна);
--     workshop_state больше не отбрасывает «new» старше 30 дней и не режет список до 80.
--  5. integrity_check() — проверка инвариантов (касса, долги, склад, зарплата, Savdo = Report, суммы заказа = позиции, даты) + ночной контроль.
-- Откат: старые определения — в 035_one_profit.sql, 023_settings.sql, 055_order_flow_simple.sql; новые функции можно удалить (drop function).

-- ============ 1. home_summary ============
create or replace function public.home_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_cash numeric; v_since date;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  select cash, since into v_cash, v_since from v_cash_balance;
  return jsonb_build_object(
    'cash', coalesce(v_cash, 0), 'since', v_since,
    'orders', (select count(*) from orders),
    'client_debt', (select coalesce(sum(greatest(p.debt, 0)), 0) from v_order_paid p join orders o on o.id = p.order_id where o.status <> 'cancelled'),
    'client_debt_orders', (select count(*) from v_order_paid p join orders o on o.id = p.order_id where o.status <> 'cancelled' and p.debt > 0),
    'overpaid', (select coalesce(sum(-p.debt), 0) from v_order_paid p join orders o on o.id = p.order_id where o.status <> 'cancelled' and p.debt < 0),
    'supplier_debt', (select coalesce(sum(greatest(debt, 0)), 0) from v_supplier_debt),
    'open_service', (select count(*) from service_tickets where status <> 'closed'));
end $$;
revoke all on function public.home_summary() from public, anon;
grant execute on function public.home_summary() to authenticated;

-- ============ 2. expenses_month_summary ============
create or replace function public.expenses_month_summary(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_m date := date_trunc('month', p_month)::date; v_e date := (date_trunc('month', p_month) + interval '1 month')::date;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  return jsonb_build_object(
    'month', to_char(v_m, 'YYYY-MM'),
    'total', (select coalesce(sum(amount), 0) from expenses where spent_at >= v_m and spent_at < v_e),
    'rows', (select count(*) from expenses where spent_at >= v_m and spent_at < v_e),
    'by_category', (select coalesce(jsonb_agg(jsonb_build_object('name', n, 'amount', a) order by a desc), '[]'::jsonb) from (
        select coalesce(c.name, '—') n, sum(x.amount) a from expenses x left join expense_categories c on c.id = x.category_id
         where x.spent_at >= v_m and x.spent_at < v_e group by 1 having sum(x.amount) <> 0) q));
end $$;
revoke all on function public.expenses_month_summary(date) from public, anon;
grant execute on function public.expenses_month_summary(date) to authenticated;

-- ============ 3. savdo_month_core (без проверки роли) и savdo_month ============
create or replace function public.savdo_month_core(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_m date := date_trunc('month', p_month)::date; v_e date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_per text := to_char(date_trunc('month', p_month), 'YYYY-MM');
  r jsonb; v_hizmat numeric; v_exp numeric; v_sal numeric; v_in numeric; v_sup numeric; v_cash_exp numeric; v_core jsonb; v_sal_profit numeric; v_loss numeric;
begin
  v_core := public.monthly_report_core(v_m);
  v_sal_profit := (v_core->'salaries'->>'in_profit')::numeric;
  v_loss := (v_core->'losses'->>'total')::numeric;
  -- отменённый заказ в таблицу и в «hizmat» не входит (как и в monthly_report_core)
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'raqami', raqami, 'ismi', ismi, 'alyumin', alyumin, 'plast', plast, 'termo', termo,
           'umumiy', alyumin + plast + termo, 'soni', soni, 'dogovor', dogovor, 'foyda', foyda, 'holati', status) order by raqami), '[]')
    into r from v_registratsiya where oy = v_per and status <> 'cancelled';
  v_hizmat := (v_core->>'margin')::numeric;
  select coalesce(sum(amount), 0) into v_in from payments where paid_at >= v_m and paid_at < v_e;
  select coalesce(sum(amount), 0) into v_exp from expenses where confirmed and source not in ('breakage', 'service') and spent_at >= v_m and spent_at < v_e;
  select coalesce(sum(amount), 0) into v_cash_exp from expenses where confirmed and spent_at >= v_m and spent_at < v_e;
  select coalesce(sum(amount), 0) into v_sal from salary_payouts where paid_at >= v_m and paid_at < v_e;   -- деньги ушли в дату выплаты (как в кассе)
  select coalesce(sum(amount), 0) into v_sup from supplier_payments where paid_at >= v_m and paid_at < v_e;
  return jsonb_build_object(
    'month', v_per,
    'orders', r,
    'salaries', (
      select coalesce(jsonb_agg(x order by x->>'name'), '[]') from (
        select jsonb_build_object('id', e.id, 'name', e.full_name,
                 'rate', (select string_agg(case pr.basis when 'salary' then 'oylik ' when 'percent_sales' then 'savdodan ' when 'per_m2' then 'm² ' when 'per_window' then 'oyna ' else pr.basis || ' ' end
                                             || trim(to_char(pr.amount, 'FM999G999G999G990.##')) || case when pr.basis = 'percent_sales' then '%' else '' end, ', ')
                           from pay_rules pr where pr.employee_id = e.id and pr.valid_from < v_e and (pr.valid_to is null or pr.valid_to >= v_m) and pr.basis in ('salary', 'fixed', 'percent_sales', 'per_m2', 'per_window')),
                 'etap', (select coalesce(jsonb_agg(jsonb_build_object('id', sp.id, 'amount', sp.amount, 'date', sp.paid_at) order by sp.paid_at, sp.created_at), '[]')
                            from salary_payouts sp where sp.employee_id = e.id and sp.period = v_per and sp.reverses_id is null
                             and not exists (select 1 from salary_payouts r2 where r2.reverses_id = sp.id)),
                 'oldi', (select coalesce(sum(amount), 0) from salary_payouts sp where sp.employee_id = e.id and sp.period = v_per),
                 'oyligi', (select coalesce(sum(l.amount), 0) from payroll_lines(v_m) l where l.employee_id = e.id)) as x
          from employees e
         where exists (select 1 from salary_payouts sp where sp.employee_id = e.id and sp.period = v_per)
            or exists (select 1 from payroll_lines(v_m) l where l.employee_id = e.id)
      ) q),
    'by_category', (
      select coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'amount', s) order by c.name), '[]') from (
        select category_id, sum(amount) s from expenses where confirmed and source not in ('breakage', 'service') and spent_at >= v_m and spent_at < v_e group by 1 having sum(amount) <> 0) x
        join expense_categories c on c.id = x.category_id),
    -- приход: ВСЕ проводки месяца со знаком; возврат/сторно — отдельной строкой с минусом. Сумма строк = итог «prixod».
    'prixod', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'date', p.paid_at, 'raqami', o.order_no, 'ismi', c.full_name, 'amount', p.amount,
               'note', p.note, 'storno', p.reverses_id is not null) order by p.paid_at, p.created_at), '[]')
        from payments p join orders o on o.id = p.order_id join clients c on c.id = o.client_id
       where p.paid_at >= v_m and p.paid_at < v_e),
    'rasxod', (
      select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'date', x.spent_at, 'category', c.name, 'category_id', x.category_id, 'amount', x.amount, 'note', x.note,
               'source', x.source, 'employee', e.full_name, 'storno', x.reverses_id is not null) order by x.spent_at, x.created_at), '[]')
        from expenses x join expense_categories c on c.id = x.category_id left join employees e on e.id = x.for_employee_id
       where x.confirmed and x.source not in ('breakage', 'service') and x.spent_at >= v_m and x.spent_at < v_e),
    'itog', jsonb_build_object('hizmat', v_hizmat, 'rasxod', v_exp, 'oylik', v_sal_profit, 'yoqotish', v_loss, 'faqat_rasxod', v_exp + v_sal_profit + v_loss,
                               'sof_foyda', (v_core->>'profit')::numeric,
                               'prixod', v_in, 'kassa_rasxod', v_cash_exp + v_sal + v_sup, 'postavshik', v_sup, 'ostatka', v_in - v_cash_exp - v_sal - v_sup),
    'categories', (select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name) from expense_categories where is_active),
    'months', (select coalesce(jsonb_agg(m order by m desc), '[]') from (
                 select distinct to_char(d, 'YYYY-MM') m from (
                   select (created_at at time zone 'Asia/Tashkent')::date d from orders union all select spent_at from expenses union all select paid_at from payments) z) y)
  );
end $$;
revoke all on function public.savdo_month_core(date) from public, anon, authenticated;

create or replace function public.savdo_month(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  return public.savdo_month_core(p_month);
end $$;
revoke all on function public.savdo_month(date) from public, anon;
grant execute on function public.savdo_month(date) to authenticated;

-- ============ 4. убрать скрытые окна по времени ============
insert into app_settings (key, value) values ('leak_window_days', '0') on conflict (key) do update set value = '0'::jsonb;   -- 0 = за всё время
insert into app_settings (key, value) values ('leak_pace_days', '30') on conflict (key) do nothing;                        -- «темп цеха» — явный период

do $$
declare v_src text;
begin
  select pg_get_functiondef('public.leaks_core()'::regprocedure) into v_src;
  v_src := replace(v_src, 'o.created_at >= now() - make_interval(days => v_win)', '(v_win <= 0 or o.created_at >= now() - make_interval(days => v_win))');
  v_src := replace(v_src, 'p.purchased_at >= v_today - v_win', '(v_win <= 0 or p.purchased_at >= v_today - v_win)');
  v_src := replace(v_src, 'm.done_at >= now() - interval ''30 days''', 'm.done_at >= now() - make_interval(days => coalesce((select (value #>> ''{}'')::int from app_settings where key = ''leak_pace_days''), 30))');
  if v_src like '%v_win)%' and v_src not like '%(v_win <= 0 or o.created_at%' then raise exception 'leaks_core: окно маржи не заменено'; end if;
  if v_src not like '%(v_win <= 0 or p.purchased_at%' or v_src not like '%leak_pace_days%' then raise exception 'leaks_core: не все окна заменены'; end if;
  execute v_src;

  select pg_get_functiondef('public.workshop_state()'::regprocedure) into v_src;
  v_src := replace(v_src, $q$(o.status = 'new' and o.created_at > now() - interval '30 days')$q$, $q$o.status = 'new'$q$);
  v_src := replace(v_src, 'order by o.order_no desc limit 80) o', 'order by o.order_no desc) o');
  if v_src like '%interval ''30 days''%' or v_src like '%limit 80%' then raise exception 'workshop_state: окна не убраны'; end if;
  execute v_src;
end $$;

-- ============ 5. integrity_check ============
create or replace function public.integrity_check() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Tashkent')::date;
  res jsonb := '[]'::jsonb; v_start date; v_open numeric; a numeric; b numeric; c numeric; v_m date; s jsonb; k jsonb; v_n bigint; v_cur date := date_trunc('month', v_today)::date;
begin
  if not (public.is_rahbar() or session_user in ('postgres', 'supabase_admin')) then raise exception 'Faqat rahbar'; end if;

  -- 1. касса = открытие + приход − расход − выплаты − оплаты поставщикам (с даты старта кассы)
  select coalesce((value #>> '{}')::date, v_today) into v_start from app_settings where key = 'cash_start_date';
  select coalesce((value #>> '{}')::numeric, 0) into v_open from app_settings where key = 'cash_opening_balance';
  a := coalesce(v_open, 0)
       + (select coalesce(sum(amount), 0) from payments where paid_at >= v_start)
       - (select coalesce(sum(amount), 0) from expenses where confirmed and spent_at >= v_start)
       - (select coalesce(sum(amount), 0) from salary_payouts where paid_at >= v_start)
       - (select coalesce(sum(amount), 0) from supplier_payments where paid_at >= v_start);
  select cash into b from v_cash_balance;
  res := res || jsonb_build_object('name', 'cash_formula', 'ok', a = b, 'expected', a, 'actual', b);

  -- 2. долг клиентов: Home = «утечки» (сумма) = сумма корзин 30/90/старше
  s := public.home_summary_core();
  k := public.leaks_core();
  a := (s->>'client_debt')::numeric;
  b := (k->'client_debts'->>'total')::numeric;
  c := (k->'client_debts'->>'d30')::numeric + (k->'client_debts'->>'d90')::numeric + (k->'client_debts'->>'older')::numeric;
  res := res || jsonb_build_object('name', 'client_debt_home_vs_leaks', 'ok', a = b, 'expected', a, 'actual', b);
  res := res || jsonb_build_object('name', 'client_debt_buckets_sum', 'ok', b = c, 'expected', b, 'actual', c);
  a := (select coalesce(sum(greatest(p.debt, 0)), 0) from (select o.contract_price - coalesce((select sum(amount) from payments x where x.order_id = o.id), 0) as debt
                                                              from orders o where o.status <> 'cancelled') p);
  res := res || jsonb_build_object('name', 'client_debt_recomputed', 'ok', a = (s->>'client_debt')::numeric, 'expected', a, 'actual', (s->>'client_debt')::numeric);

  -- 3. долг поставщикам = закупки (с доставкой) − оплаты, по всем поставщикам
  a := (select coalesce(sum(total + delivery_cost), 0) from purchases) - (select coalesce(sum(amount), 0) from supplier_payments);
  b := (select coalesce(sum(debt), 0) from v_supplier_debt);
  res := res || jsonb_build_object('name', 'supplier_debt', 'ok', a = b, 'expected', a, 'actual', b);

  -- 4. склад: остаток = сумма движений
  a := (select coalesce(sum(qty), 0) from stock_movements m join catalog_items i on i.id = m.item_id where i.stock_tracked);
  b := (select coalesce(sum(qty), 0) from v_stock_balance);
  res := res || jsonb_build_object('name', 'stock_balance', 'ok', abs(a - b) < 0.001, 'expected', a, 'actual', b);

  -- 5. шапка заказа = сумма позиций (кроме импортированных и пустых)
  select count(*) into v_n from orders o
   where not o.is_imported and exists (select 1 from order_items i where i.order_id = o.id)
     and (o.windows_count <> (select coalesce(sum(qty), 0) from order_items i where i.order_id = o.id)
          or abs(o.area_m2 - (select coalesce(sum(area_m2 * qty), 0) from order_items i where i.order_id = o.id)) > 0.05);
  res := res || jsonb_build_object('name', 'order_header_vs_items', 'ok', v_n = 0, 'expected', 0, 'actual', v_n);

  -- 6. даты и знаки: нет будущих дат, нет сторно без оригинала, нет отрицательной цены
  select (select count(*) from payments where paid_at > v_today + 1) + (select count(*) from expenses where spent_at > v_today + 1)
       + (select count(*) from salary_payouts where paid_at > v_today + 1) + (select count(*) from supplier_payments where paid_at > v_today + 1)
       + (select count(*) from purchases where purchased_at > v_today + 1) into v_n;
  res := res || jsonb_build_object('name', 'no_future_dates', 'ok', v_n = 0, 'expected', 0, 'actual', v_n);
  select (select count(*) from payments p where p.reverses_id is not null and not exists (select 1 from payments o where o.id = p.reverses_id))
       + (select count(*) from expenses p where p.reverses_id is not null and not exists (select 1 from expenses o where o.id = p.reverses_id))
       + (select count(*) from orders where contract_price < 0) into v_n;
  res := res || jsonb_build_object('name', 'ledger_sanity', 'ok', v_n = 0, 'expected', 0, 'actual', v_n);

  -- 7. по каждому из последних 6 месяцев: Savdo = Report, сумма строк = итог, зарплата начислено = сумма строк
  for v_m in select (v_cur - make_interval(months => g))::date from generate_series(0, 5) g loop
    s := public.savdo_month_core(v_m);
    k := public.monthly_report_core(v_m);
    a := (s->'itog'->>'prixod')::numeric; b := (k->'cash'->>'received')::numeric;
    res := res || jsonb_build_object('name', 'savdo_prixod_vs_report ' || to_char(v_m, 'YYYY-MM'), 'ok', a = b, 'expected', b, 'actual', a);
    a := (s->'itog'->>'ostatka')::numeric; b := (k->'cash'->>'net')::numeric;
    res := res || jsonb_build_object('name', 'savdo_ostatka_vs_report ' || to_char(v_m, 'YYYY-MM'), 'ok', a = b, 'expected', b, 'actual', a);
    a := (s->'itog'->>'sof_foyda')::numeric; b := (k->>'profit')::numeric;
    res := res || jsonb_build_object('name', 'savdo_profit_vs_report ' || to_char(v_m, 'YYYY-MM'), 'ok', a = b, 'expected', b, 'actual', a);
    a := (select coalesce(sum((x->>'amount')::numeric), 0) from jsonb_array_elements(s->'prixod') x);
    b := (s->'itog'->>'prixod')::numeric;
    res := res || jsonb_build_object('name', 'savdo_prixod_rows_sum ' || to_char(v_m, 'YYYY-MM'), 'ok', a = b, 'expected', b, 'actual', a);
    a := (select coalesce(sum((x->>'amount')::numeric), 0) from jsonb_array_elements(s->'rasxod') x);
    b := (s->'itog'->>'rasxod')::numeric;
    res := res || jsonb_build_object('name', 'savdo_rasxod_rows_sum ' || to_char(v_m, 'YYYY-MM'), 'ok', a = b, 'expected', b, 'actual', a);
    a := (select coalesce(sum((x->>'foyda')::numeric), 0) from jsonb_array_elements(s->'orders') x);
    b := (s->'itog'->>'hizmat')::numeric;
    res := res || jsonb_build_object('name', 'savdo_orders_foyda_vs_hizmat ' || to_char(v_m, 'YYYY-MM'), 'ok', abs(a - b) < 1, 'expected', b, 'actual', a);
    a := (k->'salaries'->>'accrued')::numeric;
    b := (select coalesce(sum(l.amount), 0) from payroll_lines(v_m) l);
    res := res || jsonb_build_object('name', 'payroll_accrued_vs_lines ' || to_char(v_m, 'YYYY-MM'), 'ok', abs(a - b) < 1, 'expected', b, 'actual', a);
  end loop;

  return jsonb_build_object('ok', not exists (select 1 from jsonb_array_elements(res) x where not (x->>'ok')::boolean),
                            'checked_at', now(), 'failed', (select coalesce(jsonb_agg(x), '[]') from jsonb_array_elements(res) x where not (x->>'ok')::boolean),
                            'checks', res);
end $$;
revoke all on function public.integrity_check() from public, anon;
grant execute on function public.integrity_check() to authenticated;

-- home_summary без проверки роли — для integrity_check
create or replace function public.home_summary_core() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'client_debt', (select coalesce(sum(greatest(p.debt, 0)), 0) from v_order_paid p join orders o on o.id = p.order_id where o.status <> 'cancelled'));
$$;
revoke all on function public.home_summary_core() from public, anon, authenticated;

-- ночной контроль: расхождение → уведомление руководителям
create or replace function public.integrity_nightly() returns void
language plpgsql security definer set search_path = public as $$
declare r jsonb; v_text text;
begin
  r := public.integrity_check();
  if not (r->>'ok')::boolean then
    select string_agg('• ' || (x->>'name') || ': ' || coalesce(x->>'actual', '?') || ' ≠ ' || coalesce(x->>'expected', '?'), E'\n') into v_text from jsonb_array_elements(r->'failed') x;
    perform public.notify('rahbar', null, '⚠️ Raqamlar tekshiruvi: nomuvofiqlik topildi' || E'\n' || left(v_text, 900), jsonb_build_object('integrity', true));
  end if;
end $$;
revoke all on function public.integrity_nightly() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'integrity_nightly';
    perform cron.schedule('integrity_nightly', '0 21 * * *', 'select public.integrity_nightly()');   -- 02:00 по Ташкенту
  end if;
end $$;
