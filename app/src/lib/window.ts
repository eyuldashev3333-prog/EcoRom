// Модель окна и геометрия (метры профиля, стёкла) — одна для чертежа, расчёта, PDF и 3D.
// Формулы восстановлены по окнам WinStudio владельца (см. window.test.ts):
//   рамы = периметр; импост = пролёт − 2×impostCut; просвет ячейки = доля − frameCut у сторон, касающихся рамы;
//   створка = просвет + 2×sashOverlap; стекло в створке = створка − 2×sashFace;
//   штапик = Σ периметров стёкол; уплотнитель = штапик + 2×Σ периметров створок.

export type Opening =
  | 'fixed' // глухое стекло в раме
  | 'fixed_sash' // глухая створка (X)
  | 'turn_l' // поворотная, петли слева
  | 'turn_r' // поворотная, петли справа
  | 'tilt' // откидная (петли снизу)
  | 'top' // верхнеподвесная (петли сверху)
  | 'tt_l' // поворотно-откидная, петли слева
  | 'tt_r' // поворотно-откидная, петли справа
  | 'slide_l' // раздвижная влево
  | 'slide_r' // раздвижная вправо

export interface Leaf {
  kind: 'leaf'
  id: string
  opening: Opening
  door?: boolean
  net?: boolean
  panel?: boolean // сэндвич-панель вместо стекла: нет стекла, штапика и створки, площадь идёт в sandwich_m2
  void?: boolean // пустая ячейка (вырез Г-/Т-образного окна): нет стекла, соседи получают раму по этой границе
}
export interface Split {
  kind: 'split'
  id: string
  dir: 'v' | 'h' // v — вертикальные импосты (колонки), h — горизонтальные (ряды)
  sizes: number[] // мм, сумма = ширина (v) или высота (h) области
  children: Node[]
}
export type Node = Leaf | Split

export interface WindowDesign {
  width: number // мм
  height: number // мм
  shape: 'rect' | 'arch'
  archRise?: number // мм, высота арки (стрелка дуги)
  root: Node
}

/** Параметры профильной системы (мм). Значения по умолчанию подобраны по окнам WinStudio. */
export interface Dims {
  frameCut: number // вычет просвета у рамы, на сторону
  impostCut: number // вычет длины импоста, на конец
  sashOverlap: number // нахлёст створки на просвет, на сторону
  sashFace: number // ширина створки до стекла, на сторону
  impostGlass: number // вычет глухого стекла у импоста, на сторону (половина импоста)
}
// sashFace 61.25 и impostGlass 27.5 — по трём окнам WinStudio (1200×1620 и два окна 1500×1500 из записи 13.11.2026).
export const DEFAULT_DIMS: Dims = { frameCut: 47.5, impostCut: 50, sashOverlap: 5.625, sashFace: 61.25, impostGlass: 27.5 }

export const hasSash = (o: Opening) => o !== 'fixed'
export const OPENINGS: Opening[] = ['fixed', 'fixed_sash', 'turn_l', 'turn_r', 'tilt', 'top', 'tt_l', 'tt_r', 'slide_l', 'slide_r']

let counter = 0
export const uid = () => `n${Date.now().toString(36)}${(counter++).toString(36)}`
export const leaf = (opening: Opening = 'fixed'): Leaf => ({ kind: 'leaf', id: uid(), opening })

export function newDesign(width = 1200, height = 1500): WindowDesign {
  return { width, height, shape: 'rect', root: leaf('fixed') }
}

// ---------- раскладка: прямоугольники ячеек и импосты ----------
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
export interface CellBox {
  leaf: Leaf
  rect: Rect
}
export interface Divider {
  dir: 'v' | 'h'
  x1: number
  y1: number
  x2: number
  y2: number
}

