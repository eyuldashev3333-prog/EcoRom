-- ECOROM 025: оклад и постоянная надбавка — по дням (решено 04.11.2026). Всё остальное в payroll_lines — как в 017.
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
    -- оклад/надбавка по дням: календарные дни месяца, когда одновременно действует правило и сотрудник работает (приём/уход);
    -- заодно смена ставки в середине месяца больше не даёт двойной оклад (старое правило — до даты, новое — с даты)
    select e.id as employee_id, pr.basis as kind,
           case pr.basis when 'salary' then 'Oylik' else 'Doimiy qo''shimcha' end as label,
           null::numeric as base, pr.amount as rate, round(pr.amount * x.days / x.dim, 2) as amount,
           case when x.days < x.dim then x.days::text || '/' || x.dim::text || ' kun' end as ref
    from pay_rules pr cross join b join emp e on (pr.employee_id = e.id or (pr.employee_id is null and pr.role = e.role))
    cross join lateral (select (b.d2 - b.d1) as dim,
        greatest(0, least(b.d2 - 1, coalesce(pr.valid_to, b.d2 - 1), coalesce(e.left_at, b.d2 - 1)) - greatest(b.d1, pr.valid_from, coalesce(e.hired_at, b.d1)) + 1) as days) x
    where pr.basis in ('salary', 'fixed') and pr.valid_from < b.d2 and (pr.valid_to is null or pr.valid_to >= b.d1) and x.days > 0
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
revoke all on function public.payroll_lines(date) from public, anon, authenticated;
