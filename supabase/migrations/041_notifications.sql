-- ECOROM 041 (блок 4 плана исправлений): уведомления (H9).
alter table public.notifications add column if not exists attempts int not null default 0;
alter table public.notifications add column if not exists delivered_tg bigint[] not null default '{}';
alter table public.notifications add column if not exists last_attempt_at timestamptz;

-- настройки: пока система не запущена, рассылки Rahbar/цеху по расписанию выключены; тихие часы для напоминаний
insert into public.app_settings(key, value) values ('digests_on', 'false'::jsonb), ('notify_from_hour', '8'::jsonb), ('notify_to_hour', '20'::jsonb) on conflict (key) do nothing;
update public.app_settings set value = 'false'::jsonb where key = 'expense_reminder_on';

-- повторная отправка неотправленных/с временной ошибкой уведомлений (до 5 попыток)
create or replace function public.notify_retry() returns void language plpgsql security definer set search_path = public, private as $$
declare fn_url text; secret text; r record;
begin
  select value into fn_url from private.config where key = 'tg_bot_url';
  select value into secret from private.config where key = 'tg_webhook_secret';
  if fn_url is null then return; end if;
  for r in select id from public.notifications
            where sent_at is null and attempts < 5 and created_at < now() - interval '2 minutes'
              and (last_attempt_at is null or last_attempt_at < now() - interval '2 minutes') loop
    perform net.http_post(url := fn_url, headers := jsonb_build_object('Content-Type', 'application/json', 'X-Ecorom-Secret', secret),
                          body := jsonb_build_object('notification_id', r.id));
  end loop;
