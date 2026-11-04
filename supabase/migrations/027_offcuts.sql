-- ECOROM 027: учёт обрезков профиля и раскрой. Обрезок = кусок хлыста («2,1 м»), который остался после резки и пригоден для следующего заказа.
-- Это реестр поверх склада в метрах: метры заказа списываются при «Sexga yuborish» как раньше, а обрезки показывают, ЧТО именно лежит в цехе.
-- Раскрой заказа (экран заказа) сначала берёт подходящие обрезки, потом новые хлысты; результат (какие обрезки ушли, какие остались) записывается RPC apply_cutting.
create table if not exists public.offcuts (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.catalog_items(id),
  part text not null check (part in ('rama', 'impost', 'tavaqa', 'shtapik')),
  length_mm int not null check (length_mm > 0),
  note text,
  source_order_id uuid references public.orders(id) on delete set null,   -- из какого заказа остался (null — внесён вручную)
  created_at timestamptz not null default now(),
  created_by uuid references public.employees(id),
  used_at timestamptz,
  used_order_id uuid references public.orders(id) on delete set null
);
create index if not exists offcuts_free on public.offcuts (item_id, part) where used_at is null;
alter table public.offcuts enable row level security;
drop policy if exists rahbar_all on public.offcuts;
create policy rahbar_all on public.offcuts for all to authenticated using (public.is_rahbar()) with check (public.is_rahbar());

insert into public.app_settings (key, value) values ('saw_kerf_mm', '4'), ('offcut_min_mm', '300') on conflict (key) do nothing;

-- записать результат раскроя заказа: p_used — id обрезков, которые пошли в дело; p_new — [{item_id, part, length_mm}] новые остатки
create or replace function public.apply_cutting(p_order uuid, p_used uuid[], p_new jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int := 0;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if not exists (select 1 from orders where id = p_order) then raise exception 'Buyurtma topilmadi'; end if;
  if exists (select 1 from offcuts where source_order_id = p_order or used_order_id = p_order) then
    raise exception 'Bu buyurtma uchun raskroy allaqachon yozilgan (obrezklarni o''chirib qaytadan hisoblash mumkin)';
  end if;
  update offcuts set used_at = now(), used_order_id = p_order where id = any(coalesce(p_used, '{}')) and used_at is null;
  insert into offcuts(item_id, part, length_mm, source_order_id, created_by)
    select (x->>'item_id')::uuid, x->>'part', (x->>'length_mm')::int, p_order, public.my_id()
      from jsonb_array_elements(coalesce(p_new, '[]'::jsonb)) x where (x->>'length_mm')::int > 0;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.apply_cutting(uuid, uuid[], jsonb) from public, anon;
grant execute on function public.apply_cutting(uuid, uuid[], jsonb) to authenticated;
