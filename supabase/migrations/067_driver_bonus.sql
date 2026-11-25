-- ECOROM 067: роль «Haydovchi» (водитель/доставчик) и роль «xodim» (без рабочих экранов — повар и т.п., только оклад), бонус «Mukofot».
-- Водитель возит монтажников/сервис на адрес и привозит готовое. Руководитель назначает водителя вместе с бригадой монтажа (assign_install, необязательно):
-- водитель получает уведомление (Telegram + система) с номером заказа, адресом, телефоном заказчика, датой и бригадой; в системе видит только свои рейсы
-- (без цен, денег, имени клиента и чужих заказов), нажимает «Qabul qildim» и «Yetkazildi» — руководителю приходит уведомление. Зарплата водителя — оклад (pay_rules salary).
-- Бонус: give_bonus(сотрудник, сумма, дата, комментарий) → строка «Mukofot» в начислениях месяца + уведомление сотруднику; в закрытый месяц — нельзя.
-- Откат: drop view w_deliveries; drop function driver_*, give_bonus; alter table install_jobs drop column driver_*; вернуть check-ограничения ролей; assign_install из 057.

-- ============ 1. роли ============
alter table public.employees drop constraint if exists employees_role_check;
alter table public.employees add constraint employees_role_check check (role in ('rahbar', 'ishlab', 'montajchi', 'haydovchi', 'xodim'));
alter table public.pay_rules drop constraint if exists pay_rules_role_check;
alter table public.pay_rules add constraint pay_rules_role_check check (role in ('rahbar', 'ishlab', 'montajchi', 'haydovchi', 'xodim'));
alter table public.notifications drop constraint if exists notifications_target_role_check;
alter table public.notifications add constraint notifications_target_role_check check (target_role in ('rahbar', 'ishlab', 'montajchi', 'haydovchi', 'xodim'));
-- дата приёма по умолчанию — сегодня по Ташкенту (раньше UTC: оклад «съедал» или добавлял день)
alter table public.employees alter column hired_at set default ((now() at time zone 'Asia/Tashkent')::date);

-- ============ 2. рейсы водителя ============
alter table public.install_jobs add column if not exists driver_id uuid references public.employees(id);
alter table public.install_jobs add column if not exists driver_accepted_at timestamptz;
alter table public.install_jobs add column if not exists driver_delivered_at timestamptz;

