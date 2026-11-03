-- ECOROM 017: зарплата. Rahbar пишет правила (pay_rules) → система сама считает начисления за месяц → выплаты частями (salary_payouts).
-- Начисление за месяц складывается из:
--   • salary / fixed — оклад и постоянная надбавка за каждый месяц, пока правило действует;
--   • per_m2 / per_window — за сделанные этапы окон (item_stage_marks): м² или штуки × ставка, действовавшая НА ДАТУ отметки
--     (для одной отметки берётся самое точное правило: свой > по роли, этап > любой, серия > любая);
--   • percent_sales — % от суммы договоров заказов месяца (без отменённых);
--   • bonus / penalty — разовые, в месяц даты начала правила;
--   • удержание за бой стекла, если решено «платит монтажник» и известно, кто разбил (автоматически).
-- Закрытый месяц фиксируется снимком (payroll_accruals): смена ставок потом его не меняет. Выплаты — журнал; остаток = начислено − выплачено за месяц.
-- Решение по умолчанию (подтвердить у владельца): начисление по факту сделанной работы, а не по оплате клиента.

alter table public.pay_rules drop constraint if exists pay_rules_amount_pos, drop constraint if exists pay_rules_dates, drop constraint if exists pay_rules_who, drop constraint if exists pay_rules_pct;
alter table public.pay_rules
  add constraint pay_rules_amount_pos check (amount > 0),
  add constraint pay_rules_dates check (valid_to is null or valid_to >= valid_from),
  add constraint pay_rules_who check (employee_id is not null or role is not null),
  add constraint pay_rules_pct check (basis <> 'percent_sales' or amount <= 100);

create unique index if not exists salary_payouts_reverses_once on public.salary_payouts(reverses_id) where reverses_id is not null;
create index if not exists salary_payouts_period on public.salary_payouts (period, employee_id);

create table if not exists public.payroll_months (
  month date primary key check (month = date_trunc('month', month)::date),
  closed_at timestamptz not null default now(),
  closed_by uuid references public.employees(id)
);
create table if not exists public.payroll_accruals (
  id uuid primary key default gen_random_uuid(),
  month date not null references public.payroll_months(month) on delete cascade,
  employee_id uuid not null references public.employees(id),
  kind text not null,
  label text not null,
  base numeric(14,3),
  rate numeric(14,4),
  amount numeric(14,2) not null,
  ref text
);
create index if not exists payroll_accruals_month on public.payroll_accruals (month, employee_id);
alter table public.payroll_months enable row level security;
alter table public.payroll_accruals enable row level security;
revoke all on public.payroll_months, public.payroll_accruals from anon, authenticated;

