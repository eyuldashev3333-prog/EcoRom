-- ECOROM 016: расходы. Rahbar пишет боту «obed 150000» → черновик → кнопка «Tasdiqlash» → запись в журнал expenses (касса уменьшается).
-- Журнал не правится: ошибку исправляет встречная запись (с датой исходной записи, чтобы месяцы не путались).
-- На сайте — то же вручную (record_expense / reverse_expense). Бот принимает расходы только от двух Rahbar с привязанным Telegram.
create unique index if not exists expenses_reverses_once on public.expenses(reverses_id) where reverses_id is not null;
create index if not exists expenses_spent_at on public.expenses (spent_at);

-- черновики из бота (не влияют на кассу, пока не подтверждены); через API не видны
create table if not exists public.expense_drafts (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null,
  amount numeric(14,2) not null check (amount > 0),
  category_id int references public.expense_categories(id),
  note text,
  for_employee_id uuid references public.employees(id),
  created_at timestamptz not null default now()
);
alter table public.expense_drafts enable row level security;
revoke all on public.expense_drafts from anon, authenticated;

create or replace function public.expense_actor(p_tg bigint) returns uuid language sql stable security definer set search_path = public as $$
  select id from employees where telegram_id = p_tg and role = 'rahbar' and is_active
$$;
revoke all on function public.expense_actor(bigint) from public, anon, authenticated;

create or replace function public.expense_view(p_draft public.expense_drafts) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p_draft.id, 'amount', p_draft.amount, 'note', p_draft.note,
    'category_id', p_draft.category_id, 'category', (select name from expense_categories where id = p_draft.category_id),
    'employee', (select full_name from employees where id = p_draft.for_employee_id))
$$;
revoke all on function public.expense_view(public.expense_drafts) from public, anon, authenticated;

create or replace function public.expense_draft_create(p_tg bigint, p_amount numeric, p_category int, p_note text, p_for uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_d expense_drafts;
begin
  if public.expense_actor(p_tg) is null then raise exception 'Faqat rahbar'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Summa noto''g''ri'; end if;
  delete from expense_drafts where created_at < now() - interval '2 days';
  insert into expense_drafts(telegram_id, amount, category_id, note, for_employee_id)
  values (p_tg, round(p_amount, 2), (select id from expense_categories where id = p_category and is_active), left(nullif(trim(p_note), ''), 200),
          (select id from employees where id = p_for and is_active))
  returning * into v_d;
  return public.expense_view(v_d);
end $$;

create or replace function public.expense_draft_set(p_tg bigint, p_id uuid, p_category int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_d expense_drafts;
begin
  if public.expense_actor(p_tg) is null then raise exception 'Faqat rahbar'; end if;
  update expense_drafts set category_id = (select id from expense_categories where id = p_category and is_active)
   where id = p_id and telegram_id = p_tg returning * into v_d;
  if v_d.id is null then raise exception 'Qoralama topilmadi'; end if;
  return public.expense_view(v_d);
end $$;

create or replace function public.expense_confirm(p_tg bigint, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_actor uuid := public.expense_actor(p_tg); v_d expense_drafts; v_id uuid; v_date date := (now() at time zone 'Asia/Tashkent')::date;
begin
  if v_actor is null then raise exception 'Faqat rahbar'; end if;
  select * into v_d from expense_drafts where id = p_id and telegram_id = p_tg for update;
  if v_d.id is null then raise exception 'Qoralama topilmadi yoki allaqachon yozilgan'; end if;
  if v_d.category_id is null then raise exception 'Avval kategoriyani tanlang'; end if;
  insert into expenses(category_id, amount, spent_at, note, for_employee_id, source, confirmed, created_by)
  values (v_d.category_id, v_d.amount, v_date, v_d.note, v_d.for_employee_id, 'telegram', true, v_actor) returning id into v_id;
  delete from expense_drafts where id = p_id;
  return public.expense_view(v_d) || jsonb_build_object('expense_id', v_id, 'date', v_date);
end $$;

create or replace function public.expense_discard(p_tg bigint, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.expense_actor(p_tg) is null then raise exception 'Faqat rahbar'; end if;
  delete from expense_drafts where id = p_id and telegram_id = p_tg;
end $$;

-- ===== общая отмена: встречная запись с датой исходной =====
create or replace function public.expense_reverse_core(p_id uuid, p_note text, p_actor uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v expenses; v_new uuid;
begin
  select * into v from expenses where id = p_id for update;
  if v.id is null then raise exception 'Xarajat topilmadi'; end if;
  if v.reverses_id is not null then raise exception 'Bu bekor qilish yozuvi'; end if;
  if exists (select 1 from expenses where reverses_id = p_id) then raise exception 'Allaqachon bekor qilingan'; end if;
  insert into expenses(category_id, amount, spent_at, note, for_employee_id, order_id, source, confirmed, created_by, reverses_id)
  values (v.category_id, -v.amount, v.spent_at, coalesce(nullif(trim(p_note), ''), 'Bekor qilindi'), v.for_employee_id, v.order_id, v.source, v.confirmed, p_actor, p_id)
  returning id into v_new;
  return v_new;
end $$;
revoke all on function public.expense_reverse_core(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.expense_undo(p_tg bigint, p_expense uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_actor uuid := public.expense_actor(p_tg);
begin
  if v_actor is null then raise exception 'Faqat rahbar'; end if;
  perform public.expense_reverse_core(p_expense, 'Botda bekor qilindi', v_actor);
  return jsonb_build_object('ok', true);
end $$;

-- ===== сайт =====
create or replace function public.record_expense(p_category int, p_amount numeric, p_date date default null, p_note text default null, p_for uuid default null, p_order uuid default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Summa noto''g''ri'; end if;
  if not exists (select 1 from expense_categories where id = p_category and is_active) then raise exception 'Kategoriyani tanlang'; end if;
  insert into expenses(category_id, amount, spent_at, note, for_employee_id, order_id, source, confirmed, created_by)
  values (p_category, round(p_amount, 2), coalesce(p_date, (now() at time zone 'Asia/Tashkent')::date), nullif(trim(p_note), ''), p_for, p_order, 'web', true, public.my_id())
  returning id into v_id;
  return v_id;
end $$;

-- security definer: роль проверяется здесь; внутренняя expense_reverse_core остаётся закрытой для authenticated
create or replace function public.reverse_expense(p_id uuid, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  return public.expense_reverse_core(p_id, p_note, public.my_id());
end $$;

revoke all on function public.expense_draft_create(bigint, numeric, int, text, uuid), public.expense_draft_set(bigint, uuid, int),
  public.expense_confirm(bigint, uuid), public.expense_discard(bigint, uuid), public.expense_undo(bigint, uuid) from public, anon, authenticated;
grant execute on function public.expense_draft_create(bigint, numeric, int, text, uuid), public.expense_draft_set(bigint, uuid, int),
  public.expense_confirm(bigint, uuid), public.expense_discard(bigint, uuid), public.expense_undo(bigint, uuid) to service_role;
revoke all on function public.record_expense(int, numeric, date, text, uuid, uuid), public.reverse_expense(uuid, text) from public, anon;
grant execute on function public.record_expense(int, numeric, date, text, uuid, uuid), public.reverse_expense(uuid, text) to authenticated;
