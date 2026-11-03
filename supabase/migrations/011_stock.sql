-- ECOROM 011: склад и поставщики.
-- Остаток = журнал stock_movements по паре (позиция каталога, часть): у системы профиля части rama/impost/tavaqa/shtapik/rezina —
-- это разные профили на складе; '' — сама позиция. Приход — закупка у поставщика; расход — автоматически по заказу при
-- «Sexga yuborish» (повторная отправка списывает только разницу); инвентаризация — факт, разница = утечка (adjust).
-- Долг поставщику = закупки + доставка − оплаты. Всё журналами: исправление встречной записью.

alter table public.stock_movements add column if not exists part text not null default '';
alter table public.purchase_items add column if not exists part text not null default '';
alter table public.suppliers add column if not exists is_active boolean not null default true;
alter table public.suppliers add column if not exists created_at timestamptz not null default now();
create index if not exists stock_movements_item_part on public.stock_movements (item_id, part);
create unique index if not exists purchases_reverses_once on public.purchases(reverses_id) where reverses_id is not null;
create unique index if not exists supplier_payments_reverses_once on public.supplier_payments(reverses_id) where reverses_id is not null;

-- цена и единица части (как в расчёте окна, quote.ts)
create or replace function public.part_price(p_item public.catalog_items, p_part text) returns numeric language sql immutable as $$
  select case when coalesce(p_part, '') = '' then p_item.price
              else coalesce(nullif(p_item.params->>(case p_part when 'rama' then 'frame' when 'tavaqa' then 'sash' when 'shtapik' then 'bead'
                     when 'rezina' then 'gasket' when 'profil' then 'profile' when 'zaglushka' then 'side_cap' else p_part end), '')::numeric, 0) end
$$;
create or replace function public.part_unit(p_unit text, p_part text) returns text language sql immutable as $$
  select case when p_part = 'zaglushka' then 'pcs' when p_part in ('profil', 'rezina') then 'm' else p_unit end
$$;

-- остатки: все учитываемые позиции (+ части систем), даже нулевые; стоимость по цене каталога
drop view if exists public.v_stock_balance;
create view public.v_stock_balance with (security_invoker = true) as
  with keys as (
    select i.id as item_id, p.part from public.catalog_items i
      cross join lateral unnest(case i.kind when 'system' then array['rama','impost','tavaqa','shtapik','rezina']
                                            when 'ebb' then array['', 'zaglushka'] when 'net' then array['', 'profil', 'rezina'] else array[''] end) as p(part)
     where i.stock_tracked and i.is_active
    union
    select item_id, part from public.stock_movements
  )
  select k.item_id, k.part, i.kind, i.sort,
         i.name || case when k.part <> '' then ' — ' || k.part else '' end as name,
         public.part_unit(i.unit, k.part) as unit,
         coalesce(sum(m.qty), 0) as qty,
         public.part_price(i, k.part) as price,
         round(coalesce(sum(m.qty), 0) * public.part_price(i, k.part), 2) as value
  from keys k join public.catalog_items i on i.id = k.item_id
  left join public.stock_movements m on m.item_id = k.item_id and m.part = k.part
  group by k.item_id, k.part, i.id;

drop view if exists public.v_supplier_debt;
create view public.v_supplier_debt with (security_invoker = true) as
  select s.id as supplier_id, s.name, s.city, s.phone, s.is_active,
         coalesce((select sum(total + delivery_cost) from public.purchases where supplier_id = s.id), 0) as purchased,
         coalesce((select sum(amount) from public.supplier_payments where supplier_id = s.id), 0) as paid,
         coalesce((select sum(total + delivery_cost) from public.purchases where supplier_id = s.id), 0)
         - coalesce((select sum(amount) from public.supplier_payments where supplier_id = s.id), 0) as debt
  from public.suppliers s;

