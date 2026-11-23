// Сверка количеств по статьям прайса с живыми пробами WinStudio (docs/winstudio-study/probes.txt, строки X6 «PA»):
// цена статьи = 1 000 000 → стоимость окна = количество. Окна пробного заказа PA собраны в scripts/winstudio/build_probe_orders.ps1.
import { describe, expect, it } from 'vitest'
import { designFromWblock } from './wblock'
import { quoteItem, type CatalogItem } from './quote'
import { measure, type Leaf, type WindowDesign } from './window'

const single = (w: number, h: number) => `wblock{vsx{0.0 ${w}.0}vsx vsy{0.0 ${h}.0}vsy pns{0:0 1:1}pns frs{0:1}frs ops{0:1}ops imps{}imps opsfrs{0}opsfrs impsfrs{-1}impsfrs}wblock`
const v2 = 'wblock{vsx{0.0 750.0 1500.0}vsx vsy{0.0 1500.0}vsy pns{0:0 1:0 1:1 2:1}pns frs{0:3}frs ops{0:2 1:3}ops imps{1:2}imps opsfrs{0|1}opsfrs impsfrs{0}impsfrs}wblock'
const v3 = 'wblock{vsx{0.0 600.0 1200.0 1500.0}vsx vsy{0.0 1500.0}vsy pns{0:0 1:0 1:1 2:0 2:1 3:1}pns frs{0:5}frs ops{0:2 1:4 3:5}ops imps{1:2 3:4}imps opsfrs{0|1|2}opsfrs impsfrs{0|1}impsfrs}wblock'

// окна PA: 1..6
const windows = (): WindowDesign[] => {
  const mk = (code: string, ops: string[], door = false): WindowDesign => {
    const d = designFromWblock(code, ops)!
    if (!door) return d
    const mark = (n: WindowDesign['root']): WindowDesign['root'] => (n.kind === 'leaf' ? ({ ...n, door: true } as Leaf) : { ...n, children: n.children.map(mark) })
    return { ...d, root: mark(d.root) }
  }
  return [
    mk(single(1000, 1200), ['OPEN_RIGHT']),
    mk(single(1000, 1200), ['OPEN_TOP_LEFT']),
    mk(single(1000, 1200), ['OPEN_BOTTOM']),
    mk(single(1000, 2100), ['OPEN_RIGHT'], true),
    mk(v2, ['OPEN_RIGHT', 'OPEN_LEFT']),
    mk(v3, ['OPEN_TOP_LEFT', 'OPEN_NONE', 'OPEN_RIGHT']),
  ]
}

// ключ прайса → (параметр каталога, ожидаемые количества окон 1..6 по пробам X6)
const CASES: { name: string; param: string; exp: number[] }[] = [
  { name: 'system_frame', param: 'frame', exp: [4.4, 4.4, 4.4, 6.2, 6.0, 6.0] },
  { name: 'system_impost', param: 'impost', exp: [0, 0, 0, 0, 1.404, 2.808] },
  { name: 'system_leaf', param: 'sash', exp: [4.12, 4.12, 4.12, 0, 8.528, 7.328] },
  { name: 'system_shtapik', param: 'bead', exp: [3.624, 3.624, 3.624, 5.168, 7.536, 10.24] },
  { name: 'system_rubber_sealant', param: 'gasket', exp: [11.864, 11.864, 11.864, 17.008, 24.592, 24.896] },
  { name: 'system_firm_frame', param: 'armor_frame', exp: [4.4, 4.4, 4.4, 6.2, 6.0, 6.0] },
  { name: 'system_firm_impost', param: 'armor_impost', exp: [0, 0, 0, 0, 1.404, 2.808] },
  { name: 'system_firm_leaf', param: 'armor_sash', exp: [4.12, 4.12, 4.12, 0, 8.528, 7.328] },
]

describe('количества по статьям прайса = пробы живой WinStudio (окна PA)', () => {
  const ws = windows()
  for (const c of CASES) {
    it(c.name, () => {
      const sys: CatalogItem = { id: 's', kind: 'system', name: 'S', unit: 'm', price: 0, params: { [c.param]: 1e6 } }
      const cat = new Map([[sys.id, sys]])
      ws.forEach((d, i) => {
        const q = quoteItem(measure(d), { system: 's' }, cat, d.width, d.height)
        // door_sash не задан → дверь ценой створки не считается (как в WinStudio)
        expect(q.cost / 1e6, `окно ${i + 1}`).toBeCloseTo(c.exp[i], 3)
      })
    })
  }
})
