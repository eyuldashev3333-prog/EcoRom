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
  /** импосты внутри ячейки (левая колонка окна «импосты / открывание» в WinStudio): одна створка или одно глухое стекло, поделённые импостами */
  sub?: LeafSub
  /** при импостах внутри ячейки сэндвич-панель задаётся отдельно для каждой части (как в окне «импосты / открывание» WinStudio) */
  panels?: boolean[]
}
export interface LeafSub {
  dir: 'v' | 'h' // v — вертикальные импосты (части рядом), h — горизонтальные
  parts: number // число частей: 2 (один импост) или 3 (два импоста)
  /** размеры частей по оси деления, мм, от наружного края створки (у глухого стекла — от края стекла); без них — поровну */
  sizes?: number[]
}
export interface Split {
  kind: 'split'
  id: string
  dir: 'v' | 'h' // v — вертикальные импосты (колонки), h — горизонтальные (ряды)
  sizes: number[] // мм, сумма = ширина (v) или высота (h) области
  children: Node[]
  /** рамы соединены: это не импост, а граница отдельных рам составного окна (Г-, Т-, ступенчатые шаблоны WinStudio); метры считаются по каждой раме */
  join?: boolean
}
export type Node = Leaf | Split

export interface WindowDesign {
  width: number // мм
  height: number // мм
  shape: 'rect' | 'arch'
  archRise?: number // мм, высота арки (стрелка дуги)
  root: Node
}

/**
 * Параметры профильной системы (мм) — все отступы считаются от края ячейки (у рамы — от наружной кромки габарита,
 * у импоста — от его оси). Значения сняты замерами WinStudio V44.4 на сотнях изделий (docs/winstudio-study/FINDINGS.md).
 */
export interface Dims {
  frameFace: number // глухое стекло/панель: отступ от рамы, на сторону
  impostFace: number // глухое стекло/панель: отступ от оси импоста, на сторону
  impostCut: number // вычет длины импоста на конце у рамы или выреза
  impostCutT: number // вычет длины импоста на конце, упирающемся в другой импост (Т-стык)
  sashFrame: number // габарит створки: отступ от рамы, на сторону
  sashImpost: number // габарит створки: отступ от оси импоста, на сторону
  glassSash: number // стекло/панель в створке окна: отступ от наружного края створки, на сторону
  glassDoor: number // то же в дверной створке
  beadWidth: number // только чертёж: светлая полоска штапика между контуром и видимым стеклом
  subFace: number // стекло рядом с импостом внутри ячейки: отступ от оси импоста, на сторону
  /** видимая ширина профиля для площади ламинации, мм: внутренняя и внешняя сторона (подобрано по замерам WinStudio) */
  lamIn: { frame: number; sash: number; door: number; impost: number }
  lamOut: { frame: number; sash: number; door: number; impost: number }
}
export const DEFAULT_DIMS: Dims = { frameFace: 48, impostFace: 26, impostCut: 48, impostCutT: 26, sashFrame: 35, sashImpost: 13, glassSash: 62, glassDoor: 94, beadWidth: 15, subFace: 26,
  // подбор по точным пробам (цена ламинации 1 000 000, 6 окон; docs/winstudio-study/lam_exact.txt): снаружи целые значения, остаток 0; внутри остаток ≤ 0,002 м²
  lamIn: { frame: 73.24, sash: 72.24, door: 103.14, impost: 102.23 },
  lamOut: { frame: 75, sash: 76, door: 108, impost: 106 },
}

/** слои одной ячейки на чертеже: створка (если есть), контур стекла/панели (по нему считаются штапик и стекло) и видимое стекло */
export interface LeafLayers {
  sash: Rect | null
  contour: Rect
  glass: Rect
}
export function leafLayers(rect: Rect, fs: { l: boolean; t: boolean; r: boolean; b: boolean }, lf: Leaf, dims: Dims = DEFAULT_DIMS): LeafLayers {
  const side = (touchesFrame: boolean, atFrame: number, atImpost: number) => (touchesFrame ? atFrame : atImpost)
  const grow = (r: Rect, l: number, t: number, rr: number, b: number): Rect => ({ x: r.x + l, y: r.y + t, w: r.w - l - rr, h: r.h - t - b })
  const bead = (r: Rect): Rect => grow(r, dims.beadWidth, dims.beadWidth, dims.beadWidth, dims.beadWidth)
  if (hasSash(lf.opening)) {
    const sash = grow(rect, side(fs.l, dims.sashFrame, dims.sashImpost), side(fs.t, dims.sashFrame, dims.sashImpost), side(fs.r, dims.sashFrame, dims.sashImpost), side(fs.b, dims.sashFrame, dims.sashImpost))
    const g = lf.door ? dims.glassDoor : dims.glassSash
    const contour = grow(sash, g, g, g, g)
    return { sash, contour, glass: bead(contour) }
  }
  const contour = grow(rect, side(fs.l, dims.frameFace, dims.impostFace), side(fs.t, dims.frameFace, dims.impostFace), side(fs.r, dims.frameFace, dims.impostFace), side(fs.b, dims.frameFace, dims.impostFace))
  return { sash: null, contour, glass: bead(contour) }
}