end $$;
select cron.unschedule('notify_retry') where exists (select 1 from cron.job where jobname = 'notify_retry');
select cron.schedule('notify_retry', '*/5 * * * *', 'select public.notify_retry()');
CREATE OR REPLACE FUNCTION public.leaks_digest()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r jsonb := public.leaks_core(); v_lines text[] := '{}';
begin
  if not coalesce((select (value #>> '{}')::boolean from public.app_settings where key = 'digests_on'), false) then return; end if;
  if (r->'overdue'->>'count')::int > 0 then v_lines := v_lines || ('⏰ Muddati o''tgan buyurtmalar: ' || (r->'overdue'->>'count')); end if;
  if (r->'stuck'->>'count')::int > 0 then v_lines := v_lines || ('🐌 Zavodda 3+ kun harakatsiz: ' || (r->'stuck'->>'count')); end if;
  if (r->'material'->>'count')::int > 0 then v_lines := v_lines || ('🧱 Material muammosi: ' || (r->'material'->>'count')); end if;
  if (r->'installed_unpaid'->>'count')::int > 0 then v_lines := v_lines || ('💸 O''rnatilgan, to''lanmagan: ' || (r->'installed_unpaid'->>'count') || ' ta · ' || public.fmt_sum((r->'installed_unpaid'->>'sum')::numeric)); end if;
  if (r->'service'->>'count')::int > 0 then v_lines := v_lines || ('🛠 Servis e''tibor kutmoqda: ' || (r->'service'->>'count')); end if;
  if (r->'breakage_undecided'->>'count')::int > 0 then v_lines := v_lines || ('🪟 Oyna sinishi hal qilinmagan: ' || (r->'breakage_undecided'->>'count')); end if;
  if (r->'stock_negative'->>'count')::int > 0 then v_lines := v_lines || ('📦 Omborda manfiy qoldiq: ' || (r->'stock_negative'->>'count')); end if;
  if (r->'cash'->>'negative')::boolean then v_lines := v_lines || ('💰 Kassa manfiy: ' || public.fmt_sum((r->'cash'->>'balance')::numeric)); end if;
  if array_length(v_lines, 1) is null then return; end if;
  perform public.notify('rahbar', null, '🔎 Bugungi e''tibor' || E'\n' || array_to_string(v_lines, E'\n'), jsonb_build_object('leaks', true));
end $function$;

CREATE OR REPLACE FUNCTION public.monthly_digest(p_month date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_m date := coalesce(p_month, (date_trunc('month', (now() at time zone 'Asia/Tashkent')) - interval '1 month')::date); r jsonb;
begin
  if not coalesce((select (value #>> '{}')::boolean from public.app_settings where key = 'digests_on'), false) then return; end if;
  r := public.monthly_report_core(v_m);
  perform public.notify('rahbar', null,
    '📊 ' || (r->>'month') || ' oy hisoboti' || E'\n'
    || 'Savdo: ' || fmt_sum((r->'orders'->>'revenue')::numeric) || ' (' || (r->'orders'->>'count') || ' ta buyurtma)' || E'\n'
    || 'Foyda: ' || fmt_sum((r->>'profit')::numeric) || E'\n'
    || 'Xarajat: ' || fmt_sum((r->'expenses'->>'total')::numeric) || ' · Ish haqi: ' || fmt_sum((r->'salaries'->>'accrued')::numeric)
    || ' · Yo''qotish: ' || fmt_sum((r->'losses'->>'total')::numeric) || E'\n'
    || 'Pul: +' || fmt_sum((r->'cash'->>'received')::numeric) || ' / −' || fmt_sum((r->'cash'->>'received')::numeric - (r->'cash'->>'net')::numeric) || ' · kassa: ' || fmt_sum((r->'cash'->>'balance_now')::numeric) || E'\n'
    || 'Qarz: mijozlar ' || fmt_sum((r->'debts'->>'clients')::numeric) || ' · yetkazib beruvchilar ' || fmt_sum((r->'debts'->>'suppliers')::numeric)
    || case when (r->>'incomplete')::boolean then E'\n⚠ Bu oy uchun xarajat/ish haqi to''liq emas (tizim keyin boshlangan).' else '' end,
    '{}'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.service_daily()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; v_text text; v_today date := (now() at time zone 'Asia/Tashkent')::date;
begin
  if not coalesce((select (value #>> '{}')::boolean from public.app_settings where key = 'digests_on'), false) then return; end if;
  for r in
    select t.assigned_to as emp, string_agg('• №' || o.order_no || ' ' || c.full_name || ' — ' || left(t.description, 60), E'\n' order by t.due_date nulls last) as list
      from service_tickets t join orders o on o.id = t.order_id join clients c on c.id = o.client_id
     where t.status <> 'closed' and t.assigned_to is not null and t.work_done_at is null
     group by t.assigned_to
  loop
    perform public.notify(null, r.emp, '🛠 Servis — bajarilmagan:' || E'\n' || r.list, '{}'::jsonb);
  end loop;
  select string_agg(line, E'\n') into v_text from (
    select '• №' || o.order_no || ' ' || c.full_name || ' — ' || left(t.description, 50)
           || case when t.assigned_to is null then ' [ijrochi yo''q]'
                   when t.work_done_at is not null then ' [yopishni kutmoqda]'
                   when t.due_date < v_today then ' [muddat o''tgan]' else '' end as line
      from service_tickets t join orders o on o.id = t.order_id join clients c on c.id = o.client_id
     where t.status <> 'closed' and (t.assigned_to is null or t.work_done_at is not null or t.due_date < v_today)
     order by t.created_at limit 15) x;
  if v_text is not null then perform public.notify('rahbar', null, '🛠 Servis — e''tibor kerak:' || E'\n' || v_text, '{}'::jsonb); end if;
end $function$;

CREATE OR REPLACE FUNCTION public.install_morning()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record;
begin
  if not coalesce((select (value #>> '{}')::boolean from public.app_settings where key = 'digests_on'), false) then return; end if;
  for r in
    select m.employee_id,
           string_agg('• №' || o.order_no || ' ' || c.full_name || coalesce(' — ' || o.address, ''), E'\n' order by o.order_no) as list
      from install_jobs j join install_job_members m on m.job_id = j.id
      join orders o on o.id = j.order_id join clients c on c.id = o.client_id
     where j.plan_date = (now() at time zone 'Asia/Tashkent')::date and j.status in ('planned', 'in_progress')
       and o.status in ('in_production', 'ready', 'installing')
     group by m.employee_id
  loop
    perform public.notify(null, r.employee_id, '☀️ Bugungi montaj:' || E'\n' || r.list, '{}'::jsonb);
  end loop;
end $function$;

CREATE OR REPLACE FUNCTION public.shop_tick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_hours numeric; r record; e record; v_silent text; v_from int; v_to int; v_quiet boolean;
begin
  select coalesce((value #>> '{}')::numeric, 2) into v_hours from app_settings where key = 'shop_reply_hours';
  v_hours := coalesce(v_hours, 2);
  select coalesce((value #>> '{}')::int, 8) into v_from from app_settings where key = 'notify_from_hour';
  select coalesce((value #>> '{}')::int, 20) into v_to from app_settings where key = 'notify_to_hour';
  v_quiet := not (extract(hour from (now() at time zone 'Asia/Tashkent'))::int >= coalesce(v_from, 8) and extract(hour from (now() at time zone 'Asia/Tashkent'))::int < coalesce(v_to, 20));
  -- в цеху нет ни одного сотрудника, подключённого к боту: заказ никому не дошёл → Rahbar
  if not v_quiet then
    for r in select o.id, o.order_no from orders o where o.status = 'in_production' and o.shop_sent_at is not null and o.shop_escalated_at is null and not v_quiet
              and o.shop_sent_at < now() - make_interval(secs => v_hours * 3600)
              and not exists (select 1 from employees x where x.role = 'ishlab' and x.is_active and x.telegram_id is not null) loop
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
  -- напоминание тем, кто не ответил
  for r in select o.id, o.order_no from orders o
            where o.status = 'in_production' and o.shop_sent_at is not null and o.shop_reminded_at is null and not v_quiet
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
            where o.status = 'in_production' and o.shop_reminded_at is not null and o.shop_escalated_at is null and not v_quiet
              and o.shop_reminded_at < now() - make_interval(secs => v_hours * 3600) loop
    update orders set shop_escalated_at = now() where id = r.id;
    select string_agg(x.full_name, ', ' order by x.full_name) into v_silent from employees x
     where x.role = 'ishlab' and x.is_active
       and not exists (select 1 from order_material_checks m where m.order_id = r.id and m.employee_id = x.id and m.created_at >= r.shop_sent_at);
    if v_silent is not null then
      perform public.notify('rahbar', null, '🔕 №' || r.order_no || ': zavod javob bermadi — ' || v_silent, jsonb_build_object('order_id', r.id));
    end if;
  end loop;
end $function$;

