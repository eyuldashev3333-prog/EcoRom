-- ECOROM 083: «Kirim» в Moliya — приход денег мимо заказов (решение Asad 28.11.2026).
--  Два вида:
--   * stock — «Ombordan sotish»: продажа материала со склада; склад уменьшается на проданное (движение kind = 'sale'), продать больше остатка нельзя;
--   * free  — «Erkin kirim»: свободный приход (старый клиент, которого нет в системе, и т. п.): «Nima uchun» + «Izoh» + сумма.
--  Приход идёт только в КАССУ и поток денег (Moliya, Hisobot «Kassa», SAVDO «Prixod/Ostatka», отчёт 23:00).
--  В чистую прибыль (Sof foyda) НЕ идёт — она по-прежнему считается только по заказам; списание проданного материала — не потеря склада.
--  Журнал как остальные: запись только через RPC (record_income / reverse_income), без правок и удаления, исправление — встречной записью.
--  Касса считается в нескольких местах — все обновлены одинаково: v_cash_balance, bot_cash, integrity_check, monthly_report_core, savdo_month_core, daily_report_core.
-- Откат: drop function record_income/reverse_income; восстановить v_cash_balance (060), bot_cash (081), integrity_check (059), savdo_month_core (076),
--        daily_report_core (082), monthly_report_core (убрать c_other), guard_ledger_date (060); alter table stock_movements drop column income_id; drop table incomes.

-- ============ 1. журнал прихода ============
create table if not exists public.incomes (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('stock', 'free')),
  amount numeric(14,2) not null,
  received_at date not null default ((now() at time zone 'Asia/Tashkent')::date),
  title text not null,                                   -- free: «Nima uchun»; stock: название материала
  note text,                                             -- Izoh
  item_id uuid references public.catalog_items(id),      -- stock: что продано
  part text,
  qty numeric(14,3),
  unit_cost numeric(14,2),                               -- цена склада на момент продажи (справочно)
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  reverses_id uuid references public.incomes(id),
  check ((reverses_id is null and amount > 0) or (reverses_id is not null and amount < 0)),
  check (kind = 'free' or (item_id is not null and qty is not null))
);
create unique index if not exists incomes_reverses_once on public.incomes(reverses_id) where reverses_id is not null;
create index if not exists incomes_received_at on public.incomes(received_at);

alter table public.incomes enable row level security;
drop policy if exists rahbar_read on public.incomes;
create policy rahbar_read on public.incomes for select to authenticated using ((select public.is_rahbar()));
revoke all on public.incomes from anon;

drop trigger if exists trg_00_guard_rpc on public.incomes;
create trigger trg_00_guard_rpc before insert or update or delete on public.incomes for each row execute function public.guard_rpc_only();
drop trigger if exists trg_01_ledger_date on public.incomes;
create trigger trg_01_ledger_date before insert on public.incomes for each row execute function public.guard_ledger_date();
drop trigger if exists trg_nomut_incomes on public.incomes;
create trigger trg_nomut_incomes before update or delete on public.incomes for each row execute function public.forbid_mutation();
drop trigger if exists trg_audit_incomes on public.incomes;
create trigger trg_audit_incomes after insert on public.incomes for each row execute function public.audit();

-- дата прихода тоже проверяется (не в будущем, не раньше 2020)
create or replace function public.guard_ledger_date() returns trigger
language plpgsql set search_path = public as $$
declare v_d date; v_today date := (now() at time zone 'Asia/Tashkent')::date;
begin
  v_d := (to_jsonb(new) ->> case tg_table_name
           when 'expenses' then 'spent_at'
           when 'salary_payouts' then 'paid_at'
           when 'supplier_payments' then 'paid_at'
           when 'payments' then 'paid_at'
           when 'purchases' then 'purchased_at'
           when 'incomes' then 'received_at' end)::date;
  if v_d is not null and (v_d > v_today + 1 or v_d < date '2020-01-01') then
    raise exception 'Sana noto''g''ri (%): kelajakda yoki juda eski bo''lishi mumkin emas', to_char(v_d, 'DD.MM.YYYY');
  end if;
  return new;
end $$;

