import { sql, login, get, check, info, URL_, ANON, PW, SVC } from './h.mjs'
const call = async (who, body) => { const tok = await login(who); const r = await fetch(`${URL_}/functions/v1/admin-users`, { method:'POST', headers:{ apikey:ANON, Authorization:`Bearer ${tok}`, 'Content-Type':'application/json' }, body: JSON.stringify(body) }); return { s:r.status, j: await r.json().catch(()=>null) } }
let r = await call('test_ishlab1',{action:'create',login:'t_hack',full_name:'x',password:'123456',role:'rahbar'}); check('A1','цех не может создать сотрудника (admin-users)', r.s===403, JSON.stringify(r))
r = await call('t_rah',{action:'create',login:'t_new1',full_name:'TEST New',password:'123456',role:'ishlab'}); check('A2','Rahbar создаёт сотрудника', r.s===200&&r.j.ok, JSON.stringify(r))
const newId = r.j?.id
r = await call('t_rah',{action:'create',login:'t_new1',full_name:'TEST New',password:'123456',role:'ishlab'}); check('A3','дубль логина отклонён', r.s===400, JSON.stringify(r))
r = await call('t_rah',{action:'create',login:'T_NEW2 ',full_name:'TEST New2',password:'123',role:'ishlab'}); check('A4','короткий пароль отклонён', r.s===400, JSON.stringify(r))
r = await call('t_rah',{action:'create',login:'t_new3',full_name:'  ',password:'123456',role:'ishlab'}); check('A5','пустое имя отклонено', r.s===400)
r = await call('t_rah',{action:'create',login:'t_new4',full_name:'X',password:'123456',role:'admin'}); check('A6','несуществующая роль отклонена', r.s===400)
// деактивация и вход
r = await call('t_rah',{action:'deactivate',employee_id:newId}); check('A7','деактивация', r.s===200)
const lr = await fetch(`${URL_}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:ANON,'Content-Type':'application/json'},body:JSON.stringify({email:'t_new1@ecorom.app',password:'123456'})}); check('A8','деактивированный не может войти', !lr.ok, lr.status)
r = await call('t_rah',{action:'activate',employee_id:newId}); check('A9','активация', r.s===200)
// пароль слабый, self
r = await call('t_rah',{action:'set_password',employee_id:newId,password:'12345'}); check('A10','смена пароля <6 отклонена', r.s===400)
const me = (await sql(`select id from employees where login='t_rah'`))[0].id
// ТЕСТ самоблокировки НЕ выполняю на боевых Rahbar; на t_rah — можно
r = await call('t_rah',{action:'deactivate',employee_id:me}); info('A11','Rahbar деактивирует сам себя (блок есть?)', JSON.stringify(r))
const who = await get('t_rah','orders?select=id&limit=1'); info('A12','после самодеактивации токен ещё работает?', JSON.stringify(who.data).slice(0,80))
await sql(`update employees set is_active=true, left_at=null where login='t_rah'`)
// удалить t_new1
await sql(`delete from employees where login='t_new1'`)
const u = await fetch(`${URL_}/auth/v1/admin/users?per_page=200`,{headers:{apikey:SVC,Authorization:`Bearer ${SVC}`}}); const uj = await u.json(); const t = uj.users.find(x=>x.email==='t_new1@ecorom.app'); if(t) await fetch(`${URL_}/auth/v1/admin/users/${t.id}`,{method:'DELETE',headers:{apikey:SVC,Authorization:`Bearer ${SVC}`}})