-- ===== расчёт месяца (внутренняя; только через payroll_month) =====
create or replace function public.payroll_lines(p_month date)
returns table(employee_id uuid, kind text, label text, base numeric, rate numeric, amount numeric, ref text)
language sql stable security definer set search_path = public as $$
  with b as (select date_trunc('month', p_month)::date as d1, (date_trunc('month', p_month) + interval '1 month')::date as d2),
  emp as (select e.* from employees e, b where (e.is_active or e.left_at >= b.d1) and (e.hired_at is null or e.hired_at < b.d2)),
  marks as (
    select m.done_by as emp, e.role, s.code as stage_code, s.name as stage_name,
           (m.done_at at time zone 'Asia/Tashkent')::date as d, oi.qty, oi.area_m2 * oi.qty as m2, o.order_no,
           (select c.params->>'series' from catalog_items c where c.id::text = oi.options->>'system') as series
    from item_stage_marks m
    join employees e on e.id = m.done_by join stages s on s.id = m.stage_id
    join order_items oi on oi.id = m.order_item_id join orders o on o.id = oi.order_id, b
    where (m.done_at at time zone 'Asia/Tashkent')::date >= b.d1 and (m.done_at at time zone 'Asia/Tashkent')::date < b.d2
  ),
  stage_lines as (
    select mk.emp as employee_id, bs.basis as kind,
           mk.stage_name || ' · ' || case bs.basis when 'per_m2' then 'm²' else 'oyna' end as label,
           sum(case bs.basis when 'per_m2' then mk.m2 else mk.qty end) as base, r.amount as rate,
           round(sum(case bs.basis when 'per_m2' then mk.m2 else mk.qty end) * r.amount, 2) as amount,
           string_agg(distinct '№' || mk.order_no::text, ', ') as ref
    from marks mk cross join (values ('per_m2'), ('per_window')) bs(basis)
    cross join lateral (
      select pr.amount from pay_rules pr
       where pr.basis = bs.basis and (pr.employee_id = mk.emp or (pr.employee_id is null and pr.role = mk.role))
         and pr.valid_from <= mk.d and (pr.valid_to is null or pr.valid_to >= mk.d)
         and (pr.stage_code is null or pr.stage_code = mk.stage_code) and (pr.series is null or pr.series = mk.series)
       order by (case when pr.employee_id is not null then 4 else 0 end + case when pr.stage_code is not null then 2 else 0 end + case when pr.series is not null then 1 else 0 end) desc,
                pr.valid_from desc, pr.created_at desc
       limit 1) r
    group by mk.emp, bs.basis, mk.stage_name, r.amount
  ),
  fixed_lines as (
    select e.id as employee_id, pr.basis as kind, case pr.basis when 'salary' then 'Oylik' else 'Doimiy qo''shimcha' end as label,
           null::numeric as base, pr.amount as rate, pr.amount as amount, null::text as ref
    from pay_rules pr cross join b join emp e on (pr.employee_id = e.id or (pr.employee_id is null and pr.role = e.role))
    where pr.basis in ('salary', 'fixed') and pr.valid_from < b.d2 and (pr.valid_to is null or pr.valid_to >= b.d1)
      and (pr.employee_id is not null or not exists (   -- личное правило перекрывает правило по роли
            select 1 from pay_rules p2 where p2.employee_id = e.id and p2.basis = pr.basis and p2.valid_from < b.d2 and (p2.valid_to is null or p2.valid_to >= b.d1)))
  ),
  sales as (
    select coalesce(sum(o.contract_price), 0) as s, count(*) as n from orders o, b
     where o.status <> 'cancelled' and (o.created_at at time zone 'Asia/Tashkent')::date >= b.d1 and (o.created_at at time zone 'Asia/Tashkent')::date < b.d2
  ),
  pct_lines as (
    select e.id as employee_id, pr.basis as kind, 'Savdodan ' || trim_scale(pr.amount)::text || '%' as label,
           sales.s as base, pr.amount as rate, round(sales.s * pr.amount / 100, 2) as amount, sales.n::text || ' ta buyurtma' as ref
    from pay_rules pr cross join b cross join sales join emp e on (pr.employee_id = e.id or (pr.employee_id is null and pr.role = e.role))
    where pr.basis = 'percent_sales' and pr.valid_from < b.d2 and (pr.valid_to is null or pr.valid_to >= b.d1)
      and (pr.employee_id is not null or not exists (
            select 1 from pay_rules p2 where p2.employee_id = e.id and p2.basis = pr.basis and p2.valid_from < b.d2 and (p2.valid_to is null or p2.valid_to >= b.d1)))
  ),
  adj_lines as (
    select e.id as employee_id, pr.basis as kind, case pr.basis when 'bonus' then 'Mukofot' else 'Jarima' end || coalesce(': ' || pr.note, '') as label,
           null::numeric as base, null::numeric as rate, case pr.basis when 'bonus' then pr.amount else -pr.amount end as amount, null::text as ref
    from pay_rules pr cross join b join emp e on (pr.employee_id = e.id or (pr.employee_id is null and pr.role = e.role))
    where pr.basis in ('bonus', 'penalty') and pr.valid_from >= b.d1 and pr.valid_from < b.d2
  ),
  brk_lines as (
    select gb.employee_id, 'breakage'::text as kind, 'Oyna sinishi №' || o.order_no::text || coalesce(': ' || gb.reason, '') as label,
           null::numeric as base, null::numeric as rate, -gb.amount as amount, null::text as ref
    from glass_breakages gb join orders o on o.id = gb.order_id, b
    where gb.payer = 'installer' and gb.decided and gb.employee_id is not null and gb.amount > 0
      and (gb.created_at at time zone 'Asia/Tashkent')::date >= b.d1 and (gb.created_at at time zone 'Asia/Tashkent')::date < b.d2
  )
  select l.employee_id, l.kind, l.label, l.base, l.rate, l.amount, l.ref from (
    select * from stage_lines union all select * from fixed_lines union all select * from pct_lines union all select * from adj_lines union all select * from brk_lines
  ) l where l.employee_id in (select id from emp) and l.amount <> 0