-- ===== закупка (приход) =====
-- p: {supplier_id, purchased_at, delivery_cost, note, paid_now, total (если без строк), lines:[{item_id, part, qty, unit_cost}]}
create or replace function public.record_purchase(p jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_id uuid; v_total numeric; ln jsonb; v_paid numeric := coalesce((p->>'paid_now')::numeric, 0);
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if not exists (select 1 from suppliers where id = (p->>'supplier_id')::uuid) then raise exception 'Yetkazib beruvchini tanlang'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p->'lines', '[]')) x where coalesce((x->>'qty')::numeric, 0) <= 0 or coalesce((x->>'unit_cost')::numeric, -1) < 0) then
    raise exception 'Miqdor va narxni tekshiring';
  end if;
  select coalesce(sum(round((x->>'qty')::numeric * (x->>'unit_cost')::numeric, 2)), 0) into v_total from jsonb_array_elements(coalesce(p->'lines', '[]')) x;
  if jsonb_array_length(coalesce(p->'lines', '[]')) = 0 then v_total := coalesce((p->>'total')::numeric, 0); end if;
  if v_total <= 0 then raise exception 'Xarid summasi 0 — narxlarni kiriting'; end if;
  if v_paid < 0 then raise exception 'To''lov summasi noto''g''ri'; end if;

  insert into purchases(supplier_id, purchased_at, total, delivery_cost, note, created_by)
  values ((p->>'supplier_id')::uuid, coalesce(nullif(p->>'purchased_at', '')::date, current_date), v_total,
          coalesce((p->>'delivery_cost')::numeric, 0), nullif(trim(p->>'note'), ''), public.my_id())
  returning id into v_id;
  for ln in select * from jsonb_array_elements(coalesce(p->'lines', '[]')) loop
    insert into purchase_items(purchase_id, item_id, part, qty, unit_cost)
    values (v_id, (ln->>'item_id')::uuid, coalesce(ln->>'part', ''), (ln->>'qty')::numeric, (ln->>'unit_cost')::numeric);
    insert into stock_movements(item_id, part, qty, kind, purchase_id, unit_cost, created_by)
    values ((ln->>'item_id')::uuid, coalesce(ln->>'part', ''), (ln->>'qty')::numeric, 'purchase', v_id, (ln->>'unit_cost')::numeric, public.my_id());
  end loop;
  if v_paid > 0 then
    insert into supplier_payments(supplier_id, amount, paid_at, note, created_by)
    values ((p->>'supplier_id')::uuid, v_paid, coalesce(nullif(p->>'purchased_at', '')::date, current_date), 'Xarid paytida to''landi', public.my_id());
  end if;
  return v_id;
end $$;

-- отмена закупки: встречная запись (сумма, строки и склад с минусом)
create or replace function public.reverse_purchase(p_purchase uuid, p_note text default null) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v purchases; v_id uuid;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  select * into v from purchases where id = p_purchase;
  if v.id is null then raise exception 'Xarid topilmadi'; end if;
  if v.reverses_id is not null then raise exception 'Bu bekor qilish yozuvi'; end if;
  if exists (select 1 from purchases where reverses_id = p_purchase) then raise exception 'Allaqachon bekor qilingan'; end if;
  insert into purchases(supplier_id, purchased_at, total, delivery_cost, note, created_by, reverses_id)
  values (v.supplier_id, current_date, -v.total, -v.delivery_cost, coalesce(nullif(trim(p_note), ''), 'Bekor qilindi'), public.my_id(), p_purchase)
  returning id into v_id;
  insert into purchase_items(purchase_id, item_id, part, qty, unit_cost) select v_id, item_id, part, -qty, unit_cost from purchase_items where purchase_id = p_purchase;
  insert into stock_movements(item_id, part, qty, kind, purchase_id, unit_cost, note, created_by)
  select item_id, part, -qty, 'purchase', v_id, unit_cost, 'Xarid bekor qilindi', public.my_id() from stock_movements where purchase_id = p_purchase;
  return v_id;
end $$;