/** раскладка импостов внутри ячейки: части (стёкла) и тела импостов; null — деления нет */
export interface SubLayout {
  ref: Rect // от неё отсчитываются размеры частей: створка, а у глухого стекла — контур стекла
  sizes: number[] // размеры частей по оси деления, мм
  axes: number[] // оси импостов (абсолютные координаты по оси деления)
  panes: Rect[] // контуры стёкол/панелей (по ним штапик и стекло)
  bars: Rect[] // тела импостов между стёклами
  impostLen: number // длина детали импоста
}
export function subLayout(lf: Leaf, ly: LeafLayers, dims: Dims = DEFAULT_DIMS): SubLayout | null {
  const sub = lf.sub
  if (!sub || sub.parts < 2) return null
  const ref = ly.sash ?? ly.contour
  const v = sub.dir === 'v'
  const span = v ? ref.w : ref.h
  const n = Math.round(sub.parts)
  let sizes = sub.sizes && sub.sizes.length === n && sub.sizes.every((s) => s > 0) ? [...sub.sizes] : Array.from({ length: n }, () => span / n)
  // последняя часть забирает остаток (сумма частей = размер по оси деления)
  sizes = sizes.map((s, i) => (i === n - 1 ? span - sizes.slice(0, -1).reduce((a, b) => a + b, 0) : s))
  const c = ly.contour
  const start = v ? ref.x : ref.y
  const axes: number[] = []
  let pos = start
  for (let i = 0; i < n - 1; i++) {
    pos += sizes[i]
    axes.push(pos)
  }
  const cs = v ? c.x : c.y
  const ce = cs + (v ? c.w : c.h)
  const f = dims.subFace
  const panes: Rect[] = []
  const bars: Rect[] = []
  for (let i = 0; i < n; i++) {
    const a = i === 0 ? cs : axes[i - 1] + f
    const b = i === n - 1 ? ce : axes[i] - f
    panes.push(v ? { x: a, y: c.y, w: b - a, h: c.h } : { x: c.x, y: a, w: c.w, h: b - a })
    if (i < n - 1) bars.push(v ? { x: axes[i] - f, y: c.y, w: 2 * f, h: c.h } : { x: c.x, y: axes[i] - f, w: c.w, h: 2 * f })
  }
  return { ref, sizes, axes, panes, bars, impostLen: v ? c.h : c.w }
}
/** часть ячейки k — сэндвич-панель (без импостов внутри ячейки часть одна) */
export const isPanel = (lf: Leaf, k: number): boolean => (lf.sub ? !!lf.panels?.[k] : !!lf.panel)

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

