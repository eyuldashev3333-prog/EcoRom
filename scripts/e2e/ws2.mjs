// Глубокая проверка редактора «как WinStudio» (телефон 360x720): деления, открывание, размеры, опции, несколько окон, перезагрузка, меню.
import { chromium } from 'file:///D:/Eco Rom/scripts/node_modules/playwright-core/index.mjs'
import { ensureUser, PW } from './h.mjs'

await ensureUser('t_rah', 'TEST Rahbar', 'rahbar', 1)
const BASE = 'http://localhost:4173/EcoRom/#'
const br = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await br.newContext({ viewport: { width: 360, height: 720 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
const problems = []
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_NAME_NOT_RESOLVED/.test(m.text())) problems.push('console.error: ' + m.text().slice(0, 200)) })
page.on('pageerror', (e) => problems.push('PAGEERROR: ' + e.message.slice(0, 200)))
page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) problems.push(`HTTP ${r.status()} ${r.url().replace(/^https:\/\/[^/]+/, '').slice(0, 140)}`) })
const shot = (n) => page.screenshot({ path: `shots/ws2_${n}.png` })
let fails = 0
const step = async (n, fn) => { try { await fn(); console.log('ok  ', n) } catch (e) { fails++; console.log('FAIL', n, String(e.message).split('\n')[0]); await shot('fail_' + n.replace(/\W+/g, '_')) } }
const table = async () => (await page.locator('.ws-table').innerText()).replace(/\s+/g, ' ')
const pick = (title, idx) => page.evaluate(([t, i]) => { const sec = [...document.querySelectorAll('.ws-sec')].find((s) => s.textContent === t); sec.nextElementSibling.querySelectorAll('input')[i].click() }, [title, idx])
const key = async (s) => { for (const c of s) await page.locator('.ws-pad-keys button', { hasText: new RegExp(`^${c === '.' ? '\\.' : c}$`) }).first().click() }

await page.goto(BASE + '/')
await page.fill('input[autocomplete=username]', 't_rah'); await page.fill('input[type=password]', PW); await page.click('form.login button')
await page.waitForTimeout(3500)

