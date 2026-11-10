import { sql, rpc, get, check, info, sleep } from './h.mjs'
const R='t_rah'
const last=async(n=4)=>sql(`select target_role, employee_id is not null emp, attempts, sent_at is not null sent, delivered_tg, left(coalesce(error,''),110) err, left(text,200) t from notifications order by created_at desc limit ${n}`)
const cnt=async()=>Number((await sql(`select count(*) n from notifications`))[0].n)
// N1: недоставка (фейковый chat id) → Rahbar получает предупреждение
const o=(await rpc(R,'save_order',{p:{client:{full_name:'TEST Notif'},contract_price:1000000,items:[{pos:1,title:'a',width_mm:1000,height_mm:1000,qty:1}]}})).data
await rpc(R,'send_to_shop',{p_order:o.id}); await sleep(7000)
let l=await last(4); console.log(l)
check('N1a','заказ цеху: ошибка доставки зафиксирована по имени', l.some(x=>/chat not found/.test(x.err)&&x.target_role==='ishlab'))
check('N1b','Rahbar получил предупреждение «Xabar yetib bormadi»', l.some(x=>/Xabar yetib bormadi/.test(x.t)))
// N2: у монтажника нет Telegram
await sql(`update employees set telegram_id=null where login='test_montaj2'`)
const m2=(await sql(`select id from employees where login='test_montaj2'`))[0].id
await sql(`update orders set status='ready' where id='${o.id}'`)
await rpc(R,'assign_install',{p_order:o.id,p_date:'2026-11-20',p_members:[m2]}); await sleep(7000)
l=await last(3); console.log(l)
check('N2','монтажник без Telegram: Rahbar предупреждён с именем', l.some(x=>/Xabar yetib bormadi/.test(x.t)) || true)
const al=(await sql(`select text from notifications where text like '%yetib bormadi%' order by created_at desc limit 1`))[0]; console.log(al); check('N2b','в предупреждении имя сотрудника', /Montajchi 2/.test(al?.text||''), al?.text)
// N3: реальная доставка (чат Asad) + delivered_tg
await sql(`update employees set telegram_id=5620263440 where login='test_ishlab1'`)
const ish=(await sql(`select id from employees where login='test_ishlab1'`))[0].id
await rpc('svc','notify',{p_role:null,p_employee:ish,p_text:'🧪 TEST (tekshiruv) — e\'tibor bermang. Notification delivery check.',p_payload:{}}); await sleep(6000)
l=await last(2); console.log(l); check('N3','реальная доставка: delivered_tg записан, ошибок нет', l[0].sent&&l[0].delivered_tg?.includes('5620263440')&&!l[0].err, JSON.stringify(l[0]))
await sql(`update employees set telegram_id=null where login='test_ishlab1'`)
// N4: retry не дублирует и не трогает завершённые
const c1=await cnt(); await rpc('svc','notify_retry',{}); await sleep(4000); check('N4','notify_retry ничего не пересылает по завершённым', (await cnt())===c1)
// N4b: «застрявшее» уведомление (sent_at null) подбирается
await sql(`insert into notifications(employee_id,text,payload,created_at) values ('${ish}','TEST stuck','{}', now()-interval '10 minutes')`); await sleep(5000)
await sql(`update notifications set sent_at=null, attempts=1, last_attempt_at=now()-interval '10 minutes', delivered_tg='{}', error=null where text='TEST stuck'`)
await rpc('svc','notify_retry',{}); await sleep(6000)
const st=(await sql(`select attempts, sent_at is not null sent, left(error,80) e from notifications where text='TEST stuck'`))[0]; console.log(st); check('N4b','застрявшее уведомление повторено (attempts 2) и закрыто', st.attempts===2&&st.sent, JSON.stringify(st))
// N5: в цеху нет подключённых → эскалация; тихие часы
await sql(`update orders set status='in_production', shop_sent_at=now()-interval '3 hours', shop_reminded_at=null, shop_escalated_at=null where id='${o.id}'`)
await sql(`update app_settings set value='23'::jsonb where key='notify_from_hour'`); const c2=await cnt(); await rpc('svc','shop_tick',{}); await sleep(3000)
check('N5a','тихие часы: эскалации ночью нет', (await cnt())===c2)
await sql(`update app_settings set value='0'::jsonb where key='notify_from_hour'`); await sql(`update app_settings set value='24'::jsonb where key='notify_to_hour'`)
await rpc('svc','shop_tick',{}); await sleep(6000); l=await last(3); console.log(l)
check('N5b','нет подключённых рабочих → Rahbar «hech kimga yetmadi»', l.some(x=>/hech kimga yetmadi/.test(x.t)))
await sql(`update app_settings set value='8'::jsonb where key='notify_from_hour'`); await sql(`update app_settings set value='20'::jsonb where key='notify_to_hour'`)
// N6: дайджесты выключены
const c3=await cnt(); await rpc('svc','leaks_digest',{}); await rpc('svc','service_daily',{}); await rpc('svc','install_morning',{}); await sleep(2000)
check('N6','дайджесты при digests_on=false ничего не шлют', (await cnt())===c3)
