-- ECOROM 023: настройки, которые Rahbar меняет сам на экране «Sozlamalar»: длина хлыста по умолчанию,
-- «зависло в цеху» (дни без отметок) и окно для маржи/закупок (дни). Функции утечек и 3D-цеха читают их из app_settings.
insert into public.app_settings (key, value) values ('bar_length_m', '6'), ('leak_stuck_days', '3'), ('leak_window_days', '60') on conflict (key) do nothing;
create or replace function public.leaks_core() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_pct numeric := coalesce((select (value #>> '{}')::numeric from app_settings where key = 'margin_alert_pct'), 15);
  v_today date := (now() at time zone 'Asia/Tashkent')::date;
  v_win int := coalesce((select (value #>> '{}')::int from app_settings where key = 'leak_window_days'), 60);
  v_stuck int := coalesce((select (value #>> '{}')::int from app_settings where key = 'leak_stuck_days'), 3);
  r jsonb := '{}'::jsonb; v_items jsonb; v_n int; v_sum numeric;
begin
  -- 1. низкая маржа
  select count(*) into v_n from orders o where o.status <> 'cancelled' and o.contract_price > 0 and o.calc_cost > 0 and o.created_at >= now() - make_interval(days => v_win)
     and 100 * (o.contract_price - o.calc_cost) / o.contract_price < v_pct;
  select coalesce(jsonb_agg(x), '[]') into v_items from (
    select o.id as order_id, o.order_no, c.full_name as client, o.contract_price, o.calc_cost, round(100 * (o.contract_price - o.calc_cost) / o.contract_price, 1) as margin_pct
      from orders o join clients c on c.id = o.client_id
     where o.status <> 'cancelled' and o.contract_price > 0 and o.calc_cost > 0 and o.created_at >= now() - make_interval(days => v_win) and 100 * (o.contract_price - o.calc_cost) / o.contract_price < v_pct
     order by 100 * (o.contract_price - o.calc_cost) / o.contract_price limit 10) x;
  r := r || jsonb_build_object('low_margin', jsonb_build_object('count', v_n, 'threshold', v_pct, 'items', v_items));

  -- 2. просрочен срок
  select count(*) into v_n from orders o where o.status in ('new', 'in_production', 'ready', 'installing') and o.deadline < v_today;
  select coalesce(jsonb_agg(x), '[]') into v_items from (
    select o.id as order_id, o.order_no, c.full_name as client, o.deadline, v_today - o.deadline as days_late, o.status
      from orders o join clients c on c.id = o.client_id where o.status in ('new', 'in_production', 'ready', 'installing') and o.deadline < v_today order by o.deadline limit 10) x;
  r := r || jsonb_build_object('overdue', jsonb_build_object('count', v_n, 'items', v_items));

  -- 3. зависли в цеху
  select count(*) into v_n from orders o where o.status = 'in_production' and o.shop_sent_at < now() - make_interval(days => v_stuck)
     and not exists (select 1 from item_stage_marks m join order_items i on i.id = m.order_item_id where i.order_id = o.id and m.done_at > now() - make_interval(days => v_stuck));
  select coalesce(jsonb_agg(x), '[]') into v_items from (
    select o.id as order_id, o.order_no, c.full_name as client, extract(day from now() - o.shop_sent_at)::int as days
      from orders o join clients c on c.id = o.client_id where o.status = 'in_production' and o.shop_sent_at < now() - make_interval(days => v_stuck)
       and not exists (select 1 from item_stage_marks m join order_items i on i.id = m.order_item_id where i.order_id = o.id and m.done_at > now() - make_interval(days => v_stuck))
     order by o.shop_sent_at limit 10) x;
  r := r || jsonb_build_object('stuck', jsonb_build_object('count', v_n, 'items', v_items));

  -- 4. проблема с материалом (последний ответ цеха «нет/брак» у заказа в производстве)
  select count(*) into v_n from orders o cross join lateral (
      select m.result from order_material_checks m where m.order_id = o.id and m.created_at >= o.shop_sent_at order by m.created_at desc limit 1) l
   where o.status = 'in_production' and l.result in ('not_enough', 'defect');
  select coalesce(jsonb_agg(x), '[]') into v_items from (
    select o.id as order_id, o.order_no, c.full_name as client, l.result, l.note
      from orders o join clients c on c.id = o.client_id cross join lateral (
        select m.result, m.note from order_material_checks m where m.order_id = o.id and m.created_at >= o.shop_sent_at order by m.created_at desc limit 1) l
     where o.status = 'in_production' and l.result in ('not_enough', 'defect') order by o.shop_sent_at limit 10) x;
  r := r || jsonb_build_object('material', jsonb_build_object('count', v_n, 'items', v_items));

  -- 5. долги клиентов по давности (от даты монтажа, а если её нет — от даты заказа)
  select coalesce(jsonb_build_object(
      'd30', coalesce(sum(p.debt) filter (where v_today - coalesce(o.install_date, (o.created_at at time zone 'Asia/Tashkent')::date) <= 30), 0),
      'd90', coalesce(sum(p.debt) filter (where v_today - coalesce(o.install_date, (o.created_at at time zone 'Asia/Tashkent')::date) between 31 and 90), 0),
      'older', coalesce(sum(p.debt) filter (where v_today - coalesce(o.install_date, (o.created_at at time zone 'Asia/Tashkent')::date) > 90), 0),
      'total', coalesce(sum(p.debt), 0), 'count', count(*)), '{}'::jsonb)
    into v_items from v_order_paid p join orders o on o.id = p.order_id where o.status <> 'cancelled' and p.debt > 0;
  r := r || jsonb_build_object('client_debts', v_items || jsonb_build_object('items', (
    select coalesce(jsonb_agg(x), '[]') from (
      select o.id as order_id, o.order_no, c.full_name as client, p.debt, v_today - coalesce(o.install_date, (o.created_at at time zone 'Asia/Tashkent')::date) as age_days
        from v_order_paid p join orders o on o.id = p.order_id join clients c on c.id = o.client_id
       where o.status <> 'cancelled' and p.debt > 0 order by p.debt desc limit 10) x)));

  -- 6. установлено, но не оплачено
  select count(*), coalesce(sum(p.debt), 0) into v_n, v_sum from v_order_paid p join orders o on o.id = p.order_id where o.status = 'installed' and p.debt > 0;
  select coalesce(jsonb_agg(x), '[]') into v_items from (
    select o.id as order_id, o.order_no, c.full_name as client, p.debt, o.install_date
      from v_order_paid p join orders o on o.id = p.order_id join clients c on c.id = o.client_id where o.status = 'installed' and p.debt > 0 order by p.debt desc limit 10) x;
  r := r || jsonb_build_object('installed_unpaid', jsonb_build_object('count', v_n, 'sum', v_sum, 'items', v_items));

  -- 7. долги поставщикам
  select count(*), coalesce(sum(debt), 0) into v_n, v_sum from v_supplier_debt where debt > 0;
  select coalesce(jsonb_agg(x), '[]') into v_items from (select supplier_id, name, debt from v_supplier_debt where debt > 0 order by debt desc limit 10) x;
  r := r || jsonb_build_object('supplier_debts', jsonb_build_object('count', v_n, 'sum', v_sum, 'items', v_items));

  -- 8. закуплено дороже каталога (60 дней)
  select count(*), coalesce(sum((pi.unit_cost - public.part_price(c, pi.part)) * pi.qty), 0) into v_n, v_sum
    from purchase_items pi join purchases p on p.id = pi.purchase_id join catalog_items c on c.id = pi.item_id
   where p.reverses_id is null and pi.qty > 0 and p.purchased_at >= v_today - v_win and public.part_price(c, pi.part) > 0 and pi.unit_cost > public.part_price(c, pi.part);
  select coalesce(jsonb_agg(x), '[]') into v_items from (
    select c.name || case when pi.part <> '' then ' — ' || pi.part else '' end as name, pi.unit_cost, public.part_price(c, pi.part) as catalog_price, pi.qty,
           round((pi.unit_cost - public.part_price(c, pi.part)) * pi.qty, 2) as excess
      from purchase_items pi join purchases p on p.id = pi.purchase_id join catalog_items c on c.id = pi.item_id
     where p.reverses_id is null and pi.qty > 0 and p.purchased_at >= v_today - v_win and public.part_price(c, pi.part) > 0 and pi.unit_cost > public.part_price(c, pi.part)
     order by (pi.unit_cost - public.part_price(c, pi.part)) * pi.qty desc limit 10) x;
  r := r || jsonb_build_object('pricey_purchases', jsonb_build_object('count', v_n, 'excess', v_sum, 'items', v_items));

  -- 9. минус на складе
  select count(*) into v_n from v_stock_balance where qty < 0;
  select coalesce(jsonb_agg(x), '[]') into v_items from (select name, qty, unit from v_stock_balance where qty < 0 order by qty limit 10) x;
  r := r || jsonb_build_object('stock_negative', jsonb_build_object('count', v_n, 'items', v_items));

  -- 10. бой стекла без решения «кто платит»
  select count(*), coalesce(sum(amount), 0) into v_n, v_sum from glass_breakages where not decided;
  r := r || jsonb_build_object('breakage_undecided', jsonb_build_object('count', v_n, 'sum', v_sum));

  -- 11. сервис: без исполнителя / просрочен / ждёт закрытия
  select count(*) into v_n from service_tickets t where t.status <> 'closed' and (t.assigned_to is null or t.work_done_at is not null or t.due_date < v_today);
  select coalesce(jsonb_agg(x), '[]') into v_items from (
    select t.id, o.order_no, c.full_name as client, left(t.description, 80) as description,
           case when t.assigned_to is null then 'no_assignee' when t.work_done_at is not null then 'to_close' else 'overdue' end as flag
      from service_tickets t join orders o on o.id = t.order_id join clients c on c.id = o.client_id
     where t.status <> 'closed' and (t.assigned_to is null or t.work_done_at is not null or t.due_date < v_today) order by t.created_at limit 10) x;
  r := r || jsonb_build_object('service', jsonb_build_object('count', v_n, 'items', v_items));

  -- 12. прочее
  r := r || jsonb_build_object(
    'cash', jsonb_build_object('balance', (select cash from v_cash_balance), 'negative', (select cash from v_cash_balance) < 0),
    'unknown_status', jsonb_build_object('count', (select count(*) from orders where status = 'unknown')),
    'pace', (select coalesce(jsonb_agg(x), '[]') from (
        select e.full_name as name, s.name as stage, count(*) as marks, round(sum(oi.area_m2 * oi.qty), 1) as m2
          from item_stage_marks m join employees e on e.id = m.done_by join stages s on s.id = m.stage_id join order_items oi on oi.id = m.order_item_id
         where m.done_at >= now() - interval '30 days' group by e.full_name, s.name, s.sort order by e.full_name, s.sort limit 30) x));
  return r;
end $$;

create or replace function public.workshop_state() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Tashkent')::date; r jsonb;
  v_stuck int := coalesce((select (value #>> '{}')::int from app_settings where key = 'leak_stuck_days'), 3);
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
      'stuck', ord.status = 'in_production' and ord.shop_sent_at < now() - make_interval(days => v_stuck)
               and not exists (select 1 from item_stage_marks m join order_items i on i.id = m.order_item_id where i.order_id = ord.id and m.done_at > now() - make_interval(days => v_stuck))
    ) order by ord.order_no), '[]'::jsonb)
    into r from ord join prog on prog.order_id = ord.id join pos on pos.order_id = ord.id;
  return jsonb_build_object('orders', r, 'stages', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name) order by sort), '[]'::jsonb) from stages where is_active and role = 'ishlab'));
end $$;
revoke all on function public.leaks_core() from public, anon, authenticated;
revoke all on function public.workshop_state() from public, anon;
grant execute on function public.workshop_state() to authenticated;

