import { describe, expect, it } from 'vitest'
import { applyH, invertH, isConvexQuad, premultiply, squareToQuad, warpTexture, type Pt, type Raster } from './perspective'

const solid = (w: number, h: number, rgba: [number, number, number, number]): Raster => {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) data.set(rgba, i * 4)
  return { width: w, height: h, data }
}
const px = (r: { x: number; y: number; raster: Raster }, x: number, y: number) => {
  const i = ((y - r.y) * r.raster.width + (x - r.x)) * 4
  return Array.from(r.raster.data.slice(i, i + 4))
}
const FULL = { u0: 0, u1: 1, v0: 0, v1: 1 }

describe('invertH', () => {
  it('обратное преобразование возвращает исходную точку (с перспективой)', () => {
    const H = squareToQuad({ x: 120, y: 80 }, { x: 420, y: 40 }, { x: 460, y: 330 }, { x: 90, y: 300 })
    const inv = invertH(H)
    for (const [u, v] of [[0.2, 0.3], [0.9, 0.1], [0.5, 0.5], [0, 1]]) {
      const p = applyH(H, u, v)
      const back = inv(p.x, p.y)!
      expect(back.x).toBeCloseTo(u, 6)
      expect(back.y).toBeCloseTo(v, 6)
    }
  })
})

describe('warpTexture', () => {
  const red = premultiply(solid(100, 100, [255, 0, 0, 255]))
  it('прямоугольник: внутри цвет текстуры, охват = проём', () => {
    const H = squareToQuad({ x: 10, y: 10 }, { x: 60, y: 10 }, { x: 60, y: 60 }, { x: 10, y: 60 })
    const r = warpTexture(red, H, FULL, 80, 80)!
    expect([r.x, r.y, r.raster.width, r.raster.height]).toEqual([10, 10, 50, 50])
    expect(px(r, 30, 30)).toEqual([255, 0, 0, 255])
    expect(px(r, 12, 58)).toEqual([255, 0, 0, 255])
  })
  it('трапеция: пиксели вне проёма прозрачные, внутри — цвет', () => {
    const H = squareToQuad({ x: 20, y: 10 }, { x: 70, y: 20 }, { x: 70, y: 60 }, { x: 20, y: 70 })
    const r = warpTexture(red, H, FULL, 100, 100)!
    expect(px(r, 45, 40)).toEqual([255, 0, 0, 255])
    expect(px(r, 69, 10)[3]).toBe(0) // над верхним краем (он идёт вниз вправо)
    expect(px(r, 69, 69)[3]).toBe(0) // под нижним краем
  })
  it('прозрачная часть текстуры остаётся прозрачной (стекло: сквозь него видно фото), цвет не «грязнится» на краю', () => {
    const t = solid(100, 100, [0, 0, 255, 255])
    for (let y = 0; y < 100; y++) for (let x = 0; x < 50; x++) t.data[(y * 100 + x) * 4 + 3] = 0 // левая половина прозрачна
    const H = squareToQuad({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 })
    const r = warpTexture(premultiply(t), H, FULL, 100, 100)!
    expect(px(r, 20, 50)[3]).toBe(0)
    expect(px(r, 80, 50)).toEqual([0, 0, 255, 255])
    const edge = px(r, 50, 50) // на самом шве: цвет остаётся синим, меняется только прозрачность
    expect(edge[0]).toBe(0)
    expect(edge[1]).toBe(0)
    expect(edge[2]).toBeGreaterThan(250)
  })
  it('поля текстуры (подоконник/тень) выходят за рамку проёма', () => {
    // текстура покрывает u,v от −0.1 до 1.1; рамка — центральный квадрат
    const tx = solid(120, 120, [0, 200, 0, 255])
    const H = squareToQuad({ x: 20, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 80 }, { x: 20, y: 80 })
    const r = warpTexture(premultiply(tx), H, { u0: -0.1, u1: 1.1, v0: -0.1, v1: 1.1 }, 100, 100)!
    expect(r.x).toBeLessThan(20)
    expect(r.raster.width).toBeGreaterThan(60)
    expect(px(r, r.x + 1, r.y + 1)[3]).toBe(255)
  })
  it('охват обрезается границами фото', () => {
    const H = squareToQuad({ x: -30, y: -30 }, { x: 40, y: -30 }, { x: 40, y: 40 }, { x: -30, y: 40 })
    const r = warpTexture(red, H, FULL, 100, 100)!
    expect([r.x, r.y]).toEqual([0, 0])
    expect(r.raster.width).toBe(40)
  })
})

