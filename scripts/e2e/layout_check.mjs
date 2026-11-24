// Проверка раскладки Savdo на широких экранах: доска не вылезает вбок, пейджер стоит ровно на панели. Нужен `vite preview` на 4173.
import { chromium } from 'file:///D:/Eco Rom/scripts/node_modules/playwright-core/index.mjs'
import { mkdirSync } from 'node:fs'
import { ensureUser, rpc, PW } from './h.mjs'
const OUT = process.argv[2] || 'shots'
mkdirSync(OUT, { recursive: true })
await ensureUser('t_rah', 'T Rahbar', 'rahbar', 9100001)
for (let i = 0; i < 3; i++) await rpc('t_rah', 'save_order', { p: { client: { full_name: 'TEST L' + i, phone: '+99890000000' + i }, address: 'TEST', contract_price: 1000000, calc_cost: 500000, windows_count: 1, area_m2: 1.5, items: [{ pos: 1, title: 'w', width_mm: 1000, height_mm: 1500, qty: 1, area_m2: 1.5, cost: 100, design: { width: 1000, height: 1500, shape: 'rect', root: { kind: 'leaf', id: 'a', opening: 'tt_r' } }, options: {}, materials: { items: [] } }] } })
const br = await chromium.launch({ channel: 'msedge', headless: true })
for (const [w, h] of [[1884, 950], [1280, 800], [1024, 768]]) {
  const page = await (await br.newContext({ viewport: { width: w, height: h } })).newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  await page.goto('http://localhost:4173/EcoRom/#/')
  await page.fill('input[autocomplete=username]', 't_rah')
  await page.fill('input[type=password]', PW)
  await page.click('form.login button')
  await page.waitForTimeout(3000)
  await page.goto('http://localhost:4173/EcoRom/#/')
  await page.waitForTimeout(1500)
  await page.locator('.side-sec:has-text("Savdo")').first().click()
  await page.waitForTimeout(1500)
  const m = await page.evaluate(() => {
    const pg = document.querySelector('.pager'), pane = document.querySelector('.pane[aria-hidden=false]') ?? document.querySelector('.pane')
    const kan = document.querySelector('.kanban')
    const cols = kan ? getComputedStyle(kan).gridTemplateColumns.split(' ').length : 0
    return { vw: innerWidth, docW: document.documentElement.scrollWidth, pagerScroll: pg?.scrollLeft, pagerClient: pg?.clientWidth, paneScrollW: pane?.scrollWidth, paneClientW: pane?.clientWidth, cols, kanbanRight: kan ? Math.round(kan.getBoundingClientRect().right) : null }
  })
  console.log(`${w}x${h}`, JSON.stringify(m))
  await page.screenshot({ path: `${OUT}/layout_${w}.png` })
  if (w === 1884) {
    await page.goto('http://localhost:4173/EcoRom/#/orders/done')
    await page.waitForTimeout(2000)
    await page.screenshot({ path: `${OUT}/orders_done.png` })
  }
}
await br.close()
