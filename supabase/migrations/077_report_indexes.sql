-- ECOROM 077: индексы под отчёты месяца — отметки цеха/монтажа и движения склада по дате в часовом поясе Ташкента (то же выражение, что в payroll_lines и monthly_report_core).
-- Откат: drop index item_stage_marks_done_day_idx, stock_movements_created_day_idx.
create index if not exists item_stage_marks_done_day_idx on public.item_stage_marks (((done_at at time zone 'Asia/Tashkent')::date));
create index if not exists stock_movements_created_day_idx on public.stock_movements (((created_at at time zone 'Asia/Tashkent')::date)) where kind = 'adjust';
create index if not exists orders_status_day_idx on public.orders (((status_at at time zone 'Asia/Tashkent')::date)) where status = 'cancelled';