-- ===== оплата поставщику =====
create or replace function public.record_supplier_payment(p_supplier uuid, p_amount numeric, p_date date default current_date, p_note text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Summa noto''g''ri'; end if;
  if not exists (select 1 from suppliers where id = p_supplier) then raise exception 'Yetkazib beruvchi topilmadi'; end if;
  insert into supplier_payments(supplier_id, amount, paid_at, note, created_by)
  values (p_supplier, round(p_amount, 2), coalesce(p_date, current_date), nullif(trim(p_note), ''), public.my_id()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.reverse_supplier_payment(p_payment uuid, p_note text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v supplier_payments; v_id uuid;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  select * into v from supplier_payments where id = p_payment;
  if v.id is null then raise exception 'To''lov topilmadi'; end if;
  if v.reverses_id is not null then raise exception 'Bu bekor qilish yozuvi'; end if;
  if exists (select 1 from supplier_payments where reverses_id = p_payment) then raise exception 'Allaqachon bekor qilingan'; end if;
  insert into supplier_payments(supplier_id, amount, paid_at, note, created_by, reverses_id)
  values (v.supplier_id, -v.amount, current_date, coalesce(nullif(trim(p_note), ''), 'Bekor qilindi'), public.my_id(), p_payment) returning id into v_id;
  return v_id;
end $$;

-- ===== инвентаризация: факт → разница записывается как утечка (+/−) =====
-- p: {note, lines:[{item_id, part, fact}]}; возвращает {lines, loss} (loss — стоимость недостачи, сум)
create or replace function public.stock_count(p jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare ln jsonb; v_book numeric; v_diff numeric; v_price numeric; v_n int := 0; v_loss numeric := 0;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  for ln in select * from jsonb_array_elements(coalesce(p->'lines', '[]')) loop
    if (ln->>'fact')::numeric < 0 then raise exception 'Qoldiq manfiy bo''lmaydi'; end if;
    select coalesce(sum(qty), 0) into v_book from stock_movements where item_id = (ln->>'item_id')::uuid and part = coalesce(ln->>'part', '');
    v_diff := (ln->>'fact')::numeric - v_book;
    continue when v_diff = 0;
    select public.part_price(i, coalesce(ln->>'part', '')) into v_price from catalog_items i where i.id = (ln->>'item_id')::uuid;
    insert into stock_movements(item_id, part, qty, kind, unit_cost, note, created_by)
    values ((ln->>'item_id')::uuid, coalesce(ln->>'part', ''), v_diff, 'adjust', v_price,
            coalesce(nullif(trim(p->>'note'), ''), 'Inventarizatsiya'), public.my_id());
    v_n := v_n + 1;
    v_loss := v_loss - least(v_diff, 0) * coalesce(v_price, 0);
  end loop;
  return jsonb_build_object('lines', v_n, 'loss', round(v_loss, 2));
end $$;

-- ===== авторасход по заказу: потребность − уже списано = новая запись (повторная отправка — только разница) =====
create or replace function public.order_consume(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record; v_no bigint;
begin
  select order_no into v_no from orders where id = p_order;
  for r in
    with need as (
      select (x->>'item_id')::uuid as item_id,
             coalesce(x->>'part', case when position(c.name || ' — ' in x->>'name') = 1 then substr(x->>'name', length(c.name) + 4) else '' end) as part,
             sum((x->>'qty')::numeric * i.qty) as qty
        from order_items i
        cross join jsonb_array_elements(coalesce(i.materials->'items', '[]')) x
        join catalog_items c on c.id::text = x->>'item_id' and c.stock_tracked
       where i.order_id = p_order
       group by 1, 2),
    done as (
      select item_id, part, -sum(qty) as qty from stock_movements where order_id = p_order and kind in ('consume', 'return') group by 1, 2)
    select coalesce(n.item_id, d.item_id) as item_id, coalesce(n.part, d.part) as part,
           round(coalesce(n.qty, 0) - coalesce(d.qty, 0), 3) as diff
      from need n full join done d on d.item_id = n.item_id and d.part = n.part
  loop
    continue when r.diff = 0;
    insert into stock_movements(item_id, part, qty, kind, order_id, unit_cost, note, created_by)
    select r.item_id, r.part, -r.diff, case when r.diff > 0 then 'consume' else 'return' end, p_order,
           public.part_price(c, r.part), 'Buyurtma №' || v_no, public.my_id()
      from catalog_items c where c.id = r.item_id;
  end loop;
end $$;
revoke all on function public.order_consume(uuid) from public, anon, authenticated;

-- отмена заказа до начала работ → материалы возвращаются на склад
create or replace function public.order_unconsume(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if exists (select 1 from item_stage_marks m join order_items i on i.id = m.order_item_id where i.order_id = p_order) then return; end if;
  insert into stock_movements(item_id, part, qty, kind, order_id, unit_cost, note, created_by)
  select item_id, part, -sum(qty), 'return', p_order, max(unit_cost), 'Buyurtma bekor qilindi', public.my_id()
    from stock_movements where order_id = p_order and kind in ('consume', 'return')
   group by item_id, part having sum(qty) <> 0;
end $$;
revoke all on function public.order_unconsume(uuid) from public, anon;
grant execute on function public.order_unconsume(uuid) to authenticated;   -- вызывается из set_order_status (security invoker)

-- send_to_shop (из 009) + списание материалов
create or replace function public.send_to_shop(p_order uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v orders; v_resend boolean;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  select * into v from orders where id = p_order;
  if v.id is null then raise exception 'Buyurtma topilmadi'; end if;
  if v.status not in ('new', 'in_production') then raise exception 'Bu holatdagi buyurtma sexga yuborilmaydi'; end if;
  if not exists (select 1 from order_items where order_id = p_order) then raise exception 'Buyurtmada oyna yo''q'; end if;
  v_resend := v.shop_sent_at is not null;
  update orders set status = 'in_production', shop_sent_at = now(), shop_sent_by = public.my_id(),
                    shop_reminded_at = null, shop_escalated_at = null
  where id = p_order;
  perform public.order_consume(p_order);
  perform public.notify('ishlab', null,
    case when v_resend then '🔁 Buyurtma o''zgardi — qayta tekshiring' else '🆕 Yangi buyurtma' end || E'\n'
    || public.shop_order_text(p_order) || E'\n\nSizda material yetadimi?',
    jsonb_build_object('kind', 'material_check', 'order_id', p_order));
  return jsonb_build_object('ok', true, 'resend', v_resend,
    'recipients', (select count(*) from employees where role = 'ishlab' and is_active and telegram_id is not null));
end $$;

-- set_order_status (из 007) + возврат материалов при отмене
create or replace function public.set_order_status(p_order uuid, p_status text)
returns void language plpgsql security invoker set search_path = public as $$
declare v_debt numeric; v_cur text; v_years int;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if p_status not in ('unknown','new','in_production','ready','installing','installed','closed','cancelled') then raise exception 'Holat noto''g''ri'; end if;
  select o.status, o.contract_price - coalesce((select sum(amount) from payments where order_id = o.id), 0)
    into v_cur, v_debt from orders o where o.id = p_order;
  if v_cur is null then raise exception 'Buyurtma topilmadi'; end if;
  if p_status = 'closed' then
    if v_cur not in ('installed', 'closed', 'unknown') then raise exception 'Avval «O''rnatildi» holatiga o''tkazing'; end if;
    if v_debt > 0 then raise exception 'Qarz bor: %', to_char(v_debt, 'FM999G999G999G990'); end if;
  end if;
  if p_status = 'unknown' and v_cur not in ('closed', 'unknown') then raise exception 'Bu holatga faqat yopilgan import buyurtma qaytadi'; end if;
  select coalesce((value #>> '{}')::int, 5) into v_years from app_settings where key = 'warranty_years';
  update orders set
    status = p_status,
    install_date = case when p_status = 'installed' or (p_status = 'closed' and v_cur <> 'unknown') then coalesce(install_date, current_date) else install_date end,
    closed_at = case when p_status = 'closed' then coalesce(closed_at, now()) else null end,
    warranty_until = case when p_status = 'closed' then coalesce(install_date, created_at::date, current_date) + make_interval(years => coalesce(v_years, 5))
                          when p_status = 'unknown' then null else warranty_until end
  where id = p_order;
  if p_status = 'cancelled' and v_cur <> 'cancelled' then perform public.order_unconsume(p_order); end if;
end $$;

revoke all on function public.record_purchase(jsonb), public.reverse_purchase(uuid, text), public.record_supplier_payment(uuid, numeric, date, text),
  public.reverse_supplier_payment(uuid, text), public.stock_count(jsonb) from public, anon;
grant execute on function public.record_purchase(jsonb), public.reverse_purchase(uuid, text), public.record_supplier_payment(uuid, numeric, date, text),
  public.reverse_supplier_payment(uuid, text), public.stock_count(jsonb) to authenticated;
