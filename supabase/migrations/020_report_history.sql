-- ECOROM 020: месяцы до запуска системы с импортированными из SAVDO расходами и зарплатами больше не «неполные»;
-- добавлен признак historical (месяц до cash_start_date). Всё остальное в monthly_report_core — как в 018.
do $$
declare v_src text;
begin
  select pg_get_functiondef('public.monthly_report_core(date)'::regprocedure) into v_src;
  v_src := replace(v_src,
    $q$'incomplete', v_m < coalesce(v_start, v_m),$q$,
    $q$'incomplete', v_m < coalesce(v_start, v_m) and not exists (select 1 from expenses x where x.source = 'import' and x.spent_at >= v_m and x.spent_at < v_e),
    'historical', v_m < coalesce(v_start, v_m),$q$);
  if v_src not like '%''historical''%' then raise exception 'не удалось обновить monthly_report_core'; end if;
  execute v_src;
end $$;
revoke all on function public.monthly_report_core(date) from public, anon, authenticated;
