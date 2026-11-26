// Обход всех полей ввода: курсор в поле → где линия/рамка относительно текста, не налезает ли на соседнее поле.
// В базу ничего не пишет: НИКАКИХ нажатий кнопок на страницах и никакого фокуса/blur там (26.11 «+ Qo'shish» в каталоге сразу создал позицию,
// а уход курсора из полей настроек пересохранял их). Фокус — только на экранах заказа ws (заказ не сохраняется); диалоги заказа — той же разметкой.
// Нужен vite preview на 4173. Запуск: node scripts/e2e/input_audit.mjs [chromium|webkit] [метка]
import { chromium, webkit } from 'file:///D:/Eco Rom/scripts/node_modules/playwright-core/index.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { ensureUser, sql, PW } from './h.mjs'

const ENGINE = process.argv[2] ?? 'chromium'
const TAG = process.argv[3] ?? 'now'
const OUT = `D:/Eco Rom/scripts/out/input-audit/${ENGINE}-${TAG}`
mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:4173/EcoRom/#'
const ROUTES = ['/', '/orders', '/orders/done', '/ws/orders', '/ws/customers', '/catalog', '/exchange', '/employees', '/password', '/breakages', '/offcuts', '/settings', '/leaks',
  '/report', '/payroll', '/pay-rules', '/my-pay', '/expenses', '/service', '/stock', '/purchases', '/suppliers', '/jadval/registratsiya', '/jadval/savdo']

// замер всех видимых полей на странице (в браузере)
const MEASURE = (focus) => {
  const out = []
  const els = [...document.querySelectorAll('input, textarea, select')].filter((el) => {
    if (/^(checkbox|radio|range|file|color|hidden|submit|button)$/.test(el.type)) return false
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el)
    return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.bottom > 0 && r.top < innerHeight
  })
  const rects = els.map((e) => e.getBoundingClientRect())
  els.forEach((el, i) => {
    if (focus) el.focus({ preventScroll: true })
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el)
    const n = (v) => parseFloat(v) || 0
    const fs = n(cs.fontSize), bt = n(cs.borderTopWidth), bb = n(cs.borderBottomWidth), pt = n(cs.paddingTop), pb = n(cs.paddingBottom)
    const cTop = r.top + bt + pt, cBot = r.bottom - bb - pb
    const issues = []
    let gapBelow = null, gapAbove = null
    if (el.tagName !== 'TEXTAREA') {
      const mid = (cTop + cBot) / 2, tTop = mid - 0.6 * fs, tBot = mid + 0.6 * fs // строка текста ≈ 1.2 × шрифт, по центру
      gapBelow = +((r.bottom - bb) - tBot).toFixed(1)
      gapAbove = +(tTop - (r.top + bt)).toFixed(1)
      const underline = bb >= 1 && bt === 0
      if (underline && gapBelow > 6) issues.push(`линия на ${gapBelow}px ниже текста`)
      if (!underline && bt > 0 && Math.abs(gapAbove - gapBelow) > 4) issues.push(`текст не по центру рамки (${gapAbove}/${gapBelow})`)
      if (cBot - cTop < fs * 1.05) issues.push(`мало места для текста (${(cBot - cTop).toFixed(0)}px при шрифте ${fs}px)`)
    }
    rects.forEach((o, j) => { if (j !== i && r.left < o.right - 1 && o.left < r.right - 1 && r.top < o.bottom - 1 && o.top < r.bottom - 1) issues.push('налезает на другое поле') })
    const lab = el.closest('label')
    if (lab && lab.querySelectorAll('input,textarea,select').length === 1) { const lr = lab.getBoundingClientRect(); if (r.bottom > lr.bottom + 1) issues.push(`выходит за своё поле на ${(r.bottom - lr.bottom).toFixed(0)}px`) }
    const name = el.getAttribute('aria-label') || el.placeholder || lab?.textContent?.trim().slice(0, 30) || el.name || el.className || el.tagName
    out.push({ name: String(name).slice(0, 40), cls: String(el.className).slice(0, 30), fs, h: +r.height.toFixed(0), gapBelow, gapAbove, issues })
    if (focus) el.blur()
  })
  return out
}

