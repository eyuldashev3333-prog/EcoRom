// Отладка прокрутки: кто перехватывает колесо (слушатели wheel, overflow html/body)
import { chromium } from 'file:///D:/Eco Rom/scripts/node_modules/playwright-core/index.mjs'
import { PW, sql } from './h.mjs'
const BASE = 'http://localhost:4173/EcoRom/#'
const [o] = await sql(`select id from orders where status <> 'cancelled' order by order_no desc limit 1`)
const br = await chromium.launch({ channel: 'msedge', headless: true })
const page = await (await br.newContext({ viewport: { width: 1440, height: 800 } })).newPage()
await page.goto(BASE + '/')
await page.fill('input[autocomplete=username]', 't_rah')
await page.fill('input[type=password]', PW)
await page.click('form.login button')
await page.waitForTimeout(3000)
await page.goto(BASE + `/orders/${o.id}`)
await page.waitForTimeout(2500)
const cdp = await page.context().newCDPSession(page)
const { result: win } = await cdp.send('Runtime.evaluate', { expression: 'window' })
const { result: doc } = await cdp.send('Runtime.evaluate', { expression: 'document' })
for (const [n, obj] of [['window', win], ['document', doc]]) {
  const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: obj.objectId })
  console.log(n, listeners.filter((l) => /wheel|scroll|touch|mouse/.test(l.type)).map((l) => `${l.type} passive=${l.passive} ${l.scriptId}:${l.lineNumber}`))
}
console.log(await page.evaluate(() => {
  const cs = (e) => { const s = getComputedStyle(e); return `${e.tagName} ox=${s.overflowX} oy=${s.overflowY} h=${e.clientHeight}/${e.scrollHeight} pos=${s.position}` }
  return [cs(document.documentElement), cs(document.body), cs(document.getElementById('root')), cs(document.querySelector('.app')), cs(document.querySelector('.main')), cs(document.querySelector('main'))].join('\n')
}))
await page.evaluate(() => window.scrollBy(0, 300))
console.log('scrollBy →', await page.evaluate(() => scrollY))
await page.evaluate(() => window.scrollTo(0, 0))
const r = await page.evaluate(() => new Promise((res) => {
  let seen = ''
  addEventListener('wheel', (e) => { seen = `wheel defaultPrevented=${e.defaultPrevented} target=${e.target.tagName}.${e.target.className}` ; setTimeout(() => res(seen), 0) }, { once: true })
}).then((x) => x)
).catch(() => '')
await page.mouse.move(700, 450)
await page.mouse.wheel(0, 600)
await page.waitForTimeout(600)
console.log('after wheel scrollY', await page.evaluate(() => scrollY), r)
await br.close()
