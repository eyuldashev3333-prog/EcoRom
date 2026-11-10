-- ECOROM 043 (блок 6 плана исправлений): зарплата, фото, закупки, таблицы.
-- M1 фото монтажа/боя/сервиса — файл должен реально лежать в хранилище; M3 штраф за бой по месяцу решения, % от продаж без импорта,
-- этапы без ставки видны (payroll_unpriced); M5 доставка закупки входит в стоимость склада; M9 правки в таблицах безопаснее.
create or replace function public.photo_exists(p text) returns boolean language sql stable security definer set search_path = public, storage as $$
  select exists (select 1 from storage.objects where bucket_id = 'install-photos' and name = p)
$$;
revoke all on function public.photo_exists(text) from public, anon;
grant execute on function public.photo_exists(text) to authenticated, service_role;

create or replace function public.payroll_unpriced(p_month date)
returns table(employee_id uuid, employee text, stage text, base numeric, orders text)
language sql stable security definer set search_path = public as $$
  with b as (select date_trunc('month', p_month)::date as d1, (date_trunc('month', p_month) + interval '1 month')::date as d2),
  m as (
    select dm.done_by as emp, e.role, e.full_name, s.code, s.name as sname, (dm.done_at at time zone 'Asia/Tashkent')::date as d,
           oi.area_m2 * oi.qty as m2, o.order_no,
           (select c.params->>'series' from catalog_items c where c.id::text = oi.options->>'system') as series
      from item_stage_marks dm join employees e on e.id = dm.done_by join stages s on s.id = dm.stage_id
      join order_items oi on oi.id = dm.order_item_id join orders o on o.id = oi.order_id, b
     where (dm.done_at at time zone 'Asia/Tashkent')::date >= b.d1 and (dm.done_at at time zone 'Asia/Tashkent')::date < b.d2)
  select m.emp, m.full_name, m.sname, sum(m.m2), string_agg(distinct '№' || m.order_no::text, ', ')
    from m
   where public.is_rahbar()
     and not exists (select 1 from pay_rules pr
                      where pr.basis in ('per_m2', 'per_window') and (pr.employee_id = m.emp or (pr.employee_id is null and pr.role = m.role))
                        and pr.valid_from <= m.d and (pr.valid_to is null or pr.valid_to >= m.d)
                        and (pr.stage_code is null or pr.stage_code = m.code) and (pr.series is null or pr.series = m.series))
   group by m.emp, m.full_name, m.sname
$$;
revoke all on function public.payroll_unpriced(date) from public, anon;
grant execute on function public.payroll_unpriced(date) to authenticated;

