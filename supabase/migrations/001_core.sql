-- ECOROM 001: ядро схемы. Деньги/склад — только журналы (без UPDATE/DELETE), права по ролям через RLS.
create extension if not exists pgcrypto;

-- ===== служебное =====
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create or replace function public.forbid_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'Журнал %: записи не правятся и не удаляются, исправляйте встречной записью', tg_table_name;
end $$;

-- ===== сотрудники (человек ≠ аккаунт: auth_user_id можно снять/передать, история остаётся) =====
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  role text not null check (role in ('rahbar','ishlab','montajchi')),
  phone text,
  telegram_id bigint unique,
  is_active boolean not null default true,
  hired_at date default current_date,
  left_at date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_employees_upd before update on public.employees for each row execute function public.touch_updated_at();

create or replace function public.my_id() returns uuid language sql stable security definer set search_path = public as
$$ select id from public.employees where auth_user_id = auth.uid() and is_active limit 1 $$;
create or replace function public.my_role() returns text language sql stable security definer set search_path = public as
$$ select role from public.employees where auth_user_id = auth.uid() and is_active limit 1 $$;
create or replace function public.is_rahbar() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce(public.my_role() = 'rahbar', false) $$;

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ===== клиенты =====
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  address text,
  note text,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now()
);
create index on public.clients (lower(full_name));
create index on public.clients (phone);

-- ===== каталог «LEGO»: системы, стеклопакеты, подоконники, отливы, фурнитура, работы, сетки, цвета... =====
create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('system','glass','ebb','sill','hardware','misc','work','net','lamination','color','extra')),
  name text not null,
  unit text not null default 'pcs' check (unit in ('m','m2','pcs')),
  price numeric(14,2) not null default 0,
  params jsonb not null default '{}'::jsonb,   -- для system: frame/impost/sash/bead/gasket (цена за м.п.), series
  stock_tracked boolean not null default true,
  sort int not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (kind, name)
);
create trigger trg_catalog_upd before update on public.catalog_items for each row execute function public.touch_updated_at();

-- ===== заказы =====
create sequence public.order_no_seq start 2500;
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no bigint not null unique default nextval('public.order_no_seq'),
  client_id uuid not null references public.clients(id),
  address text,
  contact_phone text,
  color text,
  status text not null default 'new' check (status in ('new','in_production','ready','installing','installed','closed','cancelled')),
  deadline date,
  install_date date,
  windows_count int not null default 0,
  area_m2 numeric(10,2) not null default 0,
  calc_cost numeric(14,2) not null default 0,          -- себестоимость (снимок)
  markup numeric(6,4) not null default 0.37,           -- наценка на момент договора
  calc_suggested numeric(14,2) not null default 0,     -- расчётная цена (снимок)
  discount_pct numeric(5,2) not null default 0,
  contract_price numeric(14,2) not null default 0,     -- ДОГОВОРНАЯ цена: единственная «настоящая»
  warranty_until date,
  notes text,
  is_imported boolean not null default false,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);
create trigger trg_orders_upd before update on public.orders for each row execute function public.touch_updated_at();
create index on public.orders (status);
create index on public.orders (client_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  pos int not null,
  title text,
  width_mm int,
  height_mm int,
  qty int not null default 1,
  design jsonb not null default '{}'::jsonb,           -- дерево секций, открывание, арка и т.д.
  options jsonb not null default '{}'::jsonb,          -- выбранные позиции каталога (без цен)
  materials jsonb not null default '{}'::jsonb,        -- расход материалов (кол-во, без цен) — видно цеху
  calc jsonb not null default '{}'::jsonb,             -- разбор цены (снимок) — только Rahbar
  cost numeric(14,2) not null default 0,
  area_m2 numeric(10,3) not null default 0,
  note text,
  glass_status text not null default 'none' check (glass_status in ('none','ordered','arrived','installed')),
  unique (order_id, pos)
);

create table public.stages (
  id serial primary key,
  code text not null unique,
  name text not null,
  sort int not null default 0,
  is_active boolean not null default true
);

create table public.item_stage_marks (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  stage_id int not null references public.stages(id),
  done_by uuid not null references public.employees(id),
  done_at timestamptz not null default now(),
  unique (order_item_id, stage_id)
);

create table public.order_material_checks (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  result text not null check (result in ('enough','not_enough','defect')),
  note text,
  created_at timestamptz not null default now()
);

-- ===== монтаж / бой стекла / сервис =====
create table public.install_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  plan_date date,
  status text not null default 'planned' check (status in ('planned','in_progress','done','postponed')),
  note text,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now()
);
create table public.install_job_members (
  job_id uuid not null references public.install_jobs(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  primary key (job_id, employee_id)
);
create table public.install_marks (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  part text not null check (part in ('frame','glass','sill_ebb')),
  done_by uuid not null references public.employees(id),
  done_at timestamptz not null default now(),
  photo_path text,
  unique (order_item_id, part)
);
create table public.glass_breakages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete set null,
  employee_id uuid references public.employees(id),     -- кто разбил
  reason text,
  photo_path text,
  payer text not null default 'factory' check (payer in ('installer','factory','client')),
  amount numeric(14,2) not null default 0,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now()
);
create table public.service_tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete set null,
  description text not null,
  photo_paths text[] not null default '{}',
  assigned_to uuid references public.employees(id),
  due_date date,
  status text not null default 'open' check (status in ('open','in_progress','closed')),
  cause text,
  payer text check (payer in ('installer','factory','client')),
  cost numeric(14,2) not null default 0,
  in_warranty boolean,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

