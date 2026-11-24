// Эмулятор Telegram Mini App (iPhone, полный экран с безопасными зонами) + автопроверки вёрстки.
// Нужен vite preview на 4173. Запуск из scripts/e2e: node tg_emul.mjs [before|after]  (после — cleanup-e2e.mjs)
import { chromium } from 'file:///D:/Eco Rom/scripts/node_modules/playwright-core/index.mjs'
import { inflateSync } from 'node:zlib'
import { ensureUser, sql, rpc, PW } from './h.mjs'

const TAG = process.argv[2] || 'after'
const BASE = 'http://localhost:4173/EcoRom/#'

// --- мини-декодер PNG (8 бит RGBA/RGB, без interlace): чтобы смотреть цвет пикселей в безопасных зонах ---
function decodePng(buf) {
  let p = 8, w = 0, h = 0, ct = 6; const idat = []
  while (p < buf.length) { const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8); const d = buf.subarray(p + 8, p + 8 + len); if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9] } else if (type === 'IDAT') idat.push(d); p += 12 + len }
  const bpp = ct === 6 ? 4 : 3, raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(h * stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), dst = out.subarray(y * stride, (y + 1) * stride), prev = y ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride)
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? dst[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0
      let v = src[i]
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      dst[i] = v & 255
    }
  }
  return { w, h, px: (x, y) => { const o = y * stride + x * bpp; return [out[o], out[o + 1], out[o + 2]] } }
}

