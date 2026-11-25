-- ECOROM 060: деньги, склад, статусы и журналы меняются ТОЛЬКО через функции системы (RPC) — прямая запись в таблицы через REST закрыта.
-- Тест №3 показал: Rahbar (и любой, у кого есть токен Rahbar) мог через REST: закрыть заказ с долгом (PATCH orders.status=closed), поставить цену ниже
-- оплаченного, вставить расходы/выплаты/движения склада/закупки/платежи поставщикам с датой 2099, подделать audit_log. UI так не пишет — он вызывает функции.
-- Механизм: BEFORE-триггер guard_rpc_only. Прямой запрос (роль authenticated/anon) без флага ecorom.rpc отклоняется. Функции системы:
--   * SECURITY DEFINER — работают от владельца, триггер их пропускает (current_user = postgres);
--   * SECURITY INVOKER (save_order, set_order_status, record_expense, …) — получают флаг через ALTER FUNCTION … SET ecorom.rpc = '1' (действует только внутри вызова).
-- service_role (бот, скрипты) пропускается как раньше.
-- Откат: drop trigger trg_00_guard_rpc on <таблица>; alter function … reset ecorom.rpc; восстановить set_order_status из 055.

-- ============ 1. guard_rpc_only ============
create or replace function public.guard_rpc_only() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and coalesce(current_setting('ecorom.rpc', true), '') <> '1' then
    raise exception 'To''g''ridan-to''g''ri yozib bo''lmaydi (%): tizim funksiyasi orqali bajaring', tg_table_name;
  end if;
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['expenses', 'salary_payouts', 'stock_movements', 'purchases', 'purchase_items', 'supplier_payments', 'audit_log', 'orders', 'order_items', 'clients'] loop
    execute format('drop trigger if exists trg_00_guard_rpc on public.%I', t);
    execute format('create trigger trg_00_guard_rpc before insert or update or delete on public.%I for each row execute function public.guard_rpc_only()', t);
  end loop;
end $$;

-- функции-«инвокеры», которые пишут в эти таблицы от имени вызвавшего: в начало тела добавляем флаг на время транзакции вызова
-- (ALTER FUNCTION … SET для своего параметра на Supabase запрещён, поэтому set_config внутри тела)
do $$
declare r record; v_src text; v_new text;
begin
  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('expense_correct', 'record_expense', 'record_purchase', 'record_supplier_payment', 'registratsiya_add',
                  'registratsiya_set', 'reverse_purchase', 'reverse_supplier_payment', 'save_order', 'stock_count') loop
    v_src := pg_get_functiondef(r.oid);
    if v_src like '%ecorom.rpc%' then continue; end if;
    v_new := regexp_replace(v_src, E'\\nbegin\\n', E'\nbegin\n  perform set_config(''ecorom.rpc'', ''1'', true);\n');
    if v_new = v_src then raise exception 'не нашёл begin в %', r.proname; end if;
    execute v_new;
  end loop;
end $$;
-- ============ 2. даты проводок: не в будущем и не раньше 2020 ============
create or replace function public.guard_ledger_date() returns trigger
language plpgsql set search_path = public as $$
declare v_d date; v_today date := (now() at time zone 'Asia/Tashkent')::date;
begin
  v_d := (to_jsonb(new) ->> case tg_table_name
           when 'expenses' then 'spent_at'
           when 'salary_payouts' then 'paid_at'
           when 'supplier_payments' then 'paid_at'
           when 'payments' then 'paid_at'
           when 'purchases' then 'purchased_at' end)::date;
  if v_d is not null and (v_d > v_today + 1 or v_d < date '2020-01-01') then
    raise exception 'Sana noto''g''ri (%): kelajakda yoki juda eski bo''lishi mumkin emas', to_char(v_d, 'DD.MM.YYYY');
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['expenses', 'salary_payouts', 'supplier_payments', 'payments', 'purchases'] loop
    execute format('drop trigger if exists trg_01_ledger_date on public.%I', t);
    execute format('create trigger trg_01_ledger_date before insert on public.%I for each row execute function public.guard_ledger_date()', t);
  end loop;
end $$;

-- ============ 3. заказ: цена не ниже оплаченного; закрытый заказ с появившимся долгом возвращается в «установлен» ============
create or replace function public.guard_order_money() returns trigger
language plpgsql set search_path = public as $$
declare v_paid numeric;
begin
  if tg_op = 'UPDATE' and (new.contract_price is distinct from old.contract_price or new.status is distinct from old.status) and new.status <> 'cancelled' then
    select coalesce(sum(amount), 0) into v_paid from payments where order_id = new.id;
    if new.contract_price is distinct from old.contract_price and new.contract_price < v_paid and old.status <> 'cancelled' then
      raise exception 'Shartnoma narxi to''langan summadan (%) kam bo''lishi mumkin emas', to_char(v_paid, 'FM999G999G999G990');
    end if;
    -- долг не может висеть на закрытом заказе: он снова «установлен» (гарантия отсчитывается заново при повторном закрытии)
    if new.status = 'closed' and old.status = 'closed' and new.contract_price - v_paid > 0 then
      new.status := 'installed'; new.closed_at := null; new.warranty_until := null;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_02_order_money on public.orders;
