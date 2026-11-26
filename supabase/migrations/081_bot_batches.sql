-- 081: расходы и закупки руководителя через ИИ (gpt-4.1-mini) — пачкой из одного сообщения.
-- Черновик → «Tasdiqlash» (всё одной транзакцией: расходы, омбор, касса) / «Bekor qilish»; после записи — «↩ Bekor qilish».
-- Только новое: таблица + функции. Старые expense_*/purchase_* не меняются (старые карточки продолжают работать).

create table if not exists public.bot_batches (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null,
  source_text text,
  lines jsonb not null default '[]',       -- проверенные строки (expense / purchase / unclear)
  status text not null default 'draft' check (status in ('draft', 'done', 'cancelled', 'undone')),
  result jsonb,                             -- что реально записано (id расходов/закупок)
  usage jsonb,                              -- токены OpenAI (для расчёта стоимости)
  created_at timestamptz not null default now(),
  done_at timestamptz
);
alter table public.bot_batches enable row level security; -- политик нет: только бот (service_role) через функции
revoke all on public.bot_batches from anon, authenticated;

-- касса для ответа бота: та же формула, что v_cash_balance (вид отдаёт кассу только руководителю на сайте,
-- бот вызывает от service_role — поэтому отдельно; держать в соответствии с v_cash_balance)
create or replace function public.bot_cash()
returns numeric language sql stable security definer set search_path = public as $$
  with s as (
    select coalesce((select (value #>> '{}')::date from app_settings where key = 'cash_start_date'), (now() at time zone 'Asia/Tashkent')::date) d,
           coalesce((select (value #>> '{}')::numeric from app_settings where key = 'cash_opening_balance'), 0) opening)
  select opening
    + (select coalesce(sum(amount), 0) from payments where paid_at >= s.d)
    - (select coalesce(sum(amount), 0) from expenses where confirmed and spent_at >= s.d)
    - (select coalesce(sum(amount), 0) from salary_payouts where paid_at >= s.d)
    - (select coalesce(sum(amount), 0) from supplier_payments where paid_at >= s.d)
  from s
$$;
revoke all on function public.bot_cash() from public, anon, authenticated;

-- проверка строк от ИИ (только техническое: существует ли материал/категория/сотрудник, числа > 0)
create or replace function public.bot_batch_check(p_lines jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare l jsonb; v_out jsonb := '[]'; v_amt numeric; v_qty numeric; v_cat expense_categories; v_emp employees; b record;
begin
  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]')) loop
    v_amt := nullif(l->>'amount', '')::numeric;
    if l->>'kind' = 'expense' then
      select * into v_cat from expense_categories where id = nullif(l->>'category_id', '')::int and is_active;
      v_emp := null;
      if nullif(l->>'employee_id', '') is not null then select * into v_emp from employees where id = (l->>'employee_id')::uuid and is_active; end if;
      if v_amt is null or v_amt <= 0 or v_amt > 999999999999 then
        v_out := v_out || jsonb_build_array(jsonb_build_object('kind', 'unclear', 'text', l->>'text', 'reason', 'summa topilmadi'));
      elsif v_cat.id is null then
        v_out := v_out || jsonb_build_array(jsonb_build_object('kind', 'unclear', 'text', l->>'text', 'reason', 'kategoriya aniqlanmadi'));
      else
        v_out := v_out || jsonb_build_array(jsonb_build_object('kind', 'expense', 'text', l->>'text', 'amount', round(v_amt, 2), 'category_id', v_cat.id, 'category', v_cat.name,
          'employee_id', v_emp.id, 'employee', v_emp.full_name, 'note', left(nullif(trim(coalesce(l->>'note', l->>'text', '')), ''), 200)));
      end if;
    elsif l->>'kind' = 'purchase' then
      v_qty := nullif(l->>'qty', '')::numeric;
      select s.item_id, s.part, s.name, s.unit into b from v_stock_balance s where s.item_id = nullif(l->>'item_id', '')::uuid and s.part = coalesce(l->>'part', '');
      if b.item_id is null then
        v_out := v_out || jsonb_build_array(jsonb_build_object('kind', 'unclear', 'text', l->>'text', 'reason', 'omborda yo''q'));
      elsif v_qty is null or v_qty <= 0 or v_qty > 1000000 then
        v_out := v_out || jsonb_build_array(jsonb_build_object('kind', 'unclear', 'text', l->>'text', 'reason', 'miqdor topilmadi'));
      elsif v_amt is null or v_amt <= 0 or v_amt > 999999999999 then
        v_out := v_out || jsonb_build_array(jsonb_build_object('kind', 'unclear', 'text', l->>'text', 'reason', 'summa topilmadi'));
      else
        v_out := v_out || jsonb_build_array(jsonb_build_object('kind', 'purchase', 'text', l->>'text', 'amount', round(v_amt, 2), 'qty', round(v_qty, 3),
          'item_id', b.item_id, 'part', b.part, 'name', b.name, 'unit', b.unit));
      end if;
    else
      v_out := v_out || jsonb_build_array(jsonb_build_object('kind', 'unclear', 'text', l->>'text', 'reason', coalesce(nullif(l->>'reason', ''), 'tushunarsiz')));
    end if;
  end loop;
  return v_out;
end $$;

create or replace function public.bot_batch_create(p_tg bigint, p_text text, p_lines jsonb, p_usage jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v bot_batches;
begin
  if public.expense_actor(p_tg) is null then raise exception 'Faqat rahbar'; end if;
  delete from bot_batches where status = 'draft' and created_at < now() - interval '2 days';
  insert into bot_batches(telegram_id, source_text, lines, usage) values (p_tg, left(p_text, 4000), public.bot_batch_check(p_lines), p_usage) returning * into v;
  return jsonb_build_object('id', v.id, 'lines', v.lines);
end $$;

-- запись: всё или ничего; повторное нажатие не пишет второй раз
create or replace function public.bot_batch_confirm(p_tg bigint, p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_actor uuid := public.expense_actor(p_tg); v bot_batches; l jsonb; v_date date := (now() at time zone 'Asia/Tashkent')::date;
        v_sup uuid; v_p uuid; v_e uuid; v_lines jsonb; exps jsonb := '[]'; purs jsonb := '[]'; v_et numeric := 0; v_pt numeric := 0; v_cash numeric;
begin
  if v_actor is null then raise exception 'Faqat rahbar'; end if;
  select * into v from bot_batches where id = p_id and telegram_id = p_tg for update;
  if v.id is null then raise exception 'Qoralama topilmadi'; end if;
  if v.status = 'done' then raise exception 'Allaqachon yozilgan'; end if;
  if v.status <> 'draft' then raise exception 'Bu qoralama bekor qilingan'; end if;
  v_lines := public.bot_batch_check(v.lines); -- ещё раз: материал/категория могли измениться
  for l in select * from jsonb_array_elements(v_lines) loop
    if l->>'kind' = 'expense' then
      insert into expenses(category_id, amount, spent_at, note, for_employee_id, source, confirmed, created_by)
      values ((l->>'category_id')::int, (l->>'amount')::numeric, v_date, l->>'note', nullif(l->>'employee_id', '')::uuid, 'telegram', true, v_actor) returning id into v_e;
      exps := exps || jsonb_build_array(jsonb_build_object('id', v_e, 'amount', (l->>'amount')::numeric, 'category', l->>'category', 'note', l->>'note', 'employee', l->>'employee'));
      v_et := v_et + (l->>'amount')::numeric;
    elsif l->>'kind' = 'purchase' then
      if v_sup is null then
        select id into v_sup from suppliers where name = 'Bot / noma''lum';
        if v_sup is null then insert into suppliers(name, note) values ('Bot / noma''lum', 'Telegram bot orqali yozilgan xaridlar') returning id into v_sup; end if;
      end if;
      insert into purchases(supplier_id, purchased_at, total, delivery_cost, note, created_by)
      values (v_sup, v_date, (l->>'amount')::numeric, 0, 'Telegram: ' || left(l->>'text', 150), v_actor) returning id into v_p;
      insert into purchase_items(purchase_id, item_id, part, qty, unit_cost)
      values (v_p, (l->>'item_id')::uuid, l->>'part', (l->>'qty')::numeric, round((l->>'amount')::numeric / (l->>'qty')::numeric, 2));
      insert into stock_movements(item_id, part, qty, kind, purchase_id, unit_cost, created_by)
      values ((l->>'item_id')::uuid, l->>'part', (l->>'qty')::numeric, 'purchase', v_p, round((l->>'amount')::numeric / (l->>'qty')::numeric, 2), v_actor);
      -- касса уменьшается через платёж поставщику (как в purchase_confirm; purchase_undo находит его по этой заметке)
      insert into supplier_payments(supplier_id, amount, paid_at, note, created_by) values (v_sup, (l->>'amount')::numeric, v_date, 'Telegram xarid ' || v_p::text, v_actor);
      purs := purs || jsonb_build_array(jsonb_build_object('id', v_p, 'amount', (l->>'amount')::numeric, 'qty', (l->>'qty')::numeric, 'name', l->>'name', 'unit', l->>'unit'));
      v_pt := v_pt + (l->>'amount')::numeric;
    end if;
  end loop;
  if jsonb_array_length(exps) + jsonb_array_length(purs) = 0 then raise exception 'Yoziladigan narsa yo''q'; end if;
  v_cash := public.bot_cash();
  update bot_batches set status = 'done', done_at = now(), lines = v_lines,
    result = jsonb_build_object('expenses', exps, 'purchases', purs, 'expense_total', v_et, 'purchase_total', v_pt)
   where id = p_id;
  return jsonb_build_object('expenses', exps, 'purchases', purs, 'expense_total', v_et, 'purchase_total', v_pt, 'cash', coalesce(v_cash, 0));
end $$;

create or replace function public.bot_batch_cancel(p_tg bigint, p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v bot_batches;
begin
  if public.expense_actor(p_tg) is null then raise exception 'Faqat rahbar'; end if;
  select * into v from bot_batches where id = p_id and telegram_id = p_tg for update;
  if v.id is null then raise exception 'Qoralama topilmadi'; end if;
  if v.status = 'done' then raise exception 'Allaqachon yozilgan — «↩ Bekor qilish» tugmasidan foydalaning'; end if;
  update bot_batches set status = 'cancelled' where id = p_id and status = 'draft';
  return jsonb_build_object('ok', true);
end $$;

-- отмена уже записанного: расходы — встречной записью; закупки — как purchase_undo (если материал не израсходован)
create or replace function public.bot_batch_undo(p_tg bigint, p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_actor uuid := public.expense_actor(p_tg); v bot_batches; x jsonb; v_et numeric := 0; v_pt numeric := 0; failed jsonb := '[]'; v_cash numeric;
begin
  if v_actor is null then raise exception 'Faqat rahbar'; end if;
  select * into v from bot_batches where id = p_id and telegram_id = p_tg for update;
  if v.id is null then raise exception 'Topilmadi'; end if;
  if v.status = 'undone' then raise exception 'Allaqachon bekor qilingan'; end if;
  if v.status <> 'done' then raise exception 'Hali yozilmagan'; end if;
  for x in select * from jsonb_array_elements(v.result->'expenses') loop
    begin
      perform public.expense_reverse_core((x->>'id')::uuid, 'Botda bekor qilindi', v_actor);
      v_et := v_et + (x->>'amount')::numeric;
    exception when others then
      failed := failed || jsonb_build_array(jsonb_build_object('name', coalesce(x->>'note', x->>'category'), 'reason', sqlerrm));
    end;
  end loop;
  for x in select * from jsonb_array_elements(v.result->'purchases') loop
    begin
      perform public.purchase_undo(p_tg, (x->>'id')::uuid);
      v_pt := v_pt + (x->>'amount')::numeric;
    exception when others then
      failed := failed || jsonb_build_array(jsonb_build_object('name', x->>'name', 'reason', sqlerrm));
    end;
  end loop;
  update bot_batches set status = 'undone', result = result || jsonb_build_object('undo_failed', failed) where id = p_id;
  v_cash := public.bot_cash();
  return jsonb_build_object('expense_total', v_et, 'purchase_total', v_pt, 'failed', failed, 'cash', coalesce(v_cash, 0));
end $$;

revoke all on function public.bot_batch_check(jsonb) from public, anon, authenticated;
revoke all on function public.bot_batch_create(bigint, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.bot_batch_confirm(bigint, uuid) from public, anon, authenticated;
revoke all on function public.bot_batch_cancel(bigint, uuid) from public, anon, authenticated;
revoke all on function public.bot_batch_undo(bigint, uuid) from public, anon, authenticated;
grant execute on function public.bot_batch_create(bigint, text, jsonb, jsonb) to service_role;
grant execute on function public.bot_batch_confirm(bigint, uuid) to service_role;
grant execute on function public.bot_batch_cancel(bigint, uuid) to service_role;
grant execute on function public.bot_batch_undo(bigint, uuid) to service_role;
