-- ECOROM 018: месячный отчёт вместо Excel «Фойда хисоби» + автоматическое сообщение Rahbar 1-го числа.
-- Прибыль = выручка − себестоимость − ish haqi − xarajatlar − yo'qotishlar, где:
--   выручка        — договоры заказов месяца (по дате создания заказа, без отменённых);
--   себестоимость  — calc_cost заказов (цены каталога); отдельной строкой «ishlar» — работы из каталога внутри себестоимости
--                    (могут пересекаться с зарплатой монтажа → показываем и «прибыль без работ в себестоимости»);
--   ish haqi       — начисления месяца (закрытый месяц — снимок);
--   xarajatlar     — подтверждённые расходы месяца (нетто с отменами);
--   yo'qotishlar   — бой стекла (платит завод) + сервис (платит завод, закрыт в месяце) + недостача инвентаризации.
-- Движение денег — отдельно: пришло от клиентов, ушло (расходы, зарплаты, поставщики); касса «сейчас» — как на главной.

create or replace function public.fmt_sum(x numeric) returns text language sql immutable as $$
  select replace(to_char(round(coalesce(x, 0)), 'FM999G999G999G999G990'), ',', ' ')
$$;

-- начисленная зарплата месяца без проверки пользователя (для отчёта и cron)
create or replace function public.payroll_total(p_month date) returns table(accrued numeric, closed boolean)
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from payroll_months where month = date_trunc('month', p_month)::date)
              then (select coalesce(sum(amount), 0) from payroll_accruals where month = date_trunc('month', p_month)::date)
              else (select coalesce(sum(amount), 0) from payroll_lines(date_trunc('month', p_month)::date)) end,
         exists (select 1 from payroll_months where month = date_trunc('month', p_month)::date)
$$;
revoke all on function public.payroll_total(date) from public, anon, authenticated;

