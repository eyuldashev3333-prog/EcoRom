-- ECOROM 009: заказ → цех. Rahbar жмёт «Sexga yuborish» → всем в цеху сообщение (размеры, материалы) с кнопками
-- Yetadi / Yetmaydi / Brak. Отвечает каждый, все ответы хранятся. «Yetmaydi/Brak» → причина одной строкой → Rahbar.
-- Нет ответа за shop_reply_hours → напоминание тем, кто молчит; ещё столько же → сообщение Rahbar.
create extension if not exists pg_cron;

alter table public.orders
  add column if not exists shop_sent_at timestamptz,
  add column if not exists shop_sent_by uuid references public.employees(id),
  add column if not exists shop_reminded_at timestamptz,
  add column if not exists shop_escalated_at timestamptz;

alter table public.order_material_checks add column if not exists rahbar_notified_at timestamptz;
create index if not exists order_material_checks_order on public.order_material_checks (order_id, created_at);

-- бот ждёт от человека причину (после «Yetmaydi»/«Brak»); служебная, через API не видна
create table if not exists public.bot_pending (
  telegram_id bigint primary key,
  check_id uuid not null references public.order_material_checks(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.bot_pending enable row level security;
revoke all on public.bot_pending from anon, authenticated;

insert into public.app_settings (key, value) values ('shop_reply_hours', '2') on conflict (key) do nothing;

-- 21.4 → «21,4», 10.00 → «10»
create or replace function public.fmt_qty(x numeric) returns text language sql immutable as $$
  select replace(rtrim(rtrim(to_char(round(coalesce(x, 0), 2), 'FM999999990.00'), '0'), '.'), '.', ',')
$$;

create or replace function public.check_label(r text) returns text language sql immutable as $$
  select case r when 'enough' then 'Yetadi' when 'not_enough' then 'Yetmaydi' when 'defect' then 'Brak' else r end
$$;

-- текст для цеха: позиции и суммарный расход материалов (без цен)
create or replace function public.shop_order_text(p_order uuid) returns text
language sql stable security definer set search_path = public as $$
  select concat_ws(E'\n',
    'Buyurtma №' || o.order_no || ' · ' || c.full_name,
    case when o.deadline is not null then 'Muddat: ' || to_char(o.deadline, 'DD.MM.YYYY') end,
    (select string_agg(i.pos || ') ' || coalesce(i.title || ': ', '') || i.width_mm || '×' || i.height_mm || ', ' || i.qty || ' ta'
                       || coalesce(' — ' || s.name, ''), E'\n' order by i.pos)
       from order_items i left join catalog_items s on s.id::text = i.options->>'system'
      where i.order_id = o.id),
    (select E'\nMateriallar:\n' || string_agg('• ' || m.name || ': ' || fmt_qty(m.qty) || ' '
                       || case m.unit when 'm' then 'm' when 'm2' then 'm²' else 'ta' end, E'\n' order by m.name)
       from (select x->>'name' as name, x->>'unit' as unit, sum((x->>'qty')::numeric * i.qty) as qty
               from order_items i, jsonb_array_elements(coalesce(i.materials->'items', '[]')) x
              where i.order_id = o.id group by 1, 2) m),
    case when o.notes is not null then E'\nIzoh: ' || o.notes end)
  from orders o join clients c on c.id = o.client_id where o.id = p_order
$$;

-- Rahbar: отправить заказ в цех (повторно — если заказ изменили)
create or replace function public.send_to_shop(p_order uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v orders; v_resend boolean;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  select * into v from orders where id = p_order;
  if v.id is null then raise exception 'Buyurtma topilmadi'; end if;
  if v.status not in ('new', 'in_production') then raise exception 'Bu holatdagi buyurtma sexga yuborilmaydi'; end if;
  if not exists (select 1 from order_items where order_id = p_order) then raise exception 'Buyurtmada oyna yo''q'; end if;
  v_resend := v.shop_sent_at is not null;
  update orders set status = 'in_production', shop_sent_at = now(), shop_sent_by = public.my_id(),
                    shop_reminded_at = null, shop_escalated_at = null
  where id = p_order;
  perform public.notify('ishlab', null,
    case when v_resend then '🔁 Buyurtma o''zgardi — qayta tekshiring' else '🆕 Yangi buyurtma' end || E'\n'
    || public.shop_order_text(p_order) || E'\n\nSizda material yetadimi?',
    jsonb_build_object('kind', 'material_check', 'order_id', p_order));
  return jsonb_build_object('ok', true, 'resend', v_resend,
    'recipients', (select count(*) from employees where role = 'ishlab' and is_active and telegram_id is not null));
end $$;

-- бот: человек нажал кнопку
create or replace function public.shop_answer(p_tg bigint, p_order uuid, p_result text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_emp employees; v orders; v_prev text; v_check uuid;
begin
  if p_result not in ('enough', 'not_enough', 'defect') then return jsonb_build_object('ok', false, 'error', 'Noto''g''ri javob'); end if;
  select * into v_emp from employees where telegram_id = p_tg and is_active and role in ('ishlab', 'rahbar');
  if v_emp.id is null then return jsonb_build_object('ok', false, 'error', 'Siz tizimda yo''qsiz yoki bloklangansiz'); end if;
  select * into v from orders where id = p_order;
  if v.id is null or v.shop_sent_at is null then return jsonb_build_object('ok', false, 'error', 'Buyurtma topilmadi'); end if;
  if v.status in ('closed', 'cancelled') then return jsonb_build_object('ok', false, 'error', 'Buyurtma yopilgan yoki bekor qilingan'); end if;

  select result into v_prev from order_material_checks where order_id = p_order and created_at >= v.shop_sent_at order by created_at desc limit 1;
  insert into order_material_checks(order_id, employee_id, result) values (p_order, v_emp.id, p_result) returning id into v_check;

  if p_result = 'enough' then
    delete from bot_pending where telegram_id = p_tg;
    update order_material_checks set rahbar_notified_at = now() where id = v_check;
    if v_prev in ('not_enough', 'defect') then   -- была проблема, теперь хватает → Rahbar должен знать
      perform public.notify('rahbar', null, '✅ №' || v.order_no || ': ' || v_emp.full_name || ' — endi material yetadi',
                            jsonb_build_object('order_id', p_order));
    end if;
  else
    insert into bot_pending(telegram_id, check_id) values (p_tg, v_check)
    on conflict (telegram_id) do update set check_id = excluded.check_id, created_at = now();
  end if;
  return jsonb_build_object('ok', true, 'order_no', v.order_no, 'name', v_emp.full_name, 'need_reason', p_result <> 'enough');
end $$;

-- бот: человек прислал причину одной строкой (null — бот ничего не ждал)
create or replace function public.shop_reason(p_tg bigint, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_check order_material_checks; v_no bigint; v_client text; v_name text;
begin
  select m.* into v_check from bot_pending b join order_material_checks m on m.id = b.check_id
   where b.telegram_id = p_tg and b.created_at > now() - interval '1 hour';
  delete from bot_pending where telegram_id = p_tg;
  if v_check.id is null then return null; end if;
  update order_material_checks set note = left(trim(p_text), 300), rahbar_notified_at = now() where id = v_check.id;
  select o.order_no, c.full_name into v_no, v_client from orders o join clients c on c.id = o.client_id where o.id = v_check.order_id;
  select full_name into v_name from employees where id = v_check.employee_id;
  perform public.notify('rahbar', null,
    '⚠️ №' || v_no || ' · ' || v_client || E'\n' || v_name || ': ' || public.check_label(v_check.result) || ' — ' || left(trim(p_text), 300),
    jsonb_build_object('order_id', v_check.order_id));
  return jsonb_build_object('ok', true, 'order_no', v_no);
end $$;

-- каждые 10 минут: причина не пришла, напоминания, сообщение Rahbar о молчании цеха
create or replace function public.shop_tick() returns void
language plpgsql security definer set search_path = public as $$
declare v_hours numeric; r record; e record; v_silent text;
begin
  select coalesce((value #>> '{}')::numeric, 2) into v_hours from app_settings where key = 'shop_reply_hours';
  v_hours := coalesce(v_hours, 2);

  -- «Yetmaydi/Brak» без причины 15 минут → Rahbar всё равно узнаёт
  for r in select m.id, m.order_id, m.result, o.order_no, c.full_name as client, e2.full_name as who
             from order_material_checks m join orders o on o.id = m.order_id join clients c on c.id = o.client_id
             join employees e2 on e2.id = m.employee_id
            where m.result <> 'enough' and m.rahbar_notified_at is null and m.created_at < now() - interval '15 minutes' loop
    update order_material_checks set rahbar_notified_at = now() where id = r.id;
    delete from bot_pending where check_id = r.id;
    perform public.notify('rahbar', null, '⚠️ №' || r.order_no || ' · ' || r.client || E'\n' || r.who || ': ' || public.check_label(r.result) || ' (sabab yozilmadi)',
                          jsonb_build_object('order_id', r.order_id));
  end loop;

  -- напоминание тем, кто не ответил
  for r in select o.id, o.order_no from orders o
            where o.status = 'in_production' and o.shop_sent_at is not null and o.shop_reminded_at is null
              and o.shop_sent_at < now() - make_interval(secs => v_hours * 3600) loop
    update orders set shop_reminded_at = now() where id = r.id;
    for e in select id from employees x where x.role = 'ishlab' and x.is_active
               and not exists (select 1 from order_material_checks m, orders o where o.id = r.id and m.order_id = o.id
                                 and m.employee_id = x.id and m.created_at >= o.shop_sent_at) loop
      perform public.notify(null, e.id, '⏰ Eslatma: javob bering' || E'\n' || public.shop_order_text(r.id) || E'\n\nSizda material yetadimi?',
                            jsonb_build_object('kind', 'material_check', 'order_id', r.id));
    end loop;
  end loop;

  -- после напоминания ещё столько же → Rahbar: кто молчит
  for r in select o.id, o.order_no, o.shop_sent_at from orders o
            where o.status = 'in_production' and o.shop_reminded_at is not null and o.shop_escalated_at is null
              and o.shop_reminded_at < now() - make_interval(secs => v_hours * 3600) loop
    update orders set shop_escalated_at = now() where id = r.id;
    select string_agg(x.full_name, ', ' order by x.full_name) into v_silent from employees x
     where x.role = 'ishlab' and x.is_active
       and not exists (select 1 from order_material_checks m where m.order_id = r.id and m.employee_id = x.id and m.created_at >= r.shop_sent_at);
    if v_silent is not null then
      perform public.notify('rahbar', null, '🔕 №' || r.order_no || ': sex javob bermadi — ' || v_silent, jsonb_build_object('order_id', r.id));
    end if;
  end loop;
end $$;

revoke all on function public.shop_order_text(uuid), public.send_to_shop(uuid), public.shop_answer(bigint, uuid, text),
  public.shop_reason(bigint, text), public.shop_tick() from public, anon, authenticated;
grant execute on function public.send_to_shop(uuid) to authenticated;
grant execute on function public.shop_answer(bigint, uuid, text), public.shop_reason(bigint, text) to service_role;

select cron.unschedule('shop_tick') where exists (select 1 from cron.job where jobname = 'shop_tick');
select cron.schedule('shop_tick', '*/10 * * * *', 'select public.shop_tick()');
