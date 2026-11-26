-- 080: привязка Telegram с главной страницы по одноразовой ссылке t.me/ecorombot?start=link_<код>
-- Только новое: таблица кодов + 3 функции. Существующие таблицы/функции не меняются.

create table if not exists public.tg_link_codes (
  code text primary key,
  employee_id uuid not null references public.employees(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  used_at timestamptz,
  used_tg bigint
);
alter table public.tg_link_codes enable row level security; -- политик нет: доступ только через функции ниже
revoke all on public.tg_link_codes from anon, authenticated;

-- кто вошёл: логин, имя, роль, привязан ли Telegram
create or replace function public.tg_link_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('login', e.login, 'full_name', e.full_name, 'role', e.role, 'linked', e.telegram_id is not null)
  from public.employees e where e.id = public.my_id()
$$;

-- новый одноразовый код (15 минут); старые неиспользованные коды этого человека удаляются
create or replace function public.tg_link_code()
returns text language plpgsql volatile security definer set search_path = public as $$
declare v_me uuid := public.my_id(); v_code text;
begin
  if v_me is null then raise exception 'Avval tizimga kiring'; end if;
  delete from public.tg_link_codes where employee_id = v_me and used_at is null;
  delete from public.tg_link_codes where expires_at < now() - interval '1 day';
  v_code := replace(replace(replace(encode(extensions.gen_random_bytes(18), 'base64'), '+', 'A'), '/', 'B'), '=', '');
  insert into public.tg_link_codes(code, employee_id) values (v_code, v_me);
  return v_code;
end $$;

-- бот: забрать код и привязать Telegram (только service_role)
create or replace function public.tg_link_claim(p_code text, p_tg bigint)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v public.tg_link_codes; e public.employees;
begin
  select * into v from public.tg_link_codes where code = p_code for update;
  if v.code is null or v.used_at is not null or v.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  select * into e from public.employees where id = v.employee_id;
  if e.id is null or not e.is_active then return jsonb_build_object('ok', false, 'reason', 'inactive'); end if;
  -- этот Telegram мог быть привязан к другому профилю — снимаем
  update public.employees set telegram_id = null where telegram_id = p_tg and id <> e.id;
  update public.employees set telegram_id = p_tg where id = e.id;
  update public.tg_link_codes set used_at = now(), used_tg = p_tg where code = p_code;
  return jsonb_build_object('ok', true, 'login', e.login, 'full_name', e.full_name, 'role', e.role);
end $$;

revoke all on function public.tg_link_status() from public, anon;
revoke all on function public.tg_link_code() from public, anon;
revoke all on function public.tg_link_claim(text, bigint) from public, anon, authenticated;
grant execute on function public.tg_link_status() to authenticated;
grant execute on function public.tg_link_code() to authenticated;
grant execute on function public.tg_link_claim(text, bigint) to service_role;