await step('wizard', async () => {
  await page.goto(BASE + '/orders/new'); await page.waitForURL(/ws\/new/, { timeout: 20000 }); await page.waitForSelector('text=YANGI MIJOZ', { timeout: 20000 })
  await page.click('text=YANGI MIJOZ'); await page.fill('.ws-field input >> nth=0', 'TEST WS Chuqur'); await page.click('.ws-submit')
  await page.fill('.ws-field input >> nth=0', 'Chuqur test 5'); await page.fill('.ws-field input[type=date]', '2027-03-01'); await page.fill('.ws-field input >> nth=2', 'izoh matni'); await page.click('.ws-submit')
  await page.waitForURL(/ws\/edit/); await page.waitForTimeout(1200)
})
await step('first window 2 vertical', async () => {
  await page.click('.ws-plus'); await page.locator('.ws-cfg button').nth(1).click(); await page.click('.ws-dlg-act .yes'); await page.waitForTimeout(2500)
  await shot('01_two_parts')
})
await step('cell dialog: tilt-turn on 2nd part', async () => {
  const b = await page.locator('.ws-svgbox svg').boundingBox()
  await page.mouse.click(b.x + b.width * 0.72, b.y + b.height * 0.42); await page.waitForTimeout(500); await shot('02_cell_dialog')
  await page.locator('.ws-cell .right .ws-tile').nth(6).click()
  await page.locator('.ws-cell .left label.ws-chk input').nth(1).check().catch(() => {})
  await shot('03_cell_chosen'); await page.click('.ws-dlg-act .yes'); await page.waitForTimeout(800); await shot('04_cell_applied')
})
await step('inner impost on the sash (tt + 2 parts)', async () => {
  const b = await page.locator('.ws-svgbox svg').boundingBox()
  await page.mouse.click(b.x + b.width * 0.72, b.y + b.height * 0.30); await page.waitForTimeout(500)
  await page.locator('.ws-cell .left button.ws-tile').nth(1).click(); await shot('04b_sub_chosen')
  await page.click('.ws-dlg-act .yes'); await page.waitForTimeout(800); await shot('04c_sub_applied'); console.log('   table:', (await table()).slice(-300))
})
await step('width keypad 1800', async () => {
  const b = await page.locator('.ws-svgbox svg').boundingBox()
  await page.locator('.ws-svgbox svg text', { hasText: '1500' }).last().click({ force: true }); await page.waitForTimeout(400)
  await page.locator('.ws-pad-keys button', { hasText: '◂◂' }).click(); await key('1800'); await shot('05_keypad_typed'); await page.locator('.ws-pad-keys button[aria-label=OK]').click(); await page.waitForTimeout(800)
  await shot('06_after_width')
  if (await page.locator('.ws-dlg').count()) { await page.click('.ws-dlg-act .no'); await page.waitForTimeout(500); await shot('06b_after_eq_no') }
})
await step('options: system, glass, hardware, scheme', async () => {
  await page.click('.ws-compass'); await page.waitForTimeout(500)
  await pick('oyna tizimi', 5); await pick('shisha paket turi', 2); await pick('furnitura', 1); await pick('moliyaviy sxema', 2)
  await shot('07_options_a')
})
await step('own price keypad', async () => {
  await page.locator('.ws-pricebox button').first().click(); await page.waitForTimeout(300); await key('5000'); await page.locator('.ws-pad-keys button[aria-label=OK]').click(); await page.waitForTimeout(500)
  await shot('08_own_price')
})
await step('sill + length dialog', async () => {
  await pick('podokonnik turi', 1); await page.waitForTimeout(300)
  await page.locator('.ws-side .ed').first().click(); await page.waitForTimeout(400); await shot('09_len_dialog'); await page.click('.ws-dlg-act .yes'); await page.waitForTimeout(300)
})
await step('side pictograms + dobor', async () => {
  await page.evaluate(() => { document.querySelector('.ws-side-b').scrollTop = 99999 }); await page.waitForTimeout(300)
  await page.locator('.ws-sidegrid .ws-pic').nth(0).click(); await page.locator('.ws-sidegrid .ws-pic').nth(1).click()
  await page.locator('.ws-sidegrid .ws-sq').nth(5).click(); await page.waitForTimeout(300); await shot('10_sides')
})
await step('close options -> legend and table', async () => {
  await page.click('.ws-side-ok'); await page.waitForTimeout(2200); await shot('11_after_options'); console.log('   table:', (await table()).slice(-260))
})
await step('second window + qty', async () => {
  await page.click('.ws-plus'); await page.locator('.ws-cfg button').nth(5).click(); await page.click('.ws-dlg-act .yes'); await page.waitForTimeout(1200)
  await page.click('.ws-compass'); await page.locator('.ws-qtyrow button').nth(1).click(); await page.locator('.ws-qtyrow button').nth(1).click(); await page.waitForTimeout(300); await shot('12_second_options_qty3')
  await page.click('.ws-side-ok'); await page.waitForTimeout(1800); await shot('13_second_window'); console.log('   tabs:', await page.locator('.ws-tab').count(), ' table:', (await table()).slice(-120))
})
await step('delete second window', async () => {
  await page.click('.ws-trash'); await page.waitForTimeout(300); await shot('14_delete_ask'); await page.click('.ws-dlg-act .yes'); await page.waitForTimeout(800)
  if ((await page.locator('.ws-tab').count()) !== 1) throw new Error('tab count ' + (await page.locator('.ws-tab').count()))
})
await step('reload keeps data', async () => {
  await page.waitForTimeout(2000)
  const url = page.url(); await page.goto('about:blank'); await page.goto(url); await page.waitForTimeout(3500)
  await shot('15_reloaded'); console.log('   url', url.replace(/.*#/, '#'), ' table:', (await table()).slice(-200))
})
await step('menu', async () => {
  await page.click('.ws-burger'); await page.waitForTimeout(400); await shot('16_menu')
})
await step('menu -> order card', async () => {
  await page.click('.ws-menu .m5'); await page.waitForTimeout(3000); await shot('17_card'); if (!/#\/orders\/[0-9a-f-]{36}$/.test(page.url())) throw new Error('url ' + page.url())
})
console.log('--- PROBLEMS', problems.length); [...new Set(problems)].slice(0, 30).forEach((p) => console.log(p))
console.log('FAILS', fails)
await br.close()
