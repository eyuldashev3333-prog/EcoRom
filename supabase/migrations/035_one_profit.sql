-- ECOROM 035: одна формула чистой прибыли везде + сервис за счёт завода сам попадает в кассу + ключевые слова категорий для бота.
--
-- Чистая прибыль = выручка − себестоимость (как в REGISTRATSIYA: ручная правка ячейки главнее расчёта)
--                  − зарплата (больший из: начислено / выплачено — чтобы не терять выплаты, если начислений нет)
--                  − расходы (подтверждённые, включая из бота)
--                  − потери (бой стекла за счёт завода, сервис за счёт завода, недостача склада).
-- Эту цифру считает ТОЛЬКО monthly_report_core. Отчёт, таблица SAVDO BOLIMI и ежемесячное сообщение читают её же.
-- Касса (v_cash_balance) уменьшается так же: расходы (все источники, в т.ч. бой и сервис), выплаты зарплаты, оплаты поставщикам.

-- ===== 1. сервис за счёт завода → расход в кассе (как бой стекла в 024) =====
alter table public.expenses drop constraint if exists expenses_source_check;
alter table public.expenses add constraint expenses_source_check check (source in ('web', 'telegram', 'import', 'breakage', 'service'));
alter table public.expenses add column if not exists service_id uuid;
insert into public.expense_categories (name, note) values ('SERVIS', 'Гарантийный сервис, платит завод (из кассы)') on conflict (name) do nothing;

create or replace function public.close_service(p_id uuid, p_cause text, p_payer text, p_cost numeric, p_in_warranty boolean default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_t service_tickets; v_no bigint; v_cat int;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if p_payer not in ('installer', 'factory', 'client') then raise exception 'To''lovchi noto''g''ri'; end if;
  if p_cost is null or p_cost < 0 then raise exception 'Summa noto''g''ri'; end if;
  if coalesce(trim(p_cause), '') = '' then raise exception 'Sababini yozing'; end if;
  update service_tickets set status = 'closed', closed_at = now(), cause = trim(p_cause), payer = p_payer, cost = round(p_cost, 2),
         in_warranty = coalesce(p_in_warranty, in_warranty)
   where id = p_id and status <> 'closed' returning * into v_t;
  if v_t.id is null then raise exception 'Zayavka topilmadi yoki allaqachon yopilgan'; end if;
  -- платит завод → деньги ушли: расход в кассе (прибыль уже учитывает его как потерю — в отчёте он считается один раз)
  if p_payer = 'factory' and round(p_cost, 2) > 0 then
    select id into v_cat from expense_categories where name = 'SERVIS';
    select order_no into v_no from orders where id = v_t.order_id;
    insert into expenses(category_id, amount, spent_at, note, order_id, source, confirmed, created_by, service_id)
    values (v_cat, round(p_cost, 2), (now() at time zone 'Asia/Tashkent')::date, 'Servis №' || v_no || ': ' || left(trim(p_cause), 120), v_t.order_id, 'service', true, public.my_id(), p_id);
  end if;
end $$;
revoke all on function public.close_service(uuid, text, text, numeric, boolean) from public, anon;
grant execute on function public.close_service(uuid, text, text, numeric, boolean) to authenticated;

-- ===== 2. единая формула: правим monthly_report_core (себестоимость как в REGISTRATSIYA, зарплата, сервис = потеря, а не расход) =====
do $$
declare v_src text;
begin
  select pg_get_functiondef('public.monthly_report_core(date)'::regprocedure) into v_src;
  -- себестоимость: из REGISTRATSIYA (ручная правка ячейки главнее расчёта)
  v_src := replace(v_src, $q$  select coalesce(sum(amount), 0) into s_paid from salary_payouts where period = v_per;$q$,
                          $q$  select coalesce(sum(amount), 0) into s_paid from salary_payouts where period = v_per;
  select coalesce(sum(dogovor - foyda), 0) into o_cost from v_registratsiya where oy = v_per and status <> 'cancelled';$q$);
  -- расходы без боя и сервиса (они в потерях); в движение денег — с ними
  v_src := replace(v_src, $q$source <> 'breakage'$q$, $q$source not in ('breakage', 'service')$q$);
  v_src := replace(v_src, $q$source = 'breakage'$q$, $q$source in ('breakage', 'service')$q$);
  -- зарплата в прибыли: больший из начислено / выплачено
  v_src := replace(v_src, $q$v_profit := (o_rev - o_cost) - s_acc - e_total$q$, $q$v_profit := (o_rev - o_cost) - greatest(s_acc, s_paid) - e_total$q$);
  v_src := replace(v_src, $q$'salaries', jsonb_build_object('accrued', s_acc,$q$, $q$'salaries', jsonb_build_object('in_profit', greatest(s_acc, s_paid), 'accrued', s_acc,$q$);
  if v_src not like '%greatest(s_acc, s_paid)%' or v_src not like '%from v_registratsiya%' or v_src not like '%source in (''breakage'', ''service'')%' then
    raise exception 'не удалось обновить monthly_report_core';
  end if;
  execute v_src;
end $$;
revoke all on function public.monthly_report_core(date) from public, anon, authenticated;

-- ===== 3. таблица SAVDO BOLIMI читает ту же цифру =====
create or replace function public.savdo_month(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_m date := date_trunc('month', p_month)::date; v_e date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_per text := to_char(date_trunc('month', p_month), 'YYYY-MM');
  r jsonb; v_hizmat numeric; v_exp numeric; v_sal numeric; v_in numeric; v_sup numeric; v_cash_exp numeric; v_core jsonb; v_sal_profit numeric; v_loss numeric;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  v_core := public.monthly_report_core(v_m);
  v_sal_profit := (v_core->'salaries'->>'in_profit')::numeric;
  v_loss := (v_core->'losses'->>'total')::numeric;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'raqami', raqami, 'ismi', ismi, 'alyumin', alyumin, 'plast', plast, 'termo', termo,
           'umumiy', alyumin + plast + termo, 'soni', soni, 'dogovor', dogovor, 'foyda', foyda, 'holati', status) order by raqami), '[]')
    into r from v_registratsiya where oy = v_per;
  v_hizmat := (v_core->>'margin')::numeric;
  select coalesce(sum(amount), 0) into v_in from payments where paid_at >= v_m and paid_at < v_e;
  select coalesce(sum(amount), 0) into v_exp from expenses where confirmed and source not in ('breakage', 'service') and spent_at >= v_m and spent_at < v_e;
  select coalesce(sum(amount), 0) into v_cash_exp from expenses where confirmed and spent_at >= v_m and spent_at < v_e;
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
        select category_id, sum(amount) s from expenses where confirmed and source not in ('breakage', 'service') and spent_at >= v_m and spent_at < v_e group by 1 having sum(amount) <> 0) x
        join expense_categories c on c.id = x.category_id),
    'prixod', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'date', p.paid_at, 'raqami', o.order_no, 'ismi', c.full_name, 'amount', p.amount, 'note', p.note) order by p.paid_at, p.created_at), '[]')
        from payments p join orders o on o.id = p.order_id join clients c on c.id = o.client_id
       where p.paid_at >= v_m and p.paid_at < v_e and p.reverses_id is null and not exists (select 1 from payments r2 where r2.reverses_id = p.id)),
    'rasxod', (
      select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'date', x.spent_at, 'category', c.name, 'category_id', x.category_id, 'amount', x.amount, 'note', x.note,
               'source', x.source, 'employee', e.full_name) order by x.spent_at, x.created_at), '[]')
        from expenses x join expense_categories c on c.id = x.category_id left join employees e on e.id = x.for_employee_id
       where x.confirmed and x.source not in ('breakage', 'service') and x.spent_at >= v_m and x.spent_at < v_e and x.reverses_id is null and not exists (select 1 from expenses r2 where r2.reverses_id = x.id)),
    -- sof_foyda = hizmat − faqat_rasxod, где faqat_rasxod = xarajat + oylik + yo'qotish. Это ровно «profit» из monthly_report_core.
    'itog', jsonb_build_object('hizmat', v_hizmat, 'rasxod', v_exp, 'oylik', v_sal_profit, 'yoqotish', v_loss, 'faqat_rasxod', v_exp + v_sal_profit + v_loss,
                               'sof_foyda', (v_core->>'profit')::numeric,
                               'prixod', v_in, 'kassa_rasxod', v_cash_exp + v_sal + v_sup, 'postavshik', v_sup, 'ostatka', v_in - v_cash_exp - v_sal - v_sup),
    'categories', (select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name) from expense_categories where is_active),
    'months', (select coalesce(jsonb_agg(m order by m desc), '[]') from (
                 select distinct to_char(d, 'YYYY-MM') m from (
                   select (created_at at time zone 'Asia/Tashkent')::date d from orders union all select spent_at from expenses union all select paid_at from payments) z) y)
  );
