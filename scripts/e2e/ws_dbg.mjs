import { chromium } from 'file:///D:/Eco Rom/scripts/node_modules/playwright-core/index.mjs'
import { PW } from './h.mjs'
const BASE = 'http://localhost:4173/EcoRom/#'
const br = await chromium.launch({ channel: 'msedge', headless: true })
const ctx = await br.newContext({ viewport: { width: 360, height: 720 } })
const page = await ctx.newPage()
page.on('console', (m) => console.log('console', m.type(), m.text().slice(0, 200)))
await page.goto(BASE + '/')
await page.fill('input[autocomplete=username]', 't_rah'); await page.fill('input[type=password]', PW); await page.click('form.login button')
await page.waitForTimeout(3500)
console.log('after login', page.url())
await page.goto(BASE + '/orders/new'); await page.waitForTimeout(6000)
console.log('url', page.url(), await page.evaluate(() => location.hash), (await page.locator('body').innerText()).slice(0,80))
await page.screenshot({ path: 'shots/ws_dbg.png' })
await br.close()
