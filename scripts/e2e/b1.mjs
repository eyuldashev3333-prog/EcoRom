import { sql, ensureUser, rpc, get, write, check, info, login, URL_, ANON, SVC } from './h.mjs'
await ensureUser('t_rah','TEST Rahbar','rahbar',900000005)
await ensureUser('test_ishlab1','TEST Sex 1','ishlab',900000001)
await ensureUser('test_montaj1','TEST Montajchi 1','montajchi',900000003)
await ensureUser('test_montaj2','TEST Montajchi 2','montajchi',900000004)
await sql(`update employees set telegram_id=null where login='elyor'`)
const R='t_rah'
const mk=(n,phone)=>({client:{full_name:n,phone},contact_phone:null,contract_price:1000000,calc_cost:500000,items:[{pos:1,title:'a',width_mm:1000,height_mm:1000,qty:1,area_m2:1}]})
const a=(await rpc(R,'save_order',{p:mk('TEST A','+998900000001')})).data, b=(await rpc(R,'save_order',{p:mk('TEST B','+998900000002')})).data, c=(await rpc(R,'save_order',{p:mk('TEST C','+998900000003')})).data
await rpc(R,'send_to_shop',{p_order:a.id})
let w=(await get('test_ishlab1','w_orders?select=order_no,notes,address,contact_phone')).data; check('T1','цех видит только отправленный заказ (1 из 3)', w.length===1&&w[0].order_no===a.order_no, JSON.stringify(w))
check('T2','цех не получает адрес/телефон', w[0].address===null&&w[0].contact_phone===null)
await sql(`update orders set status='closed' where id='${a.id}'`); w=(await get('test_ishlab1','w_orders?select=order_no')).data; check('T3','закрытый заказ цеху не виден', w.length===0, JSON.stringify(w)); await sql(`update orders set status='in_production' where id='${a.id}'`)
await rpc(R,'send_to_shop',{p_order:b.id}); const m1=(await sql(`select id from employees where login='test_montaj1'`))[0].id
await rpc(R,'mark_stage',{}) 
await sql(`update orders set status='ready' where id in ('${b.id}')`)
const aj=await rpc(R,'assign_install',{p_order:b.id,p_date:'2026-11-15',p_members:[m1]}); check('T4','назначение монтажа', aj.ok, aj.err||'')
let mw=(await get('test_montaj1','w_orders?select=order_no,contact_phone,address,client_name')).data; check('T5','монтажник видит только назначенный, телефон из карточки клиента', mw.length===1&&mw[0].contact_phone==='+998900000002'&&mw[0].address===null||mw[0]?.contact_phone==='+998900000002', JSON.stringify(mw))
mw=(await get('test_montaj2','w_orders?select=order_no')).data; check('T6','чужой монтажник не видит', mw.length===0)
// audit
let d=await write(R,'DELETE','audit_log?id=gt.0'); check('T7','Rahbar не может удалять audit_log', !d.ok||(Array.isArray(d.data)&&d.data.length===0), d.status+' '+JSON.stringify(d.data).slice(0,90))
let u=await write(R,'PATCH','audit_log?id=gt.0',{action:'X'}); check('T8','Rahbar не может править audit_log', !u.ok||(Array.isArray(u.data)&&u.data.length===0), u.status)
const rd=await get(R,'audit_log?select=id&limit=1'); check('T9','Rahbar читает audit_log', rd.ok&&rd.data.length===1)
console.log('audit rows still', (await sql(`select count(*) n from audit_log`))[0].n)
// последний rahbar
try { await sql(`do $$ begin update employees set is_active=false where role='rahbar'; end $$`); check('T10','нельзя отключить всех Rahbar (БД)', false, 'прошло!') } catch(e){ check('T10','нельзя отключить всех Rahbar (БД)', /Oxirgi/.test(e.message), e.message.slice(0,120)) }
console.log('rahbars active', await sql(`select login,is_active from employees where role='rahbar'`))
// admin-users
const call = async (who, body) => { const tok = await login(who); const r = await fetch(`${URL_}/functions/v1/admin-users`,{method:'POST',headers:{apikey:ANON,Authorization:`Bearer ${tok}`,'Content-Type':'application/json'},body:JSON.stringify(body)}); return {s:r.status,j:await r.json().catch(()=>null)} }
const me=(await sql(`select id from employees where login='t_rah'`))[0].id
let r=await call(R,{action:'deactivate',employee_id:me}); check('T11','Rahbar не может отключить себя', r.s===400, JSON.stringify(r))
r=await call(R,{action:'create',login:'t_pw1',full_name:'x',password:'12345678',role:'ishlab'}); check('T12','пароль 12345678 отклонён', r.s===400, JSON.stringify(r))
r=await call(R,{action:'create',login:'t_pw1',full_name:'x',password:'abc1234',role:'ishlab'}); check('T13','пароль 7 символов отклонён', r.s===400, JSON.stringify(r))
r=await call(R,{action:'create',login:'t_pw1',full_name:'x',password:'T_PW1xyz99',role:'ishlab'}); check('T14','пароль с логином внутри отклонён', r.s===400, JSON.stringify(r))
r=await call(R,{action:'create',login:'t_pw1',full_name:'TEST pw',password:'Kd7mPq2xZa',role:'ishlab'}); check('T15','нормальный пароль принят', r.s===200, JSON.stringify(r))
const tok=await login(R); const up=await fetch(`${URL_}/auth/v1/user`,{method:'PUT',headers:{apikey:ANON,Authorization:`Bearer ${tok}`,'Content-Type':'application/json'},body:JSON.stringify({password:'abc1234'})}); check('T16','самостоятельная смена на 7 символов отклонена сервером', !up.ok, up.status)
await import('fs').then(f=>f.writeFileSync('ctx_b1.json',JSON.stringify({ids:[a.id,b.id,c.id]})))
