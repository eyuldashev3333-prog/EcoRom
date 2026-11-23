// Площадь ламинации по замерам WinStudio V44.4 (колонки «ламин.внутр.» / «ламин.внеш.»), одинаковая ламинация с обеих сторон.
import { describe, expect, it } from 'vitest'
import { designFromWblock } from './wblock'
import { measure, type WindowDesign } from './window'

const single = (w: number, h: number) => `wblock{vsx{0.0 ${w}.0}vsx vsy{0.0 ${h}.0}vsy pns{0:0 1:1}pns frs{0:1}frs ops{0:1}ops imps{}imps opsfrs{0}opsfrs impsfrs{-1}impsfrs}wblock`
const v2 = 'wblock{vsx{0.0 750.0 1500.0}vsx vsy{0.0 1500.0}vsy pns{0:0 1:0 1:1 2:1}pns frs{0:3}frs ops{0:2 1:3}ops imps{1:2}imps opsfrs{0|1}opsfrs impsfrs{0}impsfrs}wblock'
const v3 = 'wblock{vsx{0.0 600.0 1200.0 1500.0}vsx vsy{0.0 1500.0}vsy pns{0:0 1:0 1:1 2:0 2:1 3:1}pns frs{0:5}frs ops{0:2 1:4 3:5}ops imps{1:2 3:4}imps opsfrs{0|1|2}opsfrs impsfrs{0|1}impsfrs}wblock'

const doorOf = (d: WindowDesign): WindowDesign => {
  const walk = (n: WindowDesign['root']): WindowDesign['root'] => (n.kind === 'leaf' ? { ...n, door: true } : { ...n, children: n.children.map(walk) })
  return { ...d, root: walk(d.root) }
}

const cases: { name: string; d: () => WindowDesign; inn: number; out: number }[] = [
  { name: 'глухое 1000×1200', d: () => designFromWblock(single(1000, 1200), ['OPEN_NONE'])!, inn: 0.32, out: 0.33 },
  { name: 'створка 1000×1200', d: () => designFromWblock(single(1000, 1200), ['OPEN_RIGHT'])!, inn: 0.61, out: 0.64 },
  { name: 'створка 2000×1200', d: () => designFromWblock(single(2000, 1200), ['OPEN_RIGHT'])!, inn: 0.91, out: 0.95 },
  { name: 'две части: створка + глухое', d: () => designFromWblock(v2, ['OPEN_RIGHT', 'OPEN_NONE'])!, inn: 0.89, out: 0.92 },
  { name: 'дверь 1000×2100', d: () => doorOf(designFromWblock(single(1000, 2100), ['OPEN_RIGHT'])!), inn: 1.06, out: 1.1 },
  { name: 'три части', d: () => designFromWblock(v3, ['OPEN_TOP_LEFT', 'OPEN_NONE', 'OPEN_RIGHT'])!, inn: 1.25, out: 1.3 },
]

describe('ламинация: площадь видимого профиля, как в WinStudio', () => {
  for (const c of cases) {
    it(c.name, () => {
      const m = measure(c.d())
      // подбор ширин укладывается в округление приложения (≤ 0,01 м²)
      expect(Math.abs(m.lam_in_m2 - c.inn)).toBeLessThanOrEqual(0.0101)
      expect(Math.abs(m.lam_out_m2 - c.out)).toBeLessThanOrEqual(0.0101)
    })
  }
})