export function layout(d: WindowDesign): { cells: CellBox[]; dividers: Divider[]; joins: Divider[]; frames: Rect[] } {
  const cells: CellBox[] = []
  const dividers: Divider[] = [] // импосты внутри рамы
  const joins: Divider[] = [] // границы между соединёнными рамами
  const frames: Rect[] = [] // прямоугольники отдельных рам (у обычного окна — одна, по габариту)
  const walk = (n: Node, r: Rect, atFrameLevel: boolean) => {
    if (n.kind === 'leaf') {
      if (atFrameLevel && !n.void) frames.push(r)
      cells.push({ leaf: n, rect: r })
      return
    }
    const isJoin = !!n.join
    // деление-импост верхнего уровня открывает раму; дальше вниз границы рам не ищем
    if (atFrameLevel && !isJoin) frames.push(r)
    let pos = n.dir === 'v' ? r.x : r.y
    n.children.forEach((child, i) => {
      const size = n.sizes[i]
      const cr = n.dir === 'v' ? { x: pos, y: r.y, w: size, h: r.h } : { x: r.x, y: pos, w: r.w, h: size }
      walk(child, cr, atFrameLevel && isJoin)
      pos += size
      if (i < n.children.length - 1) {
        const line: Divider = n.dir === 'v' ? { dir: 'v', x1: pos, y1: r.y, x2: pos, y2: r.y + r.h } : { dir: 'h', x1: r.x, y1: pos, x2: r.x + r.w, y2: pos }
        ;(isJoin ? joins : dividers).push(line)
      }
    })
  }
  walk(d.root, { x: 0, y: 0, w: d.width, h: d.height }, true)
  return { cells, dividers, joins, frames }
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
/** габарит створки (внешний размер профиля створки), мм */
export interface SashRect {
  leafId: string
  w: number
  h: number
  door: boolean
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
  lam_in_m2: number // площадь ламинации внутри (видимый профиль: длина × ширина), колонка «ламин.внутр.»
  lam_out_m2: number // площадь ламинации снаружи, колонка «ламин.внеш.»
  imposts: number // число отрезков импоста (для коннекторов импоста)
  impostList: number[] // длины всех деталей импоста, мм (в т.ч. импосты внутри ячейки) — для раскроя
  nets: number // число москитных сеток
  sash_by: Partial<Record<Opening, number>> // оконные (не дверные) створки по типам открывания
  sash_all_by: Partial<Record<Opening, number>> // все створки (и дверные) по типам открывания — для комплектов механики и ручек (как в WinStudio)
  panes: Pane[]
  sashRects: SashRect[] // габариты всех створок (для раскроя)
  // точные (неокруглённые) значения: WinStudio умножает цену на них, а на экране показывает округлённые (проверено живыми пробами 23.11.2026)
  exact: { area_m2: number; frame_m: number; impost_m: number; sash_m: number; bead_m: number; gasket_m: number; door_sash_m: number; nets_m: number; glass_m2: number; nets_m2: number; sandwich_m2: number }
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

/**
 * какие стороны ячейки идут по раме: край габарита, граница с пустой ячейкой (вырез Г/Т)
 * или граница соединённых рам (joins: у каждой рамы свой профиль)
 */
export function frameSides(cells: CellBox[], r: Rect, W: number, H: number, joins: Divider[] = []) {
  const voids = cells.filter((c) => c.leaf.void).map((c) => c.rect)
  const ov = (a1: number, a2: number, b1: number, b2: number) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1))
  // сторона идёт по раме, если вырез занимает не меньше половины соседней длины
  const vSide = (x: number) => voids.filter((v) => x > v.x && x < v.x + v.w).reduce((s, v) => s + ov(r.y, r.y + r.h, v.y, v.y + v.h), 0) >= r.h / 2
  const hSide = (y: number) => voids.filter((v) => y > v.y && y < v.y + v.h).reduce((s, v) => s + ov(r.x, r.x + r.w, v.x, v.x + v.w), 0) >= r.w / 2
  // сторона лежит на линии соединения рам: вертикальная линия x с покрытием по y, горизонтальная — по x
  const onJoin = (dir: 'v' | 'h', pos: number) =>
    joins.some((j) => j.dir === dir && (dir === 'v' ? j.x1 === pos && j.y1 <= r.y && j.y2 >= r.y + r.h : j.y1 === pos && j.x1 <= r.x && j.x2 >= r.x + r.w))
  return {
    l: r.x <= 0 || vSide(r.x - 1) || onJoin('v', r.x),
    t: r.y <= 0 || hSide(r.y - 1) || onJoin('h', r.y),
    r: r.x + r.w >= W || vSide(r.x + r.w + 1) || onJoin('v', r.x + r.w),
    b: r.y + r.h >= H || hSide(r.y + r.h + 1) || onJoin('h', r.y + r.h),
  }
}

/**
 * Длины деталей импоста. На каждом делении учитываются только участки, где по обе стороны есть стекло (не вырез).
 * Конец у рамы или у выреза короче на impostCut (48), конец, упирающийся в другой импост (Т-стык), — на impostCutT (26).
 * Правило подтверждено на всех шаблонах каталога WinStudio (68 схем с импостами, 0 расхождений).
 */