export function layout(d: WindowDesign): { cells: CellBox[]; dividers: Divider[] } {
  const cells: CellBox[] = []
  const dividers: Divider[] = []
  const walk = (n: Node, r: Rect) => {
    if (n.kind === 'leaf') {
      cells.push({ leaf: n, rect: r })
      return
    }
    let pos = n.dir === 'v' ? r.x : r.y
    n.children.forEach((child, i) => {
      const size = n.sizes[i]
      const cr = n.dir === 'v' ? { x: pos, y: r.y, w: size, h: r.h } : { x: r.x, y: pos, w: r.w, h: size }
      walk(child, cr)
      pos += size
      if (i < n.children.length - 1)
        dividers.push(n.dir === 'v' ? { dir: 'v', x1: pos, y1: r.y, x2: pos, y2: r.y + r.h } : { dir: 'h', x1: r.x, y1: pos, x2: r.x + r.w, y2: pos })
    })
  }
  walk(d.root, { x: 0, y: 0, w: d.width, h: d.height })
  return { cells, dividers }
}

/** деления с их областями — для подписей размеров частей на чертеже */
export interface SplitBox {
  split: Split
  rect: Rect
  parts: Rect[]
}
export function splitBoxes(d: WindowDesign): SplitBox[] {
  const out: SplitBox[] = []
  const walk = (n: Node, r: Rect) => {
    if (n.kind === 'leaf') return
    let pos = n.dir === 'v' ? r.x : r.y
    const parts = n.sizes.map((size) => {
      const pr = n.dir === 'v' ? { x: pos, y: r.y, w: size, h: r.h } : { x: r.x, y: pos, w: r.w, h: size }
      pos += size
      return pr
    })
    out.push({ split: n, rect: r, parts })
    n.children.forEach((c, i) => walk(c, parts[i]))
  }
  walk(d.root, { x: 0, y: 0, w: d.width, h: d.height })
  return out
}

// ---------- геометрия и метры ----------
export interface Pane {
  leafId: string
  w: number // мм
  h: number
  sash: boolean
}
export interface Measure {
  area_m2: number // габарит
  frame_m: number
  impost_m: number
  sash_m: number
  bead_m: number
  gasket_m: number
  glass_m2: number
  sashes: number
  doors: number
  nets_m2: number
  nets_m: number // периметр створок с сеткой (профиль сетки)
  sandwich_m2: number // площадь сэндвич-панелей
  door_sash_m: number // периметр дверных створок (входит в sash_m; в таблице WinStudio вынесен в свою колонку)
  imposts: number // число отрезков импоста (для коннекторов импоста)
  nets: number // число москитных сеток
  sash_by: Partial<Record<Opening, number>> // оконные (не дверные) створки по типам открывания — для комплектов механики
  panes: Pane[]
}

const r2 = (n: number) => Math.round(n * 100) / 100
const r3 = (n: number) => Math.round(n * 1000) / 1000

/** длина дуги сегмента окружности по хорде и стрелке */
export function arcLength(chord: number, rise: number): number {
  if (rise <= 0) return chord
  const R = (chord * chord) / 4 / (2 * rise) + rise / 2
  return 2 * R * Math.asin(Math.min(1, chord / 2 / R))
}

const inside = (r: Rect, x: number, y: number) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h

/** какие стороны ячейки идут по раме: край габарита или граница с пустой ячейкой (вырез Г/Т) */
export function frameSides(cells: CellBox[], r: Rect, W: number, H: number) {
  const voids = cells.filter((c) => c.leaf.void).map((c) => c.rect)
  const ov = (a1: number, a2: number, b1: number, b2: number) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1))
  // сторона идёт по раме, если вырез занимает не меньше половины соседней длины
  const vSide = (x: number) => voids.filter((v) => x > v.x && x < v.x + v.w).reduce((s, v) => s + ov(r.y, r.y + r.h, v.y, v.y + v.h), 0) >= r.h / 2
  const hSide = (y: number) => voids.filter((v) => y > v.y && y < v.y + v.h).reduce((s, v) => s + ov(r.x, r.x + r.w, v.x, v.x + v.w), 0) >= r.w / 2
  return {
    l: r.x <= 0 || vSide(r.x - 1),
    t: r.y <= 0 || hSide(r.y - 1),
    r: r.x + r.w >= W || vSide(r.x + r.w + 1),
    b: r.y + r.h >= H || hSide(r.y + r.h + 1),
  }
}

