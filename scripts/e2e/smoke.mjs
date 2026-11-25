// Дымовой тест интерфейса: каждая роль открывает свои экраны; ищем ошибки консоли, HTTP>=400, белые экраны и «Bu ekranda xatolik».
// Нужен запущенный `vite preview --port 4173` (собранный app/dist, говорит с боевой базой). Временные пользователи smoke_* создаются и УДАЛЯЮТСЯ в конце.
// Ничего не пишет в заказы/деньги: только открывает страницы. Запуск: node scripts/e2e/smoke.mjs
import { chromium } from 'file:///D:/Eco Rom/scripts/node_modules/playwright-core/index.mjs'
import { ensureUser, rpc, PW, sql, URL_ } from './h.mjs'
import { env } from '../env.mjs'

const BASE = 'http://localhost:4173/EcoRom/#'
const SVC = env('SUPABASE_SERVICE_ROLE_KEY')
const users = [
  ['smoke_rah', 'rahbar', 9300901],
  ['smoke_ish', 'ishlab', 9300902],
  ['smoke_mon', 'montajchi', 9300903],
  ['smoke_drv', 'haydovchi', 9300904],
  ['smoke_xod', 'xodim', 9300905],
]
const ord = (await sql(`select id from orders order by order_no limit 1`))[0]?.id
const routes = {
  rahbar: ['/', '/zavod', '/orders', '/orders/done', '/orders/done?q=asad', '/ws/orders', '/ws/new', '/payroll', '/pay-rules', '/report', '/expenses', '/stock', '/purchases', '/suppliers', '/offcuts', '/service', '/breakages', '/employees', '/catalog', '/exchange', '/settings', '/leaks', '/jadval/registratsiya', '/jadval/savdo', '/photo', '/my-pay', ord && `/orders/${ord}`, ord && `/orders/${ord}/print?mode=offer`, ord && `/ws/edit/${ord}`].filter(Boolean),
  ishlab: ['/', '/my-works', '/my-pay'],
  montajchi: ['/', '/my-works', '/my-pay'],
  haydovchi: ['/', '/my-pay'],
  xodim: ['/', '/my-pay'],
}

let bad = 0
const br = await chromium.launch({ channel: 'msedge', headless: true })
try {
  for (const [login, role, tg] of users) await ensureUser(login, 'SMOKE ' + role, role, tg)
  for (const [login, role] of users) {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    let current = ''
    const problems = []
    page.on('pageerror', (e) => problems.push(`[${current}] pageerror: ${e.message}`))
    page.on('console', (m) => {
      if (m.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of 40[134]/.test(m.text())) problems.push(`[${current}] console: ${m.text().slice(0, 200)}`)
    })
    page.on('response', (r) => {
      if (r.status() >= 500 || (r.status() >= 400 && /supabase\.co\/(rest|functions)/.test(r.url()) && r.status() !== 401 && r.status() !== 404)) problems.push(`[${current}] HTTP ${r.status()} ${r.request().method()} ${r.url().replace(/\?.*/, '').slice(-90)}`)
    })
    await page.goto(`${BASE}/`)
    await page.fill('input[autocomplete=username]', login)
    await page.fill('input[type=password]', PW)
    await page.click('form.login button')
    await page.waitForTimeout(3500)
    for (const route of routes[role]) {
      current = `${role} ${route}`
      await page.goto(`${BASE}${route}`)
      await page.waitForTimeout(2200)
      const info = await page.evaluate(() => ({ len: document.body.innerText.trim().length, crashed: /Bu ekranda xatolik/.test(document.body.innerText), docW: document.documentElement.scrollWidth, vw: innerWidth }))
      if (info.crashed) problems.push(`[${current}] экран упал (RouteBoundary)`)
      if (info.len < 5) problems.push(`[${current}] пустой экран`)
      if (info.docW > info.vw + 2) problems.push(`[${current}] горизонтальный скролл ${info.docW} > ${info.vw}`)
    }
    await ctx.close()
    console.log(`${problems.length ? '✗' : '✓'} ${role}: ${routes[role].length} экранов${problems.length ? '\n   ' + problems.join('\n   ') : ''}`)
    bad += problems.length
  }
} finally {
  await br.close()
  // уборка временных пользователей
  const rows = await sql(`select id, auth_user_id from employees where login like 'smoke\\_%'`)
  for (const r of rows) {
    await sql(`delete from employees where id = '${r.id}'`)
    if (r.auth_user_id) await fetch(`${URL_}/auth/v1/admin/users/${r.auth_user_id}`, { method: 'DELETE', headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } })
  }
  console.log(`временных пользователей удалено: ${rows.length}`)
}
console.log(bad ? `\nПроблем: ${bad}` : '\nВсе экраны открылись без ошибок')
process.exit(bad ? 1 : 0)