const close = (a: Pt, b: Pt) => {
  expect(a.x).toBeCloseTo(b.x, 6)
  expect(a.y).toBeCloseTo(b.y, 6)
}

describe('squareToQuad', () => {
  const trap = [{ x: 120, y: 80 }, { x: 420, y: 40 }, { x: 460, y: 330 }, { x: 90, y: 300 }] // произвольный проём в перспективе
  const H = squareToQuad(trap[0], trap[1], trap[2], trap[3])

  it('углы единичного квадрата попадают в углы проёма', () => {
    close(applyH(H, 0, 0), trap[0])
    close(applyH(H, 1, 0), trap[1])
    close(applyH(H, 1, 1), trap[2])
    close(applyH(H, 0, 1), trap[3])
  })
  it('прямоугольник без перспективы = обычное масштабирование', () => {
    const R = squareToQuad({ x: 10, y: 20 }, { x: 110, y: 20 }, { x: 110, y: 220 }, { x: 10, y: 220 })
    close(applyH(R, 0.5, 0.5), { x: 60, y: 120 })
    close(applyH(R, 0.25, 0.75), { x: 35, y: 170 })
  })
  it('параллелограмм (аффинный случай)', () => {
    const P = squareToQuad({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 130, y: 50 }, { x: 30, y: 50 })
    close(applyH(P, 1, 1), { x: 130, y: 50 })
    close(applyH(P, 0.5, 0.5), { x: 65, y: 25 })
  })
  it('центр квадрата — пересечение диагоналей четырёхугольника (свойство перспективы)', () => {
    const c = applyH(H, 0.5, 0.5)
    // пересечение диагоналей p0–p2 и p1–p3
    const [p0, p1, p2, p3] = trap
    const d1 = { x: p2.x - p0.x, y: p2.y - p0.y }
    const d2 = { x: p3.x - p1.x, y: p3.y - p1.y }
    const t = ((p1.x - p0.x) * d2.y - (p1.y - p0.y) * d2.x) / (d1.x * d2.y - d1.y * d2.x)
    close(c, { x: p0.x + t * d1.x, y: p0.y + t * d1.y })
  })
  it('дальняя сторона короче: равные части ближнего края сжимаются к дальнему (перспектива, не аффинное)', () => {
    // левый край длиннее правого → правая половина квадрата визуально уже левой
    const Q = squareToQuad({ x: 0, y: 0 }, { x: 100, y: 20 }, { x: 100, y: 80 }, { x: 0, y: 100 })
    const mid = applyH(Q, 0.5, 0.5)
    expect(mid.x).toBeGreaterThan(50) // середина смещена к дальнему (правому) краю
  })
  it('линии остаются прямыми: точки одной вертикали квадрата лежат на одной прямой', () => {
    const a = applyH(H, 0.3, 0)
    const b = applyH(H, 0.3, 0.5)
    const c = applyH(H, 0.3, 1)
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
    expect(Math.abs(cross)).toBeLessThan(1e-6)
  })
})

describe('isConvexQuad', () => {
  it('нормальный проём', () => expect(isConvexQuad([{ x: 0, y: 0 }, { x: 100, y: 10 }, { x: 90, y: 100 }, { x: 5, y: 90 }])).toBe(true))
  it('«бабочка» (углы перепутаны) — нет', () => expect(isConvexQuad([{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }])).toBe(false))
  it('вогнутый — нет', () => expect(isConvexQuad([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 100 }])).toBe(false))
  it('все точки на одной линии — нет', () => expect(isConvexQuad([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }, { x: 30, y: 30 }])).toBe(false))
})
