// Скриншоты новой цепочки: Savdo-канбан, карточка заказа (ПК и телефон). Нужен `vite preview` на 4173.
import { chromium } from 'file:///D:/Eco Rom/scripts/node_modules/playwright-core/index.mjs'
import { mkdirSync } from 'node:fs'
import { PW, sql } from './h.mjs'
const BASE = 'http://localhost:4173/EcoRom/#'
const OUT = process.argv[2] || 'shots'
mkdirSync(OUT, { recursive: true })
const [o] = await sql(`select id from orders where status <> 'cancelled' order by order_no desc limit 1`)
const br = await chromium.launch({ channel: 'msedge', headless: true })
for (const [name, vp] of [['pc', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const page = await (await br.newContext({ viewport: vp, deviceScaleFactor: 1 })).newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  await page.goto(BASE + '/')
  await page.fill('input[autocomplete=username]', 't_rah')
  await page.fill('input[type=password]', PW)
  await page.click('form.login button')
  await page.waitForTimeout(3000)
  for (const [n, r] of [['orders', '/orders'], ['order', `/orders/${o.id}`]]) {
    await page.goto(BASE + r)
    await page.waitForTimeout(3000)
    await page.screenshot({ path: `${OUT}/${name}_${n}.png`, fullPage: n === 'order' })
  }
  console.log(name, 'errors:', errs)
}
await br.close()
