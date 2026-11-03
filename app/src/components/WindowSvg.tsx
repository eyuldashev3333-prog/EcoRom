import { useId } from 'react'
import { arcLength, layout, splitBoxes, type Opening, type Rect, type WindowDesign } from '../lib/window'

interface Props {
  design: WindowDesign
  frameColor?: string
  selectedId?: string | null
  onSelect?: (leafId: string) => void
  onPartClick?: (splitId: string, index: number, current: number) => void
  onSizeClick?: (axis: 'w' | 'h', current: number) => void
  maxHeight?: number
  fontScale?: number // крупнее подписи для печатного листа
}

const FRAME = 60 // видимая ширина рамы на чертеже, мм
const IMPOST = 35 // половина видимого импоста, мм
const SASH = 55 // видимая ширина створки, мм

// внутренний просвет ячейки на чертеже
function clearRect(r: Rect, W: number, H: number): Rect {
  const l = r.x <= 0 ? FRAME : IMPOST
  const t = r.y <= 0 ? FRAME : IMPOST
  const rr = r.x + r.w >= W ? FRAME : IMPOST
  const b = r.y + r.h >= H ? FRAME : IMPOST
  return { x: r.x + l, y: r.y + t, w: r.w - l - rr, h: r.h - t - b }
}
const inset = (r: Rect, d: number): Rect => ({ x: r.x + d, y: r.y + d, w: r.w - 2 * d, h: r.h - 2 * d })

function openingLines(o: Opening, g: Rect) {
  const { x, y, w, h } = g
  const L = { x, y: y + h / 2 }
  const R = { x: x + w, y: y + h / 2 }
  const T = { x: x + w / 2, y }
  const B = { x: x + w / 2, y: y + h }
  const tl = { x, y }
  const tr = { x: x + w, y }
  const bl = { x, y: y + h }
  const br = { x: x + w, y: y + h }
  const tri = (a: { x: number; y: number }, p: { x: number; y: number }, q: { x: number; y: number }) => `M${p.x},${p.y} L${a.x},${a.y} L${q.x},${q.y}`
  switch (o) {
    case 'turn_l': return [tri(L, tr, br)]
    case 'turn_r': return [tri(R, tl, bl)]
    case 'tilt': return [tri(B, tl, tr)]
    case 'top': return [tri(T, bl, br)]
    case 'tt_l': return [tri(L, tr, br), tri(B, tl, tr)]
    case 'tt_r': return [tri(R, tl, bl), tri(B, tl, tr)]
    default: return []
  }
}