export function impostPieces(cells: CellBox[], dividers: Divider[], W: number, H: number, dims: Dims = DEFAULT_DIMS, joins: Divider[] = []): number[] {
  const at = (x: number, y: number) => cells.find((c) => inside(c.rect, x, y))
  const solid = (c: CellBox | undefined) => !!c && !c.leaf.void
  const out: number[] = []
  for (const dv of dividers) {
    const v = dv.dir === 'v'
    const a = v ? dv.y1 : dv.x1
    const b = v ? dv.y2 : dv.x2
    const lim = v ? H : W
    const pts = new Set<number>([a, b])
    for (const c of cells) {
      const lo = v ? c.rect.y : c.rect.x
      const hi = lo + (v ? c.rect.h : c.rect.w)
      for (const p of [lo, hi]) if (p > a && p < b) pts.add(p)
    }
    const s = [...pts].sort((x, y) => x - y)
    // конец упирается в границу соединённых рам: это рама, а не импост
    const atJoin = (p: number) =>
      joins.some((j) => (v ? j.dir === 'h' && j.y1 === p && j.x1 <= dv.x1 && j.x2 >= dv.x1 : j.dir === 'v' && j.x1 === p && j.y1 <= dv.y1 && j.y2 >= dv.y1))
    // вычет на конце отрезка p: у габарита, выреза и границы рам — как у рамы, у конца деления внутри окна — как у импоста
    const endCut = (p: number) => {
      if (p <= 0 || p >= lim || atJoin(p)) return dims.impostCut
      if (p !== a && p !== b) return dims.impostCut // граница выреза
      const beyond = p === a ? p - 1 : p + 1
      const c1 = v ? at(dv.x1 - 1, beyond) : at(beyond, dv.y1 - 1)
      const c2 = v ? at(dv.x1 + 1, beyond) : at(beyond, dv.y1 + 1)
      return solid(c1) && solid(c2) ? dims.impostCutT : dims.impostCut
    }
    let start: number | null = null
    const flush = (end: number) => {
      if (start !== null) out.push(end - start - endCut(start) - endCut(end))
      start = null
    }
    for (let i = 0; i < s.length - 1; i++) {
      const mid = (s[i] + s[i + 1]) / 2
      const c1 = v ? at(dv.x1 - 1, mid) : at(mid, dv.y1 - 1)
      const c2 = v ? at(dv.x1 + 1, mid) : at(mid, dv.y1 + 1)
      if (solid(c1) && solid(c2)) {
        if (start === null) start = s[i]
      } else flush(s[i])
    }
    flush(s[s.length - 1])
  }
  return out
}

