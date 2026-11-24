-- ECOROM 052 (24.11.2026, замечание Asad п. 8): склад — можно добавлять любое сырьё свободным вводом (название и единица — любые буквы/цифры).
-- Единица измерения больше не ограничена тремя значениями (m, m2, pcs): допускается любой короткий текст (kg, litr, rulon, list…).
alter table public.catalog_items drop constraint if exists catalog_items_unit_check;
alter table public.catalog_items add constraint catalog_items_unit_check check (char_length(trim(unit)) between 1 and 20);

-- Rahbar: новая позиция склада + начальный остаток. Вид «extra» не участвует в расчёте окон, поэтому цены заказов не меняются.
create or replace function public.add_stock_item(p_name text, p_unit text, p_qty numeric default 0, p_price numeric default 0) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text := trim(coalesce(p_name, '')); v_unit text := trim(coalesce(p_unit, ''));
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if v_name = '' or char_length(v_name) > 120 then raise exception 'Nomini kiriting (120 belgigacha)'; end if;
  if v_unit = '' or char_length(v_unit) > 20 then raise exception 'O''lchov birligini kiriting (masalan: m, kg, dona, litr)'; end if;
  if coalesce(p_qty, 0) < 0 or coalesce(p_price, 0) < 0 then raise exception 'Miqdor va narx manfiy bo''lmasin'; end if;
  if exists (select 1 from catalog_items where kind = 'extra' and lower(name) = lower(v_name)) then raise exception 'Bunday nomli material allaqachon bor'; end if;
  insert into catalog_items(kind, name, unit, price, params, stock_tracked, sort)
  values ('extra', v_name, v_unit, coalesce(p_price, 0), '{}'::jsonb, true, coalesce((select max(sort) from catalog_items where kind = 'extra'), 0) + 1)
  returning id into v_id;
  if coalesce(p_qty, 0) > 0 then
    insert into stock_movements(item_id, part, qty, kind, unit_cost, created_by) values (v_id, '', p_qty, 'adjust', coalesce(p_price, 0), public.my_id());
  end if;
  return v_id;
end $$;
revoke all on function public.add_stock_item(text, text, numeric, numeric) from public, anon;
grant execute on function public.add_stock_item(text, text, numeric, numeric) to authenticated;
notify pgrst, 'reload schema';
