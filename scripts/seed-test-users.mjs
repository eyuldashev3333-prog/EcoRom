// Тестовые рабочие и монтажники с демо-данными. Повторный запуск стирает прошлых тестовых и создаёт заново.
// Запуск: node scripts/seed-test-users.mjs [пароль]   (если пароль не указан — сгенерируется и будет показан в консоли)
// Всё тестовое помечено: логины test_*, имена «ТЕСТ …», заказы с notes = 'TEST-SEED'. Настоящих сотрудников не трогает.
import { randomBytes } from 'node:crypto'
import { env } from './env.mjs'
import { runSql } from './run-sql.mjs'

const password = process.argv[2] || randomBytes(5).toString('hex')
const URL_ = env('SUPABASE_URL')
const KEY = env('SUPABASE_SERVICE_ROLE_KEY')
const USERS = [
  { login: 'test_ishlab1', name: 'ТЕСТ Цех 1', role: 'ishlab' },
  { login: 'test_ishlab2', name: 'ТЕСТ Цех 2', role: 'ishlab' },
  { login: 'test_montaj1', name: 'ТЕСТ Монтажник 1', role: 'montajchi' },
  { login: 'test_montaj2', name: 'ТЕСТ Монтажник 2', role: 'montajchi' },
]

// 1. стереть прошлых тестовых (порядок важен из-за внешних ключей)
await runSql(`
  delete from orders where notes = 'TEST-SEED';
  delete from clients where full_name = 'ТЕСТ клиент';
  delete from salary_payouts where employee_id in (select id from employees where login like 'test\\_%');
  delete from pay_rules where employee_id in (select id from employees where login like 'test\\_%');
  delete from employees where login like 'test\\_%';
  delete from auth.users where email like 'test\\_%@ecorom.app';
`)

// 2. аккаунты входа
for (const u of USERS) {
  const r = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${u.login}@ecorom.app`, password, email_confirm: true }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`create ${u.login} → ${r.status} ${JSON.stringify(j)}`)
  u.auth = j.id
}
await runSql(`insert into employees(full_name, role, login, auth_user_id, hired_at) values ${USERS.map((u) => `('${u.name}', '${u.role}', '${u.login}', '${u.auth}', current_date - 60)`).join(', ')};`)

// 3. демо-данные: 2 заказа в цехе, 1 монтаж, ставки, отметки, выплаты (аванс частями)
await runSql(`
do $$
declare
  c uuid; o1 uuid; o2 uuid; i1 uuid; i2 uuid; i3 uuid; i4 uuid; j uuid;
  w1 uuid := (select id from employees where login = 'test_ishlab1');
  w2 uuid := (select id from employees where login = 'test_ishlab2');
  m1 uuid := (select id from employees where login = 'test_montaj1');
  m2 uuid := (select id from employees where login = 'test_montaj2');
  per text := to_char((now() at time zone 'Asia/Tashkent')::date, 'YYYY-MM');
begin
  insert into clients(full_name, phone) values ('ТЕСТ клиент', '+998900000000') returning id into c;
  insert into orders(client_id, address, status, windows_count, area_m2, contract_price, notes)
    values (c, 'Андижан, тест 1', 'in_production', 3, 5.40, 6000000, 'TEST-SEED') returning id into o1;
  insert into orders(client_id, address, status, windows_count, area_m2, contract_price, notes)
    values (c, 'Андижан, тест 2', 'installing', 2, 3.60, 4000000, 'TEST-SEED') returning id into o2;
  insert into order_items(order_id, pos, title, width_mm, height_mm, qty, area_m2) values (o1, 1, 'Окно 1', 1500, 1200, 2, 1.8) returning id into i1;
  insert into order_items(order_id, pos, title, width_mm, height_mm, qty, area_m2) values (o1, 2, 'Окно 2', 1800, 1500, 1, 2.7) returning id into i2;
  insert into order_items(order_id, pos, title, width_mm, height_mm, qty, area_m2) values (o2, 1, 'Окно 3', 1500, 1200, 1, 1.8) returning id into i3;
  insert into order_items(order_id, pos, title, width_mm, height_mm, qty, area_m2) values (o2, 2, 'Окно 4', 1500, 1200, 1, 1.8) returning id into i4;

  -- ставки только этим людям (личные правила, чтобы не задеть настоящих сотрудников)
  insert into pay_rules(employee_id, stage_code, basis, amount, valid_from) values
    (w1, 'cut', 'per_m2', 8000, current_date - 40), (w1, 'assemble', 'per_m2', 15000, current_date - 40),
    (w2, 'glass_fit', 'per_m2', 10000, current_date - 40), (w2, 'assemble', 'per_m2', 15000, current_date - 40),
    (m1, 'install', 'per_m2', 40000, current_date - 40), (m2, 'install', 'per_m2', 40000, current_date - 40);
  insert into pay_rules(employee_id, basis, amount, valid_from) values (w1, 'salary', 1500000, current_date - 40), (m1, 'salary', 1000000, current_date - 40);

  -- отметки этапов в текущем месяце
  insert into item_stage_marks(order_item_id, stage_id, done_by, done_at)
    select i1, id, w1, now() from stages where code = 'cut'
    union all select i2, id, w1, now() from stages where code = 'cut'
    union all select i1, id, w1, now() from stages where code = 'assemble'
    union all select i1, id, w2, now() from stages where code = 'glass_fit'
    union all select i3, id, m1, now() from stages where code = 'install'
    union all select i4, id, m2, now() from stages where code = 'install';

  -- монтаж: оба монтажника в бригаде заказа 2
  insert into install_jobs(order_id, plan_date, status) values (o2, current_date, 'in_progress') returning id into j;
  insert into install_job_members(job_id, employee_id) values (j, m1), (j, m2);

  -- выплаты частями (аванс и ещё часть)
  insert into salary_payouts(employee_id, amount, paid_at, period, note) values
    (w1, 500000, current_date - 10, per, 'Аванс'), (w1, 300000, current_date - 2, per, 'Часть зарплаты'),
    (w2, 200000, current_date - 5, per, 'Аванс'),
    (m1, 400000, current_date - 8, per, 'Аванс'), (m2, 150000, current_date - 3, per, 'Аванс');
end $$;
`)

console.log('Готово. Логины и общий пароль:')
for (const u of USERS) console.log(`  ${u.login}  (${u.role})`)
console.log(`  пароль: ${password}`)
