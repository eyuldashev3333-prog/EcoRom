// Точный подбор ширин ламинации по пробам с ценой 1 000 000 (docs/winstudio-study/lam_exact.txt). Запуск: cd app; npx vite-node ../scripts/winstudio/fit_lamination2.ts
import { designFromWblock } from '../../app/src/lib/wblock'
import { measure, type WindowDesign } from '../../app/src/lib/window'

const single = (w: number, h: number) => `wblock{vsx{0.0 ${w}.0}vsx vsy{0.0 ${h}.0}vsy pns{0:0 1:1}pns frs{0:1}frs ops{0:1}ops imps{}imps opsfrs{0}opsfrs impsfrs{-1}impsfrs}wblock`
const v2 = 'wblock{vsx{0.0 750.0 1500.0}vsx vsy{0.0 1500.0}vsy pns{0:0 1:0 1:1 2:1}pns frs{0:3}frs ops{0:2 1:3}ops imps{1:2}imps opsfrs{0|1}opsfrs impsfrs{0}impsfrs}wblock'
const v3 = 'wblock{vsx{0.0 600.0 1200.0 1500.0}vsx vsy{0.0 1500.0}vsy pns{0:0 1:0 1:1 2:0 2:1 3:1}pns frs{0:5}frs ops{0:2 1:4 3:5}ops imps{1:2 3:4}imps opsfrs{0|1|2}opsfrs impsfrs{0|1}impsfrs}wblock'
const cases: { code: string; ops: string[]; door?: boolean; inn: number; out: number }[] = [
  { code: single(2000, 1200), ops: ['OPEN_RIGHT'], inn: 0.911928, out: 0.94512 },
  { code: v2, ops: ['OPEN_RIGHT', 'OPEN_NONE'], inn: 0.8906, out: 0.922888 },
  { code: single(1000, 2100), ops: ['OPEN_RIGHT'], door: true, inn: 1.064656, out: 1.10436 },
  { code: v3, ops: ['OPEN_TOP_LEFT', 'OPEN_NONE', 'OPEN_RIGHT'], inn: 1.252768, out: 1.304576 },
  { code: single(1500, 1500), ops: ['OPEN_NONE'], inn: 0.439632, out: 0.45 },
  { code: single(1200, 1500), ops: ['OPEN_TOP_LEFT'], inn: 0.762928, out: 0.79412 },
  // окно 4 сквозной пробы: v3 2400x1500, правая/глухая/левая; внутренняя ламинация = (20854.55 - 289.75 +...)/190.5 из probe_full (±0.0003)
  { code: 'wblock{vsx{0.0 600.0 1200.0 2400.0}vsx vsy{0.0 1500.0}vsy pns{0:0 1:0 1:1 2:0 2:1 3:1}pns frs{0:5}frs ops{0:2 1:4 3:5}ops imps{1:2 3:4}imps opsfrs{0|1|2}opsfrs impsfrs{0|1}impsfrs}wblock', ops: ['OPEN_RIGHT', 'OPEN_NONE', 'OPEN_LEFT'], inn: 1.521, out: 0 },
]
const feat = cases.map((c) => {
  const d = designFromWblock(c.code, c.ops) as WindowDesign
  if (c.door) {
    const walk = (n: any): void => (n.kind === 'leaf' ? (n.door = true) : n.children.forEach(walk))
    walk(d.root)
  }
  const m = measure(d)
  return [m.exact.frame_m, m.exact.sash_m - m.exact.door_sash_m, m.exact.door_sash_m, m.exact.impost_m]
})
function solve(A: number[][], y: number[]): number[] {
  // нормальные уравнения (AᵀA)x = Aᵀy, метод Гаусса
  const n = A[0].length
  const M = Array.from({ length: n }, (_, i) => [...Array.from({ length: n }, (_, j) => A.reduce((s, r) => s + r[i] * r[j], 0)), A.reduce((s, r, k) => s + r[i] * y[k], 0)])
  for (let i = 0; i < n; i++) {
    let p = i
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r
    ;[M[i], M[p]] = [M[p], M[i]]
    for (let r = 0; r < n; r++) if (r !== i) { const f = M[r][i] / M[i][i]; for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c] }
  }
  return M.map((r, i) => r[n] / r[i])
}
for (const side of ['inn', 'out'] as const) {
  const y = cases.map((c) => c[side] * 1000)
  const x = solve(feat, y)
  console.log(side, 'frame/sash/door/impost =', x.map((v) => Math.round(v * 1000) / 1000).join(' / '))
  console.log('  residuals (m²):', feat.map((f, i) => Math.round((f.reduce((s, v, k) => s + v * x[k], 0) / 1000 - cases[i][side]) * 1e6) / 1e6).join(' '))
}

// перебор «круглых» значений для внутренней стороны
{
  const y = cases.map((c) => c.inn)
  let best: { e: number; v: number[] } | null = null
  for (let a = 70; a <= 76; a += 0.25) for (let b = 70; b <= 76; b += 0.25) for (let c = 98; c <= 108; c += 0.25) for (let d = 98; d <= 108; d += 0.25) {
    let e = 0
    for (let i = 0; i < feat.length; i++) e = Math.max(e, Math.abs((feat[i][0] * a + feat[i][1] * b + feat[i][2] * c + feat[i][3] * d) / 1000 - y[i]))
    if (!best || e < best.e) best = { e, v: [a, b, c, d] }
  }
  console.log('inn brute', best)
}