-- ECOROM 071: включены рассылки (решение Asad 25.11.2026): утро монтажу (07:00), сервис (07:05), «Teshiklar» (08:10), итог месяца, вечернее напоминание о расходах.
-- Раньше digests_on и expense_reminder_on были выключены, а cron показывал «succeeded» — рассылки молча не работали (тест №3, G-7).
-- Время cron — UTC: 02:00 UTC = 07:00 Ташкент. Тихие часы настраиваются notify_from_hour / notify_to_hour (только для shop_tick).
insert into public.app_settings (key, value) values ('digests_on', 'true'::jsonb), ('expense_reminder_on', 'true'::jsonb)
on conflict (key) do update set value = 'true'::jsonb, updated_at = now();