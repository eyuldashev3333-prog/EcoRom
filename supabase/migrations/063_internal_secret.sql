-- ECOROM 063: рассылка из базы в бота идёт по ОТДЕЛЬНОМУ секрету (tg_internal_secret / ECOROM_INTERNAL_SECRET).
-- Раньше один и тот же TG_WEBHOOK_SECRET защищал и вебхук Telegram, и внутренний вызов рассылки: утечка одного открывала оба входа (тест №3, F6).
-- Вебхук Telegram по-прежнему проверяет TG_WEBHOOK_SECRET (заголовок X-Telegram-Bot-Api-Secret-Token).
-- Секреты в этом файле НЕ хранятся: значение private.config.tg_internal_secret создаётся скриптом и лежит только в .env.local и секретах функций.
do $$
declare r record; v_src text;
begin
  if not exists (select 1 from private.config where key = 'tg_internal_secret') then raise exception 'нет private.config.tg_internal_secret — сначала создайте секрет'; end if;
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('notify_dispatch', 'notify_retry') loop
    v_src := pg_get_functiondef(r.oid);
    if v_src like '%tg_internal_secret%' then continue; end if;
    v_src := replace(v_src, 'tg_webhook_secret', 'tg_internal_secret');
    execute v_src;
  end loop;
end $$;
