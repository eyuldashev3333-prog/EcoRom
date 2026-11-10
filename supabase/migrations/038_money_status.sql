-- ECOROM 038 (блок 2 плана исправлений): деньги и статусы.
-- H3: оплата — без переплаты (кроме явного «avans»), без дубля, с границами даты; прямая вставка в payments закрыта.
-- H4: допустимые переходы статусов; гарантия сбрасывается при переоткрытии.
-- Ограничения значений в таблицах заказов (M2е на уровне базы).

-- ---------- ограничения значений ----------
alter table public.orders drop constraint if exists orders_values_chk;
alter table public.orders add constraint orders_values_chk check (
  contract_price >= 0 and calc_cost >= 0 and area_m2 >= 0 and windows_count >= 0 and discount_pct >= 0 and discount_pct <= 20);
alter table public.order_items drop constraint if exists order_items_values_chk;
alter table public.order_items add constraint order_items_values_chk check (
  qty > 0 and width_mm > 0 and height_mm > 0 and cost >= 0 and area_m2 >= 0);

-- ---------- оплата ----------
drop function if exists public.record_payment(uuid, numeric, date, text);
create or replace function public.record_payment(p_order uuid, p_amount numeric, p_date date default null, p_note text default null, p_advance boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  o orders; v_id uuid; v_paid numeric; v_debt numeric; v_amt numeric;
  v_today date := (now() at time zone 'Asia/Tashkent')::date;
  v_date date; v_created date;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Summa noto''g''ri'; end if;
  v_amt := round(p_amount, 2);
  if v_amt <= 0 then raise exception 'Summa noto''g''ri'; end if;
  select * into o from orders where id = p_order for update;   -- блокировка заказа: два одновременных клика идут по очереди
  if o.id is null then raise exception 'Buyurtma topilmadi'; end if;
  if o.status = 'cancelled' then raise exception 'Bekor qilingan buyurtmaga to''lov yozilmaydi'; end if;
  v_date := coalesce(p_date, v_today);
  v_created := (o.created_at at time zone 'Asia/Tashkent')::date;
  if v_date > v_today then raise exception 'To''lov sanasi kelajakda bo''lishi mumkin emas'; end if;
  if v_date < v_created - 7 then raise exception 'To''lov sanasi buyurtma sanasidan (%) juda oldin', to_char(v_created, 'DD.MM.YYYY'); end if;
  select coalesce(sum(amount), 0) into v_paid from payments where order_id = p_order;
  v_debt := o.contract_price - v_paid;
  if v_amt > v_debt and not coalesce(p_advance, false) then
    raise exception 'Summa qarzdan ko''p (qarz: %). Avans sifatida yozing', to_char(greatest(v_debt, 0), 'FM999G999G999G990');
  end if;
  if exists (select 1 from payments p where p.order_id = p_order and p.reverses_id is null and p.amount = v_amt
               and p.received_by is not distinct from public.my_id() and p.created_at > now() - interval '2 minutes'
               and not exists (select 1 from payments r where r.reverses_id = p.id)) then
    raise exception 'Bu to''lov hozirgina yozilgan (takror bosildimi?)';
  end if;
  insert into payments(order_id, amount, paid_at, note, received_by)
  values (p_order, v_amt, v_date,
          case when v_amt > v_debt then 'Avans' || coalesce(': ' || nullif(trim(p_note), ''), '') else nullif(trim(p_note), '') end,
          public.my_id())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.reverse_payment(p_payment uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_orig payments; v_id uuid;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  select * into v_orig from payments where id = p_payment for update;
  if v_orig.id is null then raise exception 'To''lov topilmadi'; end if;
  if v_orig.reverses_id is not null then raise exception 'Bu bekor qilish yozuvi'; end if;
  if exists (select 1 from payments where reverses_id = p_payment) then raise exception 'Allaqachon bekor qilingan'; end if;
  insert into payments(order_id, amount, paid_at, note, received_by, reverses_id)
  values (v_orig.order_id, -v_orig.amount, (now() at time zone 'Asia/Tashkent')::date, coalesce(nullif(trim(p_note), ''), 'Bekor qilindi'), public.my_id(), p_payment)
  returning id into v_id;
  -- долг снова появился у закрытого заказа → вернуть в «установлен»; гарантия отсчитывается заново при повторном закрытии
  update orders set status = 'installed', closed_at = null, warranty_until = null
  where id = v_orig.order_id and status = 'closed'
    and contract_price - coalesce((select sum(amount) from payments where order_id = v_orig.order_id), 0) > 0;
  return v_id;
end $$;

create or replace function public.refund_payment(p_payment uuid, p_amount numeric, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_orig payments; v_status text; v_id uuid;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  select * into v_orig from payments where id = p_payment for update;
  if v_orig.id is null then raise exception 'To''lov topilmadi'; end if;
  if v_orig.reverses_id is not null then raise exception 'Bu bekor qilish yozuvi'; end if;
  if exists (select 1 from payments where reverses_id = p_payment) then raise exception 'Allaqachon qaytarilgan yoki bekor qilingan'; end if;
  select status into v_status from orders where id = v_orig.order_id;
  if v_status <> 'cancelled' then raise exception 'Qaytarish faqat bekor qilingan buyurtmada'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > v_orig.amount then raise exception 'Summa noto''g''ri (1 .. %)', v_orig.amount; end if;
  insert into payments(order_id, amount, paid_at, note, received_by, reverses_id)
  values (v_orig.order_id, -round(p_amount, 2), (now() at time zone 'Asia/Tashkent')::date,
          coalesce(nullif(trim(p_note), ''), 'Qaytarildi') || case when p_amount < v_orig.amount then ' (qisman; zavodda qoldi ' || to_char(v_orig.amount - p_amount, 'FM999G999G999G990') || ')' else '' end,
          public.my_id(), p_payment)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.payment_correct(p_id uuid, p_field text, p_value text)
returns uuid language plpgsql security definer set search_path = public as $$
declare o payments; v_ord orders; v_new uuid; n numeric; d date; v text := nullif(trim(coalesce(p_value, '')), '');
        v_today date := (now() at time zone 'Asia/Tashkent')::date; v_paid numeric;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if p_field not in ('amount', 'date', 'note') then raise exception 'Bu maydonni tuzatib bo''lmaydi: %', p_field; end if;
  select * into o from payments where id = p_id for update;
  if o.id is null then raise exception 'To''lov topilmadi'; end if;
  if o.reverses_id is not null or exists (select 1 from payments where reverses_id = p_id) then raise exception 'Bu yozuv allaqachon tuzatilgan'; end if;
  select * into v_ord from orders where id = o.order_id for update;
  if v_ord.status = 'cancelled' then raise exception 'Bekor qilingan buyurtmada to''lov tuzatilmaydi'; end if;
  if p_field = 'amount' then
    n := replace(replace(coalesce(v, ''), ' ', ''), ',', '.')::numeric;
    if n is null or n < 0 then raise exception 'Summa noto''g''ri'; end if;
    select coalesce(sum(amount), 0) into v_paid from payments where order_id = o.order_id;
    if v_paid - o.amount + round(n, 2) > v_ord.contract_price then raise exception 'Summa qarzdan ko''p bo''lib qoladi'; end if;
  elsif p_field = 'date' then
    d := v::date;
    if d > v_today then raise exception 'To''lov sanasi kelajakda bo''lishi mumkin emas'; end if;
    if d < (v_ord.created_at at time zone 'Asia/Tashkent')::date - 7 then raise exception 'To''lov sanasi buyurtma sanasidan juda oldin'; end if;
  end if;
  insert into payments(order_id, amount, paid_at, note, received_by, reverses_id)
  values (o.order_id, -o.amount, o.paid_at, 'Tuzatish (jadvaldan)', public.my_id(), o.id);
  if p_field = 'amount' and n = 0 then return null; end if;
  insert into payments(order_id, amount, paid_at, note, received_by)
  values (o.order_id, case when p_field = 'amount' then round(n, 2) else o.amount end,
          case when p_field = 'date' then d else o.paid_at end,
          case when p_field = 'note' then v else o.note end, public.my_id())
  returning id into v_new;
  return v_new;
end $$;

-- прямая вставка/правка оплат мимо функций закрыта (читать можно)
revoke insert, update, delete, truncate on public.payments from authenticated, anon;

-- ---------- статусы ----------
create or replace function public.set_order_status(p_order uuid, p_status text)
returns void language plpgsql set search_path = public as $$
declare v_debt numeric; v_cur text; v_years int; v_ok boolean;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if p_status not in ('unknown','new','in_production','ready','installing','installed','closed','cancelled') then raise exception 'Holat noto''g''ri'; end if;
  select o.status, o.contract_price - coalesce((select sum(amount) from payments where order_id = o.id), 0)
    into v_cur, v_debt from orders o where o.id = p_order for update;
  if v_cur is null then raise exception 'Buyurtma topilmadi'; end if;
  if v_cur = p_status then return; end if;
  v_ok := case v_cur
    when 'new' then p_status in ('cancelled')
    when 'in_production' then p_status in ('ready', 'cancelled')
    when 'ready' then p_status in ('installing', 'installed', 'cancelled')
    when 'installing' then p_status in ('installed')
    when 'installed' then p_status in ('closed')
    when 'closed' then p_status in ('unknown')
    when 'unknown' then p_status in ('closed')
    when 'cancelled' then p_status in ('new')
    else false end;
  if not v_ok then raise exception 'Holatni «%» dan «%» ga o''zgartirib bo''lmaydi', v_cur, p_status; end if;
  if p_status = 'closed' then
    if v_cur not in ('installed', 'unknown') then raise exception 'Avval «O''rnatildi» holatiga o''tkazing'; end if;
    if v_debt > 0 then raise exception 'Qarz bor: %', to_char(v_debt, 'FM999G999G999G990'); end if;
  end if;
  select coalesce((value #>> '{}')::int, 5) into v_years from app_settings where key = 'warranty_years';
  update orders set
    status = p_status,
    install_date = case when p_status = 'installed' or (p_status = 'closed' and v_cur <> 'unknown') then coalesce(install_date, current_date) else install_date end,
    closed_at = case when p_status = 'closed' then coalesce(closed_at, now()) else null end,
    warranty_until = case when p_status = 'closed' then coalesce(install_date, created_at::date, current_date) + make_interval(years => coalesce(v_years, 5))
                          else null end
  where id = p_order;
  if p_status = 'cancelled' then perform public.order_unconsume(p_order); end if;
end $$;