-- ============ 2. склад: движение «продажа» ============
alter table public.stock_movements add column if not exists income_id uuid references public.incomes(id);
create index if not exists stock_movements_income on public.stock_movements(income_id) where income_id is not null;
alter table public.stock_movements drop constraint if exists stock_movements_kind_check;
alter table public.stock_movements add constraint stock_movements_kind_check check (kind in ('purchase', 'consume', 'adjust', 'scrap', 'return', 'sale'));

-- ============ 3. записать приход ============
create or replace function public.record_income(p_kind text, p_amount numeric, p_date date default null, p_title text default null, p_note text default null,
                                                p_item uuid default null, p_part text default null, p_qty numeric default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.my_id(); v_id uuid; v_date date := coalesce(p_date, (now() at time zone 'Asia/Tashkent')::date);
  v_amount numeric := round(p_amount, 2); v_part text := coalesce(p_part, ''); v_qty numeric := round(p_qty, 3);
  v_title text := nullif(btrim(coalesce(p_title, '')), ''); v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_item catalog_items; v_bal numeric; v_unit text; v_price numeric; v_start date;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if p_kind not in ('stock', 'free') then raise exception 'Kirim turini tanlang'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'Summani kiriting'; end if;
  -- до даты старта кассы приход в кассу не попадёт — такую дату не принимаем
  select (value #>> '{}')::date into v_start from app_settings where key = 'cash_start_date';
  if v_start is not null and v_date < v_start then
    raise exception 'Sana kassa boshlangan sanadan (%) oldin bo''lishi mumkin emas', to_char(v_start, 'DD.MM.YYYY');
  end if;

  if p_kind = 'free' then
    if v_title is null then raise exception '«Nima uchun» maydonini to''ldiring'; end if;
    perform pg_advisory_xact_lock(hashtext('income:' || coalesce(v_me::text, '') || v_amount::text));
  else
    select * into v_item from catalog_items where id = p_item;
    if v_item.id is null or not v_item.stock_tracked then raise exception 'Materialni tanlang'; end if;
    if v_qty is null or v_qty <= 0 then raise exception 'Miqdorni kiriting'; end if;
    -- остаток читается под блокировкой материала: две продажи одновременно не уведут склад в минус
    perform pg_advisory_xact_lock(hashtext('stock_sale:' || p_item::text || ':' || v_part));
    select coalesce(sum(qty), 0) into v_bal from stock_movements where item_id = p_item and part = v_part;
    v_unit := case public.part_unit(v_item.unit, v_part) when 'm2' then 'm²' when 'pcs' then 'dona' else public.part_unit(v_item.unit, v_part) end;   -- как на сайте
    if v_qty > v_bal then
      raise exception 'Omborda faqat % % bor', trim(to_char(greatest(v_bal, 0), 'FM999G999G990.###')), v_unit;
    end if;
    v_title := v_item.name || case when v_part <> '' then ' — ' || v_part else '' end;
    v_price := round(public.part_price(v_item, v_part), 2);
  end if;

  -- защита от двойного нажатия: та же запись того же человека за 2 минуты
  if exists (select 1 from incomes x where x.created_by is not distinct from v_me and x.kind = p_kind and x.amount = v_amount and x.received_at = v_date
               and x.title = v_title and x.qty is not distinct from (case when p_kind = 'stock' then v_qty end)
               and x.reverses_id is null and x.created_at > now() - interval '2 minutes'
               and not exists (select 1 from incomes r where r.reverses_id = x.id)) then
    raise exception 'Bu kirim hozirgina yozilgan (takror bosildimi?)';
  end if;

  insert into incomes(kind, amount, received_at, title, note, item_id, part, qty, unit_cost, created_by)
  values (p_kind, v_amount, v_date, v_title, v_note,
          case when p_kind = 'stock' then p_item end, case when p_kind = 'stock' then v_part end,
          case when p_kind = 'stock' then v_qty end, case when p_kind = 'stock' then v_price end, v_me)
  returning id into v_id;

  if p_kind = 'stock' then
    insert into stock_movements(item_id, part, qty, kind, unit_cost, note, income_id, created_by)
    values (p_item, v_part, -v_qty, 'sale', v_price, 'Sotildi' || coalesce(': ' || v_note, ''), v_id, v_me);
  end if;
  return v_id;
end $$;
revoke all on function public.record_income(text, numeric, date, text, text, uuid, text, numeric) from public, anon;
grant execute on function public.record_income(text, numeric, date, text, text, uuid, text, numeric) to authenticated;

-- ============ 4. отменить приход (встречная запись; проданный материал возвращается на склад) ============
create or replace function public.reverse_income(p_id uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v incomes; v_id uuid; v_me uuid := public.my_id();
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  select * into v from incomes where id = p_id for update;
  if v.id is null then raise exception 'Kirim topilmadi'; end if;
  if v.reverses_id is not null then raise exception 'Bu bekor qilish yozuvi'; end if;
  if exists (select 1 from incomes where reverses_id = p_id) then raise exception 'Allaqachon bekor qilingan'; end if;
  insert into incomes(kind, amount, received_at, title, note, item_id, part, qty, unit_cost, created_by, reverses_id)
  values (v.kind, -v.amount, (now() at time zone 'Asia/Tashkent')::date, v.title, coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Bekor qilindi'),
          v.item_id, v.part, case when v.qty is not null then -v.qty end, v.unit_cost, v_me, p_id)
  returning id into v_id;
  if v.kind = 'stock' then
    insert into stock_movements(item_id, part, qty, kind, unit_cost, note, income_id, created_by)
    values (v.item_id, v.part, v.qty, 'sale', v.unit_cost, 'Sotuv bekor qilindi', v_id, v_me);
  end if;
  return v_id;
end $$;
revoke all on function public.reverse_income(uuid, text) from public, anon;
grant execute on function public.reverse_income(uuid, text) to authenticated;

-- ============ 5. касса: + приход ============
create or replace view public.v_cash_balance with (security_invoker = true) as
  with s as (
    select coalesce((select (value #>> '{}')::date from public.app_settings where key = 'cash_start_date'), (now() at time zone 'Asia/Tashkent')::date) as d,
           coalesce((select (value #>> '{}')::numeric from public.app_settings where key = 'cash_opening_balance'), 0) as opening
  )
  select case when public.is_rahbar() or session_user in ('postgres', 'supabase_admin') then
           s.opening
         + (select coalesce(sum(amount), 0) from public.payments where paid_at >= s.d)
         + (select coalesce(sum(amount), 0) from public.incomes where received_at >= s.d)
         - (select coalesce(sum(amount), 0) from public.expenses where confirmed and spent_at >= s.d)
         - (select coalesce(sum(amount), 0) from public.salary_payouts where paid_at >= s.d)
         - (select coalesce(sum(amount), 0) from public.supplier_payments where paid_at >= s.d) end as cash,
         s.d as since
  from s;

create or replace function public.bot_cash()
returns numeric language sql stable security definer set search_path = public as $$
  with s as (
    select coalesce((select (value #>> '{}')::date from app_settings where key = 'cash_start_date'), (now() at time zone 'Asia/Tashkent')::date) d,
           coalesce((select (value #>> '{}')::numeric from app_settings where key = 'cash_opening_balance'), 0) opening)
  select opening
    + (select coalesce(sum(amount), 0) from payments where paid_at >= s.d)
    + (select coalesce(sum(amount), 0) from incomes where received_at >= s.d)
    - (select coalesce(sum(amount), 0) from expenses where confirmed and spent_at >= s.d)
    - (select coalesce(sum(amount), 0) from salary_payouts where paid_at >= s.d)
    - (select coalesce(sum(amount), 0) from supplier_payments where paid_at >= s.d)
  from s
$$;
revoke all on function public.bot_cash() from public, anon, authenticated;

-- ============ 6. месячный отчёт: cash.other (приход мимо заказов), net с ним; прибыль не меняется ============
do $$
declare v_src text; v_new text;
begin
  select pg_get_functiondef('public.monthly_report_core(date)'::regprocedure) into v_src;
  if v_src not like '%c_other%' then
    v_new := replace(v_src, 'c_in numeric; c_exp numeric;', 'c_in numeric; c_other numeric; c_exp numeric;');
    v_new := replace(v_new, E'  select coalesce(sum(amount), 0) into c_in from payments where paid_at >= v_m and paid_at < v_e;\n',
      E'  select coalesce(sum(amount), 0) into c_in from payments where paid_at >= v_m and paid_at < v_e;\n'
      || E'  select coalesce(sum(amount), 0) into c_other from incomes where received_at >= v_m and received_at < v_e;   -- приход мимо заказов: в кассу, не в прибыль\n');
    v_new := replace(v_new, $q$'cash', jsonb_build_object('received', c_in, 'expenses', c_exp, 'salaries', c_sal, 'suppliers', c_sup, 'net', c_in - c_exp - c_sal - c_sup,$q$,
                            $q$'cash', jsonb_build_object('received', c_in, 'other', c_other, 'expenses', c_exp, 'salaries', c_sal, 'suppliers', c_sup, 'net', c_in + c_other - c_exp - c_sal - c_sup,$q$);
    if v_new not like '%c_other numeric%' or v_new not like '%into c_other from incomes%' or v_new not like '%''other'', c_other%' or v_new not like '%c_in + c_other - c_exp%' then
      raise exception 'monthly_report_core: замена не сработала';
    end if;
    execute v_new;
  end if;
end $$;
revoke all on function public.monthly_report_core(date) from public, anon, authenticated;

-- ============ 7. SAVDO BOLIMI: приход мимо заказов — строки в «Prixod», в итоге prixod и ostatka ============
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
  -- приход = оплаты по заказам + приход мимо заказов (Kirim)
  select coalesce((select sum(amount) from payments where paid_at >= v_m and paid_at < v_e), 0)
       + coalesce((select sum(amount) from incomes where received_at >= v_m and received_at < v_e), 0) into v_in;
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
    -- строки Kirim (src = 'income') — без номера заказа, правятся только на странице «Kirim» (встречной записью)
    'prixod', (
      select coalesce(jsonb_agg(z.j order by z.d, z.c), '[]') from (
        select p.paid_at d, p.created_at c, jsonb_build_object('id', p.id, 'date', p.paid_at, 'raqami', o.order_no, 'ismi', cl.full_name, 'amount', p.amount,
                 'note', p.note, 'storno', p.reverses_id is not null, 'src', 'payment') j
          from payments p join orders o on o.id = p.order_id join clients cl on cl.id = o.client_id
         where p.paid_at >= v_m and p.paid_at < v_e
        union all
        select i.received_at, i.created_at, jsonb_build_object('id', i.id, 'date', i.received_at, 'raqami', null, 'ismi', i.title, 'amount', i.amount,
                 'note', i.note, 'storno', i.reverses_id is not null, 'src', 'income')
          from incomes i
         where i.received_at >= v_m and i.received_at < v_e) z),
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
                   select (created_at at time zone 'Asia/Tashkent')::date d from orders union all select spent_at from expenses union all select paid_at from payments
                   union all select received_at from incomes) z) y)
  );
end $$;
revoke all on function public.savdo_month_core(date) from public, anon, authenticated;

-- ============ 8. проверка цифр: касса, даты, сторно, Savdo = Report — с приходом ============
create or replace function public.integrity_check() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Tashkent')::date;
  res jsonb := '[]'::jsonb; v_start date; v_open numeric; a numeric; b numeric; c numeric; v_m date; s jsonb; k jsonb; v_n bigint; v_cur date := date_trunc('month', v_today)::date;
begin
  if not (public.is_rahbar() or session_user in ('postgres', 'supabase_admin')) then raise exception 'Faqat rahbar'; end if;

  -- 1. касса = открытие + приход (заказы + Kirim) − расход − выплаты − оплаты поставщикам (с даты старта кассы)
  select coalesce((value #>> '{}')::date, v_today) into v_start from app_settings where key = 'cash_start_date';
  select coalesce((value #>> '{}')::numeric, 0) into v_open from app_settings where key = 'cash_opening_balance';
  a := coalesce(v_open, 0)
       + (select coalesce(sum(amount), 0) from payments where paid_at >= v_start)
       + (select coalesce(sum(amount), 0) from incomes where received_at >= v_start)
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
  -- 4b. продажа со склада: движение склада = проданному количеству каждой записи Kirim (и обратно при отмене)
  select count(*) into v_n from incomes i
   where i.kind = 'stock' and coalesce((select sum(m.qty) from stock_movements m where m.income_id = i.id), 0) <> -i.qty;
  res := res || jsonb_build_object('name', 'income_stock_movements', 'ok', v_n = 0, 'expected', 0, 'actual', v_n);

  -- 5. шапка заказа = сумма позиций (кроме импортированных и пустых)
  select count(*) into v_n from orders o
   where not o.is_imported and exists (select 1 from order_items i where i.order_id = o.id)
     and (o.windows_count <> (select coalesce(sum(qty), 0) from order_items i where i.order_id = o.id)
          or abs(o.area_m2 - (select coalesce(sum(area_m2 * qty), 0) from order_items i where i.order_id = o.id)) > 0.05);
  res := res || jsonb_build_object('name', 'order_header_vs_items', 'ok', v_n = 0, 'expected', 0, 'actual', v_n);

  -- 6. даты и знаки: нет будущих дат, нет сторно без оригинала, нет отрицательной цены
  select (select count(*) from payments where paid_at > v_today + 1) + (select count(*) from expenses where spent_at > v_today + 1)
       + (select count(*) from salary_payouts where paid_at > v_today + 1) + (select count(*) from supplier_payments where paid_at > v_today + 1)
       + (select count(*) from purchases where purchased_at > v_today + 1) + (select count(*) from incomes where received_at > v_today + 1) into v_n;
  res := res || jsonb_build_object('name', 'no_future_dates', 'ok', v_n = 0, 'expected', 0, 'actual', v_n);
  select (select count(*) from payments p where p.reverses_id is not null and not exists (select 1 from payments o where o.id = p.reverses_id))
       + (select count(*) from expenses p where p.reverses_id is not null and not exists (select 1 from expenses o where o.id = p.reverses_id))
       + (select count(*) from incomes p where p.reverses_id is not null and not exists (select 1 from incomes o where o.id = p.reverses_id))
       + (select count(*) from orders where contract_price < 0) into v_n;
  res := res || jsonb_build_object('name', 'ledger_sanity', 'ok', v_n = 0, 'expected', 0, 'actual', v_n);

  -- 7. по каждому из последних 6 месяцев: Savdo = Report, сумма строк = итог, зарплата начислено = сумма строк
  for v_m in select (v_cur - make_interval(months => g))::date from generate_series(0, 5) g loop
    s := public.savdo_month_core(v_m);
    k := public.monthly_report_core(v_m);
    a := (s->'itog'->>'prixod')::numeric; b := (k->'cash'->>'received')::numeric + coalesce((k->'cash'->>'other')::numeric, 0);
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

-- ============ 9. отчёт 23:00: строка «Boshqa kirim» (за день и с 1-го числа) ============
create or replace function public.daily_report_core(p_day date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  d date := coalesce(p_day, (now() at time zone 'Asia/Tashkent')::date);
  m date := date_trunc('month', coalesce(p_day, (now() at time zone 'Asia/Tashkent')::date))::date;
  t_n int; t_sum numeric; t_paid numeric; m_n int; m_sum numeric;
  e_d numeric; p_d numeric; e_m numeric; p_m numeric; i_d numeric; i_m numeric;
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
  -- приход мимо заказов (Moliya → Kirim): продажа со склада и свободный приход; отмены — с минусом
  select coalesce(sum(amount) filter (where received_at = d), 0), coalesce(sum(amount) filter (where received_at between m and d), 0) into i_d, i_m
    from incomes where received_at between m and d;
  return jsonb_build_object(
    'day', d, 'month_start', m,
    'today', jsonb_build_object('orders', t_n, 'sum', t_sum, 'paid', t_paid),
    'month', jsonb_build_object('orders', m_n, 'sum', m_sum),
    'other_in', jsonb_build_object('today', i_d, 'month', i_m),
    'expenses_today', jsonb_build_object('expenses', e_d, 'purchases', p_d, 'total', e_d + p_d),
    'expenses_month', jsonb_build_object('expenses', e_m, 'purchases', p_m, 'total', e_m + p_m));
end $$;
revoke all on function public.daily_report_core(date) from public, anon, authenticated;
grant execute on function public.daily_report_core(date) to service_role;
