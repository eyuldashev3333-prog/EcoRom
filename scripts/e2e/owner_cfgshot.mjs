// Снимок нашего диалога «konfiguratsiya» (порядок шаблонов) для сверки с WinStudio
import { chromium } from 'file:///D:/Eco Rom/scripts/node_modules/playwright-core/index.mjs'
import { readFileSync } from 'node:fs'
import { ensureUser, PW } from './h.mjs'
await ensureUser('t_rah', 'TEST Rahbar', 'rahbar', 1)
const br = await chromium.launch({ channel: 'msedge', headless: true })
const page = await (await br.newContext({ viewport: { width: 390, height: 3600 }, deviceScaleFactor: 1 })).newPage()
await page.goto('http://localhost:4173/EcoRom/#/')
await page.fill('input[autocomplete=username]', 't_rah'); await page.fill('input[type=password]', PW); await page.click('form.login button')
await page.waitForTimeout(3000)
await page.goto('http://localhost:4173/EcoRom/#/ws/edit/' + readFileSync('D:/Eco Rom/scripts/e2e/.owner_order', 'utf8').trim()); await page.waitForTimeout(3500)
await page.click('.ws-plus'); await page.waitForTimeout(800)
await page.locator('.ws-cfg').screenshot({ path: 'D:/Eco Rom/scripts/e2e/shots/our_cfg.png' })
await br.close()