const real = await sql(`select id, telegram_id from employees where role = 'rahbar' and login not like 't\\_%' and telegram_id is not null`)
await sql(`update employees set telegram_id = null where role = 'rahbar' and login not like 't\\_%'`)
const problems = []
const note = (m) => { problems.push(m); console.log('  ✗', m) }
try {
  await ensureUser('t_rah', 'T Rahbar', 'rahbar', 9100001)
  // заказ с двумя створками, чтобы в редакторе была настоящая картинка
  const design = { width: 1500, height: 1500, shape: 'rect', root: { kind: 'split', id: 's1', dir: 'v', sizes: [750, 750], children: [{ kind: 'leaf', id: 'a1', opening: 'turn_l' }, { kind: 'leaf', id: 'a2', opening: 'fixed' }] } }
  const item = { pos: 1, title: 'w1', width_mm: 1500, height_mm: 1500, qty: 1, area_m2: 2.25, cost: 700276, design, options: {}, materials: { items: [] } }
  const saved = await rpc('t_rah', 'save_order', { p: { client: { full_name: 'TEST TG', phone: '+998900000000' }, address: 'Test 1', contract_price: 1426527, calc_cost: 1240458, items: [item] } })
  const oid = saved.data.id
  console.log('order', oid, saved.err ?? '')

  const br = await chromium.launch({ channel: 'msedge', headless: true })
  const sizes = [[393, 852], [375, 667]]
  for (const [W, H] of sizes) {
    const ctx = await br.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Telegram-iOS' })
    await ctx.route('**/telegram.org/js/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }))
    await ctx.route('**/functions/v1/tg-auth', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false }) }))
    await ctx.addInitScript((H) => {
      const top = 47, ctop = 53, bottom = 34
      const set = () => {
        if (!document.documentElement) return
        const s = document.documentElement.style
        s.setProperty('--tg-safe-area-inset-top', top + 'px'); s.setProperty('--tg-safe-area-inset-bottom', bottom + 'px')
        s.setProperty('--tg-content-safe-area-inset-top', ctop + 'px'); s.setProperty('--tg-content-safe-area-inset-bottom', '0px')
        s.setProperty('--tg-viewport-height', H + 'px'); s.setProperty('--tg-viewport-stable-height', H + 'px')
      }
      set(); document.addEventListener('DOMContentLoaded', set)
      const noop = () => {}
      window.Telegram = { WebApp: { initData: 'query_id=emul', platform: 'ios', version: '8.0', isFullscreen: true, isVerticalSwipesEnabled: false, safeAreaInset: { top, bottom, left: 0, right: 0 }, contentSafeAreaInset: { top: ctop, bottom: 0, left: 0, right: 0 }, viewportHeight: H, viewportStableHeight: H, ready: noop, expand: noop, requestFullscreen: noop, exitFullscreen: noop, disableVerticalSwipes: noop, enableVerticalSwipes: noop, setHeaderColor: noop, setBackgroundColor: noop, setBottomBarColor: noop, isVersionAtLeast: () => true, onEvent: noop, offEvent: noop, HapticFeedback: { impactOccurred: noop, notificationOccurred: noop }, themeParams: {} } }
    }, H)
    const page = await ctx.newPage()
    const tag = `${W}x${H}`
    page.on('pageerror', (e) => note(`[${tag}] PAGEERROR ${e.message.slice(0, 120)} ${(e.stack || "").split("\n").slice(1, 4).join(" | ").slice(0, 260)}`))
    const shot = async (name) => { const buf = await page.screenshot({ path: `shots/tg_${TAG}_${tag}_${name}.png` }); return buf }

    // проверки вёрстки текущего экрана
    const audit = async (name, opts = {}) => {
      const r = await page.evaluate(() => {
        const out = { sheetOut: [...document.querySelectorAll('.sheet')].filter((s) => s.getBoundingClientRect().right > innerWidth + 1).length, tg: document.documentElement.classList.contains('tg'), hscroll: document.documentElement.scrollWidth - innerWidth, bodyScroll: document.body.scrollWidth - innerWidth, cells: [], dlg: [], tbl: null }
        for (const el of document.querySelectorAll('.ws-trow, .ws-ts td, .ws-ts th, .ws-tab, .ws-plus, .ws-compass')) if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'auto') out.cells.push((el.textContent || el.className).trim().slice(0, 40) + ` (${el.scrollWidth}>${el.clientWidth})`)
        const ts = document.querySelector('.ws-ts'), tr = document.querySelector('.ws-tr'), tl = document.querySelector('.ws-tl')
        if (ts && tr && tl) { const a = ts.getBoundingClientRect(), b = tr.getBoundingClientRect(), c = tl.getBoundingClientRect(); out.tbl = { gapRight: Math.round(b.left - a.right), gapLeft: Math.round(a.left - c.right), trW: Math.round(b.width), trOverflow: tr.scrollWidth - tr.clientWidth } }
        for (const d of document.querySelectorAll('.ws-dlg, .ws-side, .ws-menu')) { const b = d.getBoundingClientRect(); const body = d.querySelector('.ws-dlg-body, .ws-side-b, .ws-menu-list') || d; out.dlg.push({ cls: d.className.slice(0, 20), l: Math.round(b.left), r: Math.round(innerWidth - b.right), sw: body.scrollWidth - body.clientWidth }) }
        return out
      })
      const bad = []
      if (!r.tg) bad.push('нет класса html.tg')
      if (r.sheetOut) bad.push('лист A4 шире экрана')
      if (r.hscroll > 1) bad.push(`страница шире экрана на ${r.hscroll}px`)
      if (r.bodyScroll > 1) bad.push(`body шире экрана на ${r.bodyScroll}px`)
      if (r.cells.length) bad.push(`обрезан текст: ${r.cells.slice(0, 4).join(' | ')}`)
      if (r.tbl && (r.tbl.gapRight < -1 || r.tbl.gapLeft < -1 || r.tbl.trOverflow > 1)) bad.push(`колонки таблицы налезают: ${JSON.stringify(r.tbl)}`)
      for (const d of r.dlg) if (d.l < 0 || d.r < 0 || d.sw > 1) bad.push(`окно ${d.cls} выходит за экран: ${JSON.stringify(d)}`)
      // безопасные зоны: цвет верхней и нижней полосы не серый фон
      if (opts.zones) {
        const png = decodePng(await shot(name + '_z'))
        const px = (x, y) => png.px(Math.round(x * 2), Math.round(y * 2))
        const grey = ([r, g, b]) => Math.abs(r - 237) < 6 && Math.abs(g - 237) < 6 && Math.abs(b - 237) < 6
        for (const [lbl, x, y] of [['верх', W / 2, 20], ['низ', W / 2, H - 6]]) if (grey(px(x, y))) bad.push(`пустая серая полоса (${lbl}) rgb(${px(x, y)})`)
      }
      console.log(`${bad.length ? '✗' : '✓'} [${tag}] ${name}${bad.length ? ' — ' + bad.join('; ') : ''}`)
      bad.forEach((b) => problems.push(`[${tag}] ${name}: ${b}`))
    }


    // движения пальцем: вбок ничего не едет, вертикально листается внутренний контейнер, документ неподвижен
    const swipe = async (name) => {
      await page.mouse.move(W / 2, H * 0.6)
      await page.mouse.wheel(500, 0); await page.waitForTimeout(250)
      const side = await page.evaluate(() => [...document.querySelectorAll('*')].filter((e) => e.scrollLeft > 1 && !e.matches('.ws-ts, .tabs, .wtabs, .tbl-wrap, .tbl-scroll')).map((e) => e.className || e.tagName).slice(0, 3))
      await page.mouse.wheel(0, 500); await page.waitForTimeout(250)
      const v = await page.evaluate(() => ({ doc: document.scrollingElement.scrollTop, inner: [...document.querySelectorAll('*')].some((e) => e.scrollTop > 1) }))
      const bad = []
      if (side.length) bad.push(`уехало вбок: ${side.join(', ')}`)
      if (v.doc > 0) bad.push('прокрутился сам документ (Telegram сможет свернуть приложение)')
      console.log(`${bad.length ? '✗' : '✓'} [${tag}] ${name}: движение пальцем${v.inner ? ' (внутренний скролл работает)' : ''}${bad.length ? ' — ' + bad.join('; ') : ''}`)
      bad.forEach((b) => problems.push(`[${tag}] ${name}: ${b}`))
    }
    await page.goto(BASE + '/')
    await page.fill('input[autocomplete=username]', 't_rah'); await page.fill('input[type=password]', PW); await page.click('form.login button')
    await page.waitForTimeout(2500)

    // --- редактор ---
    await page.goto(BASE + `/ws/edit/${oid}`); await page.waitForTimeout(2500)
    // реальные длинные значения, как у Asad на скриншоте
    await page.evaluate(() => { const v = (i, t) => { const e = document.querySelectorAll('.ws-tr .ws-trow')[i]?.querySelector('.v'); if (e) e.textContent = t }; v(1, '1 240 458'); v(2, '1 240 458'); v(3, '1 240 458'); v(4, '1 426 527'); document.querySelectorAll('.ws-ts tbody tr:nth-child(2) td').forEach((td, i) => { td.textContent = ['', '700 277', '185 787', '', '', '', ''][i] ?? td.textContent }) })
    await shot('editor'); await audit('редактор', { zones: true })
    await page.locator('.ws-burger').click(); await page.waitForTimeout(400); await shot('menu'); await audit('меню')
    await page.locator('.ws-menu .x').click(); await page.waitForTimeout(300)
    const bb = await page.locator('.ws-svgbox svg').first().boundingBox(); await page.mouse.click(bb.x + bb.width * 0.38, bb.y + bb.height * 0.5); await page.waitForTimeout(700); await shot('cell'); await audit('диалог импосты/открывание')
    await page.getByRole('button', { name: /YO'?Q/i }).first().click().catch(() => {}); await page.waitForTimeout(300)
    await page.locator('.ws-compass').click(); await page.waitForTimeout(600); await shot('options'); await audit('настройки окна')
    await page.locator('.ws-side-ok').click().catch(() => {}); await page.waitForTimeout(300)
    await page.locator('.ws-plus').click(); await page.waitForTimeout(600); await shot('config'); await audit('выбор схемы')
    await page.getByRole('button', { name: /YO'?Q|НЕТ/i }).first().click().catch(() => {}); await page.waitForTimeout(300)

    // --- печатный лист ---
    await page.goto(BASE + `/orders/${oid}/print?mode=drawings`); await page.waitForTimeout(2500); await shot('print'); await audit('печатный лист'); await swipe('печатный лист')
    // --- обычные экраны ---
    for (const [r, n] of [['/', 'главная'], ['/orders', 'заказы'], [`/orders/${oid}`, 'карточка заказа'], ['/payroll', 'зарплата'], ['/stock', 'склад'], ['/ws/orders', 'список WS']]) {
      await page.goto(BASE + r); await page.waitForTimeout(1800); await shot(n.replace(/\W+/g, '_')); await audit(n, { zones: r === '/' }); await swipe(n)
    }
    await ctx.close()
  }
  await br.close()
  console.log(problems.length ? `\nПРОБЛЕМ: ${problems.length}` : '\nВсё чисто')
} finally {
  for (const r of real) await sql(`update employees set telegram_id = ${r.telegram_id} where id = '${r.id}'`)
}
