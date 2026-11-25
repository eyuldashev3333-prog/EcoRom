-- ECOROM 069: деньги, склад, закупки — правила и ошибки из теста №3 (D-F6/F11/F16/F17, E-1, E-2a…e, E-4a, E-6, E-PUR5/6/7, E-BOT14).
--  1. Валюта: part_price (цена позиции каталога) теперь в so'm — прайс в «$», а закупки, расход склада, инвентаризация и «закуплено дороже каталога» считаются в so'm
--     (раньше склад «Qiymati», недостача и сравнение цен смешивали $ и so'm). Старые движения расхода/возврата/инвентаризации пересчитаны по курсу.
--  2. REGISTRATSIYA: «jami tannarx» = mahsulot + sbor (если введён только sbor — он учитывается, а не откатывается к calc_cost).
--  3. Выплата зарплаты: больше остатка — только как avans (подтверждение), отключённому сотруднику — только остаток; защита от дубля расхода и прихода (блокировка + 2 минуты).
--  4. Закупки/поставщики: отрицательная доставка и оплата больше стоимости закупки отклоняются; оплата больше долга поставщику — только как avans; отмена «Ombor kirim»
--     снимает и платёж (через stock_receive_undo), нельзя отменить приход, если материал уже израсходован; платёж «Ombor kirim» отдельно не отменяется.
--  5. Отчёт: материал отменённого после «Tayyor» заказа — потеря компании (раньше пропадал со склада без следа в отчёте).
--  6. Отправка в цех: ответ содержит shortage — какие материалы ушли в минус (предупреждение руководителю, отправка не блокируется).
-- Откат: восстановить функции из 011/017/029/043/053/056/035 (+066) и part_price из 011.

-- ============ 1. валюта ============
create or replace function public.part_price(p_item catalog_items, p_part text) returns numeric
language sql stable as $$
  select (case when coalesce(p_part, '') = '' then p_item.price
              else coalesce(nullif(p_item.params->>(case p_part when 'rama' then 'frame' when 'tavaqa' then 'sash' when 'shtapik' then 'bead'
                     when 'rezina' then 'gasket' when 'profil' then 'profile' when 'zaglushka' then 'side_cap' else p_part end), '')::numeric, 0) end)
         * case when (select value #>> '{}' from app_settings where key = 'price_currency') is distinct from (select value #>> '{}' from app_settings where key = 'result_currency')
                 and coalesce((select (value #>> '{}')::numeric from app_settings where key = 'currency_rate'), 0) > 0
                then (select (value #>> '{}')::numeric from app_settings where key = 'currency_rate') else 1 end
$$;

do $$
declare v_rate numeric := coalesce((select (value #>> '{}')::numeric from app_settings where key = 'currency_rate'), 0);
        v_same boolean := (select value #>> '{}' from app_settings where key = 'price_currency') is not distinct from (select value #>> '{}' from app_settings where key = 'result_currency');
begin
  -- движения расхода/возврата/инвентаризации хранили цену каталога в «$»: переводим в so'm (закупки уже в so'm)
  if not v_same and v_rate > 1 and not exists (select 1 from stock_movements where kind in ('consume', 'return', 'adjust') and unit_cost > 1000000) then
    alter table public.stock_movements disable trigger trg_nomut_stock_movements;
    update public.stock_movements set unit_cost = round(unit_cost * v_rate, 2) where kind in ('consume', 'return', 'adjust') and unit_cost is not null and unit_cost > 0;
    alter table public.stock_movements enable trigger trg_nomut_stock_movements;
  end if;
end $$;

-- ============ 2. REGISTRATSIYA: себестоимость = mahsulot + sbor ============
do $$
declare v_def text;
begin
  select pg_get_viewdef('public.v_registratsiya'::regclass, true) into v_def;
  if v_def like '%COALESCE((o.cost_product + COALESCE(o.cost_service%' or v_def like '%coalesce((o.cost_product + coalesce(o.cost_service%' then
    v_def := regexp_replace(v_def, 'COALESCE\(\(o\.cost_product \+ COALESCE\(o\.cost_service, \(0\)::numeric\)\), o\.calc_cost\)', '(COALESCE(o.cost_product, (o.calc_cost - COALESCE(i.works, (0)::numeric))) + COALESCE(o.cost_service, i.works, (0)::numeric))', 'g');
    if v_def like '%o.cost_product + COALESCE(o.cost_service, (0)::numeric)%' then raise exception 'v_registratsiya: замена не сработала'; end if;
    execute 'create or replace view public.v_registratsiya as ' || v_def;
  end if;
end $$;

-- ============ 3. выплата зарплаты: avans ============
do $$
declare v_src text; v_new text;
begin
  select pg_get_functiondef('public.record_salary_payout(uuid, numeric, date, text, text)'::regprocedure) into v_src;
  v_new := replace(v_src, 'p_note text DEFAULT NULL::text)', 'p_note text DEFAULT NULL::text, p_advance boolean DEFAULT false)');
  v_new := replace(v_new, 'declare v_id uuid;', 'declare v_acc numeric; v_paid numeric; v_active boolean; v_id uuid;');
  v_new := replace(v_new, E'  insert into salary_payouts(employee_id, amount, paid_at, period, note, created_by)',
    E'  select coalesce(sum(pm.amount), 0) into v_acc from payroll_month((v_period || ''-01'')::date, p_employee) pm;\n'
    || E'  select coalesce(sum(amount), 0) into v_paid from salary_payouts where employee_id = p_employee and period = v_period;\n'
    || E'  select is_active into v_active from employees where id = p_employee;\n'
    || E'  if round(p_amount, 2) > v_acc - v_paid then\n'
    || E'    if not coalesce(v_active, false) then raise exception ''Xodim faol emas — faqat hisoblangan qoldiqni to''''lash mumkin (qoldiq: %)'', to_char(greatest(v_acc - v_paid, 0), ''FM999G999G999G990''); end if;\n'
    || E'    if not coalesce(p_advance, false) then raise exception ''AVANS: summa hisoblangan qoldiqdan ko''''p (qoldiq: %). Avans sifatida yozing'', to_char(greatest(v_acc - v_paid, 0), ''FM999G999G999G990''); end if;\n'
    || E'  end if;\n'
    || E'  insert into salary_payouts(employee_id, amount, paid_at, period, note, created_by)');
  if v_new = v_src or v_new not like '%AVANS:%' or v_new not like '%p_advance boolean%' then raise exception 'record_salary_payout: замена не сработала'; end if;
  drop function public.record_salary_payout(uuid, numeric, date, text, text);
  execute v_new;
end $$;
revoke all on function public.record_salary_payout(uuid, numeric, date, text, text, boolean) from public, anon;
grant execute on function public.record_salary_payout(uuid, numeric, date, text, text, boolean) to authenticated;

do $$
declare v_src text; v_new text;
begin
  -- 3b. расход: защита от двойного нажатия
  select pg_get_functiondef('public.record_expense(integer, numeric, date, text, uuid, uuid)'::regprocedure) into v_src;
  if v_src not like '%hozirgina yozilgan%' then
    v_new := replace(v_src, E'  insert into expenses(category_id, amount, spent_at, note, for_employee_id, order_id, source, confirmed, created_by)',
      E'  perform pg_advisory_xact_lock(hashtext(''expense:'' || coalesce(public.my_id()::text, '''') || p_category::text || round(p_amount, 2)::text));\n'
      || E'  if exists (select 1 from expenses x where x.created_by is not distinct from public.my_id() and x.category_id = p_category and x.amount = round(p_amount, 2)\n'
      || E'                and x.spent_at = coalesce(p_date, (now() at time zone ''Asia/Tashkent'')::date) and x.note is not distinct from nullif(trim(p_note), '''')\n'
      || E'                and x.reverses_id is null and x.created_at > now() - interval ''2 minutes'' and not exists (select 1 from expenses r where r.reverses_id = x.id)) then\n'
      || E'    raise exception ''Bu xarajat hozirgina yozilgan (takror bosildimi?)'';\n  end if;\n'
      || E'  insert into expenses(category_id, amount, spent_at, note, for_employee_id, order_id, source, confirmed, created_by)');
    if v_new = v_src then raise exception 'record_expense: замена не сработала'; end if;
    execute v_new;
  end if;

  -- 4a. закупка: доставка не отрицательная; оплата не больше стоимости закупки
  select pg_get_functiondef('public.record_purchase(jsonb)'::regprocedure) into v_src;
  if v_src not like '%Yetkazib berish narxi%' then
    v_new := replace(v_src, $q$  if v_paid < 0 then raise exception 'To''lov summasi noto''g''ri'; end if;$q$,
      $q$  if v_paid < 0 then raise exception 'To''lov summasi noto''g''ri'; end if;
  if coalesce((p->>'delivery_cost')::numeric, 0) < 0 then raise exception 'Yetkazib berish narxi manfiy bo''lmasin'; end if;
  if v_paid > v_total + coalesce((p->>'delivery_cost')::numeric, 0) then raise exception 'To''lov xarid summasidan ko''p'; end if;$q$);
    if v_new = v_src then raise exception 'record_purchase: замена не сработала'; end if;
    execute v_new;
  end if;

  -- 4b. оплата поставщику больше долга — только как avans
  select pg_get_functiondef('public.record_supplier_payment(uuid, numeric, date, text)'::regprocedure) into v_src;
  v_new := replace(v_src, 'p_note text DEFAULT NULL::text)', 'p_note text DEFAULT NULL::text, p_advance boolean DEFAULT false)');
  v_new := replace(v_new, 'declare v_id uuid;', 'declare v_debt numeric; v_id uuid;');
  v_new := replace(v_new, E'  insert into supplier_payments(supplier_id, amount, paid_at, note, created_by)',
    E'  select coalesce((select sum(total + delivery_cost) from purchases where supplier_id = p_supplier), 0) - coalesce((select sum(amount) from supplier_payments where supplier_id = p_supplier), 0) into v_debt;\n'
    || E'  if round(p_amount, 2) > v_debt and not coalesce(p_advance, false) then raise exception ''AVANS: summa qarzdan ko''''p (qarz: %). Avans sifatida yozing'', to_char(greatest(v_debt, 0), ''FM999G999G999G990''); end if;\n'
    || E'  insert into supplier_payments(supplier_id, amount, paid_at, note, created_by)');
  if v_new = v_src or v_new not like '%AVANS:%' then raise exception 'record_supplier_payment: замена не сработала'; end if;
  drop function public.record_supplier_payment(uuid, numeric, date, text);
  execute v_new;
end $$;
revoke all on function public.record_supplier_payment(uuid, numeric, date, text, boolean) from public, anon;
grant execute on function public.record_supplier_payment(uuid, numeric, date, text, boolean) to authenticated;

do $$
declare v_src text; v_new text;
begin
  -- 4c. отмена закупки: «Ombor kirim» — вместе с платежом; нельзя, если материал уже израсходован
  select pg_get_functiondef('public.reverse_purchase(uuid, text)'::regprocedure) into v_src;
  if v_src not like '%Material allaqachon ishlatilgan%' then
    v_new := replace(v_src, $q$  if exists (select 1 from purchases where reverses_id = p_purchase) then raise exception 'Allaqachon bekor qilingan'; end if;$q$,
      $q$  if exists (select 1 from purchases where reverses_id = p_purchase) then raise exception 'Allaqachon bekor qilingan'; end if;
  if exists (select 1 from supplier_payments sp where sp.note = 'Ombor kirim ' || p_purchase::text and sp.reverses_id is null and not exists (select 1 from supplier_payments r where r.reverses_id = sp.id))
     and coalesce(current_setting('ecorom.undo', true), '') <> '1' then
    perform public.stock_receive_undo(p_purchase);   -- приход «Ombor kirim» снимается вместе с платежом поставщику
    select id into v_id from purchases where reverses_id = p_purchase;
    return v_id;
  end if;
  if exists (select 1 from purchase_items pi where pi.purchase_id = p_purchase
               and (select coalesce(sum(m.qty), 0) from stock_movements m where m.item_id = pi.item_id and m.part = pi.part) < pi.qty) then
    raise exception 'Material allaqachon ishlatilgan — xaridni bekor qilib bo''lmaydi (ombor manfiy bo''lib qoladi)';
  end if;$q$);
    if v_new = v_src then raise exception 'reverse_purchase: замена не сработала'; end if;
    execute v_new;
  end if;

  -- 4d. платёж «Ombor kirim» отдельно не отменяется (иначе приход остаётся без денег и undo застревает)
  select pg_get_functiondef('public.reverse_supplier_payment(uuid, text)'::regprocedure) into v_src;
  if v_src not like '%Ombor «Kirim»ga tegishli%' then
    v_new := replace(v_src, $q$  if exists (select 1 from supplier_payments where reverses_id = p_payment) then raise exception 'Allaqachon bekor qilingan'; end if;$q$,
      $q$  if exists (select 1 from supplier_payments where reverses_id = p_payment) then raise exception 'Allaqachon bekor qilingan'; end if;
  if v.note like 'Ombor kirim %' and coalesce(current_setting('ecorom.undo', true), '') <> '1' then raise exception 'Bu to''lov Ombor «Kirim»ga tegishli — kirimni Ombor sahifasidan bekor qiling'; end if;$q$);
    if v_new = v_src then raise exception 'reverse_supplier_payment: замена не сработала'; end if;
    execute v_new;
  end if;

  -- 4e. stock_receive: блокировка и защита от двойного нажатия; stock_receive_undo разрешает внутренний вызов
  select pg_get_functiondef('public.stock_receive(uuid, text, numeric, numeric, text)'::regprocedure) into v_src;
  if v_src not like '%hozirgina yozilgan%' then
    v_new := replace(v_src, $q$  if not exists (select 1 from catalog_items where id = p_item) then raise exception 'Material topilmadi'; end if;$q$,
      $q$  if not exists (select 1 from catalog_items where id = p_item) then raise exception 'Material topilmadi'; end if;
  perform pg_advisory_xact_lock(hashtext('stock_receive:' || coalesce(v_me::text, '') || p_item::text));
  if exists (select 1 from purchases p join purchase_items pi on pi.purchase_id = p.id
              where p.created_by is not distinct from v_me and pi.item_id = p_item and pi.part = coalesce(p_part, '') and pi.qty = p_qty and p.total = p_total
                and p.reverses_id is null and p.note like 'Ombor%' and p.created_at > now() - interval '2 minutes'
                and not exists (select 1 from purchases r where r.reverses_id = p.id)) then
    raise exception 'Bu kirim hozirgina yozilgan (takror bosildimi?)';
  end if;$q$);
    if v_new = v_src then raise exception 'stock_receive: замена не сработала'; end if;
    execute v_new;
  end if;
  select pg_get_functiondef('public.stock_receive_undo(uuid)'::regprocedure) into v_src;
  if v_src not like '%ecorom.undo%' then
    v_new := replace(v_src, $q$  perform public.reverse_purchase(p_purchase, 'Ombor kirim bekor qilindi');$q$,
      $q$  perform set_config('ecorom.undo', '1', true);
  perform public.reverse_purchase(p_purchase, 'Ombor kirim bekor qilindi');$q$);
    if v_new = v_src then raise exception 'stock_receive_undo: замена не сработала'; end if;
    execute v_new;
  end if;

  -- 4f. бот: отмена закупки снимает и платёж «Ombor kirim»/«Telegram xarid»; нельзя при израсходованном материале
  select pg_get_functiondef('public.purchase_undo(bigint, uuid)'::regprocedure) into v_src;
  if v_src not like '%Material allaqachon ishlatilgan%' then
    v_new := replace(v_src, $q$  insert into purchases(supplier_id, purchased_at, total, delivery_cost, note, created_by, reverses_id)$q$,
      $q$  if exists (select 1 from purchase_items pi where pi.purchase_id = p_purchase
               and (select coalesce(sum(m.qty), 0) from stock_movements m where m.item_id = pi.item_id and m.part = pi.part) < pi.qty) then
    raise exception 'Material allaqachon ishlatilgan — xaridni bekor qilib bo''lmaydi';
  end if;
  insert into purchases(supplier_id, purchased_at, total, delivery_cost, note, created_by, reverses_id)$q$);
    v_new := replace(v_new, $q$where note = 'Telegram xarid ' || p_purchase::text and reverses_id is null limit 1;$q$,
      $q$where (note = 'Telegram xarid ' || p_purchase::text or note = 'Ombor kirim ' || p_purchase::text) and reverses_id is null limit 1;$q$);
    if v_new = v_src or v_new not like '%Ombor kirim%' then raise exception 'purchase_undo: замена не сработала'; end if;
    execute v_new;
  end if;

  -- 5. отчёт: материал отменённого заказа — потеря компании (в месяц отмены)
  select pg_get_functiondef('public.monthly_report_core(date)'::regprocedure) into v_src;
  if v_src not like '%l_cancel%' then
    v_new := replace(v_src, 'l_stock numeric;', 'l_stock numeric; l_cancel numeric;');
    v_new := replace(v_new, E'  select coalesce(sum(amount), 0) into c_in from payments',
      E'  select coalesce(sum(-m.qty * coalesce(m.unit_cost, 0)), 0) into l_cancel from stock_movements m join orders o on o.id = m.order_id\n'
      || E'   where o.status = ''cancelled'' and m.kind in (''consume'', ''return'') and (o.status_at at time zone ''Asia/Tashkent'')::date >= v_m and (o.status_at at time zone ''Asia/Tashkent'')::date < v_e;\n'
      || E'  select coalesce(sum(amount), 0) into c_in from payments');
    v_new := replace(v_new, '- (l_brk + l_svc + l_stock);', '- (l_brk + l_svc + l_stock + l_cancel);');
    v_new := replace(v_new, $q$'stock', l_stock, 'total', l_brk + l_svc + l_stock)$q$, $q$'stock', l_stock, 'cancelled', l_cancel, 'total', l_brk + l_svc + l_stock + l_cancel)$q$);
    if v_new = v_src or v_new not like '%l_stock + l_cancel);%' or v_new not like '%''cancelled'', l_cancel%' then raise exception 'monthly_report_core: потеря отменённых не добавлена'; end if;
    execute v_new;
  end if;

  -- 6. send_to_shop: что ушло в минус (предупреждение)
  select pg_get_functiondef('public.send_to_shop(uuid, boolean, uuid[])'::regprocedure) into v_src;
  if v_src not like '%shortage%' then
    v_new := replace(v_src, 'declare v orders;', 'declare v_short jsonb; v orders;');
    v_new := replace(v_new, E'  perform public.order_consume(p_order);',
      E'  perform public.order_consume(p_order);\n'
      || E'  select coalesce(jsonb_agg(jsonb_build_object(''name'', b.name, ''qty'', b.qty, ''unit'', b.unit)), ''[]''::jsonb) into v_short from v_stock_balance b\n'
      || E'   where b.qty < 0 and exists (select 1 from stock_movements m where m.order_id = p_order and m.item_id = b.item_id and m.part = b.part);');
    v_new := replace(v_new, $q$'recipients', (select count(*) from employees where id = any(v_sel) and telegram_id is not null));$q$,
                            $q$'recipients', (select count(*) from employees where id = any(v_sel) and telegram_id is not null), 'shortage', v_short);$q$);
    if v_new = v_src or v_new not like '%''shortage'', v_short%' then raise exception 'send_to_shop: shortage не добавлен'; end if;
    execute v_new;
  end if;
end $$;
