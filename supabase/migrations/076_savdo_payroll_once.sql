-- ECOROM 076: savdo_month_core — payroll_lines считается один раз (раньше дважды на каждого сотрудника: на 10 000 заказов 600 мс). Результат тот же.
-- Откат: savdo_month_core из 059.
create or replace function public.savdo_month_core(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_m date := date_trunc('month', p_month)::date; v_e date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_per text := to_char(date_trunc('month', p_month), 'YYYY-MM');
  r jsonb; v_hizmat numeric; v_exp numeric; v_sal numeric; v_in numeric; v_sup numeric; v_cash_exp numeric; v_sal_rows jsonb; v_core jsonb; v_sal_profit numeric; v_loss numeric;
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
  -- начисления считаются ОДИН раз (раньше payroll_lines вызывалась дважды на каждого сотрудника)
  select coalesce(jsonb_agg(x order by x->>'name'), '[]') into v_sal_rows from (
    with pl as materialized (select l.employee_id, sum(l.amount) as amt from payroll_lines(v_m) l group by l.employee_id)
    select jsonb_build_object('id', e.id, 'name', e.full_name,
             'rate', (select string_agg(case pr.basis when 'salary' then 'oylik ' when 'percent_sales' then 'savdodan ' when 'per_m2' then 'm² ' when 'per_window' then 'oyna ' else pr.basis || ' ' end
                                         || trim(to_char(pr.amount, 'FM999G999G999G990.##')) || case when pr.basis = 'percent_sales' then '%' else '' end, ', ')
                       from pay_rules pr where pr.employee_id = e.id and pr.valid_from < v_e and (pr.valid_to is null or pr.valid_to >= v_m) and pr.basis in ('salary', 'fixed', 'percent_sales', 'per_m2', 'per_window')),
             'etap', (select coalesce(jsonb_agg(jsonb_build_object('id', sp.id, 'amount', sp.amount, 'date', sp.paid_at) order by sp.paid_at, sp.created_at), '[]')
                        from salary_payouts sp where sp.employee_id = e.id and sp.period = v_per and sp.reverses_id is null
                         and not exists (select 1 from salary_payouts r2 where r2.reverses_id = sp.id)),
             'oldi', (select coalesce(sum(amount), 0) from salary_payouts sp where sp.employee_id = e.id and sp.period = v_per),
             'oyligi', coalesce((select pl.amt from pl where pl.employee_id = e.id), 0)) as x
      from employees e
     where exists (select 1 from salary_payouts sp where sp.employee_id = e.id and sp.period = v_per)
        or exists (select 1 from pl where pl.employee_id = e.id)
  ) q;  return jsonb_build_object(
    'month', v_per,
    'orders', r,
    'salaries', v_sal_rows,
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
