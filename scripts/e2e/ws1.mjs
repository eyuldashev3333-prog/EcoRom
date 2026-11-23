// Проверка нового экрана создания заказа «как WinStudio» на размере телефона (боевая база, тестовый Rahbar t_rah).
// Нужен vite preview на 4173. После: node cleanup-e2e.mjs
import { chromium } from 'file:///D:/Eco Rom/scripts/node_modules/playwright-core/index.mjs'
import { ensureUser, PW, sql } from './h.mjs'

await ensureUser('t_rah', 'TEST Rahbar', 'rahbar', 1)
const BASE = 'http://localhost:4173/EcoRom/#'
const br = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await br.newContext({ viewport: { width: 360, height: 720 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
const problems = []
page.on('console', (m) => { if (m.type() === 'error') problems.push('console.error: ' + m.text().slice(0, 200)) })
page.on('pageerror', (e) => problems.push('PAGEERROR: ' + e.message.slice(0, 200)))
page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) problems.push(`HTTP ${r.status()} ${r.url().replace(/^https:\/\/[^/]+/, '').slice(0, 140)}`) })
const shot = (n) => page.screenshot({ path: `shots/ws_${n}.png` })
const step = async (n, fn) => { try { await fn(); console.log('ok  ', n) } catch (e) { console.log('FAIL', n, String(e.message).split('\n')[0]); await shot('fail_' + n) } }

await page.goto(BASE + '/')
await page.fill('input[autocomplete=username]', 't_rah')
await page.fill('input[type=password]', PW)
await page.click('form.login button')
await page.waitForTimeout(3000)
await page.goto(BASE + '/ws/new'); await page.waitForTimeout(1200)
await shot('01_new')
await step('new customer', async () => { await page.click('text=YANGI MIJOZ'); await page.waitForTimeout(500); await shot('02_customer') })
await step('fill customer', async () => { await page.fill('.ws-field input >> nth=0', 'TEST WS Mijoz'); await page.fill('.ws-field input >> nth=1', '+998901112233'); await shot('03_customer_filled'); await page.click('.ws-submit') ; await page.waitForTimeout(600); await shot('04_orderform') })
await step('create order', async () => { await page.fill('.ws-field input >> nth=0', 'Test manzil 1'); await page.click('.ws-submit'); await page.waitForURL(/ws\/edit/, { timeout: 15000 }); await page.waitForTimeout(1500); await shot('05_editor_empty') })
await step('add window', async () => { await page.click('.ws-plus'); await page.waitForTimeout(600); await shot('06_config'); await page.locator('.ws-cfg button').first().click(); await page.click('.ws-dlg-act .yes'); await page.waitForTimeout(2500); await shot('07_window'); console.log('url', page.url()) })
await step('options', async () => { await page.click('.ws-compass'); await page.waitForTimeout(600); await shot('08_options') })
const pick = (title, idx) => page.evaluate(([t, i]) => { const sec = [...document.querySelectorAll('.ws-sec')].find((s) => s.textContent === t); sec.nextElementSibling.querySelectorAll('input')[i].click() }, [title, idx])
await step('pick system+glass', async () => {
  await pick('oyna tizimi', 5); await pick('shisha paket turi', 2); await page.waitForTimeout(300)
  await page.locator('.ws-side-b').evaluate((el) => { el.scrollTop = 600 })
  await shot('09_options_scrolled')
})
await step('close options', async () => { await page.click('.ws-side-ok'); await page.waitForTimeout(1800); await shot('10_after_options'); console.log((await page.locator('.ws-table').innerText()).replace(/\s+/g, ' ').slice(0, 400)) })
await step('size keypad', async () => { await page.locator('.ws-svgbox svg text', { hasText: '1500' }).first().click({ force: true }); await page.waitForTimeout(500); await shot('11_keypad') })
console.log('--- PROBLEMS', problems.length); [...new Set(problems)].slice(0, 30).forEach((p) => console.log(p))
await br.close()
