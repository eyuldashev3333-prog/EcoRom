// Сверка с WinStudio, сторона ECOROM: строит окно в НАШЕМ редакторе через интерфейс (браузер, телефон 390x844)
// и читает нижнюю таблицу (окно / цена / все окна / стоимость + «jami»).
// Вызов: node owner_ours.mjs <variant.json>  → печатает JSON таблицы. Один тестовый заказ на все варианты (id в .owner_order).
import { chromium } from 'file:///D:/Eco Rom/scripts/node_modules/playwright-core/index.mjs'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { ensureUser, PW } from './h.mjs'

const V = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const ORDER_FILE = 'D:/Eco Rom/scripts/e2e/.owner_order'
const BASE = 'http://localhost:4173/EcoRom/#'
await ensureUser('t_rah', 'TEST Rahbar', 'rahbar', 1)
const br = await chromium.launch({ channel: 'msedge', headless: true })
const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 200)))
const shot = (n) => page.screenshot({ path: `D:/Eco Rom/scripts/e2e/shots/owner_${V.id}_${n}.png` })
const W = (ms) => page.waitForTimeout(ms)

await page.goto(BASE + '/')
await page.fill('input[autocomplete=username]', 't_rah'); await page.fill('input[type=password]', PW); await page.click('form.login button')
await W(3000)

let orderId = existsSync(ORDER_FILE) ? readFileSync(ORDER_FILE, 'utf8').trim() : ''
if (orderId) {
  await page.goto(BASE + '/ws/edit/' + orderId); await W(3500)
} else {
  // один тестовый заказ на всю сверку (номер заказа берётся один раз)
  await page.goto(BASE + '/orders/new'); await page.waitForURL(/ws\/new/, { timeout: 20000 }); await page.waitForSelector('text=YANGI MIJOZ', { timeout: 20000 })
  await page.click('text=YANGI MIJOZ'); await page.fill('.ws-field input >> nth=0', 'TEST WS SVERKA'); await page.click('.ws-submit')
  await page.fill('.ws-field input >> nth=0', 'sverka WinStudio'); await page.click('.ws-submit')
  await page.waitForURL(/ws\/edit/); await W(1500)
}

// удалить все окна, кроме одного, затем заменить оставшееся новым (заказ без окон сервер не хранит)
const tabs = () => page.locator('.ws-tab').count()
// новое окно из шаблона
await page.click('.ws-plus'); await W(400)
await page.locator('.ws-cfg button').nth(V.tpl ?? 0).click(); await page.click('.ws-dlg-act .yes'); await W(2500)
if (!orderId) { const m = /ws\/edit\/([0-9a-f-]{36})/.exec(page.url()); if (m) writeFileSync(ORDER_FILE, m[1]); orderId = m?.[1] }
// старые окна удалить (новое — последнее, выбрано)
for (let guard = 0; guard < 30 && (await tabs()) > 1; guard++) {
  await page.locator('.ws-tab').first().click(); await W(300)
  await page.click('.ws-trash'); await W(300); await page.click('.ws-dlg-act .yes'); await W(900)
}
await page.locator('.ws-tab').last().click(); await W(500)

