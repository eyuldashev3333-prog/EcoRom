// Обход экранов после правок 24.11 (нужен vite preview на 4173). Делает тестовые данные, снимки в shots/, список ошибок консоли/HTTP.
import { chromium } from 'file:///D:/Eco Rom/scripts/node_modules/playwright-core/index.mjs'
import { ensureUser, sql, rpc, PW } from './h.mjs'
const BASE = 'http://localhost:4173/EcoRom/#'
const real = await sql(`select id, telegram_id from employees where role = 'rahbar' and login not like 't\\_%' and telegram_id is not null`)
await sql(`update employees set telegram_id = null where role = 'rahbar' and login not like 't\\_%'`)
try {
  await ensureUser('t_rah', 'T Rahbar', 'rahbar', 9100001)
  await ensureUser('test_ishlab1', 'T Ishlab 1', 'ishlab', 9100002)
  await ensureUser('test_mont1', 'T Mont 1', 'montajchi', 9100005)
  const i1 = (await sql(`select id from employees where login='test_ishlab1'`))[0].id
  const item = { pos: 1, title: 'w1', width_mm: 1200, height_mm: 1400, qty: 1, area_m2: 1.68, cost: 100, design: { width: 1200, height: 1400, shape: 'rect', root: { kind: 'leaf', id: 'a1', opening: 'turn_l' } }, options: {}, materials: { items: [] } }
  const o = (await rpc('t_rah', 'save_order', { p: { client: { full_name: 'TEST UI', phone: '+998900000000' }, address: 'Test manzil 5', deadline: new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10), contract_price: 1000000, calc_cost: 500000, items: [item, { ...item, pos: 2 }] } })).data
  await rpc('t_rah', 'send_to_shop', { p_order: o.id, p_workers: [i1] })
  const problems = []
  const br = await chromium.launch({ channel: 'msedge', headless: true })
  const run = async (who, w, h, routes, tag) => {
    const ctx = await br.newContext({ viewport: { width: w, height: h } })
    const page = await ctx.newPage()
    let cur = 'login'
    page.on('console', (m) => m.type() === 'error' && problems.push(`[${who}${tag} ${cur}] console.error: ${m.text().slice(0, 180)}`))
    page.on('pageerror', (e) => problems.push(`[${who}${tag} ${cur}] PAGEERROR: ${e.message.slice(0, 180)}`))
    page.on('response', (r) => r.status() >= 400 && !/favicon/.test(r.url()) && problems.push(`[${who}${tag} ${cur}] HTTP ${r.status()} ${r.url().replace(/^https:\/\/[^/]+/, '').slice(0, 130)}`))
    await page.goto(BASE + '/')
    await page.fill('input[autocomplete=username]', who)
    await page.fill('input[type=password]', PW)
    await page.click('form.login button')
    await page.waitForTimeout(2500)
    for (const [r, click] of routes) {
      cur = r
      await page.goto(BASE + r)
      await page.waitForTimeout(1500)
      if (click) {
        await page.getByRole('button', { name: click }).first().click().catch(() => {})
        await page.waitForTimeout(1800)
      }
      const txt = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 130)
      console.log(`${who}${tag}`.padEnd(18), `${r}${click ? ' > ' + click : ''}`.padEnd(30), '|', txt)
      await page.screenshot({ path: `shots/c2_${who}${tag}_${(r + (click ?? '')).replace(/\W+/g, '_')}.png` })
    }
    await ctx.close()
  }
  await run('t_rah', 1440, 900, [['/'], ['/', 'Moliya'], ['/', 'Montaj'], ['/', 'Savdo'], ['/orders'], ['/stock'], ['/payroll'], ['/pay-rules'], [`/orders/${o.id}`]], '')
  await run('t_rah', 390, 844, [['/'], ['/orders'], ['/payroll']], '-m')
  await run('test_ishlab1', 390, 844, [['/'], [`/shop/${o.id}`], ['/my-pay']], '')
  await run('test_mont1', 390, 844, [['/']], '')
  console.log('--- PROBLEMS', problems.length)
  ;[...new Set(problems)].slice(0, 40).forEach((p) => console.log(p))
  await br.close()
} finally {
  for (const r of real) await sql(`update employees set telegram_id = ${r.telegram_id} where id = '${r.id}'`)
}
