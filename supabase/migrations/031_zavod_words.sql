-- ECOROM 031: слово «sex» (цех) в сообщениях Telegram и ошибках заменено на «zavod» — как в интерфейсе (04.11.2026).
-- Меняются только тексты внутри функций (все вхождения — в строках сообщений); логика не затрагивается.
do $$
declare r record; v_src text;
begin
  for r in
    select p.oid, p.proname from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.prosrc ~ '[Ss]ex' and p.prokind = 'f'
  loop
    v_src := pg_get_functiondef(r.oid);
    v_src := regexp_replace(v_src, '\mSex', 'Zavod', 'g');
    v_src := regexp_replace(v_src, '\msex', 'zavod', 'g');
    execute v_src;
  end loop;
end $$;