CREATE OR REPLACE FUNCTION public.mark_install(p_item uuid, p_part text, p_done boolean, p_photo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_me uuid := public.my_id(); v_role text := public.my_role(); v_item order_items; v_order orders; v_mark install_marks;
        v_need_photo boolean; v_stage int; v_left int; v_who text;
begin
  if v_me is null or v_role not in ('rahbar', 'montajchi') then raise exception 'Bu amal sizga ruxsat etilmagan'; end if;
  if p_part not in ('frame', 'glass', 'sill_ebb') then raise exception 'Qism noto''g''ri'; end if;
  select * into v_item from order_items where id = p_item;
  if v_item.id is null then raise exception 'Pozitsiya topilmadi'; end if;
  select * into v_order from orders where id = v_item.order_id for update;
  if v_role = 'montajchi' and not exists (select 1 from w_orders where id = v_order.id) then raise exception 'Bu buyurtma sizga biriktirilmagan'; end if;
  if p_part = 'sill_ebb' and not (v_item.options ? 'sill' or v_item.options ? 'ebb') then raise exception 'Bu oynada podokonnik/otliv yo''q'; end if;
  select id into v_stage from stages where code = 'install';
  select * into v_mark from install_marks where order_item_id = p_item and part = p_part;
  if p_done then
    if v_order.status in ('new', 'in_production') then raise exception 'Buyurtma hali zavoddan chiqmagan'; end if;
    if v_order.status not in ('ready', 'installing') then raise exception 'Buyurtma yopilgan, o''rnatilgan yoki bekor qilingan'; end if;
    if v_mark.id is not null then
      select full_name into v_who from employees where id = v_mark.done_by;
      raise exception 'Allaqachon belgilangan: %', v_who;
    end if;
    select coalesce((value #>> '{}')::boolean, true) into v_need_photo from app_settings where key = 'install_photo_required';
    if v_role = 'montajchi' and coalesce(v_need_photo, true) and p_photo is null
       and (select count(*) from install_marks where order_item_id = p_item) + 1 >= public.install_parts_needed(v_item.options)
       and not exists (select 1 from install_item_photos where order_item_id = p_item)
       and not exists (select 1 from install_marks where order_item_id = p_item and photo_path is not null)
    then raise exception 'Oynaning fotosini yuklang (1 ta foto yetarli)'; end if;
    if p_photo is not null and split_part(p_photo, '/', 1) <> v_order.id::text then raise exception 'Foto yo''li noto''g''ri'; end if;
  if p_photo is not null and not public.photo_exists(p_photo) then raise exception 'Foto serverda topilmadi (yuklash tugamagan?)'; end if;
    insert into install_marks(order_item_id, part, done_by, photo_path) values (p_item, p_part, v_me, p_photo);
    if p_part = 'glass' then
      update order_items set glass_status = 'installed', glass_status_at = now(), glass_status_by = v_me where id = p_item;
    end if;
    update orders set status = 'installing' where id = v_order.id and status = 'ready';
    update install_jobs set status = 'in_progress' where order_id = v_order.id and status in ('planned', 'postponed');
    if (select count(*) from install_marks where order_item_id = p_item) >= public.install_parts_needed(v_item.options) then
      insert into item_stage_marks(order_item_id, stage_id, done_by) values (p_item, v_stage, v_me) on conflict do nothing;
    end if;
    select count(*) into v_left from order_items i
     where i.order_id = v_order.id and public.install_parts_needed(i.options) > (select count(*) from install_marks m where m.order_item_id = i.id);
    if v_left = 0 then
      update orders set status = 'installed', install_date = coalesce(install_date, current_date) where id = v_order.id;
      update install_jobs set status = 'done' where order_id = v_order.id and status <> 'done';
      perform public.notify('rahbar', null, '🏁 №' || v_order.order_no || ' o''rnatildi — barcha oynalar belgilandi',
                            jsonb_build_object('order_id', v_order.id));
    end if;
  else
    if v_mark.id is null then raise exception 'Belgi yo''q'; end if;
    if v_mark.done_by <> v_me and v_role <> 'rahbar' then raise exception 'Faqat o''z belgingizni olib tashlay olasiz'; end if;
    if v_order.status not in ('installing', 'installed') then raise exception 'Buyurtma yopilgan yoki bekor qilingan — o''zgartirib bo''lmaydi'; end if;
    delete from install_marks where id = v_mark.id;
    delete from item_stage_marks where order_item_id = p_item and stage_id = v_stage;
    if p_part = 'glass' then update order_items set glass_status = 'arrived', glass_status_at = now(), glass_status_by = v_me where id = p_item and glass_status = 'installed'; end if;
    if v_order.status = 'installed' then
      update orders set status = 'installing', install_date = null where id = v_order.id;
      update install_jobs set status = 'in_progress' where order_id = v_order.id and status = 'done';
    end if;
  end if;
  return jsonb_build_object('status', (select status from orders where id = v_order.id),
                            'percent', (select percent from v_order_progress where order_id = v_order.id));
end $function$;

CREATE OR REPLACE FUNCTION public.record_breakage(p_item uuid, p_pieces integer, p_reason text, p_photo text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_me uuid := public.my_id(); v_role text := public.my_role(); v_item order_items; v_order orders; v_id uuid;
        v_unit numeric; v_who text; v_client text;
begin
  if v_me is null or v_role not in ('rahbar', 'ishlab', 'montajchi') then raise exception 'Bu amal sizga ruxsat etilmagan'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Sababini yozing'; end if;
  select * into v_item from order_items where id = p_item;
  if v_item.id is null then raise exception 'Pozitsiya topilmadi'; end if;
  select * into v_order from orders where id = v_item.order_id for update;
  if v_role = 'montajchi' and not exists (select 1 from w_orders where id = v_order.id) then raise exception 'Bu buyurtma sizga biriktirilmagan'; end if;
  if v_order.status not in ('in_production', 'ready', 'installing', 'installed') then raise exception 'Bu holatdagi buyurtmada qayd etib bo''lmaydi'; end if;
  if coalesce(p_pieces, 1) < 1 or coalesce(p_pieces, 1) > v_item.qty then raise exception 'Miqdor 1 dan % gacha bo''lishi kerak', v_item.qty; end if;
  if p_photo is not null and split_part(p_photo, '/', 1) <> v_order.id::text then raise exception 'Foto yo''li noto''g''ri'; end if;
  if p_photo is not null and not public.photo_exists(p_photo) then raise exception 'Foto serverda topilmadi (yuklash tugamagan?)'; end if;
  select coalesce(sum((l->>'sum')::numeric), 0) into v_unit
    from jsonb_array_elements(coalesce(v_item.calc->'lines', '[]')) l where l->>'kind' = 'glass';
  insert into glass_breakages(order_id, order_item_id, employee_id, reason, photo_path, payer, amount, pieces, created_by)
  values (v_order.id, p_item, case when v_role <> 'rahbar' then v_me end, trim(p_reason), p_photo, 'factory',
          round(v_unit * coalesce(p_pieces, 1), 2), coalesce(p_pieces, 1), v_me)
  returning id into v_id;
  update order_items set glass_status = 'none', glass_status_at = now(), glass_status_by = v_me where id = p_item and glass_status <> 'none';
  select full_name into v_who from employees where id = v_me;
  select c.full_name into v_client from clients c where c.id = v_order.client_id;
  if v_role <> 'rahbar' then
    perform public.notify('rahbar', null,
      '🪟 Oyna sindi · №' || v_order.order_no || ' ' || v_client || E'\n' || v_item.pos || ') ' || v_item.width_mm || '×' || v_item.height_mm
      || ' · ' || coalesce(p_pieces, 1) || ' ta' || E'\n' || v_who || ': ' || trim(p_reason),
      jsonb_build_object('order_id', v_order.id));
  end if;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.set_install_photo(p_item uuid, p_photo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_me uuid := public.my_id(); v_role text := public.my_role(); v_order orders;
begin
  if v_me is null or v_role not in ('rahbar', 'montajchi') then raise exception 'Bu amal sizga ruxsat etilmagan'; end if;
  select o.* into v_order from orders o join order_items i on i.order_id = o.id where i.id = p_item;
  if v_order.id is null then raise exception 'Pozitsiya topilmadi'; end if;
  if v_role = 'montajchi' and not public.install_item_mine(p_item) then raise exception 'Bu buyurtma sizga biriktirilmagan'; end if;
  if v_order.status not in ('ready', 'installing', 'installed') then raise exception 'Buyurtma hali zavoddan chiqmagan yoki yopilgan'; end if;
  if split_part(p_photo, '/', 1) <> v_order.id::text then raise exception 'Foto yo''li noto''g''ri'; end if;
  if p_photo is not null and not public.photo_exists(p_photo) then raise exception 'Foto serverda topilmadi (yuklash tugamagan?)'; end if;
  insert into install_item_photos(order_item_id, photo_path, taken_by) values (p_item, p_photo, v_me)
  on conflict (order_item_id) do update set photo_path = excluded.photo_path, taken_by = excluded.taken_by, taken_at = now();
end $function$;

CREATE OR REPLACE FUNCTION public.create_service(p_order uuid, p_item uuid, p_description text, p_due date DEFAULT NULL::date, p_assignee uuid DEFAULT NULL::uuid, p_photos text[] DEFAULT '{}'::text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v orders; v_id uuid; v_w date;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if coalesce(trim(p_description), '') = '' then raise exception 'Muammoni yozing'; end if;
  select * into v from orders where id = p_order;
  if v.id is null then raise exception 'Buyurtma topilmadi'; end if;
  if v.status not in ('installed', 'closed', 'unknown') then raise exception 'Servis faqat o''rnatilgan buyurtmaga ochiladi'; end if;
  if p_item is not null and not exists (select 1 from order_items where id = p_item and order_id = p_order) then raise exception 'Pozitsiya topilmadi'; end if;
  if p_assignee is not null and not exists (select 1 from employees where id = p_assignee and role = 'montajchi' and is_active) then raise exception 'Faqat faol o''rnatuvchini tanlash mumkin'; end if;
  if exists (select 1 from unnest(coalesce(p_photos, '{}')) f where split_part(f, '/', 1) <> p_order::text) then raise exception 'Foto yo''li noto''g''ri'; end if;
  if exists (select 1 from unnest(coalesce(p_photos, '{}')) f where not public.photo_exists(f)) then raise exception 'Foto serverda topilmadi (yuklash tugamagan?)'; end if;
  v_w := public.order_warranty(p_order);
  insert into service_tickets(order_id, order_item_id, description, photo_paths, assigned_to, due_date, in_warranty, created_by)
  values (p_order, p_item, trim(p_description), coalesce(p_photos, '{}'), p_assignee, p_due, case when v_w is null then null else v_w >= current_date end, public.my_id())
  returning id into v_id;
  if p_assignee is not null then
    perform public.notify(null, p_assignee, public.service_notify_text(v_id, '🛠 Servis'), jsonb_build_object('service_id', v_id, 'order_id', p_order));
  end if;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.service_work(p_id uuid, p_action text, p_note text DEFAULT NULL::text, p_photos text[] DEFAULT '{}'::text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v service_tickets; v_me uuid := public.my_id(); v_role text := public.my_role(); v_who text; v_ord orders;
begin
  if v_me is null or v_role not in ('rahbar', 'montajchi') then raise exception 'Bu amal sizga ruxsat etilmagan'; end if;
  select * into v from service_tickets where id = p_id;
  if v.id is null then raise exception 'Zayavka topilmadi'; end if;
  if v_role = 'montajchi' and v.assigned_to is distinct from v_me then raise exception 'Bu zayavka sizga biriktirilmagan'; end if;
  if v.status = 'closed' then raise exception 'Zayavka yopilgan'; end if;
  if p_action = 'start' then
    update service_tickets set status = 'in_progress' where id = p_id;
  elsif p_action = 'done' then
    if exists (select 1 from unnest(coalesce(p_photos, '{}')) f where split_part(f, '/', 1) <> v.order_id::text) then raise exception 'Foto yo''li noto''g''ri'; end if;
    if exists (select 1 from unnest(coalesce(p_photos, '{}')) f where not public.photo_exists(f)) then raise exception 'Foto serverda topilmadi (yuklash tugamagan?)'; end if;
    update service_tickets set status = 'in_progress', work_done_at = now(), work_done_by = v_me, work_note = nullif(trim(p_note), ''), work_photo_paths = coalesce(p_photos, '{}')
     where id = p_id;
    select * into v_ord from orders where id = v.order_id;
    select full_name into v_who from employees where id = v_me;
    perform public.notify('rahbar', null, '✅ Servis bajarildi · №' || v_ord.order_no || E'\n' || v_who || ': ' || coalesce(nullif(trim(p_note), ''), v.description) || E'\nYopish uchun tizimni oching.',
                          jsonb_build_object('service_id', p_id, 'order_id', v.order_id));
  else
    raise exception 'Amal noto''g''ri';
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.payroll_lines(p_month date)
 RETURNS TABLE(employee_id uuid, kind text, label text, base numeric, rate numeric, amount numeric, ref text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with b as (select date_trunc('month', p_month)::date as d1, (date_trunc('month', p_month) + interval '1 month')::date as d2),
  emp as (select e.* from employees e, b where (e.is_active or e.left_at >= b.d1) and (e.hired_at is null or e.hired_at < b.d2)),
  marks as (
    select m.done_by as emp, e.role, s.code as stage_code, s.name as stage_name,
           (m.done_at at time zone 'Asia/Tashkent')::date as d, oi.qty, oi.area_m2 * oi.qty as m2, o.order_no,
           (select c.params->>'series' from catalog_items c where c.id::text = oi.options->>'system') as series
    from item_stage_marks m
    join employees e on e.id = m.done_by join stages s on s.id = m.stage_id
    join order_items oi on oi.id = m.order_item_id join orders o on o.id = oi.order_id, b
    where (m.done_at at time zone 'Asia/Tashkent')::date >= b.d1 and (m.done_at at time zone 'Asia/Tashkent')::date < b.d2
  ),
  stage_lines as (
    select mk.emp as employee_id, bs.basis as kind,
           mk.stage_name || ' · ' || case bs.basis when 'per_m2' then 'm²' else 'oyna' end as label,
           sum(case bs.basis when 'per_m2' then mk.m2 else mk.qty end) as base, r.amount as rate,
           round(sum(case bs.basis when 'per_m2' then mk.m2 else mk.qty end) * r.amount, 2) as amount,
           string_agg(distinct '№' || mk.order_no::text, ', ') as ref
    from marks mk cross join (values ('per_m2'), ('per_window')) bs(basis)
    cross join lateral (
      select pr.amount from pay_rules pr
       where pr.basis = bs.basis and (pr.employee_id = mk.emp or (pr.employee_id is null and pr.role = mk.role))
         and pr.valid_from <= mk.d and (pr.valid_to is null or pr.valid_to >= mk.d)
         and (pr.stage_code is null or pr.stage_code = mk.stage_code) and (pr.series is null or pr.series = mk.series)
       order by (case when pr.employee_id is not null then 4 else 0 end + case when pr.stage_code is not null then 2 else 0 end + case when pr.series is not null then 1 else 0 end) desc,
                pr.valid_from desc, pr.created_at desc
       limit 1) r
    group by mk.emp, bs.basis, mk.stage_name, r.amount
  ),
  fixed_lines as (
    -- оклад/надбавка по дням: календарные дни месяца, когда одновременно действует правило и сотрудник работает (приём/уход);
    -- заодно смена ставки в середине месяца больше не даёт двойной оклад (старое правило — до даты, новое — с даты)
    select e.id as employee_id, pr.basis as kind,
           case pr.basis when 'salary' then 'Oylik' else 'Doimiy qo''shimcha' end as label,
           null::numeric as base, pr.amount as rate, round(pr.amount * x.days / x.dim, 2) as amount,
           case when x.days < x.dim then x.days::text || '/' || x.dim::text || ' kun' end as ref
    from pay_rules pr cross join b join emp e on (pr.employee_id = e.id or (pr.employee_id is null and pr.role = e.role))
    cross join lateral (select (b.d2 - b.d1) as dim,
        greatest(0, least(b.d2 - 1, coalesce(pr.valid_to, b.d2 - 1), coalesce(e.left_at, b.d2 - 1)) - greatest(b.d1, pr.valid_from, coalesce(e.hired_at, b.d1)) + 1) as days) x
    where pr.basis in ('salary', 'fixed') and pr.valid_from < b.d2 and (pr.valid_to is null or pr.valid_to >= b.d1) and x.days > 0
      and (pr.employee_id is not null or not exists (   -- личное правило перекрывает правило по роли
            select 1 from pay_rules p2 where p2.employee_id = e.id and p2.basis = pr.basis and p2.valid_from < b.d2 and (p2.valid_to is null or p2.valid_to >= b.d1)))
  ),
  sales as (
    select coalesce(sum(o.contract_price), 0) as s, count(*) as n from orders o, b
     where o.status <> 'cancelled' and not o.is_imported and (o.created_at at time zone 'Asia/Tashkent')::date >= b.d1 and (o.created_at at time zone 'Asia/Tashkent')::date < b.d2
  ),
  pct_lines as (
    select e.id as employee_id, pr.basis as kind, 'Savdodan ' || trim_scale(pr.amount)::text || '%' as label,
           sales.s as base, pr.amount as rate, round(sales.s * pr.amount / 100, 2) as amount, sales.n::text || ' ta buyurtma' as ref
    from pay_rules pr cross join b cross join sales join emp e on (pr.employee_id = e.id or (pr.employee_id is null and pr.role = e.role))
    where pr.basis = 'percent_sales' and pr.valid_from < b.d2 and (pr.valid_to is null or pr.valid_to >= b.d1)
      and (pr.employee_id is not null or not exists (
            select 1 from pay_rules p2 where p2.employee_id = e.id and p2.basis = pr.basis and p2.valid_from < b.d2 and (p2.valid_to is null or p2.valid_to >= b.d1)))
  ),
  adj_lines as (
    select e.id as employee_id, pr.basis as kind, case pr.basis when 'bonus' then 'Mukofot' else 'Jarima' end || coalesce(': ' || pr.note, '') as label,
           null::numeric as base, null::numeric as rate, case pr.basis when 'bonus' then pr.amount else -pr.amount end as amount, null::text as ref
    from pay_rules pr cross join b join emp e on (pr.employee_id = e.id or (pr.employee_id is null and pr.role = e.role))
    where pr.basis in ('bonus', 'penalty') and pr.valid_from >= b.d1 and pr.valid_from < b.d2
  ),
  brk_lines as (
    select gb.employee_id, 'breakage'::text as kind, 'Oyna sinishi №' || o.order_no::text || coalesce(': ' || gb.reason, '') as label,
           null::numeric as base, null::numeric as rate, -gb.amount as amount, null::text as ref
    from glass_breakages gb join orders o on o.id = gb.order_id, b
    where gb.payer = 'installer' and gb.decided and gb.employee_id is not null and gb.amount > 0
      and (coalesce(gb.decided_at, gb.created_at) at time zone 'Asia/Tashkent')::date >= b.d1 and (coalesce(gb.decided_at, gb.created_at) at time zone 'Asia/Tashkent')::date < b.d2
  )
  select l.employee_id, l.kind, l.label, l.base, l.rate, l.amount, l.ref from (
    select * from stage_lines union all select * from fixed_lines union all select * from pct_lines union all select * from adj_lines union all select * from brk_lines
  ) l where l.employee_id in (select id from emp) and l.amount <> 0
$function$;

CREATE OR REPLACE FUNCTION public.record_purchase(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_total numeric; ln jsonb; v_paid numeric := coalesce((p->>'paid_now')::numeric, 0);
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if not exists (select 1 from suppliers where id = (p->>'supplier_id')::uuid) then raise exception 'Yetkazib beruvchini tanlang'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p->'lines', '[]')) x where coalesce((x->>'qty')::numeric, 0) <= 0 or coalesce((x->>'unit_cost')::numeric, -1) < 0) then
    raise exception 'Miqdor va narxni tekshiring';
  end if;
  select coalesce(sum(round((x->>'qty')::numeric * (x->>'unit_cost')::numeric, 2)), 0) into v_total from jsonb_array_elements(coalesce(p->'lines', '[]')) x;
  if jsonb_array_length(coalesce(p->'lines', '[]')) = 0 then v_total := coalesce((p->>'total')::numeric, 0); end if;
  if v_total <= 0 then raise exception 'Xarid summasi 0 — narxlarni kiriting'; end if;
  if v_paid < 0 then raise exception 'To''lov summasi noto''g''ri'; end if;
  insert into purchases(supplier_id, purchased_at, total, delivery_cost, note, created_by)
  values ((p->>'supplier_id')::uuid, coalesce(nullif(p->>'purchased_at', '')::date, current_date), v_total,
          coalesce((p->>'delivery_cost')::numeric, 0), nullif(trim(p->>'note'), ''), public.my_id())
  returning id into v_id;
  for ln in select * from jsonb_array_elements(coalesce(p->'lines', '[]')) loop
    insert into purchase_items(purchase_id, item_id, part, qty, unit_cost)
    values (v_id, (ln->>'item_id')::uuid, coalesce(ln->>'part', ''), (ln->>'qty')::numeric, (ln->>'unit_cost')::numeric);
    insert into stock_movements(item_id, part, qty, kind, purchase_id, unit_cost, created_by)
    values ((ln->>'item_id')::uuid, coalesce(ln->>'part', ''), (ln->>'qty')::numeric, 'purchase', v_id, round((ln->>'unit_cost')::numeric * (1 + coalesce((p->>'delivery_cost')::numeric, 0) / nullif(v_total, 0)), 4), public.my_id());
  end loop;
  if v_paid > 0 then
    insert into supplier_payments(supplier_id, amount, paid_at, note, created_by)
    values ((p->>'supplier_id')::uuid, v_paid, coalesce(nullif(p->>'purchased_at', '')::date, current_date), 'Xarid paytida to''landi', public.my_id());
  end if;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.registratsiya_set(p_order uuid, p_field text, p_value text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v text := nullif(trim(coalesce(p_value, '')), ''); n numeric; v_cl uuid; v_cl2 uuid; v_paid numeric; v_st text;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if p_field in ('alyumin', 'plast', 'termo', 'mahsulot', 'sbor', 'dogovor') then
    n := nullif(replace(replace(coalesce(v, ''), ' ', ''), ',', '.'), '')::numeric;
    if n is not null and n < 0 then raise exception 'Manfiy bo''lishi mumkin emas'; end if;
  end if;
  case p_field
    when 'ismi' then
      if v is null then raise exception 'Ism bo''sh bo''lmasin'; end if;
      select client_id into v_cl from orders where id = p_order;
      if (select count(*) from orders where client_id = v_cl) > 1 then   -- у клиента есть другие заказы: не переименовываем всех, а заводим отдельного клиента для этой строки
        insert into clients(full_name, phone, address, created_by) select v, phone, address, public.my_id() from clients where id = v_cl returning id into v_cl2;
        update orders set client_id = v_cl2 where id = p_order;
      else
        update clients set full_name = v where id = v_cl;
      end if;
    when 'manzil' then update orders set address = v where id = p_order;
    when 'kontakt' then update orders set contact_phone = v where id = p_order;
    when 'rangi' then update orders set color = v where id = p_order;
    when 'sana' then
      if v::date > (now() at time zone 'Asia/Tashkent')::date then raise exception 'Sana kelajakda bo''lishi mumkin emas'; end if;
      update orders set created_at = (v::date + ((created_at at time zone 'Asia/Tashkent')::time)) at time zone 'Asia/Tashkent' where id = p_order;
    when 'ornatilish' then update orders set install_date = v::date where id = p_order;
    when 'dogovor' then
      if n is null then raise exception 'Summa kerak'; end if;
      select status into v_st from orders where id = p_order;
      select coalesce(sum(amount), 0) into v_paid from payments where order_id = p_order;
      if v_st = 'cancelled' then raise exception 'Bekor qilingan buyurtma narxi o''zgarmaydi'; end if;
      if n < v_paid then raise exception 'Shartnoma narxi to''langan summadan (%) kam bo''lishi mumkin emas', to_char(v_paid, 'FM999G999G999G990'); end if;
      update orders set contract_price = n where id = p_order;
    when 'alyumin' then update orders set m2_alu = n where id = p_order;
    when 'plast' then update orders set m2_plast = n where id = p_order;
    when 'termo' then update orders set m2_termo = n where id = p_order;
    when 'mahsulot' then update orders set cost_product = n where id = p_order;
    when 'sbor' then update orders set cost_service = n where id = p_order;
    else raise exception 'Bu ustunni tahrirlab bo''lmaydi: %', p_field;
  end case;
  if not found then raise exception 'Buyurtma topilmadi'; end if;
  if p_field in ('alyumin', 'plast', 'termo') then   -- м² строки таблицы = база для зарплаты и отчётов (у заказов с чертежом площадь считается из окон)
    update orders set area_m2 = coalesce(m2_alu, 0) + coalesce(m2_plast, 0) + coalesce(m2_termo, 0) where id = p_order and not exists (select 1 from order_items where order_id = p_order);
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.registratsiya_add(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
  values (v_client, nullif(trim(coalesce(p->>'address', '')), ''), v_phone, nullif(trim(coalesce(p->>'rangi', '')), ''), 'unknown',
          coalesce(nullif(p->>'soni', '')::int, 0), n_alu + n_pl + n_te, coalesce(v_prod, 0) + coalesce(v_serv, 0), v_contract, true,
          n_alu, n_pl, n_te, v_prod, v_serv, public.my_id(), (v_date + time '12:00') at time zone 'Asia/Tashkent')
  returning id, order_no into v_order, v_no;
  if v_paid > 0 then perform public.record_payment(v_order, v_paid, v_date, 'Jadvaldan'); end if;
  return jsonb_build_object('id', v_order, 'order_no', v_no);
end $function$;