create or replace function public.monthly_report_core(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_m date := date_trunc('month', p_month)::date; v_e date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_per text := to_char(date_trunc('month', p_month), 'YYYY-MM');
  o_n int; o_rev numeric; o_win numeric; o_area numeric; o_cost numeric; v_works numeric; v_series jsonb;
  s_acc numeric; s_closed boolean; s_paid numeric;
  e_total numeric; e_cats jsonb; l_brk numeric; l_svc numeric; l_stock numeric;
  c_in numeric; c_exp numeric; c_sal numeric; c_sup numeric; d_cli numeric; d_sup numeric; v_start date; v_profit numeric;
begin
  select count(*), coalesce(sum(contract_price), 0), coalesce(sum(windows_count), 0), coalesce(sum(area_m2), 0), coalesce(sum(calc_cost), 0)
    into o_n, o_rev, o_win, o_area, o_cost
    from orders where status <> 'cancelled' and (created_at at time zone 'Asia/Tashkent')::date >= v_m and (created_at at time zone 'Asia/Tashkent')::date < v_e;

  select coalesce(sum(oi.qty * (select coalesce(sum((l->>'sum')::numeric), 0) from jsonb_array_elements(coalesce(oi.calc->'lines', '[]')) l where l->>'kind' = 'work')), 0)
    into v_works from order_items oi join orders o on o.id = oi.order_id
   where o.status <> 'cancelled' and (o.created_at at time zone 'Asia/Tashkent')::date >= v_m and (o.created_at at time zone 'Asia/Tashkent')::date < v_e;

  -- м² по сериям: окна из конструктора — по серии системы; импорт из таблицы — «tarix» (серия неизвестна)
  select coalesce(jsonb_object_agg(s, round(a, 2)), '{}'::jsonb) into v_series from (
    select coalesce(c.params->>'series', 'unknown') as s, sum(oi.area_m2 * oi.qty) as a
      from order_items oi join orders o on o.id = oi.order_id left join catalog_items c on c.id::text = oi.options->>'system'
     where o.status <> 'cancelled' and (o.created_at at time zone 'Asia/Tashkent')::date >= v_m and (o.created_at at time zone 'Asia/Tashkent')::date < v_e
     group by 1
    union all
    select 'tarix', sum(o.area_m2) from orders o
     where o.is_imported and o.status <> 'cancelled' and (o.created_at at time zone 'Asia/Tashkent')::date >= v_m and (o.created_at at time zone 'Asia/Tashkent')::date < v_e
     having sum(o.area_m2) > 0
  ) x;

  select pt.accrued, pt.closed into s_acc, s_closed from payroll_total(v_m) pt;
  select coalesce(sum(amount), 0) into s_paid from salary_payouts where period = v_per;

  select coalesce(sum(amount), 0) into e_total from expenses where confirmed and spent_at >= v_m and spent_at < v_e;
  select coalesce(jsonb_agg(jsonb_build_object('name', n, 'amount', a) order by a desc), '[]'::jsonb) into e_cats from (
    select c.name as n, sum(x.amount) as a from expenses x join expense_categories c on c.id = x.category_id
     where x.confirmed and x.spent_at >= v_m and x.spent_at < v_e group by c.name having sum(x.amount) <> 0) q;

  select coalesce(sum(amount), 0) into l_brk from glass_breakages where payer = 'factory' and (created_at at time zone 'Asia/Tashkent')::date >= v_m and (created_at at time zone 'Asia/Tashkent')::date < v_e;
  select coalesce(sum(cost), 0) into l_svc from service_tickets where status = 'closed' and payer = 'factory' and (closed_at at time zone 'Asia/Tashkent')::date >= v_m and (closed_at at time zone 'Asia/Tashkent')::date < v_e;
  select coalesce(sum(-qty * coalesce(unit_cost, 0)), 0) into l_stock from stock_movements where kind = 'adjust' and qty < 0 and (created_at at time zone 'Asia/Tashkent')::date >= v_m and (created_at at time zone 'Asia/Tashkent')::date < v_e;

  select coalesce(sum(amount), 0) into c_in from payments where paid_at >= v_m and paid_at < v_e;
  c_exp := e_total;
  select coalesce(sum(amount), 0) into c_sal from salary_payouts where paid_at >= v_m and paid_at < v_e;
  select coalesce(sum(amount), 0) into c_sup from supplier_payments where paid_at >= v_m and paid_at < v_e;

  select coalesce(sum(greatest(p.debt, 0)), 0) into d_cli from v_order_paid p join orders o on o.id = p.order_id where o.status <> 'cancelled';
  select coalesce(sum(greatest(debt, 0)), 0) into d_sup from v_supplier_debt;
  select coalesce((value #>> '{}')::date, current_date) into v_start from app_settings where key = 'cash_start_date';

  v_profit := (o_rev - o_cost) - s_acc - e_total - (l_brk + l_svc + l_stock);
  return jsonb_build_object(
    'month', v_per,
    'incomplete', v_m < coalesce(v_start, v_m),
    'orders', jsonb_build_object('count', o_n, 'windows', o_win, 'area_m2', round(o_area, 2), 'revenue', o_rev, 'by_series', v_series),
    'cost', jsonb_build_object('calc_cost', o_cost, 'works', v_works),
    'margin', o_rev - o_cost,
    'salaries', jsonb_build_object('accrued', s_acc, 'paid', s_paid, 'remaining', s_acc - s_paid, 'closed', s_closed),
    'expenses', jsonb_build_object('total', e_total, 'by_category', e_cats),
    'losses', jsonb_build_object('breakage', l_brk, 'service', l_svc, 'stock', l_stock, 'total', l_brk + l_svc + l_stock),
    'profit', v_profit,
    'profit_without_works', v_profit + v_works,
    'cash', jsonb_build_object('received', c_in, 'expenses', c_exp, 'salaries', c_sal, 'suppliers', c_sup, 'net', c_in - c_exp - c_sal - c_sup,
                               'balance_now', (select cash from v_cash_balance)),
    'debts', jsonb_build_object('clients', d_cli, 'suppliers', d_sup));
end $$;
revoke all on function public.monthly_report_core(date) from public, anon, authenticated;

create or replace function public.monthly_report(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  return public.monthly_report_core(p_month);
end $$;
revoke all on function public.monthly_report(date) from public, anon;
grant execute on function public.monthly_report(date) to authenticated;

-- 1-го числа в 08:00 (Ташкент) Rahbar получает итог прошлого месяца
create or replace function public.monthly_digest(p_month date default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_m date := coalesce(p_month, (date_trunc('month', (now() at time zone 'Asia/Tashkent')) - interval '1 month')::date); r jsonb;
begin
  r := public.monthly_report_core(v_m);
  perform public.notify('rahbar', null,
    '📊 ' || (r->>'month') || ' oy hisoboti' || E'\n'
    || 'Savdo: ' || fmt_sum((r->'orders'->>'revenue')::numeric) || ' (' || (r->'orders'->>'count') || ' ta buyurtma)' || E'\n'
    || 'Foyda: ' || fmt_sum((r->>'profit')::numeric) || E'\n'
    || 'Xarajat: ' || fmt_sum((r->'expenses'->>'total')::numeric) || ' · Ish haqi: ' || fmt_sum((r->'salaries'->>'accrued')::numeric)
    || ' · Yo''qotish: ' || fmt_sum((r->'losses'->>'total')::numeric) || E'\n'
    || 'Pul: +' || fmt_sum((r->'cash'->>'received')::numeric) || ' / −' || fmt_sum((r->'cash'->>'received')::numeric - (r->'cash'->>'net')::numeric) || ' · kassa: ' || fmt_sum((r->'cash'->>'balance_now')::numeric) || E'\n'
    || 'Qarz: mijozlar ' || fmt_sum((r->'debts'->>'clients')::numeric) || ' · yetkazib beruvchilar ' || fmt_sum((r->'debts'->>'suppliers')::numeric)
    || case when (r->>'incomplete')::boolean then E'\n⚠ Bu oy uchun xarajat/ish haqi to''liq emas (tizim keyin boshlangan).' else '' end,
    '{}'::jsonb);
end $$;
revoke all on function public.monthly_digest(date) from public, anon, authenticated;

select cron.unschedule('monthly_digest') where exists (select 1 from cron.job where jobname = 'monthly_digest');
select cron.schedule('monthly_digest', '0 3 1 * *', 'select public.monthly_digest()');
