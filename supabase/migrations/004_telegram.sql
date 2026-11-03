-- ECOROM 004: Telegram — привязка аккаунта, мгновенная отправка уведомлений через бота.
create extension if not exists pg_net;

-- закрытая схема для служебных значений (не видна через API)
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.config (key text primary key, value text not null);

-- новая запись в notifications → сразу дергаем функцию бота (она отправит и отметит sent_at/error)
create or replace function public.notify_dispatch() returns trigger language plpgsql security definer set search_path = public, private as $$
declare fn_url text; secret text;
begin
  select value into fn_url from private.config where key = 'tg_bot_url';
  select value into secret from private.config where key = 'tg_webhook_secret';
  if fn_url is not null then
    perform net.http_post(
      url := fn_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-Ecorom-Secret', secret),
      body := jsonb_build_object('notification_id', new.id)
    );
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_dispatch on public.notifications;
create trigger trg_notify_dispatch after insert on public.notifications for each row execute function public.notify_dispatch();

-- уведомить роль или человека (вызывается из других функций/триггеров)
create or replace function public.notify(p_role text, p_employee uuid, p_text text, p_payload jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications(target_role, employee_id, text, payload) values (p_role, p_employee, p_text, p_payload);
$$;
revoke all on function public.notify(text, uuid, text, jsonb) from public, anon, authenticated;
