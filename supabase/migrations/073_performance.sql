-- ECOROM 073: скорость при большом объёме (нагрузочный тест: scripts/scale/run.mjs).
--  1. Политики RLS: is_rahbar()/my_id()/my_role()/auth.uid() вычислялись ДЛЯ КАЖДОЙ СТРОКИ; в виде (select …) они вычисляются один раз на запрос (InitPlan) —
--     тяжёлые представления (v_order_paid, v_cash_balance, v_stock_balance, списки заказов) ускоряются в разы. Смысл политик не меняется.
--  2. Индексы под реальные запросы: платежи по заказу и дате, закупки/оплаты поставщиков, заказы по дате/статусу, уведомления, журнал, отметки.
-- Откат: удалить индексы (drop index …), политики вернуть без (select …) — функционально эквивалентны.

-- ============ 1. RLS: один вызов на запрос ============
do $$
declare p record; v_q text; v_w text; v_sql text;
begin
  for p in select schemaname, tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    v_q := p.qual; v_w := p.with_check;
    if v_q is not null then
      v_q := regexp_replace(v_q, '(?<!select )(?<![\w.])(public\.)?(is_rahbar|my_id|my_role)\(\)', '(select \2())', 'g');
      v_q := regexp_replace(v_q, '(?<!select )auth\.uid\(\)', '(select auth.uid())', 'g');
    end if;
    if v_w is not null then
      v_w := regexp_replace(v_w, '(?<!select )(?<![\w.])(public\.)?(is_rahbar|my_id|my_role)\(\)', '(select \2())', 'g');
      v_w := regexp_replace(v_w, '(?<!select )auth\.uid\(\)', '(select auth.uid())', 'g');
    end if;
    if v_q is distinct from p.qual or v_w is distinct from p.with_check then
      v_sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename)
               || case when v_q is not null then ' using (' || v_q || ')' else '' end
               || case when v_w is not null then ' with check (' || v_w || ')' else '' end;
      execute v_sql;
    end if;
  end loop;
end $$;

-- ============ 2. индексы ============
create index if not exists payments_order_idx on public.payments (order_id);
create index if not exists payments_paid_at_idx on public.payments (paid_at);
create index if not exists supplier_payments_supplier_idx on public.supplier_payments (supplier_id);
create index if not exists supplier_payments_paid_at_idx on public.supplier_payments (paid_at);
create index if not exists purchases_supplier_idx on public.purchases (supplier_id);
create index if not exists purchases_purchased_at_idx on public.purchases (purchased_at);
create index if not exists purchase_items_purchase_idx on public.purchase_items (purchase_id);
create index if not exists purchase_items_item_idx on public.purchase_items (item_id);
create index if not exists salary_payouts_paid_at_idx on public.salary_payouts (paid_at);
create index if not exists expenses_order_idx on public.expenses (order_id) where order_id is not null;
create index if not exists expenses_dup_idx on public.expenses (created_by, created_at desc);
create index if not exists orders_created_at_idx on public.orders (created_at);
create index if not exists orders_status_no_idx on public.orders (status, order_no desc);
create index if not exists orders_install_date_idx on public.orders (install_date) where install_date is not null;
create index if not exists stock_movements_created_at_idx on public.stock_movements (created_at);
create index if not exists notifications_employee_idx on public.notifications (employee_id, created_at desc);
create index if not exists notifications_pending_idx on public.notifications (created_at) where sent_at is null;
create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_row_idx on public.audit_log (table_name, row_id);
create index if not exists item_stage_marks_done_at_idx on public.item_stage_marks (done_at);
create index if not exists install_job_members_emp_idx on public.install_job_members (employee_id);
create index if not exists install_jobs_driver_idx on public.install_jobs (driver_id) where driver_id is not null;
