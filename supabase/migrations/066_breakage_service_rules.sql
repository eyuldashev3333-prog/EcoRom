-- ECOROM 066: бой стекла и сервис по правилам Asad (25.11.2026); даты по Ташкенту; гонка «O'rnatildi».
-- Правило: при бое/сервисе руководитель САМ выбирает, кто платит, и пишет сумму.
--   * платит КОМПАНИЯ (factory) → расход (минус кассе) и потеря в отчёте — ровно один раз, в дату решения;
--   * платит МОНТАЖНИК или КЛИЕНТ → система НИЧЕГО не делает: ни расхода, ни удержания из зарплаты, ни долга, ни потери. Руководитель решает сам (в экране — предупреждение).
-- Исправлено (тест №3): нерешённый бой сразу попадал в потери (C-9c); «платит завод» не двигал кассу (C-9e2); удержание из зарплаты монтажника за бой (C-9f, C-8n) убрано;
-- дубль боя превышал количество окон (C-9b); reverse_expense на расходе боя/сервиса возвращал кассу, но не отчёт (C-8o2, D-F7);
-- current_date (UTC) вместо Ташкента в датах установки/гарантии/закупок (C-7); второй «O'rnatildi» терял фото проигравшего (C-6b).
-- Откат: восстановить функции из 039/035/049/057; категорию OYNA SINISHI можно оставить.

insert into public.expense_categories (name, note) values ('OYNA SINISHI', 'Oyna sinishi, kompaniya to''laydi (kassadan)') on conflict (name) do nothing;