-- ===== поставщики и склад (журналы) =====
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  city text,
  phone text,
  note text
);
create table public.purchases (            -- журнал
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  purchased_at date not null default current_date,
  total numeric(14,2) not null,
  delivery_cost numeric(14,2) not null default 0,
  note text,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  reverses_id uuid references public.purchases(id),
  check ((reverses_id is null and total > 0) or (reverses_id is not null and total < 0))
);
create table public.purchase_items (       -- журнал
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id),
  item_id uuid not null references public.catalog_items(id),
  qty numeric(14,3) not null,
  unit_cost numeric(14,2) not null
);
create table public.supplier_payments (    -- журнал
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  amount numeric(14,2) not null,
  paid_at date not null default current_date,
  note text,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  reverses_id uuid references public.supplier_payments(id),
  check ((reverses_id is null and amount > 0) or (reverses_id is not null and amount < 0))
);
create table public.stock_movements (      -- журнал: + приход, − расход
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.catalog_items(id),
  qty numeric(14,3) not null,
  kind text not null check (kind in ('purchase','consume','adjust','scrap','return')),
  order_id uuid references public.orders(id),
  purchase_id uuid references public.purchases(id),
  unit_cost numeric(14,2),
  note text,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now()
);
create index on public.stock_movements (item_id);
create index on public.stock_movements (order_id);

-- ===== деньги (журналы) =====
create table public.expense_categories (
  id serial primary key,
  name text not null unique,
  note text,
  is_active boolean not null default true
);
create table public.expenses (             -- журнал
  id uuid primary key default gen_random_uuid(),
  category_id int not null references public.expense_categories(id),
  amount numeric(14,2) not null,
  spent_at date not null default current_date,
  note text,
  for_employee_id uuid references public.employees(id),
  order_id uuid references public.orders(id),
  source text not null default 'web' check (source in ('web','telegram','import')),
  confirmed boolean not null default true,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  reverses_id uuid references public.expenses(id),
  check ((reverses_id is null and amount > 0) or (reverses_id is not null and amount < 0))
);
create table public.payments (             -- журнал: оплаты клиентов (наличные)
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  amount numeric(14,2) not null,
  paid_at date not null default current_date,
  note text,
  received_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  reverses_id uuid references public.payments(id),
  check ((reverses_id is null and amount > 0) or (reverses_id is not null and amount < 0))
);
create table public.pay_rules (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id),    -- null = для всех роли
  role text check (role in ('rahbar','ishlab','montajchi')),
  stage_code text,                                     -- null = не привязано к этапу
  basis text not null check (basis in ('salary','per_m2','per_window','percent_sales','fixed','bonus','penalty')),
  series text check (series in ('aluminium','plastic','thermo')),
  amount numeric(14,4) not null,
  valid_from date not null default current_date,
  valid_to date,
  note text,
  created_at timestamptz not null default now()
);
create table public.salary_payouts (       -- журнал
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  amount numeric(14,2) not null,
  paid_at date not null default current_date,
  period text,
  note text,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  reverses_id uuid references public.salary_payouts(id),
  check ((reverses_id is null and amount > 0) or (reverses_id is not null and amount < 0))
);

