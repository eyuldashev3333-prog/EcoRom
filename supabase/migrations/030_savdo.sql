-- ECOROM 030: таблица SAVDO BOLIMI в системе — лист месяца, как у владельца, собирается сам из базы:
--   buyurtmalar (м² по сериям, прибыль), ish haqi (по людям: выплаты частями = 1–4 ETAP, JAMI OLDI, начислено),
--   rasxodlar по категориям, prixod (оплаты клиентов), rasxod (журнал расходов), итог HIZMAT / FAQAT-RASXOD / SOF-FOYDA, касса.
-- Правка денег из ячейки = встречная запись + новая (журнал не стирается, датой исходной записи — месяц не «плывёт»).
create or replace function public.savdo_month(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_m date := date_trunc('month', p_month)::date; v_e date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_per text := to_char(date_trunc('month', p_month), 'YYYY-MM');
  r jsonb; v_hizmat numeric; v_exp numeric; v_sal numeric; v_in numeric; v_sup numeric;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  -- заказы месяца (как REGISTRATSIYA)
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'raqami', raqami, 'ismi', ismi, 'alyumin', alyumin, 'plast', plast, 'termo', termo,
           'umumiy', alyumin + plast + termo, 'soni', soni, 'dogovor', dogovor, 'foyda', foyda, 'holati', status) order by raqami), '[]'),
         coalesce(sum(foyda) filter (where status <> 'cancelled'), 0)
    into r, v_hizmat from v_registratsiya where oy = v_per;
  -- оплаты клиентов в месяце (PRIXOD)
  select coalesce(sum(amount), 0) into v_in from payments where paid_at >= v_m and paid_at < v_e;
  -- расходы месяца (без боя стекла — он в потерях; MAHSULOT-закупки считаются, как в таблице владельца — категория MAHSULOT)
  select coalesce(sum(amount), 0) into v_exp from expenses where confirmed and source <> 'breakage' and spent_at >= v_m and spent_at < v_e;
  select coalesce(sum(amount), 0) into v_sal from salary_payouts where period = v_per;
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
        select category_id, sum(amount) s from expenses where confirmed and source <> 'breakage' and spent_at >= v_m and spent_at < v_e group by 1 having sum(amount) <> 0) x
        join expense_categories c on c.id = x.category_id),
    'prixod', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'date', p.paid_at, 'raqami', o.order_no, 'ismi', c.full_name, 'amount', p.amount, 'note', p.note) order by p.paid_at, p.created_at), '[]')
        from payments p join orders o on o.id = p.order_id join clients c on c.id = o.client_id
       where p.paid_at >= v_m and p.paid_at < v_e and p.reverses_id is null and not exists (select 1 from payments r2 where r2.reverses_id = p.id)),
    'rasxod', (
      select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'date', x.spent_at, 'category', c.name, 'category_id', x.category_id, 'amount', x.amount, 'note', x.note,
               'source', x.source, 'employee', e.full_name) order by x.spent_at, x.created_at), '[]')
        from expenses x join expense_categories c on c.id = x.category_id left join employees e on e.id = x.for_employee_id
       where x.confirmed and x.source <> 'breakage' and x.spent_at >= v_m and x.spent_at < v_e and x.reverses_id is null and not exists (select 1 from expenses r2 where r2.reverses_id = x.id)),
    'itog', jsonb_build_object('hizmat', v_hizmat, 'rasxod', v_exp, 'oylik', v_sal, 'faqat_rasxod', v_exp + v_sal, 'sof_foyda', v_hizmat - v_exp - v_sal,
                               'prixod', v_in, 'kassa_rasxod', v_exp + v_sal + v_sup, 'postavshik', v_sup, 'ostatka', v_in - v_exp - v_sal - v_sup),
    'categories', (select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name) from expense_categories where is_active),
    'months', (select coalesce(jsonb_agg(m order by m desc), '[]') from (
                 select distinct to_char(d, 'YYYY-MM') m from (
                   select (created_at at time zone 'Asia/Tashkent')::date d from orders union all select spent_at from expenses union all select paid_at from payments) z) y)
  );
end $$;
revoke all on function public.savdo_month(date) from public, anon;
grant execute on function public.savdo_month(date) to authenticated;

-- исправить расход из ячейки: встречная запись к старой + новая с изменённым полем (сумма / дата / заметка / категория)
create or replace function public.expense_correct(p_id uuid, p_field text, p_value text) returns uuid
language plpgsql security invoker set search_path = public as $$
declare o expenses; v_new uuid; n numeric; v text := nullif(trim(coalesce(p_value, '')), '');
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  select * into o from expenses where id = p_id;
  if o.id is null then raise exception 'Xarajat topilmadi'; end if;
  if o.reverses_id is not null or exists (select 1 from expenses where reverses_id = p_id) then raise exception 'Bu yozuv allaqachon tuzatilgan'; end if;
  if p_field = 'amount' then
    n := replace(replace(coalesce(v, ''), ' ', ''), ',', '.')::numeric;
    if n is null or n < 0 then raise exception 'Summa noto''g''ri'; end if;
  end if;
  insert into expenses(category_id, amount, spent_at, note, for_employee_id, order_id, source, confirmed, created_by, reverses_id)
  values (o.category_id, -o.amount, o.spent_at, 'Tuzatish (jadvaldan)', o.for_employee_id, o.order_id, o.source, true, public.my_id(), o.id);
  if p_field = 'amount' and n = 0 then return null; end if;  -- 0 = расход удалён (только встречная запись)
  insert into expenses(category_id, amount, spent_at, note, for_employee_id, order_id, source, confirmed, created_by)
  values (case when p_field = 'category' then v::int else o.category_id end,
          case when p_field = 'amount' then round(n, 2) else o.amount end,
          case when p_field = 'date' then v::date else o.spent_at end,
          case when p_field = 'note' then v else o.note end,
          o.for_employee_id, o.order_id, o.source, true, public.my_id())
  returning id into v_new;
  return v_new;
end $$;

-- исправить оплату клиента из ячейки (сумма / дата / заметка)
create or replace function public.payment_correct(p_id uuid, p_field text, p_value text) returns uuid
language plpgsql security invoker set search_path = public as $$
declare o payments; v_new uuid; n numeric; v text := nullif(trim(coalesce(p_value, '')), '');
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  select * into o from payments where id = p_id;
  if o.id is null then raise exception 'To''lov topilmadi'; end if;
  if o.reverses_id is not null or exists (select 1 from payments where reverses_id = p_id) then raise exception 'Bu yozuv allaqachon tuzatilgan'; end if;
  if p_field = 'amount' then
    n := replace(replace(coalesce(v, ''), ' ', ''), ',', '.')::numeric;
    if n is null or n < 0 then raise exception 'Summa noto''g''ri'; end if;
  end if;
  insert into payments(order_id, amount, paid_at, note, received_by, reverses_id)
  values (o.order_id, -o.amount, o.paid_at, 'Tuzatish (jadvaldan)', public.my_id(), o.id);
  if p_field = 'amount' and n = 0 then return null; end if;
  insert into payments(order_id, amount, paid_at, note, received_by)
  values (o.order_id, case when p_field = 'amount' then round(n, 2) else o.amount end,
          case when p_field = 'date' then v::date else o.paid_at end,
          case when p_field = 'note' then v else o.note end, public.my_id())
  returning id into v_new;
  return v_new;
end $$;
revoke all on function public.expense_correct(uuid, text, text), public.payment_correct(uuid, text, text) from public, anon;
grant execute on function public.expense_correct(uuid, text, text), public.payment_correct(uuid, text, text) to authenticated;
