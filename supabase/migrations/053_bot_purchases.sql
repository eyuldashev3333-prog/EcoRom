-- ECOROM 053 (24.11.2026, замечание Asad п. 12): бот пишет закупки. Сообщение Rahbar, начинающееся со слова «xarid»:
--   xarid <название материала> <количество> [единица] <сумма>      например: «xarid Otliv oq 200 30 m 600000»
-- Бот находит материал на складе (или предлагает выбрать / создать новый), показывает карточку, и только после «Tasdiqlash»:
-- склад + количество, закупка в журнале, платёж поставщику «Bot / noma'lum» (касса уменьшается ровно один раз, без дубля в xarajatlar).
-- Обычный расход («taksi 50000») по-прежнему идёт в xarajatlar, склад не трогает.

create table if not exists public.purchase_drafts (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null,
  name_text text not null,
  qty numeric(14,3) not null check (qty > 0),
  unit text,
  total numeric(14,2) not null check (total > 0),
  item_id uuid references public.catalog_items(id),
  part text not null default '',
  created_at timestamptz not null default now()
);
alter table public.purchase_drafts enable row level security;
revoke all on public.purchase_drafts from anon, authenticated;

create or replace function public.unit_norm(u text) returns text language sql immutable as $$
  select case lower(replace(trim(coalesce(u, '')), '²', '2'))
    when 'm' then 'm' when 'metr' then 'm' when 'м' then 'm' when 'метр' then 'm' when 'mp' then 'm'
    when 'm2' then 'm2' when 'kv' then 'm2' when 'kv.m' then 'm2' when 'м2' then 'm2'
    when 'pcs' then 'pcs' when 'dona' then 'pcs' when 'ta' then 'pcs' when 'шт' then 'pcs' when 'sht' then 'pcs'
    else lower(replace(trim(coalesce(u, '')), '²', '2')) end
$$;

-- кандидаты: все слова названия встречаются в названии позиции склада (порядок стабильный: нужен для кнопок)
create or replace function public.purchase_candidates(p_name text) returns table(item_id uuid, part text, name text, unit text)
language sql stable security definer set search_path = public as $$
  select b.item_id, b.part, b.name, b.unit from v_stock_balance b
   where not exists (select 1 from unnest(string_to_array(lower(regexp_replace(trim(p_name), '\s+', ' ', 'g')), ' ')) t where t <> '' and position(t in lower(b.name)) = 0)
   order by length(b.name), b.name, b.part
   limit 5
$$;
revoke all on function public.purchase_candidates(text) from public, anon, authenticated;

create or replace function public.purchase_view(p_d public.purchase_drafts) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p_d.id, 'name', p_d.name_text, 'qty', p_d.qty, 'unit', p_d.unit, 'total', p_d.total, 'unit_price', round(p_d.total / p_d.qty, 2),
    'item', (select jsonb_build_object('id', b.item_id, 'part', b.part, 'name', b.name, 'unit', b.unit, 'qty', b.qty)
               from v_stock_balance b where b.item_id = p_d.item_id and b.part = p_d.part),
    'candidates', case when p_d.item_id is null then (select coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'unit', c.unit) order by length(c.name), c.name, c.part), '[]')
                                                        from public.purchase_candidates(p_d.name_text) c) else '[]'::jsonb end)
$$;
revoke all on function public.purchase_view(public.purchase_drafts) from public, anon, authenticated;