end $$;
revoke all on function public.savdo_month(date) from public, anon;
grant execute on function public.savdo_month(date) to authenticated;

-- ===== 4. ключевые слова категорий расходов (бот узнаёт «обед», «бензин»… из таблицы, а не из кода) =====
alter table public.expense_categories add column if not exists keywords text[] not null default '{}';
update public.expense_categories set keywords = case name
  when 'PITANIYA' then array['obed', 'ovqat', 'choy', 'tushlik', 'nonushta', 'pitani', 'обед', 'чай', 'питани', 'еда']
  when 'TRANSPORT' then array['benzin', 'бензин', 'gaz', 'газ', 'metan', 'propan', 'dostavka', 'доставка', 'transport', 'yoqilg', 'solyarka', 'dizel']
  when 'LABO' then array['labo', 'лабо', 'gruzovik', 'грузовик']
  when 'KOCHA KIRA' then array['kocha', 'yolkira', 'taksi', 'такси']
  when 'OFIS ARENDA' then array['arenda', 'ijara', 'ofis', 'аренда', 'офис']
  when 'KREDIT' then array['kredit', 'кредит']
  when 'SVET' then array['svet', 'свет', 'elektr', 'электр', 'kommunal', 'коммунал']
  when 'SOLIQ' then array['soliq', 'nalog', 'налог']
  when 'MAHSULOT' then array['mahsulot', 'maxsulot', 'ruchka', 'samorez', 'саморез', 'расходник', 'kley', 'клей', 'lenta', 'germetik', 'герметик']
  when 'KUT-HARAJAT' then array['kut', 'harajat', 'xarajat', 'remont', 'ремонт', 'boshqa', 'прочее']
  else keywords end
 where keywords = '{}';