/** длина импоста: на каждом делении учитываются только участки, где по обе стороны есть стекло (не вырез) */
export function impostPieces(cells: CellBox[], dividers: Divider[], cut: number): number[] {
  const at = (x: number, y: number) => cells.find((c) => inside(c.rect, x, y))
  const out: number[] = []
  for (const dv of dividers) {
    const v = dv.dir === 'v'
    const a = v ? dv.y1 : dv.x1
    const b = v ? dv.y2 : dv.x2
    const pts = new Set<number>([a, b])
    for (const c of cells) {
      const lo = v ? c.rect.y : c.rect.x
      const hi = lo + (v ? c.rect.h : c.rect.w)
      for (const p of [lo, hi]) if (p > a && p < b) pts.add(p)
    }
    const s = [...pts].sort((x, y) => x - y)
    let run = 0
    const flush = () => {
      if (run > 0) out.push(run - 2 * cut)
      run = 0
    }
    for (let i = 0; i < s.length - 1; i++) {
      const mid = (s[i] + s[i + 1]) / 2
      const c1 = v ? at(dv.x1 - 1, mid) : at(mid, dv.y1 - 1)
      const c2 = v ? at(dv.x1 + 1, mid) : at(mid, dv.y1 + 1)
      if (c1 && c2 && !c1.leaf.void && !c2.leaf.void) run += s[i + 1] - s[i]
      else flush()
    }
    flush()
  }
  return out
}
const impostLength = (cells: CellBox[], dividers: Divider[], cut: number) => impostPieces(cells, dividers, cut).reduce((a, b) => a + b, 0)

export function measure(d: WindowDesign, dims: Dims = DEFAULT_DIMS): Measure {
  const { cells, dividers } = layout(d)
  const W = d.width
  const H = d.height
  const rise = d.shape === 'arch' ? Math.min(d.archRise ?? 0, W / 2, H) : 0

  // периметр Г-/Т-образного (ортогонально-выпуклого) контура равен периметру габарита
  const framePerimeter = rise > 0 ? 2 * (H - rise) + W + arcLength(W, rise) : 2 * (W + H)
  const impostList = impostPieces(cells, dividers, dims.impostCut)
  const impost = impostList.reduce((a, b) => a + b, 0)
  const sashBy: Partial<Record<Opening, number>> = {}
  let netCount = 0
  const voidArea = cells.filter((c) => c.leaf.void).reduce((s, c) => s + c.rect.w * c.rect.h, 0)

  const panes: Pane[] = []
  let bead = 0
  let sashPerim = 0
  let sashes = 0
  let doors = 0
  let nets = 0
  let netsPerim = 0
  let sandwich = 0
  let doorPerim = 0
  for (const { leaf: lf, rect } of cells) {
    if (lf.void) continue
    const fs = frameSides(cells, rect, W, H)
    const cut = (touchesFrame: boolean) => (touchesFrame ? dims.frameCut : 0)
    const cw = rect.w - cut(fs.l) - cut(fs.r)
    const ch = rect.h - cut(fs.t) - cut(fs.b)
    if (lf.panel) {
      sandwich += (cw * ch) / 1e6
      continue
    }
    if (hasSash(lf.opening)) {
      const sw = cw + 2 * dims.sashOverlap
      const sh = ch + 2 * dims.sashOverlap
      const gw = sw - 2 * dims.sashFace
      const gh = sh - 2 * dims.sashFace
      sashPerim += 2 * (sw + sh)
      if (lf.door) doorPerim += 2 * (sw + sh)
      else sashBy[lf.opening] = (sashBy[lf.opening] ?? 0) + 1
      if (lf.net) netCount += 1
      bead += 2 * (gw + gh)
      panes.push({ leafId: lf.id, w: gw, h: gh, sash: true })
      sashes += 1
      if (lf.net) {
        nets += (sw * sh) / 1e6
        netsPerim += 2 * (sw + sh)
      }
    } else {
      // глухое стекло: у импоста вычет половины импоста (у рамы — frameCut, он уже учтён в cw/ch)
      const gw = cw - dims.impostGlass * ((fs.l ? 0 : 1) + (fs.r ? 0 : 1))
      const gh = ch - dims.impostGlass * ((fs.t ? 0 : 1) + (fs.b ? 0 : 1))
      bead += 2 * (gw + gh)
      panes.push({ leafId: lf.id, w: gw, h: gh, sash: false })
    }
    if (lf.door) doors += 1
  }

  return {
    area_m2: r2((W * H - voidArea) / 1e6),
    frame_m: r2(framePerimeter / 1000),
    impost_m: r2(impost / 1000),
    sash_m: r2(sashPerim / 1000),
    bead_m: r2(bead / 1000),
    gasket_m: r2((bead + 2 * sashPerim) / 1000),
    glass_m2: r3(panes.reduce((s, p) => s + (p.w * p.h) / 1e6, 0)),
    sashes,
    doors,
    nets_m2: r3(nets),
    nets_m: r2(netsPerim / 1000),
    sandwich_m2: r3(sandwich),
    door_sash_m: r2(doorPerim / 1000),
    imposts: impostList.length,
    nets: netCount,
    sash_by: sashBy,
    panes,
  }
}

