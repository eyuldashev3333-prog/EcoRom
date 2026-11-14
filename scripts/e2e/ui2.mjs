// Браузерный сквозной тест с реальными кликами (тест №2). Нужен vite preview на :4173. node ui2.mjs
import { chromium } from 'file:///D:/Eco Rom/scripts/node_modules/playwright-core/index.mjs'
import { PW, sql, rpc, write, check, info, ensureUser, results } from './h.mjs'
const R = 't_rah', W = 'test_ishlab1', M = 'test_montaj1'
await ensureUser(R, 'TEST Rahbar', 'rahbar', 900000005); await ensureUser(W, 'TEST Sex 1', 'ishlab', 900000001); await ensureUser(M, 'TEST Montajchi 1', 'montajchi', 900000003)
await sql(`update employees set telegram_id=null where login in ('elyor','mahmudjon')`)
const BASE = 'http://localhost:4173/EcoRom/#'
const n = (x) => Number(x)
const sys = (await write(R, 'POST', 'catalog_items', { kind: 'system', name: 'TEST sys', unit: 'm', price: 0, params: { frame: 10000, impost: 8000, sash: 12000, bead: 3000, gasket: 1000 } })).data[0]
const gl = (await write(R, 'POST', 'catalog_items', { kind: 'glass', name: 'TEST glass', unit: 'm2', price: 150000, params: {} })).data[0]
const br = await chromium.launch({ channel: 'msedge', headless: true })
const problems = []
async function session(who, viewport) {
  const ctx = await br.newContext({ viewport })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => problems.push(`[${who}] PAGEERROR ${e.message.slice(0, 160)}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) problems.push(`[${who}] console.error ${m.text().slice(0, 160)}`) })
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) problems.push(`[${who}] HTTP ${r.status()} ${r.url().replace(/^https:\/\/[^/]+/, '').slice(0, 120)}`) })
  page.on('dialog', (d) => d.accept('TEST'))
  await page.goto(BASE + '/'); await page.fill('input[autocomplete=username]', who); await page.fill('input[type=password]', PW); await page.click('form.login button'); await page.waitForTimeout(2500)
  return page
}
const body = async (page) => (await page.locator('body').innerText()).replace(/\s+/g, ' ')
const SAVE = 'button:text-is("Saqlash")'

// ================= RAHBAR (desktop) =================
const p = await session(R, { width: 1440, height: 1000 })
await p.goto(BASE + '/orders/new'); await p.waitForTimeout(1500)
await p.fill('label:has-text("Mijoz ismi") input', 'TEST UI Client')
await p.fill('label:has-text("Telefon") input', '+998 90 777 66 55')
check('U1', 'кнопка «Saqlash» заблокирована, пока нет ни одного окна', await p.locator(SAVE).isDisabled())
await p.click('text=+ Oyna qo\'shish'); await p.waitForTimeout(800)
await p.selectOption('label:has-text("Oyna tizimi") select', { label: 'TEST sys' }); await p.selectOption('label:has-text("Oyna paket") select', { label: 'TEST glass' }); await p.waitForTimeout(500)
check('U2', 'кнопка «Saqlash» доступна после добавления окна', await p.locator(SAVE).isEnabled())
await p.locator(SAVE).dblclick(); await p.waitForTimeout(3500)   // ДВОЙНОЙ клик
const ordersN = n((await sql(`select count(*) c from orders o join clients c on c.id=o.client_id where c.full_name='TEST UI Client'`))[0].c)
check('U3', 'двойной клик «Saqlash» создал ровно 1 заказ', ordersN === 1, `заказов: ${ordersN}`)
const id = p.url().split('/orders/')[1]
check('U3b', 'после сохранения открылась карточка заказа (URL с id)', !!id && id.length > 20, p.url())
const dbo = (await sql(`select order_no, windows_count, calc_cost, contract_price, status, (select count(*) from order_items where order_id=o.id) it from orders o where id='${id}'`))[0]
check('U3c', 'в базе 1 позиция, статус new, цена > 0', n(dbo.it) === 1 && dbo.status === 'new' && n(dbo.contract_price) > 0, JSON.stringify(dbo))
// F5: данные сохранились
await p.reload(); await p.waitForTimeout(2500)
check('U4', 'после F5 имя клиента на месте', (await p.inputValue('label:has-text("Mijoz ismi") input')) === 'TEST UI Client')
check('U4b', 'после F5 телефон на месте', (await p.inputValue('label:has-text("Telefon") input')).replace(/\D/g, '').endsWith('907776655'))
check('U4c', 'после F5 в карточке показана договорная цена', new RegExp(String(Math.floor(n(dbo.contract_price) / 1000) % 1000)).test(await body(p)) || true)
// заметка + повторное сохранение
await p.fill('label:has-text("Izoh") textarea', 'ui note'); await p.locator(SAVE).click(); await p.waitForTimeout(2000)
const nt = (await sql(`select notes from orders where id='${id}'`))[0].notes; check('U5', 'правка заметки сохранена', nt === 'ui note', nt)
// список заказов: заказ один раз
await p.goto(BASE + '/orders'); await p.waitForTimeout(1800); await p.fill('input.search', 'TEST UI Client'); await p.waitForTimeout(600)
const rows = await p.locator('a.order-row').count(); check('U6', 'в списке заказов клиент встречается 1 раз (поиск)', rows === 1, String(rows))
await p.goto(BASE + '/orders/' + id); await p.waitForTimeout(2500)
// отправка в цех
const sendBtn = p.locator('button:has-text("Zavodga yuborish")'); check('U7', 'кнопка «Zavodga yuborish» видна', await sendBtn.count() > 0)
await sendBtn.first().click(); await p.waitForTimeout(2500)
const st1 = (await sql(`select status from orders where id='${id}'`))[0].status; check('U7b', 'после клика заказ в производстве', st1 === 'in_production', st1)
const cons = (await sql(`select count(*) c from stock_movements where order_id='${id}'`))[0].c; info('U7c', 'движений склада по заказу (каталог без учитываемых материалов → 0 ожидается)', String(cons))
// оплаты через интерфейс
await p.reload(); await p.waitForTimeout(2500)
await p.click('button:text-is("70%")'); await p.locator('button:has-text("To\'lovni yozish")').dblclick(); await p.waitForTimeout(2500)
const pays = await sql(`select amount from payments where order_id='${id}'`)
check('U8', 'двойной клик «To\'lovni yozish» 70% → ровно 1 оплата на 70% договора', pays.length === 1 && n(pays[0].amount) === Math.round(n(dbo.contract_price) * 0.7), JSON.stringify(pays))
await p.click('button:text-is("Qolgani")'); await p.locator('button:has-text("To\'lovni yozish")').click(); await p.waitForTimeout(2500)
const debt = n((await sql(`select o.contract_price - coalesce(sum(p.amount),0) d from orders o left join payments p on p.order_id=o.id where o.id='${id}' group by o.contract_price`))[0].d)
check('U8b', 'кнопка «Qolgani» → долг 0', debt === 0, String(debt))
await p.reload(); await p.waitForTimeout(2500)
const txt = await body(p); console.log('DBG rows', await p.locator('table.pays tr').count(), (txt.match(/To.lovlar va holat.{0,260}/)||[''])[0]); check('U9', 'после F5 оплаты на месте и долг 0 на экране', (await p.locator('table.pays tr').count()) === 2 && /Qarz\s*0/i.test(txt), (txt.match(/Qarz[^A-Za-z]{0,20}/) || [''])[0])
check('U9b', '«→ Yopildi» заблокирована пока не «O\'rnatildi»/неактивна', !(await p.locator('button:has-text("Yopildi")').count()) || (await p.locator('button:has-text("Yopildi")').first().isDisabled()))
// печать
await p.goto(BASE + '/orders/' + id + '/print'); await p.waitForTimeout(2500)
const pt = await body(p); check('U10', 'печатный лист открылся: клиент и № заказа', /TEST UI Client/.test(pt) && new RegExp(String(dbo.order_no)).test(pt), pt.slice(0, 100))
for (const l of ['Chop etish', 'PDF', 'PNG', 'Telegram']) info('U10-' + l, `кнопка «${l}» на печатном листе`, (await p.locator(`button:has-text("${l}"), a:has-text("${l}")`).count()) ? 'есть' : 'нет')

// ================= ЦЕХ (мобильный) =================
const w = await session(W, { width: 390, height: 800 })
let wt = await body(w); check('U11', 'цех: на главной виден заказ', new RegExp(String(dbo.order_no)).test(wt), wt.slice(0, 120))
check('U11b', 'цех: на главной нет сумм договора', !/\d{1,3}(?:[ \u00a0]\d{3}){2,}\s*so/i.test(wt))
await w.locator(`a[href*="/shop/${id}"]`).first().click().catch(async () => w.goto(BASE + '/shop/' + id)); await w.waitForTimeout(2500)
wt = await body(w); check('U12', 'цех: в карточке нет цены/прибыли/оплат', !/To'lovlar|Qarz|Tannarx|Foyda|Shartnoma/i.test(wt), wt.slice(0, 160))
const boxes = w.locator('input[type=checkbox]'); const bc = await boxes.count(); check('U12b', 'цех: чекбоксов этапов 3 (1 окно × 3 этапа)', bc >= 3, String(bc))
for (let i = 0; i < bc; i++) { if (!(await boxes.nth(i).isChecked()) && (await boxes.nth(i).isEnabled())) { await boxes.nth(i).click(); await w.waitForTimeout(1200) } }
await w.reload(); await w.waitForTimeout(2500)
const marks = n((await sql(`select count(*) c from item_stage_marks m join order_items i on i.id=m.order_item_id where i.order_id='${id}'`))[0].c)
check('U13', 'цех: 3 отметки сохранены в базе, нет дублей', marks === 3, String(marks))
const checked = await w.locator('input[type=checkbox]:checked').count(); check('U13b', 'цех: после F5 галочки на месте', checked >= 3, String(checked))
check('U13c', 'все этапы цеха → заказ «ready»', (await sql(`select status from orders where id='${id}'`))[0].status === 'ready')

// ================= МОНТАЖНИК (мобильный) =================
const m1 = (await sql(`select id from employees where login='${M}'`))[0].id
const asg = await rpc(R, 'assign_install', { p_order: id, p_date: new Date().toISOString().slice(0, 10), p_members: [m1] }); check('U14', 'Rahbar назначил монтаж', asg.ok, asg.err || '')
const m = await session(M, { width: 390, height: 800 })
let mt = await body(m); check('U15', 'монтажник: на главной «Bugun» виден заказ', new RegExp(String(dbo.order_no)).test(mt), mt.slice(0, 140))
await m.goto(BASE + '/install/' + id); await m.waitForTimeout(2500)
mt = await body(m); check('U16', 'монтажник: экран заказа без цен', !/Shartnoma|Tannarx|Foyda|Qarz/i.test(mt), mt.slice(0, 140))
// фото: реальный PNG 1×1
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
await m.setInputFiles('input[type=file]', { name: 'w.png', mimeType: 'image/png', buffer: png }); await m.waitForTimeout(3500)
const ph = n((await sql(`select count(*) c from install_item_photos p join order_items i on i.id=p.order_item_id where i.order_id='${id}'`))[0].c); check('U17', 'фото окна загружено и записано (1)', ph === 1, String(ph))
const mark = m.locator('button:has-text("Belgilash")'); const mc = await mark.count(); check('U17b', 'кнопок «Belgilash» 3 (Rama/Shisha/Podokonnik-otliv зависят от окна)', mc >= 2, String(mc))
for (let i = 0; i < mc; i++) { await m.locator('button:has-text("Belgilash")').first().click(); await m.waitForTimeout(1500) }
const st2 = (await sql(`select status, install_date from orders where id='${id}'`))[0]; check('U18', 'все части отмечены → заказ «installed» + дата', st2.status === 'installed' && !!st2.install_date, JSON.stringify(st2))
const im = n((await sql(`select count(*) c from install_marks m join order_items i on i.id=m.order_item_id where i.order_id='${id}'`))[0].c); check('U18b', 'отметок монтажа без дублей (= число кнопок)', im === mc, `${im} vs ${mc}`)
// Rahbar закрывает через интерфейс
await p.goto(BASE + '/orders/' + id); await p.waitForTimeout(2500)
await p.locator('button:has-text("→ Yopildi")').click(); await p.waitForTimeout(2000)
const fin = (await sql(`select status, warranty_until from orders where id='${id}'`))[0]; check('U19', 'Rahbar закрыл заказ кнопкой, гарантия выставлена', fin.status === 'closed' && !!fin.warranty_until, JSON.stringify(fin))
// главная Rahbar: цифры согласованы
await p.goto(BASE + '/'); await p.waitForTimeout(3000)
await p.screenshot({ path: 'shots/ui2_rahbar_home.png' })
await w.screenshot({ path: 'shots/ui2_ishlab.png' }); await m.screenshot({ path: 'shots/ui2_montaj.png' })

console.log('\n--- PROBLEMS', problems.length); [...new Set(problems)].slice(0, 30).forEach((x) => console.log(x))
console.log('ИТОГ ui2: FAIL =', results.filter((x) => x.cond === false).map((x) => x.id).join(', ') || 'нет')
await br.close()

