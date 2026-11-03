// Перспектива «окно на фото»: проективное преобразование единичного квадрата в четырёхугольник (4 угла проёма на фото)
// и отрисовка текстуры окна на canvas разбиением на треугольники (без WebGL — работает везде, одинаково для экрана и экспорта).
export interface Pt {
  x: number
  y: number
}

/** 3×3 (в виде a..h): X = (a·u + b·v + c)/(g·u + h·v + 1), Y = (d·u + e·v + f)/(g·u + h·v + 1) */
export interface Homography {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
  g: number
  h: number
}

/** углы по часовой: p0 верх-лево ↔ (0,0), p1 верх-право ↔ (1,0), p2 низ-право ↔ (1,1), p3 низ-лево ↔ (0,1) (метод Хекберта) */
export function squareToQuad(p0: Pt, p1: Pt, p2: Pt, p3: Pt): Homography {
  const dx1 = p1.x - p2.x
  const dx2 = p3.x - p2.x
  const dx3 = p0.x - p1.x + p2.x - p3.x
  const dy1 = p1.y - p2.y
  const dy2 = p3.y - p2.y
  const dy3 = p0.y - p1.y + p2.y - p3.y
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    return { a: p1.x - p0.x, b: p2.x - p1.x, c: p0.x, d: p1.y - p0.y, e: p2.y - p1.y, f: p0.y, g: 0, h: 0 } // аффинный случай (параллелограмм)
  }
  const det = dx1 * dy2 - dx2 * dy1
  const g = (dx3 * dy2 - dx2 * dy3) / det
  const h = (dx1 * dy3 - dx3 * dy1) / det
  return { a: p1.x - p0.x + g * p1.x, b: p3.x - p0.x + h * p3.x, c: p0.x, d: p1.y - p0.y + g * p1.y, e: p3.y - p0.y + h * p3.y, f: p0.y, g, h }
}

export function applyH(H: Homography, u: number, v: number): Pt {
  const w = H.g * u + H.h * v + 1
  return { x: (H.a * u + H.b * v + H.c) / w, y: (H.d * u + H.e * v + H.f) / w }
}

/** выпуклый четырёхугольник без самопересечений (иначе перспектива бессмысленна) */
export function isConvexQuad(q: Pt[]): boolean {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = q[i]
    const b = q[(i + 1) % 4]
    const c = q[(i + 2) % 4]
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (Math.abs(cross) < 1e-6) return false
    const s = cross > 0 ? 1 : -1
    if (sign && s !== sign) return false
    sign = s
  }
  return true
}

export interface Range {
  u0: number
  u1: number
  v0: number
  v1: number
}
export interface Raster {
  width: number
  height: number
  data: Uint8ClampedArray // RGBA
}

/** обратное преобразование: точка на фото (x,y) → координата (u,v) окна; null — точка «на горизонте» */
export function invertH(H: Homography): (x: number, y: number) => Pt | null {
  // матрица M = [[a b c],[d e f],[g h 1]]; обратная — через присоединённую (знаменатель общий, масштаб не важен)
  const { a, b, c, d, e, f, g, h } = H
  const A = e - f * h
  const B = c * h - b
  const C = b * f - c * e
  const D = f * g - d
  const E = a - c * g
  const F = c * d - a * f
  const G = d * h - e * g
  const Hh = b * g - a * h
  const I = a * e - b * d
  return (x, y) => {
    const w = G * x + Hh * y + I
    if (Math.abs(w) < 1e-12) return null
    return { x: (A * x + B * y + C) / w, y: (D * x + E * y + F) / w }
  }
}

/** текстура с умноженным на альфу цветом — для корректной интерполяции на прозрачных краях */
export function premultiply(src: Raster): Raster {
  const out = new Uint8ClampedArray(src.data.length)
  for (let i = 0; i < src.data.length; i += 4) {
    const al = src.data[i + 3] / 255
    out[i] = src.data[i] * al
    out[i + 1] = src.data[i + 1] * al
    out[i + 2] = src.data[i + 2] * al
    out[i + 3] = src.data[i + 3]
  }
  return { width: src.width, height: src.height, data: out }
}

/**
 * Наложение текстуры через проективное преобразование «точно по пикселям»: для каждого пикселя фото берём цвет из текстуры
 * по обратному преобразованию (билинейно, усреднение ss×ss под-отсчётов — без «лесенки» и без швов).
 * Возвращает RGBA-растр охватывающего прямоугольника четырёхугольника (с полями текстуры) в координатах фото.
 */
export function warpTexture(tex: Raster, H: Homography, range: Range, photoW: number, photoH: number, ss = 2): { x: number; y: number; raster: Raster } | null {
  const pm = tex // ожидается premultiply(tex)
  const inv = invertH(H)
  // охват: углы текстуры → фото
  const corners = [applyH(H, range.u0, range.v0), applyH(H, range.u1, range.v0), applyH(H, range.u1, range.v1), applyH(H, range.u0, range.v1)]
  if (corners.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x))))
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y))))
  const x1 = Math.min(photoW, Math.ceil(Math.max(...corners.map((p) => p.x))))
  const y1 = Math.min(photoH, Math.ceil(Math.max(...corners.map((p) => p.y))))
  const w = x1 - x0
  const h = y1 - y0
  if (w <= 0 || h <= 0) return null
  const out = new Uint8ClampedArray(w * h * 4)
  const du = range.u1 - range.u0
  const dv = range.v1 - range.v0
  const sample = (u: number, v: number, acc: number[]) => {
    const fx = ((u - range.u0) / du) * pm.width - 0.5
    const fy = ((v - range.v0) / dv) * pm.height - 0.5
    if (fx < -1 || fy < -1 || fx > pm.width || fy > pm.height) return
    const ix = Math.floor(fx)
    const iy = Math.floor(fy)
    const tx = fx - ix
    const ty = fy - iy
    for (let k = 0; k < 4; k++) {
      const wx = k & 1 ? tx : 1 - tx
      const wy = k & 2 ? ty : 1 - ty
      const px = ix + (k & 1)
      const py = iy + (k >> 1)
      if (px < 0 || py < 0 || px >= pm.width || py >= pm.height) continue // за краем текстуры — прозрачно
      const o = (py * pm.width + px) * 4
      const wgt = wx * wy
      acc[0] += pm.data[o] * wgt
      acc[1] += pm.data[o + 1] * wgt
      acc[2] += pm.data[o + 2] * wgt
      acc[3] += pm.data[o + 3] * wgt
    }
  }
  const acc = [0, 0, 0, 0]
  const n = ss * ss
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      acc[0] = acc[1] = acc[2] = acc[3] = 0
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const p = inv(x0 + x + (sx + 0.5) / ss, y0 + y + (sy + 0.5) / ss)
          if (p && p.x >= range.u0 - 1e-9 && p.x <= range.u1 + 1e-9 && p.y >= range.v0 - 1e-9 && p.y <= range.v1 + 1e-9) sample(p.x, p.y, acc)
        }
      }
      const al = acc[3] / n
      if (al <= 0.5) continue
      const o = (y * w + x) * 4
      out[o] = (acc[0] / n / al) * 255
      out[o + 1] = (acc[1] / n / al) * 255
      out[o + 2] = (acc[2] / n / al) * 255
      out[o + 3] = al
    }
  }
  return { x: x0, y: y0, raster: { width: w, height: h, data: out } }
}
