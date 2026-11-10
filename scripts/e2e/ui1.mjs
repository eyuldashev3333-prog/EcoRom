import { chromium } from 'file:///D:/Eco Rom/scripts/node_modules/playwright-core/index.mjs'
import { PW } from './h.mjs'
const BASE = 'http://localhost:4173/EcoRom/#'
const who = process.argv[2] || 't_rah'
const routes = (process.argv[3] || '/,/orders,/orders/new,/catalog,/employees,/stock,/purchases,/suppliers,/offcuts,/expenses,/payroll,/pay-rules,/report,/leaks,/settings,/service,/breakages,/designer,/photo,/jadval/registratsiya,/jadval/savdo,/zavod,/my-pay,/password').split(',')
const br = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] })
const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const problems = []
let cur = 'login'
page.on('console', m => { if (m.type() === 'error') problems.push(`[${cur}] console.error: ${m.text().slice(0,200)}`) })
page.on('pageerror', e => problems.push(`[${cur}] PAGEERROR: ${e.message.slice(0,200)}`))
page.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) problems.push(`[${cur}] HTTP ${r.status()} ${r.url().replace(/^https:\/\/[^/]+/,'').slice(0,140)}`) })
await page.goto(BASE + '/')
await page.fill('input[autocomplete=username]', who); await page.fill('input[type=password]', PW); await page.click('form.login button')
await page.waitForTimeout(3000)
console.log('after login url', page.url(), 'title', await page.title())
for (const r of routes) {
  cur = r; await page.goto(BASE + r); await page.waitForTimeout(r.includes('zavod') ? 5000 : 1800)
  const txt = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 160)
  const err = await page.locator('.error, [role=alert]').allInnerTexts()
  console.log(r.padEnd(24), page.url().replace(BASE,'').padEnd(22), '|', txt.slice(0,110), err.length ? ' ERR:' + err.join('|').slice(0,80) : '')
  await page.screenshot({ path: `shots/${who}_${r.replace(/\W+/g,'_')}.png` })
}
console.log('--- PROBLEMS', problems.length); [...new Set(problems)].slice(0, 40).forEach(p => console.log(p))
await br.close()