// ---------- правка дерева (иммутабельно) ----------
function mapNode(n: Node, id: string, fn: (n: Node) => Node): Node {
  if (n.id === id) return fn(n)
  if (n.kind === 'split') return { ...n, children: n.children.map((c) => mapNode(c, id, fn)) }
  return n
}
function findParent(n: Node, id: string): Split | null {
  if (n.kind !== 'split') return null
  if (n.children.some((c) => c.id === id)) return n
  for (const c of n.children) {
    const p = findParent(c, id)
    if (p) return p
  }
  return null
}
export function findNode(n: Node, id: string): Node | null {
  if (n.id === id) return n
  if (n.kind === 'split') for (const c of n.children) {
    const f = findNode(c, id)
    if (f) return f
  }
  return null
}

/** размер ячейки по направлению (для деления пополам) */
function cellSpan(d: WindowDesign, id: string, dir: 'v' | 'h'): number {
  const c = layout(d).cells.find((x) => x.leaf.id === id)
  return c ? (dir === 'v' ? c.rect.w : c.rect.h) : 0
}

/** разделить ячейку на parts равных частей импостами */
export function splitLeaf(d: WindowDesign, leafId: string, dir: 'v' | 'h', parts = 2): WindowDesign {
  const span = cellSpan(d, leafId, dir)
  if (!span) return d
  const base = Math.floor(span / parts)
  const sizes = Array.from({ length: parts }, (_, i) => (i === parts - 1 ? span - base * (parts - 1) : base))
  return {
    ...d,
    root: mapNode(d.root, leafId, (n) => ({
      kind: 'split',
      id: uid(),
      dir,
      sizes,
      children: [n, ...Array.from({ length: parts - 1 }, () => leaf((n as Leaf).opening))],
    })),
  }
}

/** разделить ячейку сеткой: cols×rows равных клеток (cols−1 вертикальных и rows−1 горизонтальных импостов) */
export function gridLeaf(d: WindowDesign, leafId: string, cols: number, rows: number): WindowDesign {
  let out = d
  const src = findNode(d.root, leafId) as Leaf | null
  if (!src || (cols < 2 && rows < 2)) return d
  if (cols >= 2) out = splitLeaf(out, leafId, 'v', cols)
  if (rows >= 2) {
    // после деления на колонки id исходной ячейки остался у первой колонки; клетки — по раскладке в её прежней области
    const area = layout(d).cells.find((c) => c.leaf.id === leafId)!.rect
    const ids = layout(out).cells.filter((c) => c.rect.x >= area.x && c.rect.x < area.x + area.w && c.rect.y >= area.y && c.rect.y < area.y + area.h).map((c) => c.leaf.id)
    for (const id of ids) out = splitLeaf(out, id, 'h', rows)
  }
  return out
}