export function measure(d: WindowDesign, dims: Dims = DEFAULT_DIMS): Measure {
  const { cells, dividers, joins, frames } = layout(d)
  const W = d.width
  const H = d.height
  const rise = d.shape === 'arch' ? Math.min(d.archRise ?? 0, W / 2, H) : 0

  // рама одна: периметр габарита (у Г-/Т-образного выреза он тот же); у соединённых рам — сумма периметров каждой рамы
  const framePerimeter = rise > 0 ? 2 * (H - rise) + W + arcLength(W, rise) : frames.reduce((s, f) => s + 2 * (f.w + f.h), 0)
  const framesArea = frames.reduce((s, f) => s + f.w * f.h, 0)
  const impostList = impostPieces(cells, dividers, W, H, dims, joins)
  const sashBy: Partial<Record<Opening, number>> = {}
  const sashAllBy: Partial<Record<Opening, number>> = {}
  let netCount = 0
  // вырезы (пустые ячейки) внутри рам вычитаются из площади; вырезы вне рам составного окна в площадь не входят
  const ovl = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  const voidArea = cells.filter((c) => c.leaf.void).reduce((s, c) => s + frames.reduce((t, f) => t + ovl(c.rect, f), 0), 0)

  const panes: Pane[] = []
  const sashRects: SashRect[] = []
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
    const fs = frameSides(cells, rect, W, H, joins)
    // слои ячейки: створка 35 мм от рамы / 13 от оси импоста; стекло/панель в створке 62 (в двери 94) от её края;
    // глухое стекло/панель 48 от рамы, 26 от оси импоста
    const layers = leafLayers(rect, fs, lf, dims)
    const gw = layers.contour.w
    const gh = layers.contour.h
    if (layers.sash) {
      const sw = layers.sash.w
      const sh = layers.sash.h
      sashPerim += 2 * (sw + sh)
      if (lf.door) doorPerim += 2 * (sw + sh)
      else sashBy[lf.opening] = (sashBy[lf.opening] ?? 0) + 1
      sashAllBy[lf.opening] = (sashAllBy[lf.opening] ?? 0) + 1
      if (lf.net) netCount += 1
      sashes += 1
      sashRects.push({ leafId: lf.id, w: sw, h: sh, door: !!lf.door })
      if (lf.net) {
        nets += (sw * sh) / 1e6
        netsPerim += 2 * (sw + sh)
      }
    }
    // штапик идёт и у сэндвич-панели (как у стекла); площадь панели считается отдельно от стекла
    // импосты внутри ячейки делят стекло на части: штапик и стекло считаются по каждой части, импост — отдельная деталь
    const sb = subLayout(lf, layers, dims)
    const partsR = sb ? sb.panes : [layers.contour]
    partsR.forEach((pr, k) => {
      bead += 2 * (pr.w + pr.h)
      if (isPanel(lf, k)) sandwich += (pr.w * pr.h) / 1e6
      else panes.push({ leafId: lf.id, w: pr.w, h: pr.h, sash: hasSash(lf.opening) })
    })
    if (sb) for (let i = 0; i < sb.bars.length; i++) impostList.push(sb.impostLen)
    if (lf.door) doors += 1
  }

  const impost = impostList.reduce((a, b) => a + b, 0)
  // ламинация: видимый профиль = длина детали × его ширина (рама, створка, дверная створка, импост)
  const lamArea = (w: Dims['lamIn']) => (framePerimeter * w.frame + (sashPerim - doorPerim) * w.sash + doorPerim * w.door + impost * w.impost) / 1e6

  return {
    area_m2: r2((framesArea - voidArea) / 1e6),
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
    lam_in_m2: r3(lamArea(dims.lamIn)),
    lam_out_m2: r3(lamArea(dims.lamOut)),
    imposts: impostList.length,
    impostList,
    nets: netCount,
    sash_by: sashBy,
    sash_all_by: sashAllBy,
    panes,
    sashRects,
    exact: {
      area_m2: (framesArea - voidArea) / 1e6,
      frame_m: framePerimeter / 1000,
      impost_m: impost / 1000,
      sash_m: sashPerim / 1000,
      bead_m: bead / 1000,
      gasket_m: (bead + 2 * sashPerim) / 1000,
      door_sash_m: doorPerim / 1000,
      nets_m: netsPerim / 1000,
      glass_m2: panes.reduce((s, p) => s + (p.w * p.h) / 1e6, 0),
      nets_m2: nets,
      sandwich_m2: r3(sandwich), // WinStudio считает цену панели по площади, округлённой до 3 знаков (проба: 0.998 при 0.998016)
    },
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

/** размер первой части ячейки с импостами внутри; остальные части делят остаток поровну */
export function setSubSize(d: WindowDesign, leafId: string, index: number, value: number): WindowDesign {
  const lf = findNode(d.root, leafId) as Leaf | null
  if (!lf || lf.kind !== 'leaf' || !lf.sub) return d
  const cell = layout(d).cells.find((c) => c.leaf.id === leafId)
  if (!cell) return d
  const fs = frameSides(layout(d).cells, cell.rect, d.width, d.height, layout(d).joins)
  const sb = subLayout(lf, leafLayers(cell.rect, fs, lf))
  if (!sb || index !== 0) return d
  const span = sb.sizes.reduce((a, b) => a + b, 0)
  const n = lf.sub.parts
  const first = Math.max(100, Math.min(Math.round(value), span - 100 * (n - 1)))
  const rest = (span - first) / (n - 1)
  return updateLeaf(d, leafId, { sub: { ...lf.sub, sizes: [first, ...Array.from({ length: n - 1 }, () => rest)] } })
}
/** задать (или снять) импосты внутри ячейки: части делятся поровну по текущему размеру створки/стекла; при смене размера окна первые части сохраняют размер, последняя забирает остаток */
export function withSub(d: WindowDesign, leafId: string, spec: { dir: 'v' | 'h'; parts: number } | null, panels?: boolean[]): WindowDesign {
  const lf = findNode(d.root, leafId) as Leaf | null
  if (!lf || lf.kind !== 'leaf') return d
  if (!spec) return updateLeaf(d, leafId, { sub: undefined, panels: undefined })
  const lay = layout(d)
  const cell = lay.cells.find((c) => c.leaf.id === leafId)
  if (!cell) return d
  const ly = leafLayers(cell.rect, frameSides(lay.cells, cell.rect, d.width, d.height, lay.joins), lf)
  const ref = ly.sash ?? ly.contour
  const span = spec.dir === 'v' ? ref.w : ref.h
  return updateLeaf(d, leafId, { sub: { dir: spec.dir, parts: spec.parts, sizes: Array.from({ length: spec.parts }, () => span / spec.parts) }, panels: panels ?? Array.from({ length: spec.parts }, () => false) })
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
