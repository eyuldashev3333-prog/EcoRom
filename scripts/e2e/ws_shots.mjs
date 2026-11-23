// Снимки всех экранов /ws на разных размерах (Telegram, телефон, планшет, компьютер): поиск ошибок дизайна.
import { chromium } from 'file:///D:/Eco Rom/scripts/node_modules/playwright-core/index.mjs'
import { ensureUser, PW } from './h.mjs'

await ensureUser('t_rah', 'TEST Rahbar', 'rahbar', 1)
const BASE = 'http://localhost:4173/EcoRom/#'
const SIZES = [
  { n: 'tg360', w: 360, h: 640, tg: true },
  { n: 'ph412', w: 412, h: 915 },
  { n: 'ph390', w: 390, h: 844 },
  { n: 'tab768', w: 768, h: 1024 },
  { n: 'pc1440', w: 1440, h: 900 },
  { n: 'pc1920', w: 1920, h: 1080 },
]
const br = await chromium.launch({ channel: 'msedge', headless: true })
for (const s of SIZES) {
  const ctx = await br.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 2, hasTouch: s.w < 900, isMobile: s.w < 900 })
  if (s.tg) await ctx.addInitScript(() => { window.Telegram = { WebApp: { initData: 'query_id=test', viewportStableHeight: 600, safeAreaInset: { top: 0, bottom: 0 }, contentSafeAreaInset: { top: 0, bottom: 20 }, expand() {}, disableVerticalSwipes() {}, setHeaderColor() {}, onEvent() {}, offEvent() {}, ready() {} } } })
  const page = await ctx.newPage()
  if (s.tg) await page.route('**/telegram-web-app.js*', (r) => r.abort()) // чтобы настоящий скрипт Telegram не затёр эмуляцию
  const shot = (n) => page.screenshot({ path: `shots/s_${s.n}_${n}.png` })
  await page.goto(BASE + '/')
  await page.fill('input[autocomplete=username]', 't_rah'); await page.fill('input[type=password]', PW); await page.click('form.login button')
  await page.waitForTimeout(3500)
  await page.goto(BASE + '/ws/new'); await page.waitForSelector('text=YANGI MIJOZ', { timeout: 20000 }); await shot('1_new')
  await page.click('text=YANGI MIJOZ'); await page.waitForTimeout(500)
  await page.fill('.ws-field input >> nth=0', 'TEST WS Dizayn'); await page.fill('.ws-field input >> nth=1', '+998901234567'); await shot('2_customer')
  await page.click('.ws-submit'); await page.waitForTimeout(500)
  await page.fill('.ws-field input >> nth=0', 'Dizayn test'); await shot('3_order')
  await page.click('.ws-submit'); await page.waitForURL(/ws\/edit/); await page.waitForTimeout(800); await shot('4_empty')
  await page.click('.ws-plus'); await page.waitForTimeout(500); await shot('5_config')
  await page.locator('.ws-cfg button').nth(1).click(); await page.click('.ws-dlg-act .yes'); await page.waitForTimeout(2500); await shot('6_window')
  await page.click('.ws-compass'); await page.waitForTimeout(500); await shot('7_options')
  await page.click('.ws-side-ok'); await page.waitForTimeout(400)
  const b = await page.locator('.ws-svgbox svg').boundingBox()
  await page.mouse.click(b.x + b.width * 0.7, b.y + b.height * 0.4); await page.waitForTimeout(500); await shot('8_cell')
  await page.click('.ws-dlg-act .no'); await page.waitForTimeout(300)
  await page.click('.ws-burger'); await page.waitForTimeout(400); await shot('9_menu')
  await page.click('.ws-menu .m6'); await page.waitForTimeout(300)
  await page.goto(BASE + '/ws/orders'); await page.waitForTimeout(2500); await shot('10_orders')
  await ctx.close()
}
await br.close()
console.log('done')
