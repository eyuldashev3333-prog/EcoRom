-- ECOROM 024: (1) монтаж: одно фото на окно вместо фото на каждую часть; (2) бой стекла «платит завод» списывается из кассы.

-- ===== 1. одно фото на окно =====
create table if not exists public.install_item_photos (
  order_item_id uuid primary key references public.order_items(id) on delete cascade,
  photo_path text not null,
  taken_by uuid references public.employees(id),
  taken_at timestamptz not null default now()
);
alter table public.install_item_photos enable row level security;
drop policy if exists rahbar_all on public.install_item_photos;
create policy rahbar_all on public.install_item_photos for all to authenticated using (public.is_rahbar()) with check (public.is_rahbar());

-- монтажник видит фото окон только своих заказов (w_orders считает «мои» по my_id)
create or replace function public.install_item_mine(p_item uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from order_items i join w_orders w on w.id = i.order_id where i.id = p_item)
$$;
revoke all on function public.install_item_mine(uuid) from public, anon;
grant execute on function public.install_item_mine(uuid) to authenticated;
drop policy if exists montajchi_read on public.install_item_photos;
create policy montajchi_read on public.install_item_photos for select to authenticated using (public.my_role() = 'montajchi' and public.install_item_mine(order_item_id));

create or replace function public.set_install_photo(p_item uuid, p_photo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.my_id(); v_role text := public.my_role(); v_order orders;
begin
  if v_me is null or v_role not in ('rahbar', 'montajchi') then raise exception 'Bu amal sizga ruxsat etilmagan'; end if;
  select o.* into v_order from orders o join order_items i on i.order_id = o.id where i.id = p_item;
  if v_order.id is null then raise exception 'Pozitsiya topilmadi'; end if;
  if v_role = 'montajchi' and not public.install_item_mine(p_item) then raise exception 'Bu buyurtma sizga biriktirilmagan'; end if;
  if v_order.status not in ('ready', 'installing', 'installed') then raise exception 'Buyurtma hali sexdan chiqmagan yoki yopilgan'; end if;
  if split_part(p_photo, '/', 1) <> v_order.id::text then raise exception 'Foto yo''li noto''g''ri'; end if;
  insert into install_item_photos(order_item_id, photo_path, taken_by) values (p_item, p_photo, v_me)
  on conflict (order_item_id) do update set photo_path = excluded.photo_path, taken_by = excluded.taken_by, taken_at = now();
end $$;
revoke all on function public.set_install_photo(uuid, text) from public, anon;
grant execute on function public.set_install_photo(uuid, text) to authenticated;

-- mark_install: фото нужно один раз на окно — при отметке последней части (если у окна ещё нет фото)
do $$
declare v_src text;
begin
  select pg_get_functiondef('public.mark_install(uuid,text,boolean,text)'::regprocedure) into v_src;
  v_src := replace(v_src,
    $q$if v_role = 'montajchi' and coalesce(v_need_photo, true) and p_photo is null then raise exception 'Foto kerak'; end if;$q$,
    $q$if v_role = 'montajchi' and coalesce(v_need_photo, true) and p_photo is null
       and (select count(*) from install_marks where order_item_id = p_item) + 1 >= public.install_parts_needed(v_item.options)
       and not exists (select 1 from install_item_photos where order_item_id = p_item)
       and not exists (select 1 from install_marks where order_item_id = p_item and photo_path is not null)
    then raise exception 'Oynaning fotosini yuklang (1 ta foto yetarli)'; end if;$q$);
  if v_src not like '%install_item_photos%' then raise exception 'не удалось обновить mark_install'; end if;
  execute v_src;
end $$;

-- ===== 2. бой стекла → касса =====
alter table public.expenses drop constraint if exists expenses_source_check;
alter table public.expenses add constraint expenses_source_check check (source in ('web', 'telegram', 'import', 'breakage'));
-- без внешнего ключа: журнал расходов не правится, а запись боя можно удалить (тогда триггер ниже отменяет расход встречной записью)
alter table public.expenses add column if not exists breakage_id uuid;
alter table public.expenses drop constraint if exists expenses_breakage_id_fkey;
insert into public.expense_categories (name, note) values ('OYNA SINISHI', 'Бой стекла, платит завод (из кассы)') on conflict (name) do nothing;

-- приводит запись в кассе в соответствие с решением по бою: платит завод и решено → расход на сумму боя; иначе нет расхода
create or replace function public.sync_breakage_cash(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b glass_breakages; v_ord expenses; v_want numeric; v_no int; v_cat int;
begin
  select * into b from glass_breakages where id = p_id;
  if b.id is null then return; end if;
  v_want := case when b.payer = 'factory' and b.decided then coalesce(b.amount, 0) else 0 end;
  select * into v_ord from expenses x where x.breakage_id = p_id and x.reverses_id is null
     and not exists (select 1 from expenses r where r.reverses_id = x.id) limit 1;
  if v_ord.id is not null and v_ord.amount <> v_want then
    insert into expenses(category_id, amount, spent_at, note, order_id, source, confirmed, created_by, reverses_id, breakage_id)
    values (v_ord.category_id, -v_ord.amount, v_ord.spent_at, 'Bekor qilindi (oyna sinishi o''zgardi)', v_ord.order_id, 'breakage', true, public.my_id(), v_ord.id, p_id);
    v_ord := null;
  end if;
  if v_ord.id is null and v_want > 0 then
    select id into v_cat from expense_categories where name = 'OYNA SINISHI';
    select order_no into v_no from orders where id = b.order_id;
    insert into expenses(category_id, amount, spent_at, note, order_id, source, confirmed, created_by, breakage_id)
    values (v_cat, v_want, (now() at time zone 'Asia/Tashkent')::date, 'Oyna sinishi №' || v_no || ' (' || b.pieces || ' ta)', b.order_id, 'breakage', true, public.my_id(), p_id);
  end if;
end $$;
revoke all on function public.sync_breakage_cash(uuid) from public, anon, authenticated;

-- решение Rahbar (как в 014) + запись в кассу
create or replace function public.resolve_breakage(p_id uuid, p_payer text, p_amount numeric, p_employee uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if p_payer not in ('installer', 'factory', 'client') then raise exception 'To''lovchi noto''g''ri'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'Summa noto''g''ri'; end if;
  if p_payer = 'installer' and p_employee is null and not exists (select 1 from glass_breakages where id = p_id and employee_id is not null) then
    raise exception 'Kim to''laydi — xodimni tanlang';
  end if;
  update glass_breakages set payer = p_payer, amount = round(p_amount, 2), employee_id = coalesce(p_employee, employee_id),
         decided = true, decided_by = public.my_id(), decided_at = now()
   where id = p_id;
  if not found then raise exception 'Yozuv topilmadi'; end if;
  perform public.sync_breakage_cash(p_id);
end $$;
revoke all on function public.resolve_breakage(uuid, text, numeric, uuid) from public, anon;
grant execute on function public.resolve_breakage(uuid, text, numeric, uuid) to authenticated;

-- запись боя удалили → расход в кассе отменяется встречной записью
create or replace function public.breakage_before_delete() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ord expenses;
begin
  select * into v_ord from expenses x where x.breakage_id = old.id and x.reverses_id is null and not exists (select 1 from expenses r where r.reverses_id = x.id) limit 1;
  if v_ord.id is not null then
    insert into expenses(category_id, amount, spent_at, note, order_id, source, confirmed, created_by, reverses_id)
    values (v_ord.category_id, -v_ord.amount, v_ord.spent_at, 'Bekor qilindi (oyna sinishi yozuvi o''chirildi)', v_ord.order_id, 'breakage', true, public.my_id(), v_ord.id);
  end if;
  return old;
end $$;
drop trigger if exists trg_breakage_before_delete on public.glass_breakages;
create trigger trg_breakage_before_delete before delete on public.glass_breakages for each row execute function public.breakage_before_delete();

-- отчёт: бой «платит завод» уже в потерях → из «расходов» исключаем (иначе дважды), а в движение денег (cash.expenses) добавляем
do $$
declare v_src text;
begin
  select pg_get_functiondef('public.monthly_report_core(date)'::regprocedure) into v_src;
  v_src := replace(v_src, $q$from expenses where confirmed and spent_at >= v_m and spent_at < v_e;$q$, $q$from expenses where confirmed and source <> 'breakage' and spent_at >= v_m and spent_at < v_e;$q$);
  v_src := replace(v_src, $q$where x.confirmed and x.spent_at >= v_m and x.spent_at < v_e group by c.name$q$, $q$where x.confirmed and x.source <> 'breakage' and x.spent_at >= v_m and x.spent_at < v_e group by c.name$q$);
  v_src := replace(v_src, $q$c_exp := e_total;$q$, $q$c_exp := e_total + coalesce((select sum(amount) from expenses where confirmed and source = 'breakage' and spent_at >= v_m and spent_at < v_e), 0);$q$);
  if v_src not like '%source <> ''breakage''%' or v_src not like '%source = ''breakage''%' then raise exception 'не удалось обновить monthly_report_core'; end if;
  execute v_src;
end $$;
revoke all on function public.monthly_report_core(date) from public, anon, authenticated;
