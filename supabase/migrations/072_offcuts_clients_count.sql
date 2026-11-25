-- ECOROM 072: обрезки, клиенты из таблицы, инвентаризация (тест №3: E-CUT3/4/6/9, D-F13, E-CNT4).
--  * apply_cutting: использованный или несуществующий обрезок отклоняется понятной ошибкой (раньше «успех», а заказ считал обрезок взятым); неверная часть/длина — понятная ошибка.
--  * order_unconsume (отмена заказа до начала работ): обрезки, взятые заказом, возвращаются в реестр; не использованные обрезки от его раскроя снимаются.
--  * registratsiya_add: два разных человека с одним именем и разными телефонами больше не склеиваются в одного клиента.
--  * stock_count: пустой «факт» — понятная ошибка вместо ошибки базы.
-- Откат: восстановить функции из 019/043/011.

do $$
declare v_src text; v_new text;
begin
  select pg_get_functiondef('public.apply_cutting(uuid, uuid[], jsonb)'::regprocedure) into v_src;
  if v_src not like '%Obrezok topilmadi%' then
    v_new := replace(v_src, $q$  update offcuts set used_at = now(), used_order_id = p_order where id = any(coalesce(p_used, '{}')) and used_at is null;$q$,
      $q$  if exists (select 1 from unnest(coalesce(p_used, '{}'::uuid[])) u where not exists (select 1 from offcuts o where o.id = u and o.used_at is null)) then
    raise exception 'Obrezok topilmadi yoki allaqachon ishlatilgan';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_new, '[]'::jsonb)) x
              where coalesce(x->>'part', '') not in ('rama', 'impost', 'tavaqa', 'shtapik') or coalesce((x->>'length_mm')::numeric, 0) <= 0 or coalesce((x->>'length_mm')::numeric, 0) > 20000
                 or not exists (select 1 from catalog_items c where c.id::text = x->>'item_id')) then
    raise exception 'Obrezok ma''lumoti noto''g''ri (qism, uzunlik 1…20000 mm yoki material)';
  end if;
  update offcuts set used_at = now(), used_order_id = p_order where id = any(coalesce(p_used, '{}')) and used_at is null;$q$);
    if v_new = v_src then raise exception 'apply_cutting: замена не сработала'; end if;
    execute v_new;
  end if;

  select pg_get_functiondef('public.order_unconsume(uuid)'::regprocedure) into v_src;
  if v_src not like '%used_order_id = p_order%' then
    v_new := replace(v_src, $q$  if exists (select 1 from item_stage_marks m join order_items i on i.id = m.order_item_id where i.order_id = p_order) then return; end if;$q$,
      $q$  if exists (select 1 from item_stage_marks m join order_items i on i.id = m.order_item_id where i.order_id = p_order) then return; end if;
  -- обрезки: взятые заказом возвращаются в реестр, ещё не использованные обрезки от его раскроя снимаются
  update offcuts set used_at = null, used_order_id = null where used_order_id = p_order;
  delete from offcuts where source_order_id = p_order and used_at is null;$q$);
    if v_new = v_src then raise exception 'order_unconsume: замена не сработала'; end if;
    execute v_new;
  end if;

  select pg_get_functiondef('public.registratsiya_add(jsonb)'::regprocedure) into v_src;
  if v_src not like '%norm_phone%' then
    v_new := replace(v_src, $q$  if v_phone is not null then select id into v_client from clients where phone = v_phone limit 1; end if;
  if v_client is null then select id into v_client from clients where lower(full_name) = lower(v_name) limit 1; end if;$q$,
      $q$  if v_phone is not null then
    select id into v_client from clients where public.norm_phone(phone) = public.norm_phone(v_phone) and public.norm_phone(v_phone) is not null limit 1;
    if v_client is null then   -- тёзка без телефона — тот же человек; тёзка с другим телефоном — другой человек
      select id into v_client from clients where lower(btrim(full_name)) = lower(v_name) and public.norm_phone(phone) is null limit 1;
      if v_client is not null then update clients set phone = v_phone where id = v_client; end if;
    end if;
  else
    select id into v_client from clients where lower(btrim(full_name)) = lower(v_name) order by created_at limit 1;
  end if;$q$);
    if v_new = v_src then raise exception 'registratsiya_add: замена не сработала'; end if;
    execute v_new;
  end if;

  select pg_get_functiondef('public.stock_count(jsonb)'::regprocedure) into v_src;
  if v_src not like '%Haqiqiy qoldiqni kiriting%' then
    v_new := replace(v_src, $q$    if (ln->>'fact')::numeric < 0 then raise exception 'Qoldiq manfiy bo''lmaydi'; end if;$q$,
      $q$    if nullif(ln->>'fact', '') is null then raise exception 'Haqiqiy qoldiqni kiriting'; end if;
    if (ln->>'fact')::numeric < 0 then raise exception 'Qoldiq manfiy bo''lmaydi'; end if;$q$);
    if v_new = v_src then raise exception 'stock_count: замена не сработала'; end if;
    execute v_new;
  end if;
end $$;
