// Скриншоты главной по ролям (цех, монтажник, Rahbar-канбан) на тестовых заказах f1.mjs. Нужен `vite preview` на 4173.
import { chromium } from 'file:///D:/Eco Rom/scripts/node_modules/playwright-core/index.mjs'
import { mkdirSync } from 'node:fs'
import { PW } from './h.mjs'
const BASE = 'http://localhost:4173/EcoRom/#'
const OUT = process.argv[2] || 'shots'
mkdirSync(OUT, { recursive: true })
const br = await chromium.launch({ channel: 'msedge', headless: true })
for (const [who, r] of [['test_ishlab1', '/'], ['test_mont1', '/'], ['t_rah', '/orders']]) {
  const page = await (await br.newContext({ viewport: { width: 390, height: 844 } })).newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  await page.goto(BASE + '/')
  await page.fill('input[autocomplete=username]', who)
  await page.fill('input[type=password]', PW)
  await page.click('form.login button')
  await page.waitForTimeout(3000)
  await page.goto(BASE + r)
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT}/role_${who}.png`, fullPage: true })
  console.log(who, 'errors:', errs)
}
await br.close()