-- ===== уведомления (шлёт бот) и аудит =====
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id),
  target_role text check (target_role in ('rahbar','ishlab','montajchi')),
  text text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  error text
);
create table public.audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor uuid,
  table_name text not null,
  row_id text,
  action text not null,
  old_data jsonb,
  new_data jsonb
);
create or replace function public.audit() returns trigger language plpgsql security definer set search_path = public as $$
declare rid text;
begin
  rid := coalesce((to_jsonb(coalesce(new, old))->>'id'), '');
  insert into public.audit_log(actor, table_name, row_id, action, old_data, new_data)
  values (public.my_id(), tg_table_name, rid, tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['employees','app_settings','clients','catalog_items','orders','order_items','item_stage_marks','install_marks','glass_breakages','service_tickets','pay_rules'] loop
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.audit()', t);
  end loop;
  -- журналы: запрет правки и удаления
  foreach t in array array['purchases','purchase_items','supplier_payments','stock_movements','expenses','payments','salary_payouts'] loop
    execute format('create trigger trg_nomut_%1$s before update or delete on public.%1$s for each row execute function public.forbid_mutation()', t);
    execute format('create trigger trg_audit_%1$s after insert on public.%1$s for each row execute function public.audit()', t);
  end loop;
end $$;

-- ===== представления: остатки, долги, касса, прогресс =====
create view public.v_stock_balance with (security_invoker = true) as
  select i.id as item_id, i.kind, i.name, i.unit, coalesce(sum(m.qty), 0) as qty
  from public.catalog_items i left join public.stock_movements m on m.item_id = i.id
  where i.stock_tracked group by i.id;

create view public.v_supplier_debt with (security_invoker = true) as
  select s.id as supplier_id, s.name,
         coalesce((select sum(total + delivery_cost) from public.purchases where supplier_id = s.id), 0)
         - coalesce((select sum(amount) from public.supplier_payments where supplier_id = s.id), 0) as debt
  from public.suppliers s;

create view public.v_order_paid with (security_invoker = true) as
  select o.id as order_id, o.order_no, o.contract_price,
         coalesce(sum(p.amount), 0) as paid,
         o.contract_price - coalesce(sum(p.amount), 0) as debt
  from public.orders o left join public.payments p on p.order_id = o.id group by o.id;

create view public.v_cash_balance with (security_invoker = true) as
  select (select coalesce(sum(amount), 0) from public.payments)
       - (select coalesce(sum(amount), 0) from public.expenses where confirmed)
       - (select coalesce(sum(amount), 0) from public.salary_payouts)
       - (select coalesce(sum(amount), 0) from public.supplier_payments) as cash;

create view public.v_order_progress with (security_invoker = true) as
  select o.id as order_id, o.order_no,
         coalesce((select count(*) from public.order_items i where i.order_id = o.id), 0) as items,
         coalesce((select count(*) from public.item_stage_marks m join public.order_items i on i.id = m.order_item_id where i.order_id = o.id), 0) as done_marks,
         (select count(*) from public.stages where is_active) as stages_count,
         case when (select count(*) from public.order_items i where i.order_id = o.id) = 0 then 0
              else round(100.0 * (select count(*) from public.item_stage_marks m join public.order_items i on i.id = m.order_item_id where i.order_id = o.id)
                   / ((select count(*) from public.order_items i where i.order_id = o.id) * greatest((select count(*) from public.stages where is_active), 1)), 1) end as percent
  from public.orders o;

-- ===== виды для цеха и монтажников (без цен) =====
create view public.w_orders as
  select o.id, o.order_no, o.status, o.deadline, o.color, o.windows_count, o.area_m2, o.notes, o.install_date,
         case when public.my_role() = 'montajchi' then o.address end as address,
         case when public.my_role() = 'montajchi' then o.contact_phone end as contact_phone
  from public.orders o
  where public.my_role() = 'ishlab'
     or (public.my_role() = 'montajchi' and exists (
          select 1 from public.install_jobs j join public.install_job_members m on m.job_id = j.id
          where j.order_id = o.id and m.employee_id = public.my_id()));

create view public.w_order_items as
  select i.id, i.order_id, i.pos, i.title, i.width_mm, i.height_mm, i.qty, i.design, i.options, i.materials, i.note, i.glass_status
  from public.order_items i where i.order_id in (select id from public.w_orders);

-- ===== права =====
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;   -- ограничено RLS ниже
revoke all on public.w_orders, public.w_order_items from authenticated;
grant select on public.w_orders, public.w_order_items to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.my_id(), public.my_role(), public.is_rahbar() to authenticated;

-- RLS: включить на всех базовых таблицах, Rahbar — всё; остальным — ничего напрямую (через w_* и RPC)
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy rahbar_all on public.%I for all to authenticated using (public.is_rahbar()) with check (public.is_rahbar())', t);
  end loop;
end $$;

-- свой профиль и справочники читают все вошедшие
create policy self_read on public.employees for select to authenticated using (auth_user_id = auth.uid());
create policy stages_read on public.stages for select to authenticated using (true);
create policy notif_read_own on public.notifications for select to authenticated using (employee_id = public.my_id());

-- ===== начальные данные =====
insert into public.stages (code, name, sort) values
  ('cut', 'Резка', 1), ('assemble', 'Сборка', 2), ('glass_fit', 'Стекло/фурнитура', 3), ('install', 'Монтаж', 4);

insert into public.expense_categories (name, note) values
  ('OFIS ARENDA', 'Аренда офиса/помещения'), ('KREDIT', 'Кредит'), ('SVET', 'Свет/коммунальные'),
  ('SOLIQ', 'Налоги'), ('MAHSULOT', 'Мелочи: ручки, расходники'), ('PITANIYA', 'Питание (обед, чай)'),
  ('LABO', 'Малый грузовик (перевозка грузов)'), ('KOCHA KIRA', 'Дорожные/внеплановые'), ('KUT-HARAJAT', 'Разное'),
  ('TRANSPORT', 'Бензин/газ машин, доставка');

insert into public.app_settings (key, value) values
  ('markup', '0.37'), ('warranty_years', '5'), ('margin_alert_pct', '15'), ('currency', '"UZS"'),
  ('company', '{"name":"ECOROM","slogan":"Sifat va ishonch","executor":"Махмуд Мухторжонов","address":"Шахрихон, ул. Чинабот","phone":"+998 97 203 55 55","web":"www.ecorom.uz"}');
