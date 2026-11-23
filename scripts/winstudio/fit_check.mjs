// Проверка гипотез о формулах WinStudio против замеров grid.csv (Node, без зависимостей).
// Запуск: node scripts/winstudio/fit_check.mjs
import { readFileSync } from 'node:fs'

const csv = readFileSync(new URL('../../docs/winstudio-study/grid.csv', import.meta.url), 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/)
const head = csv[0].replace(/"/g, '').split(',')
const rows = csv.slice(1).map((l) => {
  const v = l.replace(/"/g, '').split(',')
  return Object.fromEntries(head.map((h, i) => [h, v[i]]))
})

const f = Math.fround
const r2 = (x) => Math.round(f(x) * 100 + 1e-9) / 100 // как у приложения: float32, потом 2 знака

// ---- гипотеза о константах (мм) ----
const K = {
  frameFace: 47.5, // видимая рама: стекло глухое от края
  impostGlass: 27.5, // стекло глухое у импоста
  sashFrame: 35, // створка внутрь от края ячейки у рамы
  sashImpost: 12.5, // створка внутрь от центра импоста
  glassFrameSide: 62.5, // стекло в створке от наружного края створки, сторона рамы
  glassImpostSide: 60, // стекло в створке от наружного края створки, сторона импоста
  door: { sashFrame: 35, glassFrameSide: 94 },
}

// ячейка: rect {w,h}, стороны {l,r,t,b}: true = рама, false = импост; leaf: 'fx' | 'sh' | 'door'
function cell(w, h, s, kind) {
  if (kind === 'fx') {
    const gw = w - (s.l ? K.frameFace : K.impostGlass) - (s.r ? K.frameFace : K.impostGlass)
    const gh = h - (s.t ? K.frameFace : K.impostGlass) - (s.b ? K.frameFace : K.impostGlass)
    return { bead: 2 * (gw + gh), glass: (gw * gh) / 1e6, sash: 0 }
  }
  const e = (frame) => (frame ? (kind === 'door' ? K.door.sashFrame : K.sashFrame) : K.sashImpost)
  const g = (frame) => (frame ? (kind === 'door' ? K.door.glassFrameSide : K.glassFrameSide) : K.glassImpostSide)
  const sw = w - e(s.l) - e(s.r)
  const sh = h - e(s.t) - e(s.b)
  const gw = sw - g(s.l) - g(s.r)
  const gh = sh - g(s.t) - g(s.b)
  return { bead: 2 * (gw + gh), glass: (gw * gh) / 1e6, sash: 2 * (sw + sh) }
}

function predict(r) {
  const W = +r.w, H = +r.h
  const tag = r.tag
  let cells = []
  if (tag.startsWith('door_turnR')) cells = [[W, H, { l: 1, r: 1, t: 1, b: 1 }, 'door']]
  else if (tag === 'win_op4') cells = [[W, H, { l: 1, r: 1, t: 1, b: 1 }, 'fx']]
  else if (/^win_op[0-8]$/.test(tag)) cells = [[W, H, { l: 1, r: 1, t: 1, b: 1 }, 'sh']]
  else if (tag.startsWith('v2_') || tag.startsWith('h2_')) {
    const [dir, a, b] = tag.split('_')
    const v = dir === 'v2'
    const first = 750, second = (v ? W : H) - 750
    const K1 = a === 'fx' ? 'fx' : 'sh', K2 = b === 'fx' ? 'fx' : 'sh'
    cells = v
      ? [[first, H, { l: 1, r: 0, t: 1, b: 1 }, K1], [second, H, { l: 0, r: 1, t: 1, b: 1 }, K2]]
      : [[W, first, { l: 1, r: 1, t: 1, b: 0 }, K1], [W, second, { l: 1, r: 1, t: 0, b: 1 }, K2]]
  } else return null
  let bead = 0, glass = 0, sash = 0, doorSash = 0
  for (const [w, h, s, k] of cells) {
    const c = cell(w, h, s, k)
    bead += c.bead; glass += c.glass
    if (k === 'door') doorSash += c.sash; else sash += c.sash
  }
  const allSash = sash + doorSash
  return { bead: r2(f(bead) / 1000), glass: r2(glass), gasket: r2(f(bead + 2 * allSash) / 1000), sash: r2(sash / 1000), doorsash: r2(doorSash / 1000) }
}

let total = 0, bad = 0
const byTag = {}
for (const r of rows) {
  const p = predict(r)
  if (!p) continue
  const bt = (byTag[r.tag.replace(/_\d+$/, '')] ??= { n: 0, bad: 0 })
  for (const k of ['bead', 'glass', 'gasket']) {
    const got = parseFloat(r[k])
    total++; bt.n++
    if (Math.abs(got - p[k]) > 0.0051) { bad++; bt.bad++; console.log(`MISS ${r.tag} ${r.w}x${r.h} ${k}: app ${got} model ${p[k]}`) }
  }
  const sashApp = r.sash === '-' ? 0 : parseFloat(r.sash), doorApp = r.doorsash === '-' ? 0 : parseFloat(r.doorsash)
  for (const [k, a, m] of [['sash', sashApp, p.sash], ['doorsash', doorApp, p.doorsash]]) {
    total++; bt.n++
    if (Math.abs(a - m) > 0.0051) { bad++; bt.bad++; console.log(`MISS ${r.tag} ${r.w}x${r.h} ${k}: app ${a} model ${m}`) }
  }
}
console.log(`\nchecked ${total} values, mismatches ${bad}`)
console.table(byTag)
