-- ECOROM 010: галочки этапов по каждой позиции заказа. Каждый отмечает за себя (кто + когда — основа зарплаты и скорости).
-- Этап принадлежит роли: Kesish/Yig'ish/Shisha — цех, Montaj — монтажник (до Фазы 3 его может отметить Rahbar).
-- Все этапы цеха по всем позициям → заказ «Tayyor» + сообщение Rahbar; сняли галочку → обратно «Ishlab chiqarishda».
alter table public.stages add column if not exists role text not null default 'ishlab' check (role in ('ishlab', 'montajchi'));
update public.stages set name = 'Kesish' where code = 'cut';
update public.stages set name = 'Yig''ish' where code = 'assemble';
update public.stages set name = 'Shisha / furnitura' where code = 'glass_fit';
update public.stages set name = 'Montaj', role = 'montajchi' where code = 'install';

-- % готовности: позиция ×2 окна весит вдвое больше
create or replace view public.v_order_progress with (security_invoker = true) as
  select o.id as order_id, o.order_no,
         coalesce((select sum(i.qty) from public.order_items i where i.order_id = o.id), 0) as items,
         coalesce((select sum(i.qty) from public.item_stage_marks m join public.order_items i on i.id = m.order_item_id
                    join public.stages s on s.id = m.stage_id and s.is_active where i.order_id = o.id), 0) as done_marks,
         (select count(*) from public.stages where is_active) as stages_count,
         case when not exists (select 1 from public.order_items i where i.order_id = o.id) then 0
              else round(100.0 * coalesce((select sum(i.qty) from public.item_stage_marks m join public.order_items i on i.id = m.order_item_id
                                            join public.stages s on s.id = m.stage_id and s.is_active where i.order_id = o.id), 0)
                   / ((select sum(i.qty) from public.order_items i where i.order_id = o.id) * greatest((select count(*) from public.stages where is_active), 1)), 1) end as percent
  from public.orders o;

-- цеху — имя клиента (как в сообщении бота), без телефона/адреса
create or replace view public.w_orders as
  select o.id, o.order_no, o.status, o.deadline, o.color, o.windows_count, o.area_m2, o.notes, o.install_date,
         case when public.my_role() = 'montajchi' then o.address end as address,
         case when public.my_role() = 'montajchi' then o.contact_phone end as contact_phone,
         (select c.full_name from public.clients c where c.id = o.client_id) as client_name
  from public.orders o
  where public.my_role() = 'ishlab'
     or (public.my_role() = 'montajchi' and exists (
          select 1 from public.install_jobs j join public.install_job_members m on m.job_id = j.id
          where j.order_id = o.id and m.employee_id = public.my_id()));

-- отметки по заказам, которые человек видит (кто и когда)
create or replace view public.w_stage_marks as
  select m.id, m.order_item_id, m.stage_id, m.done_by, m.done_at, e.full_name as done_by_name
  from public.item_stage_marks m join public.employees e on e.id = m.done_by
  where m.order_item_id in (select id from public.w_order_items);
revoke all on public.w_stage_marks from anon, authenticated;
grant select on public.w_stage_marks to authenticated;

-- поставить / снять галочку
create or replace function public.mark_stage(p_item uuid, p_stage int, p_done boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.my_id(); v_role text := public.my_role(); v_stage stages; v_order orders;
        v_mark item_stage_marks; v_who text; v_left int; v_pct numeric;
begin
  if v_me is null then raise exception 'Kirish kerak'; end if;
  select * into v_stage from stages where id = p_stage and is_active;
  if v_stage.id is null then raise exception 'Bosqich topilmadi'; end if;
  if v_role <> 'rahbar' and v_role <> v_stage.role then raise exception 'Bu bosqich sizniki emas'; end if;
  select o.* into v_order from orders o join order_items i on i.order_id = o.id where i.id = p_item for update of o;
  if v_order.id is null then raise exception 'Pozitsiya topilmadi'; end if;
  if v_role = 'montajchi' and not exists (select 1 from w_orders where id = v_order.id) then raise exception 'Bu buyurtma sizga biriktirilmagan'; end if;
  if v_order.status = 'new' then raise exception 'Buyurtma hali sexga yuborilmagan'; end if;
  if v_order.status not in ('in_production', 'ready', 'installing') then raise exception 'Buyurtma yopilgan yoki bekor qilingan — belgilab bo''lmaydi'; end if;

  select * into v_mark from item_stage_marks where order_item_id = p_item and stage_id = p_stage;
  if p_done then
    if v_mark.id is not null then
      select full_name into v_who from employees where id = v_mark.done_by;
      raise exception 'Allaqachon belgilangan: %', v_who;
    end if;
    insert into item_stage_marks(order_item_id, stage_id, done_by) values (p_item, p_stage, v_me);
  else
    if v_mark.id is null then raise exception 'Belgi yo''q'; end if;
    if v_mark.done_by <> v_me and v_role <> 'rahbar' then raise exception 'Faqat o''z belgingizni olib tashlay olasiz'; end if;
    delete from item_stage_marks where id = v_mark.id;
  end if;

  -- сколько галочек цеха ещё не стоит по всему заказу
  select count(*) into v_left from order_items i cross join stages s
   where i.order_id = v_order.id and s.is_active and s.role = 'ishlab'
     and not exists (select 1 from item_stage_marks m where m.order_item_id = i.id and m.stage_id = s.id);
  if v_left = 0 and v_order.status = 'in_production' then
    update orders set status = 'ready' where id = v_order.id;
    perform public.notify('rahbar', null, '✅ №' || v_order.order_no || ' tayyor — sex barcha bosqichlarni tugatdi',
                          jsonb_build_object('order_id', v_order.id));
  elsif v_left > 0 and v_order.status = 'ready' then
    update orders set status = 'in_production' where id = v_order.id;
  end if;

  select percent into v_pct from v_order_progress where order_id = v_order.id;
  return jsonb_build_object('percent', v_pct, 'status', (select status from orders where id = v_order.id));
end $$;
revoke all on function public.mark_stage(uuid, int, boolean) from public, anon;
grant execute on function public.mark_stage(uuid, int, boolean) to authenticated;
