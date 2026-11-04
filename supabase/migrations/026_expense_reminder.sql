-- ECOROM 026: вечером в 21:00 (Ташкент) Rahbar получает напоминание, если за день не записано ни одного расхода (решено 04.11.2026).
-- Выключатель — app_settings.expense_reminder_on (экран «Sozlamalar»). Расходы боя стекла (source = 'breakage') и импорт не считаются.
insert into public.app_settings (key, value) values ('expense_reminder_on', 'true') on conflict (key) do nothing;

create or replace function public.expense_evening_check() returns void
language plpgsql security definer set search_path = public as $$
declare v_on boolean := coalesce((select (value #>> '{}')::boolean from app_settings where key = 'expense_reminder_on'), true);
        v_today date := (now() at time zone 'Asia/Tashkent')::date;
begin
  if not v_on then return; end if;
  if exists (select 1 from expenses where reverses_id is null and confirmed and source in ('web', 'telegram') and spent_at = v_today) then return; end if;
  perform public.notify('rahbar', null, '🧾 Bugun xarajat yozilmagan. Hammasi to''g''rimi? Agar xarajat bo''lgan bo''lsa — botga yozing, masalan: «obed 150000».', '{}'::jsonb);
end $$;
revoke all on function public.expense_evening_check() from public, anon, authenticated;

select cron.unschedule('expense_evening') where exists (select 1 from cron.job where jobname = 'expense_evening');
select cron.schedule('expense_evening', '0 16 * * *', 'select public.expense_evening_check()');
