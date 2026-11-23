// Подбор ширин видимого профиля для площади ламинации. Запуск: cd app; npx vite-node ../scripts/winstudio/fit_lamination.ts
import { designFromWblock } from '../../app/src/lib/wblock'
import { frameSides, impostPieces, layout, measure, DEFAULT_DIMS, type WindowDesign } from '../../app/src/lib/window'

const single = (w: number, h: number) => `wblock{vsx{0.0 ${w}.0}vsx vsy{0.0 ${h}.0}vsy pns{0:0 1:1}pns frs{0:1}frs ops{0:1}ops imps{}imps opsfrs{0}opsfrs impsfrs{-1}impsfrs}wblock`
const v2 = 'wblock{vsx{0.0 750.0 1500.0}vsx vsy{0.0 1500.0}vsy pns{0:0 1:0 1:1 2:1}pns frs{0:3}frs ops{0:2 1:3}ops imps{1:2}imps opsfrs{0|1}opsfrs impsfrs{0}impsfrs}wblock'
const v3 = 'wblock{vsx{0.0 600.0 1200.0 1500.0}vsx vsy{0.0 1500.0}vsy pns{0:0 1:0 1:1 2:0 2:1 3:1}pns frs{0:5}frs ops{0:2 1:4 3:5}ops imps{1:2 3:4}imps opsfrs{0|1|2}opsfrs impsfrs{0|1}impsfrs}wblock'

interface Case { name: string; code: string; ops: string[]; door?: boolean; inn: number; out: number }
const cases: Case[] = [
  { name: 'w1 fixed 1000x1200', code: single(1000, 1200), ops: ['OPEN_NONE'], inn: 0.32, out: 0.33 },
  { name: 'w2 sash 1000x1200', code: single(1000, 1200), ops: ['OPEN_RIGHT'], inn: 0.61, out: 0.64 },
  { name: 'w3 sash 2000x1200', code: single(2000, 1200), ops: ['OPEN_RIGHT'], inn: 0.91, out: 0.95 },
  { name: 'w4 v2 sash+fixed', code: v2, ops: ['OPEN_RIGHT', 'OPEN_NONE'], inn: 0.89, out: 0.92 },
  { name: 'w5 door 1000x2100', code: single(1000, 2100), ops: ['OPEN_RIGHT'], door: true, inn: 1.06, out: 1.1 },
  { name: 'w6 v3 tt,fixed,turn', code: v3, ops: ['OPEN_TOP_LEFT', 'OPEN_NONE', 'OPEN_RIGHT'], inn: 1.25, out: 1.3 },
]

interface Feat { frame: number; sash: number; door: number; impost: number }
function feat(c: Case): Feat {
  const d = designFromWblock(c.code, c.ops) as WindowDesign
  if (c.door) {
    const walk = (n: any): void => { if (n.kind === 'leaf') n.door = true; else n.children.forEach(walk) }
    walk(d.root)
  }
  const { cells, dividers, joins } = layout(d)
  const m = measure(d)
  void frameSides
  const impost = impostPieces(cells, dividers, d.width, d.height, DEFAULT_DIMS, joins).reduce((a, b) => a + b, 0) / 1000
  let sash = 0
  let door = 0
  for (const s of m.sashRects) (s.door ? (door += 2 * (s.w + s.h)) : (sash += 2 * (s.w + s.h)))
  return { frame: 2 * (d.width + d.height) / 1000, sash: sash / 1000, door: door / 1000, impost }
}

const feats = cases.map(feat)
for (const side of ['inn', 'out'] as const) {
  const ok: number[][] = []
  for (let a = 55; a <= 110; a += 0.5)
    for (let b = 55; b <= 110; b += 0.5)
      for (let bd = 70; bd <= 140; bd += 1)
        for (let c = 60; c <= 140; c += 1) {
          let bad = 0
          for (let i = 0; i < cases.length; i++) {
            const f = feats[i]
            const area = (f.frame * a + f.sash * b + f.door * bd + f.impost * c) / 1000
            if (Math.abs(Math.round(area * 100) / 100 - cases[i][side]) > 0.0051) { bad++; break }
          }
          if (!bad) ok.push([a, b, bd, c])
        }
  const rg = (k: number) => (ok.length ? `${Math.min(...ok.map((x) => x[k]))}..${Math.max(...ok.map((x) => x[k]))}` : '-')
  let best: any = null
  for (let a = 55; a <= 110; a += 0.5) for (let b = 55; b <= 110; b += 0.5) for (let bd = 70; bd <= 140; bd += 1) for (let c = 40; c <= 140; c += 1) { let mx = 0; for (let i = 0; i < cases.length; i++) { const f = feats[i]; const area = (f.frame * a + f.sash * b + f.door * bd + f.impost * c) / 1000; mx = Math.max(mx, Math.abs(area - cases[i][side])) } if (!best || mx < best.mx) best = { a, b, bd, c, mx } }
  console.log(side, 'best max err', best)
  console.log(side, 'feasible', ok.length, 'frame', rg(0), 'sash', rg(1), 'door', rg(2), 'impost', rg(3))
}

