-- ECOROM 007: статус «не указан» для истории без статуса (импорт); переключатель «Yopildi» вкл/выкл.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('unknown','new','in_production','ready','installing','installed','closed','cancelled'));

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
    -- «не указан» (история) можно закрыть сразу; новые — только после установки
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
end $$;