$$;
revoke all on function public.payroll_lines(date) from public, anon, authenticated;

-- ===== строки месяца: Rahbar — все (или один), остальные — только свои =====
create or replace function public.payroll_month(p_month date, p_employee uuid default null)
returns table(employee_id uuid, full_name text, kind text, label text, base numeric, rate numeric, amount numeric, ref text, closed boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_m date := date_trunc('month', p_month)::date; v_me uuid := public.my_id();
begin
  if v_me is null then raise exception 'Kirish kerak'; end if;
  if not public.is_rahbar() then p_employee := v_me; end if;
  if exists (select 1 from payroll_months pm where pm.month = v_m) then
    return query select a.employee_id, e.full_name, a.kind, a.label, a.base, a.rate, a.amount, a.ref, true
      from payroll_accruals a join employees e on e.id = a.employee_id
     where a.month = v_m and (p_employee is null or a.employee_id = p_employee) order by e.full_name, a.kind, a.label;
  else
    return query select l.employee_id, e.full_name, l.kind, l.label, l.base, l.rate, l.amount, l.ref, false
      from payroll_lines(v_m) l join employees e on e.id = l.employee_id
     where p_employee is null or l.employee_id = p_employee order by e.full_name, l.kind, l.label;
  end if;
end $$;

-- ===== сводка месяца: начислено / выплачено / остаток =====
create or replace function public.payroll_summary(p_month date)
returns table(employee_id uuid, full_name text, role text, accrued numeric, paid numeric, remaining numeric, closed boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_m date := date_trunc('month', p_month)::date; v_me uuid := public.my_id(); v_period text := to_char(date_trunc('month', p_month), 'YYYY-MM');
begin
  if v_me is null then raise exception 'Kirish kerak'; end if;
  return query
    with a as (select pm.employee_id, sum(pm.amount) as s, bool_or(pm.closed) as c from payroll_month(v_m) pm group by pm.employee_id),
         p as (select sp.employee_id, sum(sp.amount) as s from salary_payouts sp where sp.period = v_period group by sp.employee_id),
         ids as (select a.employee_id from a union select p.employee_id from p)
    select e.id, e.full_name, e.role, coalesce(a.s, 0), coalesce(p.s, 0), coalesce(a.s, 0) - coalesce(p.s, 0),
           exists (select 1 from payroll_months x where x.month = v_m)
      from ids join employees e on e.id = ids.employee_id left join a on a.employee_id = ids.employee_id left join p on p.employee_id = ids.employee_id
     where public.is_rahbar() or e.id = v_me
     order by e.full_name;
end $$;

create or replace function public.payroll_payouts(p_month date, p_employee uuid default null)
returns table(id uuid, employee_id uuid, amount numeric, paid_at date, note text, reverses_id uuid)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_me uuid := public.my_id();
begin
  if v_me is null then raise exception 'Kirish kerak'; end if;
  if not public.is_rahbar() then p_employee := v_me; end if;
  return query select sp.id, sp.employee_id, sp.amount, sp.paid_at, sp.note, sp.reverses_id from salary_payouts sp
   where sp.period = to_char(date_trunc('month', p_month), 'YYYY-MM') and (p_employee is null or sp.employee_id = p_employee)
   order by sp.paid_at, sp.created_at;
end $$;

-- ===== закрыть / открыть месяц =====
create or replace function public.payroll_close(p_month date) returns int
language plpgsql security definer set search_path = public as $$
declare v_m date := date_trunc('month', p_month)::date; v_n int; r record; v_today date := (now() at time zone 'Asia/Tashkent')::date;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if (v_m + interval '1 month')::date > v_today then raise exception 'Oy hali tugamagan — oy tugagach yoping'; end if;
  if exists (select 1 from payroll_months where month = v_m) then raise exception 'Oy allaqachon yopilgan'; end if;
  insert into payroll_months(month, closed_by) values (v_m, public.my_id());
  insert into payroll_accruals(month, employee_id, kind, label, base, rate, amount, ref)
    select v_m, l.employee_id, l.kind, l.label, l.base, l.rate, l.amount, l.ref from payroll_lines(v_m) l;
  get diagnostics v_n = row_count;
  for r in select a.employee_id, sum(a.amount) as s from payroll_accruals a where a.month = v_m group by a.employee_id having sum(a.amount) <> 0 loop
    perform public.notify(null, r.employee_id, '📒 ' || to_char(v_m, 'YYYY-MM') || ' uchun ish haqi hisoblandi: '
      || replace(to_char(r.s, 'FM999G999G999G990'), ',', ' ') || ' so''m. Tafsilot — «Ish haqim» bo''limida.', '{}'::jsonb);
  end loop;
  return v_n;
end $$;

create or replace function public.payroll_reopen(p_month date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  delete from payroll_months where month = date_trunc('month', p_month)::date;
  if not found then raise exception 'Oy yopilmagan'; end if;
end $$;

-- ===== выплаты (журнал): часть, аванс, расчёт; отмена — встречной записью =====
create or replace function public.record_salary_payout(p_employee uuid, p_amount numeric, p_date date default null, p_period text default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_date date := coalesce(p_date, (now() at time zone 'Asia/Tashkent')::date); v_period text;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Summa noto''g''ri'; end if;
  if not exists (select 1 from employees where id = p_employee) then raise exception 'Xodim topilmadi'; end if;
  v_period := coalesce(nullif(trim(p_period), ''), to_char(v_date, 'YYYY-MM'));
  if v_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Davr noto''g''ri (YYYY-MM)'; end if;
  insert into salary_payouts(employee_id, amount, paid_at, period, note, created_by)
  values (p_employee, round(p_amount, 2), v_date, v_period, nullif(trim(p_note), ''), public.my_id()) returning id into v_id;
  perform public.notify(null, p_employee, '💵 Ish haqi to''landi: ' || replace(to_char(round(p_amount, 2), 'FM999G999G999G990'), ',', ' ') || ' so''m (' || v_period || ')'
    || coalesce(E'\n' || nullif(trim(p_note), ''), ''), '{}'::jsonb);
  return v_id;
end $$;

create or replace function public.reverse_salary_payout(p_id uuid, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v salary_payouts; v_new uuid;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  select * into v from salary_payouts where id = p_id for update;
  if v.id is null then raise exception 'To''lov topilmadi'; end if;
  if v.reverses_id is not null then raise exception 'Bu bekor qilish yozuvi'; end if;
  if exists (select 1 from salary_payouts where reverses_id = p_id) then raise exception 'Allaqachon bekor qilingan'; end if;
  insert into salary_payouts(employee_id, amount, paid_at, period, note, created_by, reverses_id)
  values (v.employee_id, -v.amount, v.paid_at, v.period, coalesce(nullif(trim(p_note), ''), 'Bekor qilindi'), public.my_id(), p_id) returning id into v_new;
  return v_new;
end $$;

revoke all on function public.payroll_month(date, uuid), public.payroll_summary(date), public.payroll_payouts(date, uuid), public.payroll_close(date), public.payroll_reopen(date),
  public.record_salary_payout(uuid, numeric, date, text, text), public.reverse_salary_payout(uuid, text) from public, anon;
grant execute on function public.payroll_month(date, uuid), public.payroll_summary(date), public.payroll_payouts(date, uuid), public.payroll_close(date), public.payroll_reopen(date),
  public.record_salary_payout(uuid, numeric, date, text, text), public.reverse_salary_payout(uuid, text) to authenticated;
