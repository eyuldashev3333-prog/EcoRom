-- ECOROM 012: статус стеклопакетов по позиции: none → ordered (заказали) → arrived (привезли) → installed (поставили).
-- Стекло Rahbar заказывает сам (автозаказа нет), размеры — в карточке. Кто и когда сменил — видно; история — audit_log.
-- Rahbar ставит любой статус; цех — «заказано/привезли» (принимает стекло); «поставлено» — Rahbar (в Фазе 3 — монтажник).
alter table public.order_items
  add column if not exists glass_status_at timestamptz,
  add column if not exists glass_status_by uuid references public.employees(id);

create or replace view public.w_order_items as
  select i.id, i.order_id, i.pos, i.title, i.width_mm, i.height_mm, i.qty, i.design, i.options, i.materials, i.note, i.glass_status,
         i.glass_status_at, (select e.full_name from public.employees e where e.id = i.glass_status_by) as glass_by_name
  from public.order_items i where i.order_id in (select id from public.w_orders);

create or replace function public.set_glass_status(p_items uuid[], p_status text) returns int
language plpgsql security definer set search_path = public as $$
declare v_role text := public.my_role(); v_n int;
begin
  if public.my_id() is null then raise exception 'Kirish kerak'; end if;
  if p_status not in ('none', 'ordered', 'arrived', 'installed') then raise exception 'Holat noto''g''ri'; end if;
  if v_role = 'montajchi' or (v_role = 'ishlab' and p_status not in ('ordered', 'arrived')) then
    raise exception 'Bu holatni faqat rahbar qo''yadi';
  end if;
  if v_role = 'ishlab' and exists (select 1 from order_items where id = any(p_items) and glass_status = 'installed') then
    raise exception 'O''rnatilgan oynani faqat rahbar o''zgartiradi';
  end if;
  if exists (select 1 from order_items i join orders o on o.id = i.order_id where i.id = any(p_items) and o.status in ('closed', 'cancelled')) then
    raise exception 'Buyurtma yopilgan yoki bekor qilingan';
  end if;
  if v_role = 'ishlab' and exists (select 1 from order_items i where i.id = any(p_items) and i.order_id not in (select id from w_orders)) then
    raise exception 'Buyurtma topilmadi';
  end if;
  update order_items set glass_status = p_status, glass_status_at = now(), glass_status_by = public.my_id()
   where id = any(p_items) and glass_status <> p_status;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.set_glass_status(uuid[], text) from public, anon;
grant execute on function public.set_glass_status(uuid[], text) to authenticated;