export default function WindowSvg({ design, frameColor = '#f4f4f2', selectedId, onSelect, onPartClick, onSizeClick, maxHeight = 420, fontScale = 1 }: Props) {
  // свой id на каждый чертёж: на одной странице (PDF заказа) их несколько
  const uidRaw = useId().replace(/[^a-zA-Z0-9]/g, '')
  const clipId = `clip${uidRaw}`
  const netId = `net${uidRaw}`
  const { width: W, height: H } = design
  const { cells } = layout(design)
  const splits = splitBoxes(design)
  const pad = Math.max(W, H) * 0.14 * Math.max(1, fontScale * 0.8)
  const font = Math.max(W, H) * 0.035 * fontScale
  const rise = design.shape === 'arch' ? Math.min(design.archRise ?? 0, W / 2, H) : 0

  // контур: прямоугольник или арка
  const archPath = (x: number, y: number, w: number, h: number, rs: number) => {
    if (rs <= 0) return `M${x},${y} H${x + w} V${y + h} H${x} Z`
    const R = (w * w) / 4 / (2 * rs) + rs / 2
    return `M${x},${y + h} V${y + rs} A${R},${R} 0 0 1 ${x + w},${y + rs} V${y + h} Z`
  }
  const outer = archPath(0, 0, W, H, rise)
  const inner = archPath(FRAME, FRAME, W - 2 * FRAME, H - 2 * FRAME, Math.max(0, rise - FRAME * 0.6))
  const stroke = Math.max(W, H) * 0.004

  return (
    <svg
      viewBox={`${-pad} ${-pad * 0.35} ${W + pad * 1.35} ${H + pad * 1.35}`}
      style={{ width: '100%', maxHeight, display: 'block' }}
      fontSize={font}
      fontFamily="system-ui, sans-serif"
    >
      <defs>
        <clipPath id={clipId}>
          <path d={inner} />
        </clipPath>
        <pattern id={netId}width={font * 0.6} height={font * 0.6} patternUnits="userSpaceOnUse">
          <path d={`M0,0 L${font * 0.6},${font * 0.6} M${font * 0.6},0 L0,${font * 0.6}`} stroke="#5a6b62" strokeWidth={stroke * 0.5} />
        </pattern>
      </defs>

      {/* рама */}
      <path d={outer} fill={frameColor} stroke="#3c4a42" strokeWidth={stroke} />
      <path d={inner} fill={frameColor} stroke="#3c4a42" strokeWidth={stroke * 0.6} />

      <g clipPath={`url(#${clipId})`}>
        {cells.map(({ leaf, rect }) => {
          const c = clearRect(rect, W, H)
          const sash = leaf.opening !== 'fixed'
          const glass = sash ? inset(c, SASH) : c
          const sel = leaf.id === selectedId
          return (
            <g key={leaf.id} onClick={() => onSelect?.(leaf.id)} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
              {/* импост/фон ячейки */}
              <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill={frameColor} stroke="#3c4a42" strokeWidth={stroke * 0.5} />
              {sash && <rect x={c.x} y={c.y} width={c.w} height={c.h} fill={frameColor} stroke="#3c4a42" strokeWidth={stroke * 0.7} />}
              <rect x={glass.x} y={glass.y} width={glass.w} height={glass.h} fill="#cfe4f2" stroke="#3c4a42" strokeWidth={stroke * 0.5} />
              {leaf.net && <rect x={glass.x} y={glass.y} width={glass.w} height={glass.h} fill={`url(#${netId})`} opacity={0.5} />}
              {openingLines(leaf.opening, glass).map((d, i) => (
                <path key={i} d={d} fill="none" stroke="#3c4a42" strokeWidth={stroke * 0.6} />
              ))}
              {leaf.opening === 'fixed' && (
                <path
                  d={`M${glass.x + glass.w / 2 - font},${glass.y + glass.h / 2} h${font * 2} M${glass.x + glass.w / 2},${glass.y + glass.h / 2 - font} v${font * 2}`}
                  stroke="#7b8c83"
                  strokeWidth={stroke * 0.6}
                />
              )}
              {leaf.opening === 'fixed_sash' && (
                <path
                  d={`M${glass.x + glass.w / 2 - font * 0.7},${glass.y + glass.h / 2 - font * 0.7} l${font * 1.4},${font * 1.4} m0,${-font * 1.4} l${-font * 1.4},${font * 1.4}`}
                  stroke="#3c4a42"
                  strokeWidth={stroke * 0.6}
                />
              )}
              {(leaf.opening === 'slide_l' || leaf.opening === 'slide_r') && (
                <path
                  d={
                    leaf.opening === 'slide_r'
                      ? `M${glass.x + glass.w * 0.25},${glass.y + glass.h / 2} h${glass.w * 0.5} l${-font},${-font * 0.6} m${font},${font * 0.6} l${-font},${font * 0.6}`
                      : `M${glass.x + glass.w * 0.75},${glass.y + glass.h / 2} h${-glass.w * 0.5} l${font},${-font * 0.6} m${-font},${font * 0.6} l${font},${font * 0.6}`
                  }
                  fill="none"
                  stroke="#3c4a42"
                  strokeWidth={stroke * 0.7}
                />
              )}
              {leaf.door && (
                <text x={glass.x + glass.w / 2} y={glass.y + font * 1.6} textAnchor="middle" fill="#3c4a42" fontWeight={700}>
                  ESHIK
                </text>
              )}
              {sel && <rect x={rect.x + stroke * 2} y={rect.y + stroke * 2} width={rect.w - stroke * 4} height={rect.h - stroke * 4} fill="none" stroke="#0e9a2f" strokeWidth={stroke * 3} strokeDasharray={`${font} ${font * 0.5}`} />}
            </g>
          )
        })}
      </g>

      {/* размеры частей делений (нажать — изменить) */}
      {splits.map(({ split, parts }) =>
        parts.map((p, i) => {
          const v = split.dir === 'v'
          const cx = v ? p.x + p.w / 2 : p.x + FRAME + font * 1.6
          const cy = v ? p.y + p.h - FRAME - font * 1.2 : p.y + p.h / 2
          const label = String(split.sizes[i])
          return (
            <g key={`${split.id}-${i}`} onClick={() => onPartClick?.(split.id, i, split.sizes[i])} style={{ cursor: onPartClick ? 'pointer' : 'default' }}>
              <rect x={cx - font * 1.4} y={cy - font * 0.75} width={font * 2.8} height={font * 1.3} rx={font * 0.3} fill="#ffffff" stroke="#9aaba1" strokeWidth={stroke * 0.5} />
              <text x={cx} y={cy + font * 0.3} textAnchor="middle" fill="#15201a">
                {label}
              </text>
            </g>
          )
        }),
      )}

      {/* общие размеры */}
      <g stroke="#3c4a42" strokeWidth={stroke * 0.6}>
        <line x1={0} y1={H + pad * 0.45} x2={W} y2={H + pad * 0.45} />
        <line x1={0} y1={H + pad * 0.3} x2={0} y2={H + pad * 0.6} />
        <line x1={W} y1={H + pad * 0.3} x2={W} y2={H + pad * 0.6} />
        <line x1={-pad * 0.45} y1={0} x2={-pad * 0.45} y2={H} />
        <line x1={-pad * 0.3} y1={0} x2={-pad * 0.6} y2={0} />
        <line x1={-pad * 0.3} y1={H} x2={-pad * 0.6} y2={H} />
      </g>
      <text x={W / 2} y={H + pad * 0.45 + font * 1.2} textAnchor="middle" fill="#15201a" fontWeight={700} onClick={() => onSizeClick?.('w', W)} style={{ cursor: onSizeClick ? 'pointer' : 'default' }}>
        {W}
      </text>
      <text
        x={-pad * 0.45 - font * 0.5}
        y={H / 2}
        textAnchor="middle"
        fill="#15201a"
        fontWeight={700}
        transform={`rotate(-90 ${-pad * 0.45 - font * 0.5} ${H / 2})`}
        onClick={() => onSizeClick?.('h', H)}
        style={{ cursor: onSizeClick ? 'pointer' : 'default' }}
      >
        {H}
      </text>
      {rise > 0 && (
        <text x={W + pad * 0.1} y={rise / 2} fill="#62736a" fontSize={font * 0.8}>
          ⌒ {rise} · {Math.round(arcLength(W, rise))}
        </text>
      )}
    </svg>
  )
}
