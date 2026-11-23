// Каталог конфигураций окна («+» в WinStudio): те же схемы, в том же порядке и с теми же размерами, что в WinStudio V44.4
// (составные Г-/Т-/ступенчатые — отдельные рамы, соединённые делениями join), затем арочные и заготовки с открываниями.
import { designFromWblock } from './wblock'
import { WINSTUDIO_TEMPLATES } from './winstudioTemplates'
import { layout, leaf, newDesign, setPartSize, splitLeaf, uid, updateLeaf, type Node, type WindowDesign } from './window'

type S = 'f' | 'x' | { d: 'v' | 'h'; k: S[]; f?: number[] } // f — стекло, x — вырез, f[] — доли размеров

const build = (s: S, w: number, h: number): Node => {
  if (s === 'f') return leaf('fixed')
  if (s === 'x') return { ...leaf('fixed'), void: true }
  const total = s.d === 'v' ? w : h
  const fr = s.f ?? s.k.map(() => 1)
  const sum = fr.reduce((a, b) => a + b, 0)
  const sizes = fr.map((f) => Math.round((total * f) / sum))
  sizes[sizes.length - 1] = total - sizes.slice(0, -1).reduce((a, b) => a + b, 0)
  return {
    kind: 'split',
    id: uid(),
    dir: s.d,
    sizes,
    children: s.k.map((c, i) => (s.d === 'v' ? build(c, sizes[i], h) : build(c, w, sizes[i]))),
  }
}
const mk = (w: number, h: number, s: S): WindowDesign => ({ width: w, height: h, shape: 'rect', root: build(s, w, h) })

const V = (k: S[], f?: number[]): S => ({ d: 'v', k, f })
const H = (k: S[], f?: number[]): S => ({ d: 'h', k, f })
const row = (n: number): S => (n === 1 ? 'f' : V(Array(n).fill('f')))
const col = (n: number): S => (n === 1 ? 'f' : H(Array(n).fill('f')))

export interface Config {
  key: string
  build: () => WindowDesign
}
const cfg = (key: string, w: number, h: number, s: S): Config => ({ key, build: () => mk(w, h, s) })

export const CONFIGS: Config[] = WINSTUDIO_TEMPLATES.map((code, i) => ({ key: `ws${i + 1}`, build: () => designFromWblock(code)! }))
// арочные окна: арка над двумя и тремя частями
export const ARCH_CONFIGS: Config[] = [
  { key: 'arch2', build: () => ({ ...mk(1500, 1800, row(2)), shape: 'arch', archRise: 400 }) },
  { key: 'arch3', build: () => ({ ...mk(2100, 1800, row(3)), shape: 'arch', archRise: 500 }) },
]
CONFIGS.push(...ARCH_CONFIGS)

// старые заготовки с открываниями (двухстворчатое, фрамуга, балкон, арка)
export const PRESETS: { key: string; build: () => WindowDesign }[] = [
  { key: 'fixed', build: () => newDesign(1200, 1500) },
  {
    key: 'two',
    build: () => {
      const b = newDesign(1200, 1500)
      const d = splitLeaf(b, b.root.id, 'v')
      return updateLeaf(d, layout(d).cells[1].leaf.id, { opening: 'tt_r' })
    },
  },
  {
    key: 'three',
    build: () => {
      const b = newDesign(1800, 1500)
      const d = splitLeaf(b, b.root.id, 'v', 3)
      const c = layout(d).cells
      return updateLeaf(updateLeaf(d, c[0].leaf.id, { opening: 'tt_l' }), c[2].leaf.id, { opening: 'tt_r' })
    },
  },
  {
    key: 'transom',
    build: () => {
      const b = newDesign(1500, 2000)
      let d = splitLeaf(b, b.root.id, 'h')
      d = setPartSize(d, d.root.id, 0, 500)
      const bottom = layout(d).cells[1].leaf.id
      d = splitLeaf(d, bottom, 'v')
      return updateLeaf(d, layout(d).cells[2].leaf.id, { opening: 'tt_r' })
    },
  },
  {
    key: 'balcony',
    build: () => {
      const b = newDesign(2100, 2150)
      let d = splitLeaf(b, b.root.id, 'v')
      d = setPartSize(d, d.root.id, 0, 750)
      return updateLeaf(d, layout(d).cells[0].leaf.id, { opening: 'tt_l', door: true })
    },
  },
  { key: 'arch', build: () => ({ ...newDesign(1200, 1800), shape: 'arch', archRise: 400 }) },
]