-- 1. бой: расход в кассе только если РЕШЕНО и платит компания
create or replace function public.sync_breakage_cash(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b glass_breakages; v_ord expenses; v_want numeric; v_no bigint; v_cat int;
begin
  select * into b from glass_breakages where id = p_id;
  if b.id is null then return; end if;
  v_want := case when b.decided and b.payer = 'factory' then round(b.amount, 2) else 0 end;
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

-- 2. resolve_breakage: сотрудник необязателен (удержания нет); решение сразу двигает кассу через sync_breakage_cash
create or replace function public.resolve_breakage(p_id uuid, p_payer text, p_amount numeric, p_employee uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if p_payer not in ('installer', 'factory', 'client') then raise exception 'To''lovchi noto''g''ri'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'Summa noto''g''ri'; end if;
  update glass_breakages set payer = p_payer, amount = round(p_amount, 2), employee_id = coalesce(p_employee, employee_id),
         decided = true, decided_by = public.my_id(), decided_at = now()
   where id = p_id;
  if not found then raise exception 'Yozuv topilmadi'; end if;
  perform public.sync_breakage_cash(p_id);
end $$;
revoke all on function public.resolve_breakage(uuid, text, numeric, uuid) from public, anon;
grant execute on function public.resolve_breakage(uuid, text, numeric, uuid) to authenticated;

do $$
declare v_src text; v_new text; r record;
begin
  -- 3. record_breakage: всего разбитых по позиции не больше количества окон
  select pg_get_functiondef('public.record_breakage(uuid, integer, text, text)'::regprocedure) into v_src;
  if v_src not like '%allaqachon qayd etilgan%' then
    v_new := replace(v_src, $q$  if p_photo is not null and split_part(p_photo, '/', 1) <> v_order.id::text then raise exception 'Foto yo''li noto''g''ri'; end if;$q$,
      $q$  if coalesce((select sum(pieces) from glass_breakages where order_item_id = p_item), 0) + coalesce(p_pieces, 1) > v_item.qty then
    raise exception 'Bu pozitsiyada allaqachon % ta oyna sinishi qayd etilgan (jami % ta)', coalesce((select sum(pieces) from glass_breakages where order_item_id = p_item), 0), v_item.qty;
  end if;
  if p_photo is not null and split_part(p_photo, '/', 1) <> v_order.id::text then raise exception 'Foto yo''li noto''g''ri'; end if;$q$);
    if v_new = v_src then raise exception 'record_breakage: замена не сработала'; end if;
    execute v_new;
  end if;

  -- 4. зарплата: удержания за бой больше нет
  select pg_get_functiondef('public.payroll_lines(date)'::regprocedure) into v_src;
  if v_src like '%union all select * from brk_lines%' then
    v_new := replace(v_src, 'union all select * from adj_lines union all select * from brk_lines', 'union all select * from adj_lines');
    if v_new = v_src then raise exception 'payroll_lines: замена не сработала'; end if;
    execute v_new;
  end if;

  -- 5. отчёт: потеря «бой» — только решённое и за счёт компании, в месяц решения (как расход в кассе)
  select pg_get_functiondef('public.monthly_report_core(date)'::regprocedure) into v_src;
  v_new := replace(v_src, $q$select coalesce(sum(amount), 0) into l_brk from glass_breakages where payer = 'factory' and (created_at at time zone 'Asia/Tashkent')::date >= v_m and (created_at at time zone 'Asia/Tashkent')::date < v_e;$q$,
                          $q$select coalesce(sum(amount), 0) into l_brk from glass_breakages where decided and payer = 'factory' and (decided_at at time zone 'Asia/Tashkent')::date >= v_m and (decided_at at time zone 'Asia/Tashkent')::date < v_e;$q$);
  if v_new = v_src and v_src not like '%where decided and payer = ''factory''%' then raise exception 'monthly_report_core: потеря боя не заменена'; end if;
  v_src := v_new;

  -- 6. даты по Ташкенту (во всех функциях, где был current_date)
  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('create_service', 'install_done', 'record_purchase', 'record_supplier_payment', 'reverse_purchase', 'reverse_supplier_payment') loop
    v_new := regexp_replace(pg_get_functiondef(r.oid), 'current_date', E'(now() at time zone ''Asia/Tashkent'')::date', 'gi');
    if r.proname = 'install_done' then
      -- 7. второй «O'rnatildi» (гонка/повтор): фото проигравшего не теряем
      v_new := replace(v_new, $q$if v.status = 'installed' then return jsonb_build_object('ok', true, 'status', 'installed'); end if;$q$,
        $q$if v.status = 'installed' then
    insert into install_order_photos(order_id, photo_path, taken_by)
    select p_order, x, v_me from unnest(coalesce(p_photos, '{}')) x
     where split_part(x, '/', 1) = p_order::text and public.photo_exists(x)
       and not exists (select 1 from install_order_photos o where o.order_id = p_order and o.photo_path = x);
    return jsonb_build_object('ok', true, 'status', 'installed');
  end if;$q$);
      if v_new not like '%photo_path = x);%' then raise exception 'install_done: гонка не заменена'; end if;
    end if;
    execute v_new;
  end loop;
  v_new := regexp_replace(v_src, 'current_date', E'(now() at time zone ''Asia/Tashkent'')::date', 'gi');
  execute v_new;   -- monthly_report_core

  -- 8. расход, порождённый боем/сервисом, не отменяется отдельно (иначе касса вернётся, а отчёт нет): правьте запись боя/сервиса
  select pg_get_functiondef('public.expense_reverse_core(uuid, text, uuid)'::regprocedure) into v_src;
  if v_src not like '%sinish/servisdan%' then
    v_new := replace(v_src, $q$  if v.reverses_id is not null then raise exception 'Bu bekor qilish yozuvi'; end if;$q$,
      $q$  if v.reverses_id is not null then raise exception 'Bu bekor qilish yozuvi'; end if;
  if v.source in ('breakage', 'service') then raise exception 'Bu xarajat sinish/servisdan hosil bo''lgan — uni sinish yoki servis yozuvida o''zgartiring'; end if;$q$);
    if v_new = v_src then raise exception 'expense_reverse_core: замена не сработала'; end if;
    execute v_new;
  end if;
end $$;
