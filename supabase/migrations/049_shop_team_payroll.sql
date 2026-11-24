-- ECOROM 049 (24.11.2026, замечания Asad, блоки C и C2).
-- 1) Руководитель при отправке заказа в цех выбирает, кто работает над заказом: вся команда Ishlab chiqarish или отдельные люди.
-- 2) Ответ цеха («Yetadi / Yetmaydi / Brak»): записывается только первый; опоздавшие нажатия видны в журнале order_shop_late.
-- 3) Зарплата: этапная оплата (за м² и за окна) начисляется каждому назначенному на заказ (полностью, не делится);
--    монтаж — каждому из бригады; новая основа «за заказ» (per_order); оклад считается по дням/часам, пропуски вычитаются с объяснением.
-- 4) Статистика по сотруднику (worker_stats): заказы, окна, м², сервисы, пропуски, начислено — не зависит от типа оплаты.
-- Закрытые месяцы (payroll_accruals) не пересчитываются. Старые заказы без назначенных считаются по-старому (кто поставил отметку).

-- ===== кто работает над заказом =====
create table if not exists public.order_shop_workers (
  order_id uuid not null references public.orders(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  added_by uuid references public.employees(id),
  added_at timestamptz not null default now(),
  primary key (order_id, employee_id)
);
create index if not exists order_shop_workers_emp on public.order_shop_workers (employee_id);
alter table public.order_shop_workers enable row level security;
revoke all on public.order_shop_workers from anon, authenticated;
grant select on public.order_shop_workers to authenticated;
drop policy if exists osw_read on public.order_shop_workers;
create policy osw_read on public.order_shop_workers for select to authenticated using (public.is_rahbar() or employee_id = public.my_id());

alter table public.orders
  add column if not exists shop_team_all boolean not null default true,
  add column if not exists shop_accepted_by uuid references public.employees(id),
  add column if not exists shop_accepted_at timestamptz;

-- опоздавшие нажатия (кто, что, кто был первым) — журнал, только чтение Rahbar
create table if not exists public.order_shop_late (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  result text not null,
  winner_id uuid references public.employees(id),
  winner_result text,
  created_at timestamptz not null default now()
);
create index if not exists order_shop_late_order on public.order_shop_late (order_id, created_at);
alter table public.order_shop_late enable row level security;
revoke all on public.order_shop_late from anon, authenticated;
grant select on public.order_shop_late to authenticated;
drop policy if exists osl_read on public.order_shop_late;
create policy osl_read on public.order_shop_late for select to authenticated using (public.is_rahbar());

-- команда заказа: назначенные; у старых заказов без назначенных — весь цех
create or replace function public.shop_team(p_order uuid) returns table(employee_id uuid)
language sql stable security definer set search_path = public as $$
  select w.employee_id from order_shop_workers w join employees e on e.id = w.employee_id where w.order_id = p_order and e.is_active
  union all
  select e.id from employees e where e.role = 'ishlab' and e.is_active and not exists (select 1 from order_shop_workers w where w.order_id = p_order)
$$;
revoke all on function public.shop_team(uuid) from public, anon, authenticated;

-- кто получает деньги/статистику за отметку этапа: назначенные на заказ; нет назначенных — тот, кто поставил отметку
create or replace function public.mark_workers(p_order uuid, p_stage_code text, p_done_by uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select x.employee_id from (
    select sw.employee_id from order_shop_workers sw where sw.order_id = p_order and p_stage_code <> 'install'
    union
    select jm.employee_id from install_job_members jm join install_jobs j on j.id = jm.job_id where j.order_id = p_order and p_stage_code = 'install'
  ) x
  union all
  select p_done_by
   where not exists (select 1 from order_shop_workers sw where sw.order_id = p_order and p_stage_code <> 'install')
     and not exists (select 1 from install_job_members jm join install_jobs j on j.id = jm.job_id where j.order_id = p_order and p_stage_code = 'install')
$$;
revoke all on function public.mark_workers(uuid, text, uuid) from public, anon, authenticated;

-- цех видит только свои заказы (если назначенных нет — как раньше, все отправленные)
create or replace view public.w_orders as
select o.id, o.order_no, o.status, o.deadline, o.color, o.windows_count, o.area_m2,
       case when o.is_imported then null else o.notes end as notes,
       o.install_date,
       case when public.my_role() = 'montajchi' then o.address else null end as address,
       case when public.my_role() = 'montajchi' then coalesce(o.contact_phone, c.phone) else null end as contact_phone,
       c.full_name as client_name,
       o.shop_accepted_at
  from public.orders o
  left join public.clients c on c.id = o.client_id
 where (public.my_role() = 'ishlab' and o.shop_sent_at is not null and o.status in ('in_production', 'ready', 'installing')
        and (exists (select 1 from public.order_shop_workers w where w.order_id = o.id and w.employee_id = public.my_id())
             or not exists (select 1 from public.order_shop_workers w where w.order_id = o.id)))
    or (public.my_role() = 'montajchi' and exists (
          select 1 from public.install_jobs j join public.install_job_members m on m.job_id = j.id
           where j.order_id = o.id and m.employee_id = public.my_id()));

-- ===== отправка в цех: p_workers = кто работает (null = вся команда / оставить прежний выбор) =====
drop function if exists public.send_to_shop(uuid, boolean);
create or replace function public.send_to_shop(p_order uuid, p_force boolean default false, p_workers uuid[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v orders; v_resend boolean; v_all uuid[]; v_sel uuid[]; v_text text; e uuid; v_team_all boolean;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  select * into v from orders where id = p_order;
  if v.id is null then raise exception 'Buyurtma topilmadi'; end if;
  if v.status not in ('new', 'in_production') then raise exception 'Bu holatdagi buyurtma zavodga yuborilmaydi'; end if;
  if not exists (select 1 from order_items where order_id = p_order) then raise exception 'Buyurtmada oyna yo''q'; end if;
  if not coalesce(p_force, false) and (coalesce(v.calc_cost, 0) <= 0 or coalesce(v.contract_price, 0) <= 0) then
    raise exception 'NARX_NOL: tannarx yoki shartnoma narxi 0 — avval katalogga narxlarni kiriting';
  end if;
  select coalesce(array_agg(id), '{}') into v_all from employees where role = 'ishlab' and is_active;
  if coalesce(array_length(v_all, 1), 0) = 0 then raise exception 'Zavodda (Ishlab chiqarish) faol xodim yo''q'; end if;
  if p_workers is not null and coalesce(array_length(p_workers, 1), 0) = 0 then raise exception 'Kamida bitta xodimni tanlang'; end if;
  if p_workers is not null and exists (select 1 from unnest(p_workers) m where m <> all(v_all)) then
    raise exception 'Faqat faol Ishlab chiqarish xodimlarini tanlash mumkin';
  end if;
  v_resend := v.shop_sent_at is not null;
  -- кого назначаем: явный выбор; иначе прежний выбор при повторной отправке; иначе вся команда
  if p_workers is not null then v_sel := p_workers;
  elsif v_resend and exists (select 1 from order_shop_workers where order_id = p_order) then
    select coalesce(array_agg(w.employee_id), '{}') into v_sel from order_shop_workers w join employees x on x.id = w.employee_id where w.order_id = p_order and x.is_active;
    if coalesce(array_length(v_sel, 1), 0) = 0 then v_sel := v_all; end if;
  else v_sel := v_all;
  end if;
  v_team_all := (select bool_and(m = any(v_sel)) from unnest(v_all) m);
  delete from order_shop_workers where order_id = p_order and not (employee_id = any(v_sel));
  insert into order_shop_workers(order_id, employee_id, added_by) select p_order, m, public.my_id() from unnest(v_sel) m on conflict do nothing;
  update orders set status = 'in_production', shop_sent_at = now(), shop_sent_by = public.my_id(), shop_team_all = coalesce(v_team_all, false),
                    shop_reminded_at = null, shop_escalated_at = null, shop_accepted_by = null, shop_accepted_at = null
  where id = p_order;
  perform public.order_consume(p_order);
  v_text := case when v_resend then '🔁 Buyurtma o''zgardi — qayta tekshiring' else '🆕 Yangi buyurtma' end || E'\n'
            || public.shop_order_text(p_order) || E'\n\nSizda material yetadimi?';
  if coalesce(v_team_all, false) then
    perform public.notify('ishlab', null, v_text, jsonb_build_object('kind', 'material_check', 'order_id', p_order));
  else
    foreach e in array v_sel loop
      perform public.notify(null, e, v_text, jsonb_build_object('kind', 'material_check', 'order_id', p_order));
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'resend', v_resend, 'team_all', coalesce(v_team_all, false), 'workers', cardinality(v_sel),
    'recipients', (select count(*) from employees where id = any(v_sel) and telegram_id is not null));
end $$;
revoke all on function public.send_to_shop(uuid, boolean, uuid[]) from public, anon;
grant execute on function public.send_to_shop(uuid, boolean, uuid[]) to authenticated;

-- сменить исполнителей, пока заказ в цехе (новым — уведомление)
create or replace function public.shop_set_workers(p_order uuid, p_workers uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v orders; v_all uuid[]; v_old uuid[]; e uuid; v_text text;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  select * into v from orders where id = p_order for update;
  if v.id is null then raise exception 'Buyurtma topilmadi'; end if;
  if v.status not in ('in_production', 'ready') or v.shop_sent_at is null then raise exception 'Buyurtma hozir zavodda emas'; end if;
  if coalesce(array_length(p_workers, 1), 0) = 0 then raise exception 'Kamida bitta xodimni tanlang'; end if;
  select coalesce(array_agg(id), '{}') into v_all from employees where role = 'ishlab' and is_active;
  if exists (select 1 from unnest(p_workers) m where m <> all(v_all)) then raise exception 'Faqat faol Ishlab chiqarish xodimlarini tanlash mumkin'; end if;
  select coalesce(array_agg(employee_id), '{}') into v_old from order_shop_workers where order_id = p_order;
  delete from order_shop_workers where order_id = p_order and not (employee_id = any(p_workers));
  insert into order_shop_workers(order_id, employee_id, added_by) select p_order, m, public.my_id() from unnest(p_workers) m on conflict do nothing;
  update orders set shop_team_all = (select bool_and(m = any(p_workers)) from unnest(v_all) m) where id = p_order;
  v_text := '🆕 Siz buyurtmaga biriktirildingiz' || E'\n' || public.shop_order_text(p_order);
  foreach e in array p_workers loop
    if e <> all(v_old) or coalesce(array_length(v_old, 1), 0) = 0 then
      perform public.notify(null, e, v_text, jsonb_build_object('order_id', p_order));
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'workers', cardinality(p_workers));
end $$;
revoke all on function public.shop_set_workers(uuid, uuid[]) from public, anon;
grant execute on function public.shop_set_workers(uuid, uuid[]) to authenticated;

-- ===== ответ цеха: записывается только ПЕРВЫЙ; остальные нажатия — в журнал =====
create or replace function public.shop_answer_core(p_emp uuid, p_order uuid, p_result text, p_tg bigint default null, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_emp employees; v orders; v_first order_material_checks; v_first_name text; v_check uuid; v_note text := nullif(left(trim(coalesce(p_note, '')), 300), '');
begin
  if p_result not in ('enough', 'not_enough', 'defect') then return jsonb_build_object('ok', false, 'error', 'Noto''g''ri javob'); end if;
  select * into v_emp from employees where id = p_emp and is_active and role in ('ishlab', 'rahbar');
  if v_emp.id is null then return jsonb_build_object('ok', false, 'error', 'Siz tizimda yo''qsiz yoki bloklangansiz'); end if;
  select * into v from orders where id = p_order for update;       -- два нажатия одновременно не пройдут: второй ждёт и увидит ответ первого
  if v.id is null or v.shop_sent_at is null then return jsonb_build_object('ok', false, 'error', 'Buyurtma topilmadi'); end if;
  if v.status in ('closed', 'cancelled') then return jsonb_build_object('ok', false, 'error', 'Buyurtma yopilgan yoki bekor qilingan'); end if;
  if v_emp.role = 'ishlab' and not exists (select 1 from public.shop_team(p_order) t where t.employee_id = v_emp.id) then
    return jsonb_build_object('ok', false, 'error', 'Bu buyurtma sizga biriktirilmagan');
  end if;

  select * into v_first from order_material_checks where order_id = p_order and created_at >= v.shop_sent_at order by created_at asc limit 1;
  if v_first.id is not null then
    select full_name into v_first_name from employees where id = v_first.employee_id;
    insert into order_shop_late(order_id, employee_id, result, winner_id, winner_result) values (p_order, v_emp.id, p_result, v_first.employee_id, v_first.result);
    return jsonb_build_object('ok', false, 'taken', true, 'by', v_first_name, 'result', v_first.result,
      'error', 'Allaqachon javob berilgan: ' || coalesce(v_first_name, '—') || ' — ' || public.check_label(v_first.result));
  end if;

  insert into order_material_checks(order_id, employee_id, result, note) values (p_order, v_emp.id, p_result, v_note) returning id into v_check;
  if p_result = 'enough' then
    update order_material_checks set rahbar_notified_at = now() where id = v_check;
    update orders set shop_accepted_by = v_emp.id, shop_accepted_at = now() where id = p_order;
    perform public.notify('rahbar', null, '✅ №' || v.order_no || ': ' || v_emp.full_name || ' — qabul qildi, material yetadi', jsonb_build_object('order_id', p_order));
  elsif v_note is not null then
    update order_material_checks set rahbar_notified_at = now() where id = v_check;
    perform public.notify('rahbar', null, '⚠️ №' || v.order_no || E'\n' || v_emp.full_name || ': ' || public.check_label(p_result) || ' — ' || v_note, jsonb_build_object('order_id', p_order));
  elsif p_tg is not null then
    insert into bot_pending(telegram_id, check_id) values (p_tg, v_check)
    on conflict (telegram_id) do update set check_id = excluded.check_id, created_at = now();
  end if;
  return jsonb_build_object('ok', true, 'order_no', v.order_no, 'name', v_emp.full_name, 'need_reason', p_result <> 'enough' and v_note is null);
end $$;
revoke all on function public.shop_answer_core(uuid, uuid, text, bigint, text) from public, anon, authenticated;

-- бот
create or replace function public.shop_answer(p_tg bigint, p_order uuid, p_result text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from employees where telegram_id = p_tg and is_active and role in ('ishlab', 'rahbar');
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'Siz tizimda yo''qsiz yoki bloklangansiz'); end if;
  return public.shop_answer_core(v_id, p_order, p_result, p_tg, null);
end $$;
revoke all on function public.shop_answer(bigint, uuid, text) from public, anon, authenticated;
grant execute on function public.shop_answer(bigint, uuid, text) to service_role;

-- приложение (экран заказа / цех)
create or replace function public.shop_answer_web(p_order uuid, p_result text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if public.my_id() is null then raise exception 'Kirish kerak'; end if;
  return public.shop_answer_core(public.my_id(), p_order, p_result, null, p_note);
end $$;
revoke all on function public.shop_answer_web(uuid, text, text) from public, anon;
grant execute on function public.shop_answer_web(uuid, text, text) to authenticated;

-- состояние «заказ в цехе»: кто работает, кто ответил первым (видно Rahbar и назначенным)
create or replace function public.shop_state(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o orders;
begin
  if public.my_id() is null then raise exception 'Kirish kerak'; end if;
  if not public.is_rahbar() and not exists (select 1 from public.shop_team(p_order) t where t.employee_id = public.my_id()) then return null; end if;
  select * into o from orders where id = p_order;
  if o.id is null or o.shop_sent_at is null then return null; end if;
  return jsonb_build_object(
    'sent_at', o.shop_sent_at, 'team_all', o.shop_team_all,
    'team', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.full_name) order by e.full_name), '[]') from public.shop_team(p_order) t join employees e on e.id = t.employee_id),
    'first', (select jsonb_build_object('id', e.id, 'name', e.full_name, 'result', m.result, 'note', m.note, 'at', m.created_at)
                from order_material_checks m join employees e on e.id = m.employee_id
               where m.order_id = p_order and m.created_at >= o.shop_sent_at order by m.created_at asc limit 1),
    'late', (select coalesce(jsonb_agg(jsonb_build_object('name', e.full_name, 'result', l.result, 'at', l.created_at) order by l.created_at), '[]')
               from order_shop_late l join employees e on e.id = l.employee_id where l.order_id = p_order and l.created_at >= o.shop_sent_at));
end $$;
revoke all on function public.shop_state(uuid) from public, anon;
grant execute on function public.shop_state(uuid) to authenticated;

-- ===== напоминания цеха: только назначенным и только если ещё никто не ответил =====
create or replace function public.shop_tick() returns void
language plpgsql security definer set search_path = public as $$
declare v_hours numeric; r record; e record; v_silent text; v_from int; v_to int; v_quiet boolean;
begin
  select coalesce((value #>> '{}')::numeric, 2) into v_hours from app_settings where key = 'shop_reply_hours';
  v_hours := coalesce(v_hours, 2);
  select coalesce((value #>> '{}')::int, 8) into v_from from app_settings where key = 'notify_from_hour';
  select coalesce((value #>> '{}')::int, 20) into v_to from app_settings where key = 'notify_to_hour';
  v_quiet := not (extract(hour from (now() at time zone 'Asia/Tashkent'))::int >= coalesce(v_from, 8) and extract(hour from (now() at time zone 'Asia/Tashkent'))::int < coalesce(v_to, 20));
  -- у назначенных нет ни одного, подключённого к боту: заказ никому не дошёл → Rahbar
  if not v_quiet then
    for r in select o.id, o.order_no from orders o where o.status = 'in_production' and o.shop_sent_at is not null and o.shop_escalated_at is null
              and o.shop_sent_at < now() - make_interval(secs => v_hours * 3600)
              and not exists (select 1 from public.shop_team(o.id) t join employees x on x.id = t.employee_id where x.telegram_id is not null) loop
      update orders set shop_escalated_at = now(), shop_reminded_at = coalesce(shop_reminded_at, now()) where id = r.id;
      perform public.notify('rahbar', null, '🔕 №' || r.order_no || ': zavodda botga ulangan xodim yo''q — buyurtma hech kimga yetmadi', jsonb_build_object('order_id', r.id));
    end loop;
  end if;
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
  -- напоминание назначенным, если никто ещё не ответил
  for r in select o.id, o.order_no from orders o
            where o.status = 'in_production' and o.shop_sent_at is not null and o.shop_reminded_at is null and not v_quiet
              and o.shop_sent_at < now() - make_interval(secs => v_hours * 3600)
              and not exists (select 1 from order_material_checks m where m.order_id = o.id and m.created_at >= o.shop_sent_at) loop
    update orders set shop_reminded_at = now() where id = r.id;
    for e in select t.employee_id as id from public.shop_team(r.id) t loop
      perform public.notify(null, e.id, '⏰ Eslatma: javob bering' || E'\n' || public.shop_order_text(r.id) || E'\n\nSizda material yetadimi?',
                            jsonb_build_object('kind', 'material_check', 'order_id', r.id));
    end loop;
  end loop;
  -- после напоминания ещё столько же, ответа нет → Rahbar: кто молчит
  for r in select o.id, o.order_no, o.shop_sent_at from orders o
            where o.status = 'in_production' and o.shop_reminded_at is not null and o.shop_escalated_at is null and not v_quiet
              and o.shop_reminded_at < now() - make_interval(secs => v_hours * 3600)
              and not exists (select 1 from order_material_checks m where m.order_id = o.id and m.created_at >= o.shop_sent_at) loop
    update orders set shop_escalated_at = now() where id = r.id;
    select string_agg(x.full_name, ', ' order by x.full_name) into v_silent from public.shop_team(r.id) t join employees x on x.id = t.employee_id;
    if v_silent is not null then
      perform public.notify('rahbar', null, '🔕 №' || r.order_no || ': zavod javob bermadi — ' || v_silent, jsonb_build_object('order_id', r.id));
    end if;
  end loop;
end $$;
revoke all on function public.shop_tick() from public, anon, authenticated;

-- ===== оклад: дней в неделю и часов в день; основа «за заказ» =====
alter table public.pay_rules
  add column if not exists work_days_per_week int not null default 6,
  add column if not exists work_hours_per_day numeric(4,2) not null default 8;
alter table public.pay_rules drop constraint if exists pay_rules_work_chk;
alter table public.pay_rules add constraint pay_rules_work_chk check (work_days_per_week between 1 and 7 and work_hours_per_day > 0 and work_hours_per_day <= 24);
alter table public.pay_rules drop constraint if exists pay_rules_basis_check;
alter table public.pay_rules add constraint pay_rules_basis_check check (basis in ('salary', 'per_m2', 'per_window', 'per_order', 'percent_sales', 'fixed', 'bonus', 'penalty'));

-- ===== пропуски сотрудников (журнал: только добавление, отмена встречной записью) =====
create table if not exists public.attendance_absences (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  day date not null,
  hours numeric(4,2) check (hours is null or (hours > 0 and hours <= 24)),   -- null = весь день
  reason text not null check (reason in ('sick', 'leave', 'permit', 'skip', 'other')),
  note text,
  deduct boolean not null default true,                                      -- вычесть из оклада
  reverses_id uuid references public.attendance_absences(id),
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now()
);
create unique index if not exists attendance_absences_reverses_once on public.attendance_absences(reverses_id) where reverses_id is not null;
create index if not exists attendance_absences_emp_day on public.attendance_absences (employee_id, day);
alter table public.attendance_absences enable row level security;
revoke all on public.attendance_absences from anon, authenticated;

create or replace function public.absence_add(p_employee uuid, p_day date, p_hours numeric, p_reason text, p_note text default null, p_deduct boolean default true) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if not exists (select 1 from employees where id = p_employee and role <> 'rahbar') then raise exception 'Xodim topilmadi'; end if;
  if p_day is null then raise exception 'Sanani kiriting'; end if;
  if p_day > (now() at time zone 'Asia/Tashkent')::date + 31 then raise exception 'Sana juda uzoq kelajakda'; end if;
  if p_hours is not null and (p_hours <= 0 or p_hours > 24) then raise exception 'Soat noto''g''ri'; end if;
  insert into attendance_absences(employee_id, day, hours, reason, note, deduct, created_by)
  values (p_employee, p_day, p_hours, p_reason, nullif(trim(p_note), ''), coalesce(p_deduct, true), public.my_id()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.absence_cancel(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v attendance_absences; v_new uuid;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  select * into v from attendance_absences where id = p_id for update;
  if v.id is null or v.reverses_id is not null then raise exception 'Yozuv topilmadi'; end if;
  if exists (select 1 from attendance_absences where reverses_id = p_id) then raise exception 'Allaqachon bekor qilingan'; end if;
  insert into attendance_absences(employee_id, day, hours, reason, note, deduct, reverses_id, created_by)
  values (v.employee_id, v.day, v.hours, v.reason, 'bekor qilindi', false, p_id, public.my_id()) returning id into v_new;
  return v_new;
end $$;

create or replace function public.absences_list(p_month date, p_employee uuid default null)
returns table(id uuid, employee_id uuid, day date, hours numeric, reason text, note text, deduct boolean, cancelled boolean)
language sql stable security definer set search_path = public as $$
  select a.id, a.employee_id, a.day, a.hours, a.reason, a.note, a.deduct,
         exists (select 1 from attendance_absences x where x.reverses_id = a.id) as cancelled
    from attendance_absences a
   where public.is_rahbar() and a.reverses_id is null
     and a.day >= date_trunc('month', p_month)::date and a.day < (date_trunc('month', p_month) + interval '1 month')::date
     and (p_employee is null or a.employee_id = p_employee)
   order by a.day desc, a.created_at desc
$$;
revoke all on function public.absence_add(uuid, date, numeric, text, text, boolean), public.absence_cancel(uuid), public.absences_list(date, uuid) from public, anon;
grant execute on function public.absence_add(uuid, date, numeric, text, text, boolean), public.absence_cancel(uuid), public.absences_list(date, uuid) to authenticated;

-- ===== расчёт месяца =====
create or replace function public.payroll_lines(p_month date)
returns table(employee_id uuid, kind text, label text, base numeric, rate numeric, amount numeric, ref text)
language sql stable security definer set search_path = public as $$
  with b as (select date_trunc('month', p_month)::date as d1, (date_trunc('month', p_month) + interval '1 month')::date as d2),
  emp as (select e.* from employees e, b where (e.is_active or e.left_at >= b.d1) and (e.hired_at is null or e.hired_at < b.d2)),
  marks as (
    -- каждая отметка этапа начисляется каждому назначенному на заказ (нет назначенных — тому, кто поставил отметку)
    select w.emp as emp, e.role, s.code as stage_code, s.name as stage_name,
           (m.done_at at time zone 'Asia/Tashkent')::date as d, oi.qty, oi.area_m2 * oi.qty as m2, o.order_no,
           (select c.params->>'series' from catalog_items c where c.id::text = oi.options->>'system') as series
    from b cross join item_stage_marks m
    join stages s on s.id = m.stage_id
    join order_items oi on oi.id = m.order_item_id join orders o on o.id = oi.order_id
    cross join lateral public.mark_workers(o.id, s.code, m.done_by) as w(emp)
    join employees e on e.id = w.emp
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
  ord_lines as (
    -- «за заказ»: каждому из бригады монтажа полная сумма за установленный в месяце заказ (не делится)
    select x.emp as employee_id, 'per_order'::text as kind, 'Montaj · buyurtma uchun' as label,
           count(*)::numeric as base, r.amount as rate, round(count(*) * r.amount, 2) as amount,
           string_agg('№' || x.order_no::text, ', ' order by x.order_no) as ref
    from (
      select distinct o.id as order_id, o.order_no, o.install_date as d, jm.employee_id as emp
        from b cross join orders o join install_jobs j on j.order_id = o.id join install_job_members jm on jm.job_id = j.id
       where o.install_date >= b.d1 and o.install_date < b.d2 and o.status in ('installed', 'closed')
    ) x join employees e on e.id = x.emp
    cross join lateral (
      select pr.amount from pay_rules pr
       where pr.basis = 'per_order' and (pr.employee_id = x.emp or (pr.employee_id is null and pr.role = e.role))
         and pr.valid_from <= x.d and (pr.valid_to is null or pr.valid_to >= x.d)
       order by (case when pr.employee_id is not null then 1 else 0 end) desc, pr.valid_from desc, pr.created_at desc
       limit 1) r
    group by x.emp, r.amount
  ),
  fixed_lines as (
    select e.id as employee_id, pr.basis as kind,
           case pr.basis when 'salary' then 'Oylik' else 'Doimiy qo''shimcha' end as label,
           null::numeric as base, pr.amount as rate, round(pr.amount * x.days / x.dim, 2) as amount,
           case when x.days < x.dim then x.days::text || '/' || x.dim::text || ' kun' end as ref
    from pay_rules pr cross join b join emp e on (pr.employee_id = e.id or (pr.employee_id is null and pr.role = e.role))
    cross join lateral (select (b.d2 - b.d1) as dim,
        greatest(0, least(b.d2 - 1, coalesce(pr.valid_to, b.d2 - 1), coalesce(e.left_at, b.d2 - 1)) - greatest(b.d1, pr.valid_from, coalesce(e.hired_at, b.d1)) + 1) as days) x
    where pr.basis in ('salary', 'fixed') and pr.valid_from < b.d2 and (pr.valid_to is null or pr.valid_to >= b.d1) and x.days > 0
      and (pr.employee_id is not null or not exists (
            select 1 from pay_rules p2 where p2.employee_id = e.id and p2.basis = pr.basis and p2.valid_from < b.d2 and (p2.valid_to is null or p2.valid_to >= b.d1)))
  ),
  abs_lines as (
    -- пропуск с галочкой «вычесть»: цена дня = оклад / рабочие дни месяца (дней в неделю из правила), цена часа = цена дня / часов в день
    select a.employee_id, 'absence'::text as kind,
           'Kelmadi ' || to_char(a.day, 'DD.MM') || ' — ' || case a.reason when 'sick' then 'kasal' when 'leave' then 'ta''til' when 'permit' then 'ruxsat' when 'skip' then 'sababsiz' else 'boshqa' end
             || coalesce(': ' || a.note, '') as label,
           case when a.hours is null then 1 else round(a.hours / r.hrs, 4) end as base,
           round(r.amount / wd.n, 2) as rate,
           -round(r.amount / wd.n * case when a.hours is null then 1 else least(a.hours / r.hrs, 1) end, 2) as amount,
           case when a.hours is null then '1 kun' else trim_scale(a.hours)::text || ' soat' end as ref
    from b cross join attendance_absences a join employees e on e.id = a.employee_id
    cross join lateral (
      select pr.amount, pr.work_days_per_week as dpw, pr.work_hours_per_day as hrs from pay_rules pr
       where pr.basis = 'salary' and (pr.employee_id = a.employee_id or (pr.employee_id is null and pr.role = e.role))
         and pr.valid_from <= a.day and (pr.valid_to is null or pr.valid_to >= a.day)
       order by (case when pr.employee_id is not null then 1 else 0 end) desc, pr.valid_from desc, pr.created_at desc
       limit 1) r
    cross join lateral (
      select count(*)::int as n from generate_series(date_trunc('month', a.day)::date, (date_trunc('month', a.day) + interval '1 month' - interval '1 day')::date, interval '1 day') g
       where extract(isodow from g) <= r.dpw) wd
    where a.deduct and a.reverses_id is null and not exists (select 1 from attendance_absences x where x.reverses_id = a.id)
      and a.day >= b.d1 and a.day < b.d2 and extract(isodow from a.day) <= r.dpw and wd.n > 0
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
    select * from stage_lines union all select * from ord_lines union all select * from fixed_lines union all select * from abs_lines
    union all select * from pct_lines union all select * from adj_lines union all select * from brk_lines
  ) l where l.employee_id in (select id from emp) and l.amount <> 0
$$;
revoke all on function public.payroll_lines(date) from public, anon, authenticated;

-- этапы без ставки: оклад-сотрудникам (у кого действует оклад) ставка за м² не нужна; считаем по назначенным
create or replace function public.payroll_unpriced(p_month date)
returns table(employee_id uuid, employee text, stage text, base numeric, orders text)
language sql stable security definer set search_path = public as $$
  with b as (select date_trunc('month', p_month)::date as d1, (date_trunc('month', p_month) + interval '1 month')::date as d2),
  m as (
    select w.emp, e.role, e.full_name, s.code, s.name as sname, (dm.done_at at time zone 'Asia/Tashkent')::date as d,
           oi.area_m2 * oi.qty as m2, o.order_no,
           (select c.params->>'series' from catalog_items c where c.id::text = oi.options->>'system') as series
      from b cross join item_stage_marks dm join stages s on s.id = dm.stage_id
      join order_items oi on oi.id = dm.order_item_id join orders o on o.id = oi.order_id
      cross join lateral public.mark_workers(o.id, s.code, dm.done_by) as w(emp)
      join employees e on e.id = w.emp
     where (dm.done_at at time zone 'Asia/Tashkent')::date >= b.d1 and (dm.done_at at time zone 'Asia/Tashkent')::date < b.d2)
  select m.emp, m.full_name, m.sname, sum(m.m2), string_agg(distinct '№' || m.order_no::text, ', ')
    from m
   where public.is_rahbar()
     and not exists (select 1 from pay_rules pr
                      where pr.basis in ('per_m2', 'per_window', 'salary') and (pr.employee_id = m.emp or (pr.employee_id is null and pr.role = m.role))
                        and pr.valid_from <= m.d and (pr.valid_to is null or pr.valid_to >= m.d)
                        and (pr.basis = 'salary' or ((pr.stage_code is null or pr.stage_code = m.code) and (pr.series is null or pr.series = m.series))))
   group by m.emp, m.full_name, m.sname
$$;
revoke all on function public.payroll_unpriced(date) from public, anon;
grant execute on function public.payroll_unpriced(date) to authenticated;

-- ===== статистика по сотрудникам (не зависит от типа оплаты) =====
create or replace function public.worker_stats(p_month date, p_employee uuid default null)
returns table(employee_id uuid, full_name text, role text, orders int, windows int, m2 numeric, services int, absence_days numeric, absence_hours numeric, accrued numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_emp uuid := case when public.is_rahbar() then p_employee else public.my_id() end;
begin
  if public.my_id() is null then raise exception 'Kirish kerak'; end if;
  return query
  with b as (select date_trunc('month', p_month)::date as d1, (date_trunc('month', p_month) + interval '1 month')::date as d2),
  done as (
    select distinct w.emp, oi.id as item_id, o.id as order_id, oi.qty, oi.area_m2 * oi.qty as m2
      from b cross join item_stage_marks m join stages s on s.id = m.stage_id
      join order_items oi on oi.id = m.order_item_id join orders o on o.id = oi.order_id
      cross join lateral public.mark_workers(o.id, s.code, m.done_by) as w(emp)
     where (m.done_at at time zone 'Asia/Tashkent')::date >= b.d1 and (m.done_at at time zone 'Asia/Tashkent')::date < b.d2
  ),
  agg as (select d.emp, count(distinct d.order_id)::int as orders, sum(d.qty)::int as windows, sum(d.m2) as m2 from done d group by d.emp),
  svc as (select t.work_done_by as emp, count(*)::int as n from service_tickets t, b
           where t.work_done_at is not null and (t.work_done_at at time zone 'Asia/Tashkent')::date >= b.d1 and (t.work_done_at at time zone 'Asia/Tashkent')::date < b.d2 group by t.work_done_by),
  ab as (select a.employee_id as emp, coalesce(sum(case when a.hours is null then 1 end), 0)::numeric as days, coalesce(sum(a.hours), 0) as hrs
           from attendance_absences a, b
          where a.reverses_id is null and a.day >= b.d1 and a.day < b.d2 and not exists (select 1 from attendance_absences x where x.reverses_id = a.id)
          group by a.employee_id),
  pay as (select l.employee_id as emp, sum(l.amount) as s from public.payroll_lines(p_month) l group by l.employee_id)
  select e.id, e.full_name, e.role, coalesce(agg.orders, 0), coalesce(agg.windows, 0), coalesce(round(agg.m2, 2), 0), coalesce(svc.n, 0),
         coalesce(ab.days, 0), coalesce(ab.hrs, 0), coalesce(pay.s, 0)
    from employees e left join agg on agg.emp = e.id left join svc on svc.emp = e.id left join ab on ab.emp = e.id left join pay on pay.emp = e.id
   where e.role in ('ishlab', 'montajchi') and (v_emp is null or e.id = v_emp)
     and (e.is_active or agg.emp is not null or svc.emp is not null or pay.emp is not null)
   order by e.role, e.full_name;
end $$;
revoke all on function public.worker_stats(date, uuid) from public, anon;
grant execute on function public.worker_stats(date, uuid) to authenticated;

notify pgrst, 'reload schema';