create or replace function public.purchase_draft_create(p_tg bigint, p_name text, p_qty numeric, p_unit text, p_total numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_d purchase_drafts; v_norm text := lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g')); v_item uuid; v_part text; v_n int;
begin
  if public.expense_actor(p_tg) is null then raise exception 'Faqat rahbar'; end if;
  if v_norm = '' then raise exception 'Material nomini yozing'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Miqdor noto''g''ri'; end if;
  if p_total is null or p_total <= 0 then raise exception 'Summa noto''g''ri'; end if;
  delete from purchase_drafts where created_at < now() - interval '2 days';
  -- 1) ровно одно совпадение по полному названию; 2) иначе единственный кандидат; иначе пользователь выбирает кнопкой
  select count(*) into v_n from v_stock_balance where lower(name) = v_norm;
  if v_n = 1 then select b.item_id, b.part into v_item, v_part from v_stock_balance b where lower(b.name) = v_norm;
  else
    select count(*) into v_n from public.purchase_candidates(p_name);
    if v_n = 1 then select c.item_id, c.part into v_item, v_part from public.purchase_candidates(p_name) c; end if;
  end if;
  insert into purchase_drafts(telegram_id, name_text, qty, unit, total, item_id, part)
  values (p_tg, left(trim(p_name), 120), round(p_qty, 3), nullif(left(trim(coalesce(p_unit, '')), 20), ''), round(p_total, 2), v_item, coalesce(v_part, ''))
  returning * into v_d;
  return public.purchase_view(v_d);
end $$;

