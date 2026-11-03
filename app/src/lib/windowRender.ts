// Реалистичная картинка окна для наложения на фото (не чертёж): рама цвета каталога с фасками, створки, ручки,
// стекло с оттенком/бликом (прозрачное — через него видна фотография), подоконник и мягкая тень.
// Размеры берутся из конструктора (layout) — те же деления, что в заказе.
import { layout, type Leaf, type Opening, type Rect, type WindowDesign } from './window'

const FRAME = 60 // видимая ширина рамы, мм (как на чертеже)
const IMPOST = 35
const SASH = 55

export type Tint = 'clear' | 'blue' | 'bronze' | 'grey'
export const TINTS: Record<Tint, string> = { clear: '210,232,245', blue: '120,170,215', bronze: '150,115,70', grey: '120,128,135' }

export interface RenderOpts {
  frameColor: string
  tint: Tint
  /** 0.1–1: насколько стекло закрывает то, что за ним (1 — глухо, закрывает старое окно) */
  glassOpacity: number
  sill: boolean
  px: number // длинная сторона текстуры, px
}
export interface Rendered {
  canvas: HTMLCanvasElement
  /** область (u,v) относительно рамки окна, которую покрывает текстура */
  range: { u0: number; u1: number; v0: number; v1: number }
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  const r = c(((n >> 16) & 255) * k)
  const g = c(((n >> 8) & 255) * k)
  const b = c((n & 255) * k)
  return `rgb(${r},${g},${b})`
}

function clearRect(r: Rect, W: number, H: number): Rect {
  const l = r.x <= 0 ? FRAME : IMPOST
  const t = r.y <= 0 ? FRAME : IMPOST
  const rr = r.x + r.w >= W ? FRAME : IMPOST
  const b = r.y + r.h >= H ? FRAME : IMPOST
  return { x: r.x + l, y: r.y + t, w: r.w - l - rr, h: r.h - t - b }
}
const inset = (r: Rect, d: number): Rect => ({ x: r.x + d, y: r.y + d, w: r.w - 2 * d, h: r.h - 2 * d })

function archPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rise: number) {
  ctx.beginPath()
  if (rise <= 0) {
    ctx.rect(x, y, w, h)
    return
  }
  const R = (w * w) / 4 / (2 * rise) + rise / 2
  const cx = x + w / 2
  const cy = y + R
  ctx.moveTo(x, y + h)
  ctx.lineTo(x, y + rise)
  ctx.arc(cx, cy, R, Math.atan2(rise - R, -w / 2), Math.atan2(rise - R, w / 2), false)
  ctx.lineTo(x + w, y + h)
  ctx.closePath()
}

// профиль с фаской: заливка + светлая кромка сверху/слева и тёмная снизу/справа
function profile(ctx: CanvasRenderingContext2D, r: Rect, color: string, bevel: number) {
  ctx.fillStyle = color
  ctx.fillRect(r.x, r.y, r.w, r.h)
  ctx.fillStyle = shade(color, 1.12)
  ctx.fillRect(r.x, r.y, r.w, bevel)
  ctx.fillRect(r.x, r.y, bevel, r.h)
  ctx.fillStyle = shade(color, 0.78)
  ctx.fillRect(r.x, r.y + r.h - bevel, r.w, bevel)
  ctx.fillRect(r.x + r.w - bevel, r.y, bevel, r.h)
}

function handle(ctx: CanvasRenderingContext2D, leaf: Leaf, sash: Rect, color: string) {
  const o: Opening = leaf.opening
  let x = 0
  let y = 0
  let vertical = true
  if (o === 'turn_l' || o === 'tt_l') { x = sash.x + SASH * 0.45; y = sash.y + sash.h / 2 }
  else if (o === 'turn_r' || o === 'tt_r') { x = sash.x + sash.w - SASH * 0.45; y = sash.y + sash.h / 2 }
  else if (o === 'tilt') { x = sash.x + sash.w / 2; y = sash.y + SASH * 0.45; vertical = false }
  else if (o === 'top') { x = sash.x + sash.w / 2; y = sash.y + sash.h - SASH * 0.45; vertical = false }
  else return
  const len = leaf.door ? 160 : 110
  const wd = 22
  ctx.fillStyle = color
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = 6
  if (vertical) ctx.fillRect(x - wd / 2, y - len / 2, wd, len)
  else ctx.fillRect(x - len / 2, y - wd / 2, len, wd)
  ctx.shadowBlur = 0
  ctx.shadowColor = 'transparent'
}

