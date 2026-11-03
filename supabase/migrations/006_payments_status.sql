-- ECOROM 006: оплаты клиентов (журнал, отмена встречной записью) и смена статуса заказа с правилами.
create unique index if not exists payments_reverses_once on public.payments(reverses_id) where reverses_id is not null;

create or replace function public.record_payment(p_order uuid, p_amount numeric, p_date date default current_date, p_note text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid; v_status text;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Summa noto''g''ri'; end if;
  select status into v_status from orders where id = p_order;
  if v_status is null then raise exception 'Buyurtma topilmadi'; end if;
  if v_status = 'cancelled' then raise exception 'Bekor qilingan buyurtmaga to''lov yozilmaydi'; end if;
  insert into payments(order_id, amount, paid_at, note, received_by)
  values (p_order, round(p_amount, 2), coalesce(p_date, current_date), nullif(trim(p_note), ''), public.my_id())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.reverse_payment(p_payment uuid, p_note text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_orig payments; v_id uuid;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  select * into v_orig from payments where id = p_payment;
  if v_orig.id is null then raise exception 'To''lov topilmadi'; end if;
  if v_orig.reverses_id is not null then raise exception 'Bu bekor qilish yozuvi'; end if;
  if exists (select 1 from payments where reverses_id = p_payment) then raise exception 'Allaqachon bekor qilingan'; end if;
  insert into payments(order_id, amount, paid_at, note, received_by, reverses_id)
  values (v_orig.order_id, -v_orig.amount, current_date, coalesce(nullif(trim(p_note), ''), 'Bekor qilindi'), public.my_id(), p_payment)
  returning id into v_id;
  -- долг снова появился у закрытого заказа → вернуть в «установлен», чтобы отчёты не врали
  update orders set status = 'installed', closed_at = null
  where id = v_orig.order_id and status = 'closed'
    and contract_price - coalesce((select sum(amount) from payments where order_id = v_orig.order_id), 0) > 0;
  return v_id;
end $$;

-- статус: закрыть можно только установленный заказ без долга; при закрытии — гарантия
create or replace function public.set_order_status(p_order uuid, p_status text)
returns void language plpgsql security invoker set search_path = public as $$
declare v_debt numeric; v_install date; v_years int;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if p_status not in ('new','in_production','ready','installing','installed','closed','cancelled') then raise exception 'Holat noto''g''ri'; end if;
  select o.contract_price - coalesce((select sum(amount) from payments where order_id = o.id), 0), o.install_date
    into v_debt, v_install from orders o where o.id = p_order;
  if v_debt is null then raise exception 'Buyurtma topilmadi'; end if;
  if p_status = 'closed' then
    if (select status from orders where id = p_order) not in ('installed', 'closed') then
      raise exception 'Avval «O''rnatildi» holatiga o''tkazing';
    end if;
    if v_debt > 0 then raise exception 'Qarz bor: %', to_char(v_debt, 'FM999G999G999G990'); end if;
  end if;
  select coalesce((value #>> '{}')::int, 5) into v_years from app_settings where key = 'warranty_years';
  update orders set
    status = p_status,
    install_date = case when p_status in ('installed','closed') then coalesce(install_date, current_date) else install_date end,
    closed_at = case when p_status = 'closed' then now() when p_status <> 'closed' then null else closed_at end,
    warranty_until = case when p_status = 'closed' then coalesce(install_date, current_date) + make_interval(years => coalesce(v_years, 5)) else warranty_until end
  where id = p_order;
end $$;

revoke all on function public.record_payment(uuid, numeric, date, text), public.reverse_payment(uuid, text), public.set_order_status(uuid, text) from public, anon;
grant execute on function public.record_payment(uuid, numeric, date, text), public.reverse_payment(uuid, text), public.set_order_status(uuid, text) to authenticated;
