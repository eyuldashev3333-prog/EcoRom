// Проверка прокрутки колесом мыши на ПК: карточка заказа (/orders/:id) и главная. Нужен `vite preview` на 4173.
// Запуск: node scroll_check.mjs [tg]  — с «tg» подменяет Telegram.WebApp (как Telegram Desktop).
import { chromium } from 'file:///D:/Eco Rom/scripts/node_modules/playwright-core/index.mjs'
import { PW, ensureUser, sql } from './h.mjs'
const BASE = 'http://localhost:4173/EcoRom/#'
const tg = process.argv[2] === 'tg'
await ensureUser('t_rah', 'TEST Rahbar', 'rahbar')
const [o] = await sql(`select id from orders where status <> 'cancelled' order by order_no desc limit 1`)
const br = await chromium.launch({ channel: 'msedge', headless: true })
const ctx = await br.newContext({ viewport: { width: 1440, height: 800 } })
const page = await ctx.newPage()
await page.goto(BASE + '/')
await page.fill('input[autocomplete=username]', 't_rah')
await page.fill('input[type=password]', PW)
await page.click('form.login button')
await page.waitForTimeout(3000)
if (tg) {
  // Telegram Desktop: html.tg — прокрутка внутри #root
  await page.evaluate(() => document.documentElement.classList.add('tg'))
}
for (const r of [`/orders/${o.id}`, '/orders', '/']) {
  await page.goto(BASE + r)
  await page.waitForTimeout(2500)
  const before = await page.evaluate(() => ({ win: scrollY, root: document.getElementById('root').scrollTop, pane: document.querySelector('.pane:not([aria-hidden=true])')?.scrollTop ?? null, h: document.documentElement.scrollHeight }))
  await page.mouse.move(700, 450)
  await page.mouse.wheel(0, 600)
  await page.waitForTimeout(800)
  const after = await page.evaluate(() => ({ win: scrollY, root: document.getElementById('root').scrollTop, pane: document.querySelector('.pane:not([aria-hidden=true])')?.scrollTop ?? null, h: document.documentElement.scrollHeight }))
  const el = await page.evaluate(() => { const e = document.elementFromPoint(700, 450); return e ? `${e.tagName}.${e.className}`.slice(0, 80) : '' })
  console.log(r.padEnd(50), JSON.stringify(before), '→', JSON.stringify(after), 'under mouse:', el)
}
await br.close()
