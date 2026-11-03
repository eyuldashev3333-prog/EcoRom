-- ECOROM 021: живое состояние цеха для 3D-экрана «virtual sex». Rahbar-only.
-- Где «стоит» заказ: первая операция цеха (по порядку этапов), которая ещё не сделана на ВСЕХ позициях заказа;
-- все операции цеха сделаны → «ready» (готов к монтажу); монтаж идёт → «install»; ещё не отправлен в цех → «new».
-- Флаги: late (срок прошёл), material (последний ответ цеха «нет/брак»), stuck (в цеху 3+ дня без отметок).
create or replace function public.workshop_state() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Tashkent')::date; r jsonb;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  with st as (select id, code, name, sort from stages where is_active and role = 'ishlab'),
  ord as (
    select o.id, o.order_no, c.full_name as client, o.deadline, o.status, o.windows_count, o.shop_sent_at,
           (select count(*) from order_items i where i.order_id = o.id) as items
      from orders o join clients c on c.id = o.client_id
     where not o.is_imported and (o.status in ('in_production', 'ready', 'installing') or (o.status = 'new' and o.created_at > now() - interval '30 days'))
     order by o.order_no desc limit 80
  ),
  prog as (
    select ord.id as order_id, jsonb_object_agg(st.code, (select count(*) from item_stage_marks m join order_items i on i.id = m.order_item_id where i.order_id = ord.id and m.stage_id = st.id)) as done
      from ord cross join st group by ord.id
  ),
  pos as (
    select ord.id as order_id,
           (select st.code from st where (select count(*) from item_stage_marks m join order_items i on i.id = m.order_item_id where i.order_id = ord.id and m.stage_id = st.id) < ord.items order by st.sort limit 1) as first_open
      from ord
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'order_id', ord.id, 'order_no', ord.order_no, 'client', ord.client, 'deadline', ord.deadline, 'status', ord.status,
      'windows', ord.windows_count, 'items', ord.items,
      'station', case ord.status when 'new' then 'new' when 'installing' then 'install' when 'ready' then 'ready'
                  else coalesce(pos.first_open, 'ready') end,
      'done', prog.done,
      'percent', coalesce((select percent from v_order_progress p where p.order_id = ord.id), 0),
      'late', coalesce(ord.deadline < v_today, false),
      'material', exists (select 1 from order_material_checks m where m.order_id = ord.id and ord.shop_sent_at is not null and m.created_at >= ord.shop_sent_at
                           and m.result in ('not_enough', 'defect')
                           and m.created_at = (select max(m2.created_at) from order_material_checks m2 where m2.order_id = ord.id and m2.created_at >= ord.shop_sent_at)),
      'stuck', ord.status = 'in_production' and ord.shop_sent_at < now() - interval '3 days'
               and not exists (select 1 from item_stage_marks m join order_items i on i.id = m.order_item_id where i.order_id = ord.id and m.done_at > now() - interval '3 days')
    ) order by ord.order_no), '[]'::jsonb)
    into r from ord join prog on prog.order_id = ord.id join pos on pos.order_id = ord.id;
  return jsonb_build_object('orders', r, 'stages', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name) order by sort), '[]'::jsonb) from stages where is_active and role = 'ishlab'));
end $$;
revoke all on function public.workshop_state() from public, anon;
grant execute on function public.workshop_state() to authenticated;
