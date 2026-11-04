-- ECOROM 032: итоги месяцев из таблицы SAVDO BOLIMI владельца (HIZMAT, FAQAT-RASXOD, SOF-FOYDA, PRIXOD, касса) —
-- справочно, для сверки с цифрами системы по прошлым месяцам. Заполняется скриптом scripts/import-savdo-totals.mjs; в расчётах не участвует.
create table if not exists public.legacy_savdo (
  month text primary key check (month ~ '^\d{4}-\d{2}$'),
  hizmat numeric(16,2),
  faqat_rasxod numeric(16,2),
  sof_foyda numeric(16,2),
  prixod numeric(16,2),
  rasxod_kassa numeric(16,2),
  ostatka numeric(16,2),
  sheet text,
  imported_at timestamptz not null default now()
);
alter table public.legacy_savdo enable row level security;
drop policy if exists rahbar_all on public.legacy_savdo;
create policy rahbar_all on public.legacy_savdo for all to authenticated using (public.is_rahbar()) with check (public.is_rahbar());
