-- ECOROM 003: логин сотрудника хранится рядом с профилем (аккаунт сам живёт в auth.users).
alter table public.employees add column if not exists login text unique;
update public.employees e set login = split_part(u.email, '@', 1)
from auth.users u where u.id = e.auth_user_id and e.login is null;
