// Скриншоты: главная мастера/монтажника со статистикой, «Mening ishlarim», «Tarix» у руководителя. Нужен `vite preview` на 4173 и заказ из f4.mjs.
import { chromium } from 'file:///D:/Eco Rom/scripts/node_modules/playwright-core/index.mjs'
import { mkdirSync } from 'node:fs'
import { PW, sql } from './h.mjs'
const OUT = process.argv[2] || 'shots'
mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:4173/EcoRom/#'
const br = await chromium.launch({ channel: 'msedge', headless: true })
const login = async (who, vp = { width: 390, height: 844 }) => {
  const page = await (await br.newContext({ viewport: vp })).newPage()
  page.on('pageerror', (e) => console.log(who, 'PAGEERROR', e.message))
  await page.goto(BASE + '/')
  await page.fill('input[autocomplete=username]', who)
  await page.fill('input[type=password]', PW)
  await page.click('form.login button')
  await page.waitForTimeout(3000)
  return page
}
const [o] = await sql(`select id from orders where client_id in (select id from clients where full_name = 'TEST F4 Mijoz') limit 1`)
let page = await login('test_ishlab1')
await page.screenshot({ path: `${OUT}/usta_home.png`, fullPage: true })
await page.goto(BASE + '/my-works'); await page.waitForTimeout(2500)
await page.locator('button:has-text("Bajarilgan")').click(); await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/usta_myworks.png`, fullPage: true })
await page.goto(BASE + '/shop/' + o.id); await page.waitForTimeout(2500)
await page.screenshot({ path: `${OUT}/usta_done_order.png` })
page = await login('test_mont1')
await page.screenshot({ path: `${OUT}/mont_home.png`, fullPage: true })
await page.goto(BASE + '/my-works'); await page.waitForTimeout(2500)
await page.locator('button:has-text("Bajarilgan")').click(); await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/mont_myworks.png`, fullPage: true })
page = await login('t_rah', { width: 1200, height: 900 })
await page.goto(BASE + '/orders/' + o.id); await page.waitForTimeout(3000)
await page.screenshot({ path: `${OUT}/rahbar_history.png`, fullPage: true })
await br.close()
