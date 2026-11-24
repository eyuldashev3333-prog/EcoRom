// Скриншоты: Ombor с «+ Kirim» и диалогом, «Ish haqi qoidalari». Нужен `vite preview` на 4173.
import { chromium } from 'file:///D:/Eco Rom/scripts/node_modules/playwright-core/index.mjs'
import { mkdirSync } from 'node:fs'
import { ensureUser, PW } from './h.mjs'
await ensureUser('t_rah', 'T Rahbar', 'rahbar', 9100001)
const OUT = process.argv[2] || 'shots'
mkdirSync(OUT, { recursive: true })
const br = await chromium.launch({ channel: 'msedge', headless: true })
const page = await (await br.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.goto('http://localhost:4173/EcoRom/#/')
await page.fill('input[autocomplete=username]', 't_rah')
await page.fill('input[type=password]', PW)
await page.click('form.login button')
await page.waitForTimeout(3000)
await page.goto('http://localhost:4173/EcoRom/#/stock')
await page.waitForTimeout(2500)
await page.fill('input[type=search]', 'Otliv oq 200')
await page.waitForTimeout(500)
await page.locator('button:has-text("+ Kirim")').first().click()
await page.waitForTimeout(400)
await page.locator('.dialog input').nth(0).fill('10')
await page.locator('.dialog input').nth(1).fill('500000')
await page.screenshot({ path: `${OUT}/stock_kirim.png` })
await page.keyboard.press('Escape')
await page.goto('http://localhost:4173/EcoRom/#/pay-rules')
await page.waitForTimeout(2000)
await page.locator('select').nth(1).focus()
const opts = await page.locator('select').nth(1).locator('option').allInnerTexts()
console.log('pay-rules Turi options:', opts)
await page.screenshot({ path: `${OUT}/payrules.png`, fullPage: true })
console.log('errors:', errs)
await br.close()