/** убрать деление, в котором находится ячейка (объединить соседей в одну ячейку) */
export function mergeParent(d: WindowDesign, leafId: string): WindowDesign {
  const parent = findParent(d.root, leafId)
  if (!parent) return d
  const keep = findNode(parent, leafId) as Leaf
  return { ...d, root: mapNode(d.root, parent.id, () => ({ ...keep, id: uid() })) }
}

export function updateLeaf(d: WindowDesign, leafId: string, patch: Partial<Leaf>): WindowDesign {
  return { ...d, root: mapNode(d.root, leafId, (n) => ({ ...(n as Leaf), ...patch })) }
}

const MIN = 100
/** изменить размер части деления; разницу забирает соседняя часть */
export function setPartSize(d: WindowDesign, splitId: string, index: number, value: number): WindowDesign {
  return {
    ...d,
    root: mapNode(d.root, splitId, (n) => {
      const s = n as Split
      const sizes = [...s.sizes]
      const j = index < sizes.length - 1 ? index + 1 : index - 1
      const total = sizes[index] + sizes[j]
      const v = Math.max(MIN, Math.min(Math.round(value), total - MIN))
      sizes[index] = v
      sizes[j] = total - v
      return { ...s, sizes }
    }),
  }
}

/** новый габарит: все деления масштабируются пропорционально */
export function resize(d: WindowDesign, width: number, height: number): WindowDesign {
  const scale = (n: Node, w: number, h: number): Node => {
    if (n.kind === 'leaf') return n
    const total = n.dir === 'v' ? w : h
    const old = n.sizes.reduce((a, b) => a + b, 0)
    const sizes = n.sizes.map((s) => Math.round((s / old) * total))
    sizes[sizes.length - 1] = total - sizes.slice(0, -1).reduce((a, b) => a + b, 0)
    return {
      ...n,
      sizes,
      children: n.children.map((c, i) => (n.dir === 'v' ? scale(c, sizes[i], h) : scale(c, w, sizes[i]))),
    }
  }
  return { ...d, width, height, root: scale(d.root, width, height) }
}

/** есть ли деление с неравными частями (тогда после смены габарита спрашиваем «Уравнять размеры?») */
export function hasUnequalParts(d: WindowDesign): boolean {
  const walk = (n: Node): boolean =>
    n.kind === 'split' && (Math.max(...n.sizes) - Math.min(...n.sizes) > 1 || n.children.some(walk))
  return walk(d.root)
}

/** уравнять размеры: все части каждого деления получают поровну (остаток — последней части) */
export function equalize(d: WindowDesign): WindowDesign {
  const walk = (n: Node, w: number, h: number): Node => {
    if (n.kind === 'leaf') return n
    const total = n.dir === 'v' ? w : h
    const cnt = n.children.length
    const base = Math.floor(total / cnt)
    const sizes = n.sizes.map((_, i) => (i === cnt - 1 ? total - base * (cnt - 1) : base))
    return { ...n, sizes, children: n.children.map((c, i) => (n.dir === 'v' ? walk(c, sizes[i], h) : walk(c, w, sizes[i]))) }
  }
  return { ...d, root: walk(d.root, d.width, d.height) }
}

/** Проблемы чертежа, при которых цену и стекло считать нельзя: 'size' — габарит вне 200…6000 мм, 'pane' — стекло меньше 50 мм (отрицательные/нулевые панели). */
export function designProblems(d: WindowDesign, dims: Dims = DEFAULT_DIMS): ('size' | 'pane')[] {
  const out: ('size' | 'pane')[] = []
  if (!(d.width >= 200 && d.width <= 6000) || !(d.height >= 200 && d.height <= 6000)) out.push('size')
  if (measure(d, dims).panes.some((p) => !(p.w >= 50 && p.h >= 50))) out.push('pane')
  return out
}
