// «Прокликиватель»: нажимает каждую кнопку на каждом экране Rahbar (кроме деструктивных), ловит ошибки страницы/консоли/HTTP.
// Запуск: node ui3.mjs [who] ; нужен vite preview :4173 и хотя бы один заказ (после ui2.mjs)
import { chromium } from 'file:///D:/Eco Rom/scripts/node_modules/playwright-core/index.mjs'
import { PW, sql } from './h.mjs'
const who = process.argv[2] || 't_rah'
const BASE = 'http://localhost:4173/EcoRom/#'
const oid = (await sql(`select id from orders order by order_no desc limit 1`))[0]?.id
const routes = ['/', '/orders', '/orders/new', ...(oid ? ['/orders/' + oid, '/orders/' + oid + '/print'] : []), '/catalog', '/employees', '/stock', '/purchases', '/suppliers', '/offcuts', '/expenses', '/payroll', '/pay-rules', '/report', '/leaks', '/settings', '/service', '/breakages', '/designer', '/photo', '/jadval/registratsiya', '/jadval/savdo', '/zavod', '/my-pay', '/password']
const SKIP = /o.chirish|delete|bekor|chiqish|logout|yopildi|tasdiqla|tozalash|reset|qayta tikla|import|deaktiv|o.chir|saqlash|yozish|qo.shish|yuborish|tayinlash|boshqa foto|suratga|belgilash|olib tashlash|qaytarish|kirish|login/i
const br = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage()
let cur = 'login'; const problems = []
page.on('pageerror', (e) => problems.push(`[${cur}] PAGEERROR ${e.message.slice(0, 160)}`))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) problems.push(`[${cur}] console.error ${m.text().slice(0, 160)}`) })
page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) problems.push(`[${cur}] HTTP ${r.status()} ${r.url().replace(/^https:\/\/[^/]+/, '').slice(0, 110)}`) })
page.on('dialog', (d) => d.dismiss())
await page.goto(BASE + '/'); await page.fill('input[autocomplete=username]', who); await page.fill('input[type=password]', PW); await page.click('form.login button'); await page.waitForTimeout(2500)
let total = 0, clicked = 0, skipped = 0, failedClick = 0
for (const r of routes) {
  cur = r; await page.goto(BASE + r); await page.waitForTimeout(r.includes('zavod') ? 4500 : 1600)
  const sel = 'main button:visible, main a.btn-link:visible, .content button:visible'
  const count = await page.locator('main button:visible').count()
  let rc = 0, rs = 0
  for (let i = 0; i < count; i++) {
    const b = page.locator('main button:visible').nth(i)
    const label = ((await b.innerText().catch(() => '')) || (await b.getAttribute('aria-label').catch(() => '')) || '').trim().replace(/\s+/g, ' ')
    total++
    if (SKIP.test(label) || (await b.isDisabled().catch(() => true))) { skipped++; rs++; continue }
    try { await b.click({ timeout: 2500 }); clicked++; rc++; await page.waitForTimeout(250) } catch (e) { failedClick++; problems.push(`[${r}] не нажалась «${label.slice(0, 40)}»: ${String(e.message).split('\n')[0].slice(0, 80)}`) }
    if (!page.url().endsWith('#' + r)) { await page.goto(BASE + r); await page.waitForTimeout(1200) }
  }
  console.log(r.padEnd(28), 'кнопок', String(count).padStart(3), 'нажато', String(rc).padStart(3), 'пропущено (деструктивные/disabled)', rs)
}
console.log(`\nВСЕГО кнопок ${total}, нажато ${clicked}, пропущено ${skipped}, не нажалось ${failedClick}`)
console.log('--- PROBLEMS', problems.length); [...new Set(problems)].slice(0, 40).forEach((x) => console.log(x))
await br.close()
