// Каталог конфигураций окна («+» в WinStudio): готовые схемы делений, включая Г- и Т-образные (вырез = пустая ячейка).
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

export const CONFIGS: Config[] = [
  cfg('c1', 1200, 1500, 'f'),
  ...[2, 3, 4, 5, 6].map((n) => cfg(`cols${n}`, 600 * n, 1500, row(n))),
  cfg('rows2', 1200, 1500, col(2)),
  cfg('rows3', 1200, 2100, col(3)),
  // сетки: колонки × ряды
  cfg('g2x2', 1200, 1500, H([row(2), row(2)])),
  cfg('g3x2', 1800, 1500, H([row(3), row(3)])),
  cfg('g2x3', 1200, 2100, H([row(2), row(2), row(2)])),
  cfg('g3x3', 1800, 2100, H([row(3), row(3), row(3)])),
  cfg('g4x2', 2400, 1500, H([row(4), row(4)])),
  // фрамуга сверху + N колонок
  ...[1, 2, 3, 4, 5, 6].map((n) => cfg(`top1_${n}`, Math.max(1200, 600 * n), 1900, H([ 'f', row(n)], [1, 3]))),
  ...[2, 3, 4].map((n) => cfg(`topn_${n}`, 600 * n, 1900, H([row(n), row(n)], [1, 3]))),
  // полоса снизу
  ...[1, 2, 3, 4].map((n) => cfg(`bot_${n}`, Math.max(1200, 600 * n), 1900, H([row(n), 'f'], [3, 1]))),
  // фрамуга сверху и полоса снизу
  ...[1, 2, 3].map((n) => cfg(`tb_${n}`, Math.max(1200, 600 * n), 2300, H(['f', row(n), 'f'], [1, 3, 1]))),
  // Г-образные: вырез в одном углу
  cfg('L_tl', 1500, 1500, V([H(['x', 'f'], [1, 1]), 'f'])),
  cfg('L_tr', 1500, 1500, V(['f', H(['x', 'f'], [1, 1])])),
  cfg('L_bl', 1500, 1500, V([H(['f', 'x'], [1, 1]), 'f'])),
  cfg('L_br', 1500, 1500, V(['f', H(['f', 'x'], [1, 1])])),
  cfg('L3_tl', 2100, 1500, V([H(['x', 'f']), 'f', 'f'])),
  cfg('L3_tr', 2100, 1500, V(['f', 'f', H(['x', 'f'])])),
  // Т-образные: две боковые колонки короче центральной
  cfg('T_top', 1800, 1500, V([H(['x', 'f'], [1, 2]), 'f', H(['x', 'f'], [1, 2])])),
  cfg('T_bot', 1800, 1500, V([H(['f', 'x'], [2, 1]), 'f', H(['f', 'x'], [2, 1])])),
  cfg('T_wide', 2400, 1500, V([H(['x', 'f'], [1, 2]), 'f', H(['x', 'f'], [1, 2])], [1, 2, 1])),
  // ступени
  cfg('stairs_l', 1800, 1800, V([H(['x', 'f'], [2, 1]), H(['x', 'f'], [1, 2]), 'f'])),
  cfg('stairs_r', 1800, 1800, V(['f', H(['x', 'f'], [1, 2]), H(['x', 'f'], [2, 1])])),
  // высокий центр с делениями по бокам
  cfg('centerTall', 2000, 1500, V([col(2), 'f', col(2)], [1, 2, 1])),
  cfg('leftRows3', 1500, 1800, V([col(3), 'f'])),
  cfg('rightRows3', 1500, 1800, V(['f', col(3)])),

  // ряды и сетки побольше
  cfg('rows4', 1200, 2400, col(4)),
  cfg('rows5', 1200, 2700, col(5)),
  cfg('g4x3', 2400, 2100, H([row(4), row(4), row(4)])),
  cfg('g5x2', 3000, 1500, H([row(5), row(5)])),
  cfg('g6x2', 3600, 1500, H([row(6), row(6)])),
  cfg('g2x4', 1200, 2400, H([row(2), row(2), row(2), row(2)])),
  cfg('g3x4', 1800, 2400, H([row(3), row(3), row(3), row(3)])),
  // фрамуга и низ с разным числом частей
  ...([[2, 3], [3, 2], [2, 4], [4, 2], [3, 4], [4, 3]] as const).map(([a, b]) => cfg(`tb_${a}_${b}`, 600 * Math.max(a, b), 1900, H([row(a), row(b)], [1, 3]))),
  ...[2, 3, 4].map((n) => cfg(`botn_${n}`, 600 * n, 1900, H([row(n), row(n)], [3, 1]))),
  cfg('three2', 1200, 2400, H([row(2), row(2), 'f'], [1, 2, 1])),
  // неравные части
  cfg('v12', 1500, 1500, V(['f', 'f'], [1, 2])),
  cfg('v21', 1500, 1500, V(['f', 'f'], [2, 1])),
  cfg('v121', 2100, 1500, V(['f', 'f', 'f'], [1, 2, 1])),
  cfg('v112', 2100, 1500, V(['f', 'f', 'f'], [1, 1, 2])),
  cfg('v211', 2100, 1500, V(['f', 'f', 'f'], [2, 1, 1])),
  cfg('v1221', 2400, 1500, V(['f', 'f', 'f', 'f'], [1, 2, 2, 1])),
  cfg('v11211', 3000, 1500, V(['f', 'f', 'f', 'f', 'f'], [1, 1, 2, 1, 1])),
  cfg('h12', 1200, 1800, H(['f', 'f'], [1, 2])),
  cfg('h21', 1200, 1800, H(['f', 'f'], [2, 1])),
  cfg('h121', 1200, 2100, H(['f', 'f', 'f'], [1, 2, 1])),
  cfg('top121', 2100, 1900, H([row(3), V(['f', 'f', 'f'], [1, 2, 1])], [1, 3])),
  // вырезы: Г-образные с тремя колонками, U-образные, крест, Т по горизонтали
  cfg('L3_bl', 2100, 1500, V([H(['f', 'x']), 'f', 'f'])),
  cfg('L3_br', 2100, 1500, V(['f', 'f', H(['f', 'x'])])),
  cfg('L4_tl', 2400, 1500, V([H(['x', 'f']), 'f', 'f', 'f'])),
  cfg('L4_tr', 2400, 1500, V(['f', 'f', 'f', H(['x', 'f'])])),
  cfg('U_top', 1800, 1500, V(['f', H(['x', 'f'], [1, 2]), 'f'])),
  cfg('U_bot', 1800, 1500, V(['f', H(['f', 'x'], [2, 1]), 'f'])),
  cfg('plus', 1800, 1800, H([V(['x', 'f', 'x']), row(3), V(['x', 'f', 'x'])])),
  cfg('Th_top', 1800, 1800, H(['f', V(['x', 'f', 'x'])], [1, 2])),
  cfg('Th_bot', 1800, 1800, H([V(['x', 'f', 'x']), 'f'], [2, 1])),
  cfg('Lh_tl', 1800, 1500, H([V(['f', 'x']), 'f'], [1, 1])),
  cfg('Lh_tr', 1800, 1500, H([V(['x', 'f']), 'f'], [1, 1])),
  cfg('Lh_bl', 1800, 1500, H(['f', V(['f', 'x'])], [1, 1])),
  cfg('Lh_br', 1800, 1500, H(['f', V(['x', 'f'])], [1, 1])),
  cfg('stairs4_l', 2400, 2400, V([H(['x', 'f'], [3, 1]), H(['x', 'f'], [2, 2]), H(['x', 'f'], [1, 3]), 'f'])),
  cfg('stairs4_r', 2400, 2400, V(['f', H(['x', 'f'], [1, 3]), H(['x', 'f'], [2, 2]), H(['x', 'f'], [3, 1])])),
  cfg('T_split', 2400, 1800, V([H(['x', col(2)], [1, 2]), 'f', H(['x', col(2)], [1, 2])], [1, 2, 1])),
  cfg('Tcols', 2400, 1800, V([H(['x', row(1)], [1, 2]), 'f', H(['x', 'f'], [1, 2])], [1, 2, 1])),
]

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