create or replace function public.purchase_draft_pick(p_tg bigint, p_id uuid, p_idx int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_d purchase_drafts; v_item uuid; v_part text;
begin
  if public.expense_actor(p_tg) is null then raise exception 'Faqat rahbar'; end if;
  select * into v_d from purchase_drafts where id = p_id and telegram_id = p_tg for update;
  if v_d.id is null then raise exception 'Qoralama topilmadi yoki allaqachon yozilgan'; end if;
  select x.item_id, x.part into v_item, v_part from (select c.item_id, c.part, row_number() over (order by length(c.name), c.name, c.part) as rn from public.purchase_candidates(v_d.name_text) c) x where x.rn = p_idx + 1;
  if v_item is null then raise exception 'Material topilmadi'; end if;
  update purchase_drafts set item_id = v_item, part = v_part where id = p_id returning * into v_d;
  return public.purchase_view(v_d);
end $$;

-- нет такого материала на складе: создаём новый (вид «extra»), единица — из сообщения, иначе «dona»
create or replace function public.purchase_draft_new(p_tg bigint, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_d purchase_drafts; v_item uuid;
begin
  if public.expense_actor(p_tg) is null then raise exception 'Faqat rahbar'; end if;
  select * into v_d from purchase_drafts where id = p_id and telegram_id = p_tg for update;
  if v_d.id is null then raise exception 'Qoralama topilmadi yoki allaqachon yozilgan'; end if;
  select id into v_item from catalog_items where kind = 'extra' and lower(name) = lower(v_d.name_text);
  if v_item is null then
    insert into catalog_items(kind, name, unit, price, params, stock_tracked, sort)
    values ('extra', v_d.name_text, coalesce(v_d.unit, 'dona'), round(v_d.total / v_d.qty, 2), '{}'::jsonb, true, coalesce((select max(sort) from catalog_items where kind = 'extra'), 0) + 1)
    returning id into v_item;
  end if;
  update purchase_drafts set item_id = v_item, part = '' where id = p_id returning * into v_d;
  return public.purchase_view(v_d);
end $$;

create or replace function public.purchase_confirm(p_tg bigint, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_actor uuid := public.expense_actor(p_tg); v_d purchase_drafts; v_sup uuid; v_p uuid; v_date date := (now() at time zone 'Asia/Tashkent')::date; v_name text; v_unit text;
begin
  if v_actor is null then raise exception 'Faqat rahbar'; end if;
  select * into v_d from purchase_drafts where id = p_id and telegram_id = p_tg for update;
  if v_d.id is null then raise exception 'Qoralama topilmadi yoki allaqachon yozilgan'; end if;
  if v_d.item_id is null then raise exception 'Avval materialni tanlang'; end if;
  select id into v_sup from suppliers where name = 'Bot / noma''lum';
  if v_sup is null then insert into suppliers(name, note) values ('Bot / noma''lum', 'Telegram bot orqali yozilgan xaridlar') returning id into v_sup; end if;
  insert into purchases(supplier_id, purchased_at, total, delivery_cost, note, created_by)
  values (v_sup, v_date, v_d.total, 0, 'Telegram: ' || v_d.name_text, v_actor) returning id into v_p;
  insert into purchase_items(purchase_id, item_id, part, qty, unit_cost) values (v_p, v_d.item_id, v_d.part, v_d.qty, round(v_d.total / v_d.qty, 2));
  insert into stock_movements(item_id, part, qty, kind, purchase_id, unit_cost, created_by) values (v_d.item_id, v_d.part, v_d.qty, 'purchase', v_p, round(v_d.total / v_d.qty, 2), v_actor);
  -- касса уменьшается через платёж поставщику (один раз)
  insert into supplier_payments(supplier_id, amount, paid_at, note, created_by) values (v_sup, v_d.total, v_date, 'Telegram xarid ' || v_p::text, v_actor);
  delete from purchase_drafts where id = p_id;
  select b.name, b.unit into v_name, v_unit from v_stock_balance b where b.item_id = v_d.item_id and b.part = v_d.part;
  return jsonb_build_object('purchase_id', v_p, 'name', coalesce(v_name, v_d.name_text), 'unit', coalesce(v_unit, v_d.unit), 'qty', v_d.qty, 'total', v_d.total);
end $$;

create or replace function public.purchase_discard(p_tg bigint, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.expense_actor(p_tg) is null then raise exception 'Faqat rahbar'; end if;
  delete from purchase_drafts where id = p_id and telegram_id = p_tg;
end $$;

-- «↩ Bekor qilish» в боте: встречная закупка + встречный платёж (склад и касса возвращаются)
create or replace function public.purchase_undo(p_tg bigint, p_purchase uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_actor uuid := public.expense_actor(p_tg); v purchases; v_id uuid; v_pay supplier_payments;
begin
  if v_actor is null then raise exception 'Faqat rahbar'; end if;
  select * into v from purchases where id = p_purchase for update;
  if v.id is null then raise exception 'Xarid topilmadi'; end if;
  if v.reverses_id is not null then raise exception 'Bu bekor qilish yozuvi'; end if;
  if exists (select 1 from purchases where reverses_id = p_purchase) then raise exception 'Allaqachon bekor qilingan'; end if;
  insert into purchases(supplier_id, purchased_at, total, delivery_cost, note, created_by, reverses_id)
  values (v.supplier_id, (now() at time zone 'Asia/Tashkent')::date, -v.total, -v.delivery_cost, 'Botda bekor qilindi', v_actor, p_purchase) returning id into v_id;
  insert into purchase_items(purchase_id, item_id, part, qty, unit_cost) select v_id, item_id, part, -qty, unit_cost from purchase_items where purchase_id = p_purchase;
  insert into stock_movements(item_id, part, qty, kind, purchase_id, unit_cost, note, created_by)
  select item_id, part, -qty, 'purchase', v_id, unit_cost, 'Xarid bekor qilindi', v_actor from stock_movements where purchase_id = p_purchase;
  select * into v_pay from supplier_payments where note = 'Telegram xarid ' || p_purchase::text and reverses_id is null limit 1;
  if v_pay.id is not null and not exists (select 1 from supplier_payments where reverses_id = v_pay.id) then
    insert into supplier_payments(supplier_id, amount, paid_at, note, created_by, reverses_id)
    values (v_pay.supplier_id, -v_pay.amount, v_pay.paid_at, 'Botda bekor qilindi', v_actor, v_pay.id);
  end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.purchase_draft_create(bigint, text, numeric, text, numeric), public.purchase_draft_pick(bigint, uuid, int), public.purchase_draft_new(bigint, uuid),
  public.purchase_confirm(bigint, uuid), public.purchase_discard(bigint, uuid), public.purchase_undo(bigint, uuid) from public, anon, authenticated;
grant execute on function public.purchase_draft_create(bigint, text, numeric, text, numeric), public.purchase_draft_pick(bigint, uuid, int), public.purchase_draft_new(bigint, uuid),
  public.purchase_confirm(bigint, uuid), public.purchase_discard(bigint, uuid), public.purchase_undo(bigint, uuid) to service_role;
notify pgrst, 'reload schema';
