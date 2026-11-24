// Скриншоты: цех (карточка без имени, чертёж крупно) и монтажник (диалог «O'rnatildi»: фото + стекло). Нужен `vite preview` на 4173 и заказ из f1_ready.mjs.
import { chromium } from 'file:///D:/Eco Rom/scripts/node_modules/playwright-core/index.mjs'
import { mkdirSync } from 'node:fs'
import { PW, sql } from './h.mjs'
const OUT = process.argv[2] || 'shots'
mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:4173/EcoRom/#'
const br = await chromium.launch({ channel: 'msedge', headless: true })
const login = async (who) => {
  const page = await (await br.newContext({ viewport: { width: 390, height: 844 } })).newPage()
  page.on('pageerror', (e) => console.log(who, 'PAGEERROR', e.message))
  await page.goto(BASE + '/')
  await page.fill('input[autocomplete=username]', who)
  await page.fill('input[type=password]', PW)
  await page.click('form.login button')
  await page.waitForTimeout(3000)
  return page
}
const [o] = await sql(`select id from orders o where o.status = 'ready' and exists (select 1 from clients c where c.id = o.client_id and c.full_name = 'TEST F1 ready') limit 1`)
let page = await login('test_ishlab1')
await page.goto(BASE + '/shop/' + o.id)
await page.waitForTimeout(3000)
await page.screenshot({ path: `${OUT}/usta_order.png`, fullPage: true })
await page.goto(BASE + '/')
await page.waitForTimeout(2500)
await page.screenshot({ path: `${OUT}/usta_home.png`, fullPage: true })
page = await login('test_mont1')
await page.locator('button:has-text("O\'rnatildi")').first().click()
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/mont_dialog_noglass.png` })
await br.close()