const key = async (s) => { for (const c of String(s)) await page.locator('.ws-pad-keys button', { hasText: new RegExp(`^${c === '.' ? '\\.' : c}$`) }).first().click() }
const padSet = async (v) => { await page.locator('.ws-pad-keys button', { hasText: '◂◂' }).click(); await key(v); await page.locator('.ws-pad-keys button[aria-label=OK]').click(); await W(700); if (await page.locator('.ws-dlg-act .no').count()) { await page.click('.ws-dlg-act .no'); await W(400) } }
// размеры: общая ширина — самая нижняя подпись, общая высота — самая левая
async function dimLabels() {
  return page.$$eval('.ws-svgbox svg text', (ts) => ts.map((t, i) => { const r = t.getBoundingClientRect(); return { i, x: r.x + r.width / 2, y: r.y + r.height / 2, t: t.textContent } }))
}
async function build(W0) {
if (W0.w) { const L = await dimLabels(); const b = L.reduce((a, x) => (x.y > a.y ? x : a)); await page.locator('.ws-svgbox svg text').nth(b.i).click({ force: true }); await W(300); await padSet(W0.w) }
if (W0.h) { const L = await dimLabels(); const b = L.reduce((a, x) => (x.x < a.x ? x : a)); await page.locator('.ws-svgbox svg text').nth(b.i).click({ force: true }); await W(300); await padSet(W0.h) }
// ячейки: клик по доле чертежа, затем диалог «импосты / открывание»
const OPEN = ['slide_r', 'tilt', 'slide_l', 'turn_r', 'fixed', 'turn_l', 'tt_r', 'top', 'tt_l', 'fixed_sash']
for (const c of W0.cells ?? []) {
  // части окна — <g> с курсором-указателем и площадью больше подписей; берём ближайшую к доле от общего прямоугольника частей
  const pt = await page.evaluate(([fx, fy]) => {
    const gs = [...document.querySelectorAll('.ws-svgbox svg g')].filter((g) => g.style.cursor === 'pointer').map((g) => g.getBoundingClientRect()).filter((r) => r.width * r.height > 1500)
    const x0 = Math.min(...gs.map((r) => r.left)), x1 = Math.max(...gs.map((r) => r.right)), y0 = Math.min(...gs.map((r) => r.top)), y1 = Math.max(...gs.map((r) => r.bottom))
    const tx = x0 + (x1 - x0) * fx, ty = y0 + (y1 - y0) * fy
    const best = gs.map((r) => ({ cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2, inside: tx >= r.left && tx <= r.right && ty >= r.top && ty <= r.bottom, a: r.width * r.height }))
      .sort((a, b) => (b.inside - a.inside) || (a.inside && b.inside ? a.a - b.a : Math.hypot(a.cx - tx, a.cy - ty) - Math.hypot(b.cx - tx, b.cy - ty)))[0]
    return best
  }, c.at)
  await page.mouse.click(pt.cx, pt.cy); await W(500)
  if (c.sub) await page.locator('.ws-cell .left button.ws-tile').nth({ none: 0, v2: 1, h2: 2, v3: 3, h3: 4 }[c.sub]).click()
  if (c.open) await page.locator('.ws-cell .right .ws-tile').nth(OPEN.indexOf(c.open)).click()
  // недоступная галочка (сетка у глухой створки, как в WinStudio) — не трогаем
  const chk = async (label, on) => { const el = page.locator('.ws-cell .left label.ws-chk', { hasText: label }).locator('input'); if (await el.isDisabled()) return; if ((await el.isChecked()) !== !!on) await el.click() }
  if (c.door !== undefined) await chk('eshik', c.door)
  if (c.net !== undefined) await chk('to‘r', c.net)
  for (const [i, on] of (c.sandwich ?? []).entries()) { const el = page.locator(`.ws-cell input[aria-label="sendvich panellar ${i + 1}"]`); if ((await el.isChecked()) !== on) await el.click() }
  await page.click('.ws-dlg-act .yes'); await W(700)
}
// опции окна
const O = W0.opts ?? {}
const sec = { scheme: 'moliyaviy sxema', system: 'oyna tizimi', glass: 'shisha paket turi', ebb: 'otliv turi', sill: 'podokonnik turi', hardware: 'furnitura', misc: 'har xil', works: 'ishlar', net: 'pashsha to‘ri', lamIn: 'ichki laminatsiya', lamOut: 'tashqi laminatsiya' }
if (Object.keys(O).length) {
  await page.click('.ws-compass'); await W(600)
  const pickIn = async (title, name) => {
    const ok = await page.evaluate(([t, n]) => {
      const s = [...document.querySelectorAll('.ws-sec')].find((x) => x.textContent === t); if (!s) return 'no section ' + t
      const lab = [...s.nextElementSibling.querySelectorAll('label')].find((l) => l.textContent.trim() === n); if (!lab) return 'no item ' + n
      const inp = lab.querySelector('input'); if (!inp.checked) inp.click(); return 'ok'
    }, [title, name])
    if (ok !== 'ok') throw new Error(ok)
  }
  for (const k of ['scheme', 'system', 'glass', 'hardware', 'net', 'lamIn', 'lamOut']) if (O[k]) await pickIn(sec[k], O[k])
  for (const k of ['ebb', 'sill', 'works', 'misc']) for (const n of O[k] ?? []) {
    await pickIn(sec[k], typeof n === 'string' ? n : n.name)
    // длина подоконника/отлива: карандаш у выбранного → диалог (мм; количество оставляем 1, как у WinStudio)
    // куски: n.len (первый кусок) и n.more [{len, qty}] — доп. куски (кнопка-карандаш «ещё кусок»), как B у WinStudio
    const pieceDlg = async (len, qty) => { await W(300); await page.locator('.ws-dlg .ws-input').nth(0).fill(String(len)); if (qty) await page.locator('.ws-dlg .ws-input').nth(1).fill(String(qty)); await page.click('.ws-dlg-act .yes'); await W(400) }
    const itemEl = (sel) => page.evaluate(([t, nm, sel]) => { const s = [...document.querySelectorAll('.ws-sec')].find((x) => x.textContent === t); const lab = [...s.nextElementSibling.querySelectorAll('label')].find((l) => l.textContent.trim() === nm); const box = lab.parentElement; const b = sel === 'add' ? lab.querySelector('button.ed') : box.querySelector('.ws-piece button[aria-label="mm"]'); b.click() }, [sec[k], n.name, sel])
    if (typeof n !== 'string' && (n.len || n.qty)) { await itemEl('first'); await pieceDlg(n.len ?? '', n.qty) }
    if (typeof n !== 'string') for (const p of n.more ?? []) { await itemEl('add'); await pieceDlg(p.len, p.qty) }
  }
  if (O.qty && O.qty > 1) for (let i = 1; i < O.qty; i++) { await page.locator('.ws-qtyrow button').nth(1).click(); await W(150) }
  // дополнения по размеру: sides = { support, threshold, corner, connect:[l,t,r,b], connect90, connect135, nashelnik, dobor:{ '15':[...] } }
  const S = O.sides ?? {}
  const SIDE_UZ = { l: 'chap', t: 'tepa', r: "o'ng", b: 'past' }
  for (const [k, lab] of [['support', 'tayanch profil'], ['threshold', "bo'sag'a"], ['corner', 'burchak peshtoq']]) if (S[k]) {
    const r = await page.evaluate((lab) => { const l = [...document.querySelectorAll('.ws-side-b label.ws-opt')].find((x) => x.textContent.trim() === lab); if (!l) return 'no ' + lab; const i = l.querySelector('input'); if (!i.checked) i.click(); return 'ok' }, lab)
    if (r !== 'ok') throw new Error(r)
  }
  for (const [k, title] of [['connect', 'ulovchi profillar'], ['connect90', 'ulovchi profillar 90°'], ['connect135', 'ulovchi profillar 135°'], ['nashelnik', 'qoplamalar (nashelnik)']]) for (const s of S[k] ?? []) {
    const r = await page.evaluate(([t, a]) => { const sec = [...document.querySelectorAll('.ws-sec')].find((x) => x.textContent === t); if (!sec) return 'no sec ' + t; const b = sec.parentElement.querySelector(`button[aria-label="${a}"]`); if (!b) return 'no btn ' + a; if (b.getAttribute('aria-pressed') !== 'true') b.click(); return 'ok' }, [title, SIDE_UZ[s]])
    if (r !== 'ok') throw new Error(r)
  }
  for (const [d, sides] of Object.entries(S.dobor ?? {})) for (const s of sides) {
    const b = page.locator(`.ws-side-b button[aria-label="${d} ${SIDE_UZ[s]}"]`)
    if ((await b.getAttribute('aria-pressed')) !== 'true') await b.click()
  }
  await W(500); await shot('opts')
  await page.click('.ws-side-ok'); await W(2200)
}
  // своя цена: поле «o‘z narxi» → цифровая клавиатура
  if (O.own) { await page.click('.ws-compass'); await W(500); await page.locator('.ws-pricebox button').first().click(); await W(300); await page.locator('.ws-pad-keys button', { hasText: '◂◂' }).click(); await key(O.own); await page.locator('.ws-pad-keys button[aria-label=OK]').click(); await W(500); await page.click('.ws-side-ok'); await W(1500) }}
