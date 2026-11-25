-- Блок «права»: рассылка по отдельному секрету; нельзя отключить последнего Rahbar; сотрудник с отключённым профилем видит пустоту.
do $$
declare v_ids uuid[]; v_n int;
begin
  perform pg_temp.t('notify_dispatch uses tg_internal_secret', (select pg_get_functiondef(oid) from pg_proc where proname = 'notify_dispatch') like '%tg_internal_secret%'
                    and (select pg_get_functiondef(oid) from pg_proc where proname = 'notify_dispatch') not like '%tg_webhook_secret%');
  perform pg_temp.t('notify_retry uses tg_internal_secret', (select pg_get_functiondef(oid) from pg_proc where proname = 'notify_retry') like '%tg_internal_secret%');
  perform pg_temp.t('internal secret differs from webhook secret', (select value from private.config where key = 'tg_internal_secret') is distinct from (select value from private.config where key = 'tg_webhook_secret'));

  -- последний активный Rahbar: отключить нельзя, предпоследнего — можно
  select array_agg(id order by login) into v_ids from employees where role = 'rahbar' and is_active;
  v_n := coalesce(array_length(v_ids, 1), 0);
  perform pg_temp.t('has at least 1 active rahbar', v_n >= 1, v_n::text);
  if v_n >= 2 then
    perform pg_temp.okq('deactivate non-last rahbar', format($f$update employees set is_active = false where id = %L$f$, v_ids[1]));
    perform pg_temp.err('deactivate LAST rahbar rejected', format($f$update employees set is_active = false where id = %L$f$, v_ids[2]));
    perform pg_temp.err('demote LAST rahbar rejected', format($f$update employees set role = 'ishlab' where id = %L$f$, v_ids[2]));
    perform pg_temp.err('delete LAST rahbar rejected', format($f$delete from employees where id = %L$f$, v_ids[2]));
  end if;
end $$;
