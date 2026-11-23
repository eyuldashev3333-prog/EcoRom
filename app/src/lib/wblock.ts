// Формат структуры окна WinStudio V44.4 («wblock») → наша модель окна.
// Пример: wblock{vsx{0.0 750.0 1500.0}vsx vsy{0.0 1500.0}vsy pns{0:0 1:0 1:1 2:1}pns frs{0:3}frs ops{0:2 1:3}ops imps{1:2}imps …}wblock
//   vsx, vsy — координаты линий сетки (мм); pns — вершины сетки «ix:iy» (по возрастанию ix, затем iy);
//   frs, ops, imps — пары индексов вершин: левый верх : правый низ для рам (frs) и панелей/стёкол (ops), концы отрезка для импостов (imps).
// Сложные шаблоны (Г, Т, ступени) состоят из нескольких отдельных рам (frs); у нас они — деления с флагом join.
import { leaf, uid, type Leaf, type Node, type Opening, type WindowDesign } from './window'

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

const nums = (s: string) => (s.trim() ? s.trim().split(/\s+/).map(Number) : [])
const grab = (code: string, key: string) => {
  const m = code.match(new RegExp(`${key}\\{([^}]*)\\}${key}`))
  return m ? m[1].trim() : ''
}

export function parseWblock(code: string) {
  const vsx = nums(grab(code, 'vsx'))
  const vsy = nums(grab(code, 'vsy'))
  const verts = grab(code, 'pns')
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.split(':').map(Number))
  const box = (a: number, b: number): Box => ({ x0: vsx[verts[a][0]], y0: vsy[verts[a][1]], x1: vsx[verts[b][0]], y1: vsy[verts[b][1]] })
  const pairs = (key: string) =>
    grab(code, key)
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p.split(':').map(Number))
  const panes = pairs('ops').map(([a, b]) => box(a, b))
  const frames = pairs('frs').map(([a, b]) => box(a, b))
  return { vsx, vsy, panes, frames, W: vsx[vsx.length - 1], H: vsy[vsy.length - 1] }
}

const OPEN: Record<string, Opening> = {
  OPEN_NONE: 'fixed',
  OPEN_RIGHT: 'turn_r',
  OPEN_LEFT: 'turn_l',
  OPEN_TOP_LEFT: 'tt_l',
  OPEN_TOP_RIGHT: 'tt_r',
  OPEN_BOTTOM: 'tilt',
  OPEN_TOP: 'top',
}

interface Item {
  box: Box
  node: Node
}

/** разбить область на дерево делений по готовым элементам (гильотина); join — деления между отдельными рамами */
function guillotine(region: Box, items: Item[], join: boolean): Node | null {
  if (items.length === 1) return items[0].node
  const sizes = (a: number, b: number) => [a, b]
  const xs = [...new Set(items.flatMap((i) => [i.box.x0, i.box.x1]))].filter((x) => x > region.x0 && x < region.x1).sort((a, b) => a - b)
  for (const x of xs) {
    if (items.some((i) => i.box.x0 < x && i.box.x1 > x)) continue
    const l = guillotine({ ...region, x1: x }, items.filter((i) => i.box.x1 <= x), join)
    const r = guillotine({ ...region, x0: x }, items.filter((i) => i.box.x0 >= x), join)
    if (l && r) return { kind: 'split', id: uid(), dir: 'v', sizes: sizes(x - region.x0, region.x1 - x), children: [l, r], ...(join ? { join: true } : {}) }
  }
  const ys = [...new Set(items.flatMap((i) => [i.box.y0, i.box.y1]))].filter((y) => y > region.y0 && y < region.y1).sort((a, b) => a - b)
  for (const y of ys) {
    if (items.some((i) => i.box.y0 < y && i.box.y1 > y)) continue
    const t = guillotine({ ...region, y1: y }, items.filter((i) => i.box.y1 <= y), join)
    const b = guillotine({ ...region, y0: y }, items.filter((i) => i.box.y0 >= y), join)
    if (t && b) return { kind: 'split', id: uid(), dir: 'h', sizes: sizes(y - region.y0, region.y1 - y), children: [t, b], ...(join ? { join: true } : {}) }
  }
  return null
}

/**
 * Окно по коду wblock. openings — типы открывания панелей по порядку (winOpeningsArray), по умолчанию всё глухое.
 * Участки сетки вне рам становятся пустыми ячейками (вырезы), рамы соединяются делениями join.
 */
export function designFromWblock(code: string, openings: string[] = []): WindowDesign | null {
  const { vsx, vsy, panes, frames, W, H } = parseWblock(code)
  if (!panes.length) return null
  const frameBoxes = frames.length ? frames : [{ x0: 0, y0: 0, x1: W, y1: H }]
  const leafOf = (i: number): Leaf => ({ ...leaf(OPEN[openings[i]] ?? 'fixed') })

  // содержимое каждой рамы: панели внутри неё, разбитые импостами
  const frameItems: Item[] = []
  for (const fb of frameBoxes) {
    const inside = panes.map((p, i) => ({ p, i })).filter(({ p }) => p.x0 >= fb.x0 && p.x1 <= fb.x1 && p.y0 >= fb.y0 && p.y1 <= fb.y1)
    const items: Item[] = inside.map(({ p, i }) => ({ box: p, node: leafOf(i) }))
    const node = guillotine(fb, items, false)
    if (!node) return null
    frameItems.push({ box: fb, node })
  }

  // участки сетки вне рам — вырезы
  const voids: Item[] = []
  for (let ix = 0; ix < vsx.length - 1; ix++)
    for (let iy = 0; iy < vsy.length - 1; iy++) {
      const c: Box = { x0: vsx[ix], y0: vsy[iy], x1: vsx[ix + 1], y1: vsy[iy + 1] }
      if (!frameBoxes.some((f) => c.x0 >= f.x0 && c.x1 <= f.x1 && c.y0 >= f.y0 && c.y1 <= f.y1)) voids.push({ box: c, node: { ...leaf('fixed'), void: true } })
    }

  const all = [...frameItems, ...voids]
  // верхний уровень: границы между рамами и вырезами — join (рамы прямоугольные и самостоятельные)
  const root = guillotine({ x0: 0, y0: 0, x1: W, y1: H }, all, all.length > 1)
  if (!root) return null
  return { width: W, height: H, shape: 'rect', root }
}