await build(V)
// доп. окна заказа (строки «все окна» / «стоимость»)
for (const m of V.more ?? []) {
  await page.click('.ws-plus'); await W(400)
  await page.locator('.ws-cfg button').nth(m.tpl ?? 0).click(); await page.click('.ws-dlg-act .yes'); await W(2500)
  await build(m)
}
await shot('win')
// таблица
const T = await page.evaluate(() => {
  const heads = [...document.querySelectorAll('.ws-table thead th')].map((th) => th.textContent.trim())
  const rows = [...document.querySelectorAll('.ws-table tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()))
  const tot = [...document.querySelectorAll('.ws-table .ws-tr .ws-trow')].slice(1).map((d) => (d.querySelector('.v')?.textContent ?? '') + ' ' + (d.querySelector('small')?.textContent ?? ''))
  const names = ['oyna', 'narx', 'barcha oynalar', 'qiymat']
  const cols = {}
  heads.forEach((h, i) => { cols[h] = Object.fromEntries(names.map((n, j) => [n, rows[j]?.[i] ?? ''])) })
  return { cols, total: Object.fromEntries(names.map((n, j) => [n, (tot[j] ?? '').trim()])) }
})
// только ASCII в выводе (не-ASCII как \uXXXX): вывод идёт через фоновое задание PowerShell, где кодировка консоли портит «‘»
console.log(JSON.stringify({ id: V.id, order: orderId, errs, ...T }).replace(/[\u0080-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')))
await br.close()