create trigger trg_02_order_money before update on public.orders for each row execute function public.guard_order_money();

-- ============ 4. set_order_status: «Готов → Установлен» мимо монтажника — только с причиной; даты по Ташкенту ============
alter table public.orders add column if not exists status_note text;

drop function if exists public.set_order_status(uuid, text);
create or replace function public.set_order_status(p_order uuid, p_status text, p_reason text default null) returns void
language plpgsql set search_path = public as $$
declare v_debt numeric; v_cur text; v_years int; v_ok boolean; v_imp boolean; v_need_photo boolean; v_today date := (now() at time zone 'Asia/Tashkent')::date; v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  perform set_config('ecorom.rpc', '1', true);
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if p_status not in ('unknown','new','in_production','ready','installing','installed','closed','cancelled') then raise exception 'Holat noto''g''ri'; end if;
  select o.status, o.contract_price - coalesce((select sum(amount) from payments where order_id = o.id), 0), o.is_imported
    into v_cur, v_debt, v_imp from orders o where o.id = p_order for update;
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
  if p_status = 'installed' and v_cur = 'ready' and not coalesce(v_imp, false) and (v_reason is null or length(v_reason) < 3) then
    raise exception 'Montajchisiz «O''rnatildi» qilish uchun sababni yozing. Eslatma: o''rnatish ish haqi hisoblanmaydi';
  end if;
  if p_status = 'closed' then
    if v_cur not in ('installed', 'unknown') then raise exception 'Avval «O''rnatildi» holatiga o''tkazing'; end if;
    if v_debt > 0 then raise exception 'Qarz bor: %', to_char(v_debt, 'FM999G999G999G990'); end if;
    select coalesce((value #>> '{}')::boolean, true) into v_need_photo from app_settings where key = 'install_photo_required';
    if v_cur = 'installed' and not coalesce(v_imp, false) and coalesce(v_need_photo, true) and not public.order_has_install_photo(p_order) then
      raise exception 'O''rnatish fotosi yo''q — o''rnatuvchi ilovadan foto yuklasin';
    end if;
  end if;
  select coalesce((value #>> '{}')::int, 5) into v_years from app_settings where key = 'warranty_years';
  update orders set
    status = p_status,
    status_note = case when v_reason is not null then v_reason else status_note end,
    install_date = case when p_status = 'installed' or (p_status = 'closed' and v_cur <> 'unknown') then coalesce(install_date, v_today) else install_date end,
    closed_at = case when p_status = 'closed' then coalesce(closed_at, now()) else null end,
    warranty_until = case when p_status = 'closed' then coalesce(install_date, (created_at at time zone 'Asia/Tashkent')::date, v_today) + make_interval(years => coalesce(v_years, 5))
                          else null end
  where id = p_order;
  if p_status = 'cancelled' then perform public.order_unconsume(p_order); end if;
end $$;
revoke all on function public.set_order_status(uuid, text, text) from public, anon;
grant execute on function public.set_order_status(uuid, text, text) to authenticated;

-- ============ 5. старые функции-обходы: закрыты для сайта (поток «Qabul qildim → фото → O'rnatildi» идёт через shop_answer / install_done) ============
revoke execute on function public.mark_stage(uuid, integer, boolean) from public, anon, authenticated;
revoke execute on function public.mark_install(uuid, text, boolean, text) from public, anon, authenticated;
revoke execute on function public.set_glass_status(uuid[], text) from public, anon, authenticated;
revoke execute on function public.notify_retry() from public, anon, authenticated;

-- анонимам рабочие функции не нужны (внутри они всё равно проверяют роль)
revoke execute on function public.install_done(uuid, boolean, text[]) from public, anon;
revoke execute on function public.order_glass(uuid, text) from public, anon;
revoke execute on function public.order_has_install_photo(uuid) from public, anon;
revoke execute on function public.record_payment(uuid, numeric, date, text, boolean) from public, anon;
revoke execute on function public.shop_ready(uuid) from public, anon;
revoke execute on function public.stock_receive(uuid, text, numeric, numeric, text) from public, anon;
revoke execute on function public.stock_receive_undo(uuid) from public, anon;
revoke execute on function public.my_work(date) from public, anon;

-- ============ 6. касса видна только Rahbar (раньше цех/монтаж читали v_cash_balance и видели остаток-открытие) ============
create or replace view public.v_cash_balance with (security_invoker = true) as
  with s as (
    select coalesce((select (value #>> '{}')::date from public.app_settings where key = 'cash_start_date'), (now() at time zone 'Asia/Tashkent')::date) as d,
           coalesce((select (value #>> '{}')::numeric from public.app_settings where key = 'cash_opening_balance'), 0) as opening
  )
  select case when public.is_rahbar() or session_user in ('postgres', 'supabase_admin') then
           s.opening
         + (select coalesce(sum(amount), 0) from public.payments where paid_at >= s.d)
         - (select coalesce(sum(amount), 0) from public.expenses where confirmed and spent_at >= s.d)
         - (select coalesce(sum(amount), 0) from public.salary_payouts where paid_at >= s.d)
         - (select coalesce(sum(amount), 0) from public.supplier_payments where paid_at >= s.d) end as cash,
         s.d as since
  from s;
