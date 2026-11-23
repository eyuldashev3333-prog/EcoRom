// Сквозная сверка цены окна с живой WinStudio: 6 разных окон (дверь, делённые, сетки, ламинация, сэндвич, добавки по сторонам),
// у каждой статьи прайса свои цены. Данные и ответы: __fixtures__/winstudio-full.json (scripts/winstudio/probe_full.ps1).
import fx from './__fixtures__/winstudio-full.json'
import { designFromWblock } from './wblock'
import { quoteItem, type CatalogItem, type ItemOptions, type Side } from './quote'
import { measure, type Leaf, type Node, type WindowDesign } from './window'

const P = fx.prices as Record<string, any>
const sys = P.system as Record<string, string>
const n = (v: unknown) => Number(v)
const items: CatalogItem[] = [
  {
    id: 'sys', kind: 'system', name: 'B', unit: 'm', price: 0,
    params: {
      frame: n(sys.system_frame), impost: n(sys.system_impost), sash: n(sys.system_leaf), door_sash: n(sys.system_door_leaf), bead: n(sys.system_shtapik), gasket: n(sys.system_rubber_sealant),
      armor_frame: n(sys.system_firm_frame), armor_impost: n(sys.system_firm_impost), armor_sash: n(sys.system_firm_leaf), armor_door: n(sys.system_firm_door_leaf), sandwich: n(sys.system_sandwiches),
      mech_tt: n(sys.system_mehanic_rot), mech_h: n(sys.system_mehanic_hor), mech_v: n(sys.system_mehanic_vert), corner_frame: n(sys.system_firm_corner_frame), corner_sash: n(sys.system_firm_corner_leaf),
      connector: n(sys.system_impost_connector), support: n(sys.system_seat_profile), threshold: n(sys.system_dorsill), corner: n(sys.system_corner_jamb_profile),
      connect: n(sys.system_joint_profile), connect90: 0, connect135: 0, nashelnik: n(sys.system_gap_profile),
      dobor15: 0, dobor20: n(sys.system_extender_profile_20), dobor40: n(sys.system_extender_profile_40), dobor60: n(sys.system_extender_profile_60), dobor80: n(sys.system_extender_profile_80), dobor100: n(sys.system_extender_profile_100),
    },
  },
  { id: 'gl', kind: 'glass', name: 'G', unit: 'm2', price: 0, params: { glass1: n(P.glass.glass_glass1), glass2: n(P.glass.glass_glass2), glass3: n(P.glass.glass_glass3), film: n(P.glass.glass_film), gas: n(P.glass.glass_gas), spacer: n(P.glass.glass_spacers), desiccant: n(P.glass.glass_dryer), butyl: n(P.glass.glass_butil_stripe), sealant: n(P.glass.glass_sealant) } },
  { id: 'hw', kind: 'hardware', name: 'F', unit: 'pcs', price: 0, params: { handle_simple: n(P.furniture.furniture_handle_regular) } },
  { id: 'net', kind: 'net', name: 'N', unit: 'm2', price: n(P.net.mosquito_grid), params: { profile: n(P.net.mosquito_profile), gasket: n(P.net.mosquito_gum), corner: n(P.net.mosquito_corners), holder: n(P.net.mosquito_holders), pull: n(P.net.mosquito_handles) } },
  { id: 'lam', kind: 'lamination', name: 'L', unit: 'm2', price: n(P.lamination), params: {} },
  { id: 'sillin', kind: 'sill', name: 'SI', unit: 'm', price: n(P.sillInner[0]), params: { side_cap: n(P.sillInner[1]) } },
  { id: 'sillout', kind: 'ebb', name: 'SO', unit: 'm', price: n(P.sillOuter[0]), params: { side_cap: n(P.sillOuter[1]) } },
  { id: 'job', kind: 'work', name: 'J', unit: 'pcs', price: n(P.job), params: { basis: 'pcs' } },
  { id: 'ext', kind: 'misc', name: 'E', unit: 'pcs', price: n(P.extra), params: { basis: 'pcs' } },
]
export const catalog = new Map(items.map((i) => [i.id, i]))

const bools = (s?: string) => (s ?? '').split(' ').filter(Boolean).map((x) => x === 'true')
// порядок флагов в файле .wnd: слева, сверху, снизу, справа (подтверждено пробой: «false true false true» у доборов 20 = сверху + справа)
const sides = (s?: string): Side[] => (['l', 't', 'b', 'r'] as Side[]).filter((_, i) => bools(s)[i])

export function build(w: (typeof fx.windows)[number]): { d: WindowDesign; o: ItemOptions } {
  const ops = w.ops.split(' ').filter(Boolean)
  const doors = bools(w.doors)
  const nets = bools(w.nets)
  const base = designFromWblock(w.code, ops)!
  let k = 0
  const mark = (nd: Node): Node => {
    if (nd.kind === 'leaf') {
      const i = k++
      const lf: Leaf = { ...nd, door: doors[i] || undefined, net: nets[i] || undefined }
      if (w.extra && (w.extra as unknown as Record<string, string>).winIsSandwiches?.startsWith('true')) lf.panel = true
      return lf
    }
    return { ...nd, children: nd.children.map(mark) }
  }
  const d: WindowDesign = { ...base, root: mark(base.root) }
  const e = (w.extra ?? {}) as unknown as Record<string, string>
  const o: ItemOptions = { system: 'sys', hardware: 'hw' }
  if (e.winGlass) o.glass = 'gl'
  if (nets.some(Boolean)) o.net = 'net'
  if (e.winInnerSill) o.sills = [{ id: 'sillin' }]
  if (e.winOuterSill) o.ebbs = [{ id: 'sillout' }]
  if (e.winWorks) o.works = ['job']
  if (e.winAditions) o.misc = ['ext']
  if (e.winLaminationInner) o.lamination_in = 'lam'
  if (e.winLaminationOuter) o.lamination_out = 'lam'
  const sd: NonNullable<ItemOptions['sides']> = {}
  if (e.winAddonSeatProfile === 'true') sd.support = true
  if (e.winAddonDorsill === 'true') sd.threshold = true
  if (e.winAddonCornerJamb === 'true') sd.corner = true
  if (e.winAddonJointProfile) sd.connect = sides(e.winAddonJointProfile)
  if (e.winAddonJointProfile90deg) sd.connect90 = sides(e.winAddonJointProfile90deg)
  if (e.winAddonJointProfile135deg) sd.connect135 = sides(e.winAddonJointProfile135deg)
  if (e.winAddonGapProfile) sd.nashelnik = sides(e.winAddonGapProfile)
  const dobor: Record<string, Side[]> = {}
  for (const x of ['15', '20', '40', '60', '80', '100']) if (e[`winAddonExtender${x}`]) dobor[x] = sides(e[`winAddonExtender${x}`])
  if (Object.keys(dobor).length) sd.dobor = dobor
  if (Object.keys(sd).length) o.sides = sd
  return { d, o }
}