const rows = []
const run = async (page, where, focus = false) => {
  const res = await page.evaluate(MEASURE, focus)
  for (const x of res) rows.push({ where, ...x })
  if (res.some((x) => x.issues.length)) await page.screenshot({ path: `${OUT}/${where.replace(/[^a-z0-9]+/gi, '_')}.png` })
  return res.length
}
const W = (ms) => new Promise((r) => setTimeout(r, ms))

await ensureUser('t_rah', 'TEST Rahbar', 'rahbar')
const browser = await (ENGINE === 'webkit' ? webkit.launch() : chromium.launch({ channel: 'msedge' }))
try {
  for (const [vname, vp, mobile] of [['phone', { width: 390, height: 844 }, true], ['pc', { width: 1440, height: 900 }, false]]) {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: mobile, isMobile: mobile && ENGINE !== 'webkit' ? true : undefined, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    await page.goto(BASE + '/')
    await page.waitForSelector('input[type=password]', { timeout: 20000 })
    await run(page, `${vname} вход`)
    await page.fill('input[autocomplete=username]', 't_rah'); await page.fill('input[type=password]', PW); await page.keyboard.press('Enter')
    await page.waitForSelector('.home, .main', { timeout: 20000 }); await W(1500)
    await run(page, `${vname} верх+главная`)
    for (const r of ROUTES) {
      await page.goto(BASE + r); await W(1800)
      await run(page, `${vname} ${r}`) // только замер: без нажатий и без фокуса (страницы сохраняют сами)
    }
    // экраны заказа (WinStudio): заказчик → заказ (не сохраняем)
    await page.goto(BASE + '/ws/new'); await page.waitForSelector('text=YANGI MIJOZ', { timeout: 20000 })
    await page.click('text=YANGI MIJOZ'); await W(800)
    await run(page, `${vname} заказ: MIJOZ`, true)
    await page.fill('.ws-field input >> nth=0', 'TEST поле'); await page.click('.ws-submit'); await W(1000) // только черновик в браузере
    await run(page, `${vname} заказ: BUYURTMA`, true)
    await page.screenshot({ path: `${OUT}/${vname}-buyurtma.png` })
    // диалоги редактора — та же разметка и классы (LenDialog, заметка в настройках окна)
    await page.evaluate(() => {
      const host = document.querySelector('.ws-phone')
      host.querySelector('.ws-top').style.display = 'none' // мерить только поля диалога
      host.insertAdjacentHTML('beforeend', `<div class="ws-ov" id="audit"><div class="ws-dlg"><div class="ws-dlg-b plain"><div class="ws-text" style="display:grid;gap:10px">
        <label>mm<input class="ws-input" inputmode="numeric" value="1400"></label><label>soni<input class="ws-input" inputmode="numeric" value="1"></label></div></div>
        <aside class="ws-side" style="position:static"><div class="ws-side-b"><input class="ws-input" aria-label="izoh" value="izoh"></div></aside></div></div>`)
    })
    await run(page, `${vname} заказ: диалог куска + заметка`, true)
    await page.screenshot({ path: `${OUT}/${vname}-dialog.png` })
    // форма заказчика крупно — снимок «до/после»
    await page.goto(BASE + '/ws/new'); await page.waitForSelector('text=YANGI MIJOZ'); await page.click('text=YANGI MIJOZ'); await W(600)
    await page.fill('.ws-field input >> nth=0', 'Asad'); await page.locator('.ws-form').screenshot({ path: `${OUT}/${vname}-mijoz.png` })
    await ctx.close()
  }
} finally {
  await browser.close()
  await sql(`update employees set is_active = false, telegram_id = null where login = 't_rah'`)
}
writeFileSync(`${OUT}/result.json`, JSON.stringify(rows, null, 1))
const bad = rows.filter((x) => x.issues.length)
console.log(`${ENGINE}: полей проверено ${rows.length}, с замечаниями ${bad.length}`)
for (const x of bad) console.log(`  ✗ ${x.where} · «${x.name}» (${x.cls}) — ${x.issues.join('; ')}`)
console.log(`снимки: ${OUT}`)
