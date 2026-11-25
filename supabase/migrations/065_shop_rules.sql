-- ECOROM 065: правила цеха (тест №3: B-3.11, B-6, G-4).
--  * Ответ цеха («Qabul qildim / Material yetmaydi / Brak») принимается только пока заказ в производстве: на готовый («Tayyor») и дальше — отказ (раньше «Material yetmaydi»
--    на готовом заказе давал ложную «Material muammosi» руководителю).
--  * Команду цеха нельзя менять после «Tayyor»: начисления (м², окна) считаются по текущей команде заказа, и смена задним числом переносила бы деньги за уже сделанную работу
--    от одного сотрудника к другому. До «Tayyor» смена команды — как раньше (новый человек получает уведомление).
--  * Ответ руководителя на кнопку в боте больше не «захватывает» его следующий текст как причину отказа цеха (раньше «obed 150000» уходило в причину, а расход не записывался):
--    ожидание причины ставится только для сотрудника цеха, и shop_reason принимает текст только от сотрудника цеха.
-- Откат: восстановить shop_answer_core, shop_set_workers, shop_reason из 049/011.
do $$
declare v_src text; v_new text;
begin
  -- 1. ответ цеха только пока заказ в производстве; ожидание причины — только для цеха
  select pg_get_functiondef('public.shop_answer_core(uuid, uuid, text, bigint, text)'::regprocedure) into v_src;
  if v_src not like '%Buyurtma allaqachon zavoddan chiqqan%' then
    v_new := replace(v_src, $q$if v.status in ('closed', 'cancelled') then return jsonb_build_object('ok', false, 'error', 'Buyurtma yopilgan yoki bekor qilingan'); end if;$q$,
      $q$if v.status in ('closed', 'cancelled') then return jsonb_build_object('ok', false, 'error', 'Buyurtma yopilgan yoki bekor qilingan'); end if;
  if v.status <> 'in_production' then return jsonb_build_object('ok', false, 'error', 'Buyurtma allaqachon zavoddan chiqqan — javob endi kerak emas'); end if;$q$);
    v_new := replace(v_new, 'elsif p_tg is not null then', $q$elsif p_tg is not null and v_emp.role = 'ishlab' then$q$);
    if v_new = v_src or v_new not like '%Buyurtma allaqachon zavoddan chiqqan%' or v_new not like '%v_emp.role = ''ishlab'' then%' then raise exception 'shop_answer_core: замена не сработала'; end if;
    execute v_new;
  end if;

  -- 2. команду нельзя менять после «Tayyor»
  select pg_get_functiondef('public.shop_set_workers(uuid, uuid[])'::regprocedure) into v_src;
  if v_src not like '%Tayyor buyurtmada jamoani%' then
    v_new := replace(v_src, $q$if v.status not in ('in_production', 'ready') or v.shop_sent_at is null then raise exception 'Buyurtma hozir zavodda emas'; end if;$q$,
      $q$if v.status = 'ready' then raise exception 'Tayyor buyurtmada jamoani o''zgartirib bo''lmaydi (ish haqi hisobi buziladi)'; end if;
    if v.status <> 'in_production' or v.shop_sent_at is null then raise exception 'Buyurtma hozir zavodda emas'; end if;$q$);
    if v_new = v_src then raise exception 'shop_set_workers: замена не сработала'; end if;
    execute v_new;
  end if;

  -- 3. причину принимаем только от сотрудника цеха
  select pg_get_functiondef('public.shop_reason(bigint, text)'::regprocedure) into v_src;
  if v_src not like '%e.role = ''ishlab''%' then
    v_new := replace(v_src, $q$where b.telegram_id = p_tg and b.created_at > now() - interval '1 hour';$q$,
      $q$where b.telegram_id = p_tg and b.created_at > now() - interval '1 hour'
     and exists (select 1 from employees e where e.telegram_id = p_tg and e.role = 'ishlab' and e.is_active);$q$);
    if v_new = v_src then raise exception 'shop_reason: замена не сработала'; end if;
    execute v_new;
  end if;
end $$;

-- старые «висящие» ожидания причины у руководителей — убрать
delete from bot_pending where telegram_id in (select telegram_id from employees where role = 'rahbar' and telegram_id is not null);