export function renderWindow(design: WindowDesign, o: RenderOpts): Rendered {
  const W = design.width
  const H = design.height
  const mx = W * 0.09 // поля текстуры: подоконник по бокам и тень
  const mt = H * 0.05
  const mb = H * 0.13
  const totW = W + 2 * mx
  const totH = H + mt + mb
  const s = o.px / Math.max(totW, totH)
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(totW * s)
  canvas.height = Math.ceil(totH * s)
  const ctx = canvas.getContext('2d')!
  ctx.scale(s, s)
  ctx.translate(mx, mt)
  const rise = design.shape === 'arch' ? Math.min(design.archRise ?? 0, W / 2, H) : 0
  const innerRise = Math.max(0, rise - FRAME * 0.6)
  const bevel = Math.max(5, Math.min(W, H) * 0.006)
  const color = o.frameColor

  // мягкая тень от окна на стену (вправо-вниз)
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.38)'
  ctx.shadowBlur = Math.max(W, H) * 0.03
  ctx.shadowOffsetX = W * 0.012
  ctx.shadowOffsetY = H * 0.012
  archPath(ctx, 0, 0, W, H, rise)
  ctx.fillStyle = color
  ctx.fill()
  ctx.restore()

  // рама
  archPath(ctx, 0, 0, W, H, rise)
  ctx.fillStyle = color
  ctx.fill()
  ctx.save()
  archPath(ctx, 0, 0, W, H, rise)
  ctx.clip()
  const inner: Rect = { x: FRAME, y: FRAME, w: W - 2 * FRAME, h: H - 2 * FRAME }
  profile(ctx, { x: 0, y: 0, w: W, h: H }, color, bevel * 1.6)
  ctx.restore()

  // ячейки: импосты/створки/стекло внутри внутреннего контура
  ctx.save()
  archPath(ctx, inner.x, inner.y, inner.w, inner.h, innerRise)
  ctx.clip()
  const { cells } = layout(design)
  const tint = TINTS[o.tint]
  const glassRects: Rect[] = []
  for (const { leaf, rect } of cells) {
    const c = clearRect(rect, W, H)
    const sash = leaf.opening !== 'fixed'
    profile(ctx, rect, color, bevel)
    if (sash) profile(ctx, c, color, bevel * 1.2)
    glassRects.push(sash ? inset(c, SASH) : c)
  }
  // стекло: сначала «вырезаем» дырку (сквозь неё видно фото), затем оттенок
  for (const gr of glassRects) ctx.clearRect(gr.x, gr.y, gr.w, gr.h)
  for (const gr of glassRects) {
    ctx.fillStyle = `rgba(${tint},${o.glassOpacity})`
    ctx.fillRect(gr.x, gr.y, gr.w, gr.h)
    // блик: диагональная светлая полоса + градиент неба
    const grad = ctx.createLinearGradient(gr.x, gr.y, gr.x + gr.w, gr.y + gr.h)
    grad.addColorStop(0, 'rgba(255,255,255,0.32)')
    grad.addColorStop(0.45, 'rgba(255,255,255,0.05)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = grad
    ctx.fillRect(gr.x, gr.y, gr.w, gr.h)
    ctx.save()
    ctx.beginPath()
    ctx.rect(gr.x, gr.y, gr.w, gr.h)
    ctx.clip()
    ctx.fillStyle = 'rgba(255,255,255,0.16)'
    ctx.beginPath()
    const k = Math.max(gr.w, gr.h)
    ctx.moveTo(gr.x + gr.w * 0.18, gr.y)
    ctx.lineTo(gr.x + gr.w * 0.18 + k * 0.16, gr.y)
    ctx.lineTo(gr.x - k * 0.04, gr.y + gr.h * 0.5 + k * 0.16)
    ctx.lineTo(gr.x - k * 0.04, gr.y + gr.h * 0.5)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    // тонкая тёмная обводка стекла
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.lineWidth = Math.max(3, bevel * 0.5)
    ctx.strokeRect(gr.x, gr.y, gr.w, gr.h)
  }
  // ручки
  const handleColor = shade(color === '#f4f4f2' ? '#d8d8d4' : '#cfcfcf', 1)
  for (const { leaf, rect } of cells) {
    if (leaf.opening !== 'fixed') handle(ctx, leaf, clearRect(rect, W, H), handleColor)
  }
  ctx.restore()

  // подоконник: белая плита под рамой, чуть шире окна
  if (o.sill) {
    const sx = -W * 0.035
    const sw = W * 1.07
    const top = H
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.4)'
    ctx.shadowBlur = H * 0.015
    ctx.shadowOffsetY = H * 0.01
    ctx.fillStyle = '#f2f2ef'
    ctx.fillRect(sx, top, sw, 38)
    ctx.restore()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(sx, top, sw, 9)
    ctx.fillStyle = '#d2d2cc'
    ctx.fillRect(sx, top + 30, sw, 8)
  }

  return { canvas, range: { u0: -mx / W, u1: 1 + mx / W, v0: -mt / H, v1: 1 + mb / H } }
}