-- assign_install(+p_driver): водитель необязателен; смена водителя/даты — новое уведомление водителю
do $$
declare v_src text; v_new text;
begin
  select pg_get_functiondef('public.assign_install(uuid, date, uuid[], text)'::regprocedure) into v_src;
  v_new := replace(v_src, 'p_note text DEFAULT NULL::text)', 'p_note text DEFAULT NULL::text, p_driver uuid DEFAULT NULL::uuid)');
  v_new := replace(v_new, 'declare v orders; v_job install_jobs;', 'declare v_drv employees; v_old_drv uuid; v_crew text; v orders; v_job install_jobs;');
  v_new := replace(v_new, E'  select * into v_job from install_jobs where order_id = p_order and status <> ''done'' order by created_at desc limit 1;',
    E'  if p_driver is not null then\n    select * into v_drv from employees where id = p_driver and role = ''haydovchi'' and is_active;\n    if v_drv.id is null then raise exception ''Faqat faol haydovchini tanlash mumkin''; end if;\n  end if;\n  select * into v_job from install_jobs where order_id = p_order and status <> ''done'' order by created_at desc limit 1;');
  v_new := replace(v_new, E'  return v_job.id;\nend',
    E'  select driver_id into v_old_drv from install_jobs where id = v_job.id;\n'
    || E'  if v_old_drv is distinct from p_driver then update install_jobs set driver_id = p_driver, driver_accepted_at = null, driver_delivered_at = null where id = v_job.id; end if;\n'
    || E'  if p_driver is not null and (v_old_drv is distinct from p_driver or v_date_changed) then\n'
    || E'    select string_agg(e2.full_name, '', '') into v_crew from employees e2 where e2.id = any(p_members);\n'
    || E'    perform public.notify(null, p_driver, ''🚚 Reys'' || case when v_old_drv is not distinct from p_driver then '' (sana o''''zgardi)'' else '''' end\n'
    || E'      || E''\\n№'' || v.order_no || E''\\nSana: '' || to_char(p_date, ''DD.MM.YYYY'') || coalesce(E''\\nManzil: '' || v.address, '''')\n'
    || E'      || coalesce(E''\\nTelefon: '' || coalesce(v.contact_phone, (select c3.phone from clients c3 where c3.id = v.client_id)), '''') || coalesce(E''\\nBrigada: '' || v_crew, ''''),\n'
    || E'      jsonb_build_object(''kind'', ''delivery'', ''job_id'', v_job.id, ''order_id'', p_order));\n'
    || E'  end if;\n  return v_job.id;\nend');
  if v_new = v_src or v_new not like '%v_old_drv%' or v_new not like '%Faqat faol haydovchini%' or v_new not like '%p_driver uuid%' then raise exception 'assign_install: замена не сработала'; end if;
  drop function public.assign_install(uuid, date, uuid[], text);
  execute v_new;
end $$;
revoke all on function public.assign_install(uuid, date, uuid[], text, uuid) from public, anon;
grant execute on function public.assign_install(uuid, date, uuid[], text, uuid) to authenticated;

-- рабочее представление водителя: только свои рейсы; клиент/адрес/телефон скрыты, когда заказ закрыт или отменён; цен нет
create or replace view public.w_deliveries with (security_invoker = false) as
 select j.id as job_id, o.id as order_id, o.order_no, j.plan_date, j.status as job_status, o.status as order_status,
        case when o.status not in ('closed', 'cancelled') then o.address end as address,
        case when o.status not in ('closed', 'cancelled') then coalesce(o.contact_phone, c.phone) end as contact_phone,
        j.driver_accepted_at, j.driver_delivered_at,
        (select string_agg(e.full_name, ', ' order by e.full_name) from install_job_members m join employees e on e.id = m.employee_id where m.job_id = j.id) as crew
   from install_jobs j join orders o on o.id = j.order_id left join clients c on c.id = o.client_id
  where my_role() = 'haydovchi' and j.driver_id = my_id();
grant select on public.w_deliveries to authenticated;

-- действие водителя (общее для сайта и бота): accept / delivered
create or replace function public.driver_action_core(p_emp uuid, p_job uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_emp employees; j install_jobs; o orders; v_new boolean := false;
begin
  if p_action not in ('accept', 'delivered') then return jsonb_build_object('ok', false, 'error', 'Noto''g''ri amal'); end if;
  select * into v_emp from employees where id = p_emp and is_active and role = 'haydovchi';
  if v_emp.id is null then return jsonb_build_object('ok', false, 'error', 'Siz tizimda yo''qsiz yoki bloklangansiz'); end if;
  select * into j from install_jobs where id = p_job for update;
  if j.id is null or j.driver_id is distinct from p_emp then return jsonb_build_object('ok', false, 'error', 'Bu reys sizga biriktirilmagan'); end if;
  select * into o from orders where id = j.order_id;
  if o.status in ('closed', 'cancelled') then return jsonb_build_object('ok', false, 'error', 'Buyurtma yopilgan yoki bekor qilingan'); end if;
  if p_action = 'accept' then
    if j.driver_accepted_at is not null then return jsonb_build_object('ok', true, 'already', true, 'order_no', o.order_no); end if;
    update install_jobs set driver_accepted_at = now() where id = p_job;
    perform public.notify('rahbar', null, '🚚 №' || o.order_no || ': ' || v_emp.full_name || ' — reysni qabul qildi', jsonb_build_object('order_id', o.id));
  else
    if j.driver_delivered_at is not null then return jsonb_build_object('ok', true, 'already', true, 'order_no', o.order_no); end if;
    update install_jobs set driver_delivered_at = now(), driver_accepted_at = coalesce(driver_accepted_at, now()) where id = p_job;
    perform public.notify('rahbar', null, '🚚 №' || o.order_no || ': ' || v_emp.full_name || ' — yetkazib berdi', jsonb_build_object('order_id', o.id));
  end if;
  return jsonb_build_object('ok', true, 'order_no', o.order_no);
end $$;
revoke all on function public.driver_action_core(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.driver_action(p_job uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() <> 'haydovchi' then raise exception 'Bu amal sizga ruxsat etilmagan'; end if;
  return public.driver_action_core(public.my_id(), p_job, p_action);
end $$;
revoke all on function public.driver_action(uuid, text) from public, anon;
grant execute on function public.driver_action(uuid, text) to authenticated;

-- то же для бота: сотрудник определяется по Telegram
create or replace function public.driver_answer(p_tg bigint, p_job uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_emp uuid;
begin
  select id into v_emp from employees where telegram_id = p_tg and is_active and role = 'haydovchi';
  if v_emp is null then return jsonb_build_object('ok', false, 'error', 'Siz tizimda yo''qsiz yoki bloklangansiz'); end if;
  return public.driver_action_core(v_emp, p_job, p_action);
end $$;
revoke all on function public.driver_answer(bigint, uuid, text) from public, anon, authenticated;

-- ============ 3. бонус ============
create or replace function public.give_bonus(p_employee uuid, p_amount numeric, p_date date default null, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Tashkent')::date; v_d date; v_id uuid; v_emp employees; v_month date;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1e10 then raise exception 'Summa noto''g''ri'; end if;
  select * into v_emp from employees where id = p_employee and is_active;
  if v_emp.id is null then raise exception 'Faol xodim topilmadi'; end if;
  v_d := coalesce(p_date, v_today);
  if v_d > v_today or v_d < date '2020-01-01' then raise exception 'Sana noto''g''ri'; end if;
  v_month := date_trunc('month', v_d)::date;
  if exists (select 1 from payroll_months where month = v_month and closed_at is not null) then raise exception 'Oy yopilgan — mukofot yozib bo''lmaydi'; end if;
  insert into pay_rules(employee_id, basis, amount, valid_from, valid_to, note)
  values (p_employee, 'bonus', round(p_amount, 2), v_d, v_d, nullif(trim(coalesce(p_note, '')), '')) returning id into v_id;
  perform public.notify(null, p_employee, '🎁 Mukofot: ' || replace(to_char(round(p_amount), 'FM999G999G999G990'), ',', ' ') || ' so''m'
                        || coalesce(E'\n' || nullif(trim(coalesce(p_note, '')), ''), '') || E'\nTafsilot — «Ish haqim» bo''limida.', '{}'::jsonb);
  return v_id;
end $$;
revoke all on function public.give_bonus(uuid, numeric, date, text) from public, anon;
grant execute on function public.give_bonus(uuid, numeric, date, text) to authenticated;
