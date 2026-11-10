-- ECOROM 039 (блок 2): сервис — только на установленном заказе; бой стекла не дублирует кассу (расход — при закупке замены).
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
  v_w := public.order_warranty(p_order);
  insert into service_tickets(order_id, order_item_id, description, photo_paths, assigned_to, due_date, in_warranty, created_by)
  values (p_order, p_item, trim(p_description), coalesce(p_photos, '{}'), p_assignee, p_due, case when v_w is null then null else v_w >= current_date end, public.my_id())
  returning id into v_id;
  if p_assignee is not null then
    perform public.notify(null, p_assignee, public.service_notify_text(v_id, '🛠 Servis'), jsonb_build_object('service_id', v_id, 'order_id', p_order));
  end if;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.sync_breakage_cash(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b glass_breakages; v_ord expenses; v_want numeric; v_no int; v_cat int;
begin
  select * into b from glass_breakages where id = p_id;
  if b.id is null then return; end if;
  v_want := 0;  -- 039: бой не списывается из кассы отдельно — деньги уходят при закупке замены стекла (иначе двойной расход); бой остаётся в «потерях» отчёта
  select * into v_ord from expenses x where x.breakage_id = p_id and x.reverses_id is null
     and not exists (select 1 from expenses r where r.reverses_id = x.id) limit 1;
  if v_ord.id is not null and v_ord.amount <> v_want then
    insert into expenses(category_id, amount, spent_at, note, order_id, source, confirmed, created_by, reverses_id, breakage_id)
    values (v_ord.category_id, -v_ord.amount, v_ord.spent_at, 'Bekor qilindi (oyna sinishi o''zgardi)', v_ord.order_id, 'breakage', true, public.my_id(), v_ord.id, p_id);
    v_ord := null;
  end if;
  if v_ord.id is null and v_want > 0 then
    select id into v_cat from expense_categories where name = 'OYNA SINISHI';
    select order_no into v_no from orders where id = b.order_id;
    insert into expenses(category_id, amount, spent_at, note, order_id, source, confirmed, created_by, breakage_id)
    values (v_cat, v_want, (now() at time zone 'Asia/Tashkent')::date, 'Oyna sinishi №' || v_no || ' (' || b.pieces || ' ta)', b.order_id, 'breakage', true, public.my_id(), p_id);
  end if;
end $function$;
