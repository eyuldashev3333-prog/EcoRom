-- ECOROM 033: новая строка REGISTRATSIYA прямо из таблицы (как запись в Google Sheet): клиент (по телефону/имени или новый),
-- метры по сериям, договор, при желании — аванс. Строка без чертежей (как импортированные): правится в таблице; чертёж и расчёт —
-- через «Yangi buyurtma». Номер — следующий из общей последовательности.
create or replace function public.registratsiya_add(p jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_name text := trim(coalesce(p->>'full_name', ''));
  v_phone text := nullif(trim(coalesce(p->>'phone', '')), '');
  v_client uuid; v_order uuid; v_no bigint;
  n_alu numeric := coalesce(nullif(p->>'alyumin', '')::numeric, 0);
  n_pl numeric := coalesce(nullif(p->>'plast', '')::numeric, 0);
  n_te numeric := coalesce(nullif(p->>'termo', '')::numeric, 0);
  v_contract numeric := coalesce(nullif(p->>'dogovor', '')::numeric, 0);
  v_prod numeric := nullif(p->>'mahsulot', '')::numeric;
  v_serv numeric := nullif(p->>'sbor', '')::numeric;
  v_paid numeric := coalesce(nullif(p->>'berdi', '')::numeric, 0);
  v_date date := coalesce(nullif(p->>'sana', '')::date, (now() at time zone 'Asia/Tashkent')::date);
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if v_name = '' then raise exception 'Mijoz ismi kiritilmagan'; end if;
  if least(n_alu, n_pl, n_te, v_contract, v_paid) < 0 then raise exception 'Manfiy bo''lishi mumkin emas'; end if;
  -- клиент: тот же телефон, иначе то же имя (без регистра), иначе новый
  if v_phone is not null then select id into v_client from clients where phone = v_phone limit 1; end if;
  if v_client is null then select id into v_client from clients where lower(full_name) = lower(v_name) limit 1; end if;
  if v_client is null then
    insert into clients(full_name, phone, address, created_by) values (v_name, v_phone, nullif(trim(coalesce(p->>'address', '')), ''), public.my_id()) returning id into v_client;
  end if;
  insert into orders(client_id, address, contact_phone, color, status, windows_count, area_m2, calc_cost, contract_price, is_imported,
                     m2_alu, m2_plast, m2_termo, cost_product, cost_service, created_by, created_at)
  values (v_client, nullif(trim(coalesce(p->>'address', '')), ''), v_phone, nullif(trim(coalesce(p->>'rangi', '')), ''), 'new',
          coalesce(nullif(p->>'soni', '')::int, 0), n_alu + n_pl + n_te, coalesce(v_prod, 0) + coalesce(v_serv, 0), v_contract, true,
          n_alu, n_pl, n_te, v_prod, v_serv, public.my_id(), (v_date + time '12:00') at time zone 'Asia/Tashkent')
  returning id, order_no into v_order, v_no;
  if v_paid > 0 then perform public.record_payment(v_order, v_paid, v_date, 'Jadvaldan'); end if;
  return jsonb_build_object('id', v_order, 'order_no', v_no);
end $$;
revoke all on function public.registratsiya_add(jsonb) from public, anon;
grant execute on function public.registratsiya_add(jsonb) to authenticated;
