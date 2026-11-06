// Проверка связок: заказ → оплата → расход → зарплата → сервис → бой стекла → поставщик → касса / прибыль / отчёт / таблица SAVDO.
// Всё выполняется ОДНОЙ транзакцией, которая в конце откатывается (RAISE): в базе ничего не остаётся, уведомления не уходят.
// Запуск: node scripts/check-links.mjs
import { runSql } from './run-sql.mjs'

const sql = `
do $$
declare
  v_auth uuid; v_emp uuid; v_c uuid; v_o uuid; v_i uuid; v_cat int; v_sup uuid; v_t uuid; v_b uuid; v_m date := date_trunc('month', now() at time zone 'Asia/Tashkent')::date;
  cash0 numeric; cash1 numeric; p0 numeric; p1 numeric; r0 jsonb; r1 jsonb; res text := '';
  procedure_dummy int;
begin
  select auth_user_id, id into v_auth, v_emp from employees where role = 'rahbar' and is_active and auth_user_id is not null limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_auth::text, true);

  r0 := monthly_report_core(v_m); select cash into cash0 from v_cash_balance; p0 := (r0->>'profit')::numeric;

  -- 1. заказ: выручка +10 млн, себестоимость 6 млн → прибыль +4 млн, касса не меняется
  insert into clients(full_name, phone) values ('ZZ-CHECK', '+998000000000') returning id into v_c;
  insert into orders(client_id, status, windows_count, area_m2, contract_price, calc_cost, notes) values (v_c, 'in_production', 1, 2, 10000000, 6000000, 'ZZ-CHECK') returning id into v_o;
  insert into order_items(order_id, pos, qty, area_m2, width_mm, height_mm) values (v_o, 1, 1, 2, 1000, 2000) returning id into v_i;
  r1 := monthly_report_core(v_m); select cash into cash1 from v_cash_balance;
  res := res || format(E'%s | заказ → прибыль +4 000 000 | было %s стало %s\\n', case when (r1->>'profit')::numeric - p0 = 4000000 and cash1 = cash0 then 'OK ' else 'ОШИБКА' end, p0, (r1->>'profit')::numeric);
  p1 := (r1->>'profit')::numeric; cash0 := cash1; r0 := r1;

  -- 2. оплата клиента 4 млн → касса +4 млн, долг по заказу 6 млн
  perform record_payment(v_o, 4000000);
  select cash into cash1 from v_cash_balance;
  res := res || format(E'%s | оплата 4 млн → касса +4 000 000, долг 6 000 000 | касса %s, долг %s\\n', case when cash1 - cash0 = 4000000 and (select debt from v_order_paid where order_id = v_o) = 6000000 then 'OK ' else 'ОШИБКА' end, cash1 - cash0, (select debt from v_order_paid where order_id = v_o));
  cash0 := cash1;

  -- 3. расход (как из бота, категория PITANIYA) 300 000 → касса −300 000 и прибыль −300 000
  select id into v_cat from expense_categories where name = 'PITANIYA';
  perform record_expense(v_cat, 300000, null, 'ZZ-CHECK обед');
  r1 := monthly_report_core(v_m); select cash into cash1 from v_cash_balance;
  res := res || format(E'%s | расход 300 000 → касса −300 000 и прибыль −300 000 | касса %s, прибыль %s\\n', case when cash1 - cash0 = -300000 and (r1->>'profit')::numeric - p1 = -300000 then 'OK ' else 'ОШИБКА' end, cash1 - cash0, (r1->>'profit')::numeric - p1);
  cash0 := cash1; p1 := (r1->>'profit')::numeric; r0 := r1;

  -- 4. выплата зарплаты 200 000 → касса −200 000 (в прибыли зарплата = больший из начислено/выплачено)
  perform record_salary_payout(v_emp, 200000, null, null, 'ZZ-CHECK аванс');
  r1 := monthly_report_core(v_m); select cash into cash1 from v_cash_balance;
  res := res || format(E'%s | выплата зарплаты 200 000 → касса −200 000 | касса %s; зарплата в прибыли %s → %s\\n', case when cash1 - cash0 = -200000 then 'OK ' else 'ОШИБКА' end, cash1 - cash0, r0->'salaries'->>'in_profit', r1->'salaries'->>'in_profit');
  cash0 := cash1; p1 := (r1->>'profit')::numeric; r0 := r1;

  -- 5. сервис за счёт завода 150 000 → касса −150 000, прибыль −150 000 (ОДИН раз), потеря «сервис» +150 000
  v_t := create_service(v_o, v_i, 'ZZ-CHECK');
  perform close_service(v_t, 'ZZ-CHECK sabab', 'factory', 150000, true);
  r1 := monthly_report_core(v_m); select cash into cash1 from v_cash_balance;
  res := res || format(E'%s | сервис за счёт завода 150 000 → касса −150 000, прибыль −150 000 один раз | касса %s, прибыль %s, расходы в отчёте %s\\n',
         case when cash1 - cash0 = -150000 and (r1->>'profit')::numeric - p1 = -150000 and (r1->'expenses'->>'total')::numeric = (r0->'expenses'->>'total')::numeric then 'OK ' else 'ОШИБКА' end,
         cash1 - cash0, (r1->>'profit')::numeric - p1, (r1->'expenses'->>'total')::numeric - (r0->'expenses'->>'total')::numeric);
  cash0 := cash1; p1 := (r1->>'profit')::numeric; r0 := r1;

  -- 6. бой стекла за счёт завода 200 000 → касса −200 000, прибыль −200 000
  v_b := record_breakage(v_i, 1, 'ZZ-CHECK');
  perform resolve_breakage(v_b, 'factory', 200000, null);
  r1 := monthly_report_core(v_m); select cash into cash1 from v_cash_balance;
  res := res || format(E'%s | бой стекла за счёт завода 200 000 → касса −200 000, прибыль −200 000 | касса %s, прибыль %s\\n', case when cash1 - cash0 = -200000 and (r1->>'profit')::numeric - p1 = -200000 then 'OK ' else 'ОШИБКА' end, cash1 - cash0, (r1->>'profit')::numeric - p1);
  cash0 := cash1; p1 := (r1->>'profit')::numeric;

  -- 7. оплата поставщику 100 000 → касса −100 000, прибыль не меняется (материалы в себестоимости заказа)
  insert into suppliers(name) values ('ZZ-CHECK') returning id into v_sup;
  perform record_supplier_payment(v_sup, 100000);
  r1 := monthly_report_core(v_m); select cash into cash1 from v_cash_balance;
  res := res || format(E'%s | оплата поставщику 100 000 → касса −100 000, прибыль без изменений | касса %s, прибыль %s\\n', case when cash1 - cash0 = -100000 and (r1->>'profit')::numeric - p1 = 0 then 'OK ' else 'ОШИБКА' end, cash1 - cash0, (r1->>'profit')::numeric - p1);

  -- 8. одна цифра везде: таблица SAVDO BOLIMI = отчёт
  res := res || format(E'%s | таблица SAVDO и отчёт показывают одну чистую прибыль | отчёт %s, SAVDO %s\\n',
         case when (savdo_month(v_m)->'itog'->>'sof_foyda')::numeric = (r1->>'profit')::numeric then 'OK ' else 'ОШИБКА' end, (r1->>'profit')::numeric, (savdo_month(v_m)->'itog'->>'sof_foyda')::numeric);

  raise exception E'CHECK_RESULT\\n%', res;
end $$;`

try {
  await runSql(sql.replace('  procedure_dummy int;\n', ''))
  console.log('Неожиданно: транзакция не откатилась')
} catch (e) {
  const m = String(e.message).match(/CHECK_RESULT\\n([\s\S]*?)(\\n"|\\"|$)/)
  if (!m) { console.log(e.message); process.exit(1) }
  console.log(m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim())
}
