import { useId } from 'react'
import { fmtLen } from '../lib/units'
import { arcLength, chainLines, DEFAULT_DIMS, frameSides, isPanel, layout, leafLayers, subLayout, type Opening, type Rect, type WindowDesign } from '../lib/window'

interface Props {
  design: WindowDesign
  frameColor?: string
  selectedId?: string | null
  onSelect?: (leafId: string) => void
  /** нажатие на размер в цепочке частей: ось, номер отрезка, текущий размер */
  onChainClick?: (axis: 'w' | 'h', index: number, current: number) => void
  /** нажатие на кружок в конце цепочки — «Выровнять размеры?» */
  onChainEqualize?: (axis: 'w' | 'h') => void
  onSizeClick?: (axis: 'w' | 'h', current: number) => void
  onSubClick?: (leafId: string, index: number, current: number) => void // размер части ячейки с импостом внутри
  maxHeight?: number
  fontScale?: number // крупнее подписи для печатного листа
  legend?: string[] // выбранные опции окна (режим «контроль» и PDF с подробностями)
  badge?: string // «5 dona» — количество
  note?: string // заметка к окну
}

// Геометрия и цвета сняты с чертежа WinStudio V44.4 (docs/winstudio-study/FINDINGS.md): слои ячейки считает leafLayers() в lib/window.ts,
// там же те же отступы идут в расчёт метров, поэтому чертёж и штапик/стекло не расходятся.
const FRAME = DEFAULT_DIMS.frameFace // видимая ширина рамы, мм

const C = {
  frameOuter: '#939393',
  line: '#353535',
  contourLine: '#666666',
  glass: '#cddbeb',
  panel: '#e9e9e9', // сэндвич-панель: сплошная светлая заливка (как у WinStudio)
  sashFill: '#f5f5f5',
  band: '#dfdfdf',
  frameDefault: '#e9e9e9',
}

// размеры ручки WinStudio, мм (не зависят от размера окна): пластина и рычаг
const HANDLE = { plateW: 37, plateH: 81, gripW: 24.5, gripH: 132, gripTop: 27.5 }
const CROSS = 150 // полуразмер креста глухого стекла, мм

/** смешать цвет с белым (t>0) или чёрным (t<0) */
function shade(hex: string, t: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(t >= 0 ? v + (255 - v) * t : v * (1 + t)))
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

export function openingLines(o: Opening, g: Rect) {
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
    // поворотно-откидная: откидывание — «Λ» (вершина вверху), как рисует WinStudio (живая сверка 25.11.2026, вариант v09);
    // у просто откидной (tilt) — «V» с ручкой снизу
    case 'tt_l': return [tri(L, tr, br), tri(T, bl, br)]
    case 'tt_r': return [tri(R, tl, bl), tri(T, bl, br)]
    default: return []
  }
}

/** сторона, где стоит ручка (там сходятся линии открывания): r/l — на боковой стойке створки, b/t — на нижней/верхней */
function handleSide(o: Opening): 'r' | 'l' | 'b' | 't' | null {
  switch (o) {
    case 'turn_r': case 'tt_r': return 'r'
    case 'turn_l': case 'tt_l': return 'l'
    case 'tilt': return 'b'
    case 'top': return 't'
    default: return null
  }
}

export default function WindowSvg({ design, frameColor = '#f4f4f2', selectedId, onSelect, onChainClick, onChainEqualize, onSizeClick, onSubClick, maxHeight = 420, fontScale = 1, legend, badge, note }: Props) {
  // свой id на каждый чертёж: на одной странице (PDF заказа) их несколько
  const uidRaw = useId().replace(/[^a-zA-Z0-9]/g, '')
  const clipId = `clip${uidRaw}`
  const netId = `net${uidRaw}`
  const { width: W, height: H } = design
  const { cells, joins, frames } = layout(design)
  // составное окно (Г, Т, ступени): несколько отдельных рам, рамы рисуются каждая со своим контуром
  const composite = frames.length > 1 || frames.some((f) => f.w !== design.width || f.h !== design.height)
  const M = Math.max(W, H)
  const font = M * 0.031 * fontScale
  const rise = design.shape === 'arch' ? Math.min(design.archRise ?? 0, W / 2, H) : 0
  const stroke = M * 0.0022

  // цвета: белый «по умолчанию» заменяем серым WinStudio, цветная рама (ламинация) задаёт тон всем слоям
  const isDefault = frameColor.toLowerCase() === '#f4f4f2'
  const body = isDefault ? C.frameDefault : frameColor
  const sashFill = isDefault ? C.sashFill : shade(frameColor, 0.45)
  const band = isDefault ? C.band : shade(frameColor, -0.08)

  // размерные линии: отступы пропорциональны габариту (как у WinStudio: общий размер дальше, размеры частей ближе)
  const offO = M * 0.1427
  const offP = M * 0.0703
  const dotR = M * 0.0086
  const labH = font * 1.75
  const labW = (text: string) => font * (text.length * 0.62 + 1.2)
  const padL = offO + font * 3
  const padT = font * 1.2
  const padR = font * 2 + (rise > 0 ? font * 6 : 0)
  const padB = offO + labH

  // контур: прямоугольник или арка
  const archPath = (x: number, y: number, w: number, h: number, rs: number) => {
    if (rs <= 0) return `M${x},${y} H${x + w} V${y + h} H${x} Z`
    const R = (w * w) / 4 / (2 * rs) + rs / 2
    return `M${x},${y + h} V${y + rs} A${R},${R} 0 0 1 ${x + w},${y + rs} V${y + h} Z`
  }
  const outer = archPath(0, 0, W, H, rise)
  const inner = archPath(FRAME, FRAME, W - 2 * FRAME, H - 2 * FRAME, Math.max(0, rise - FRAME * 0.6))

  const Label = ({ cx, cy, text, onClick }: { cx: number; cy: number; text: string; onClick?: () => void }) => (
    <g onClick={onClick ? (e) => { e.stopPropagation(); onClick() } : undefined} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <rect x={cx - labW(text) / 2} y={cy - labH / 2} width={labW(text)} height={labH} rx={labH * 0.3} fill="#ffffff" stroke="#d9d9d9" strokeWidth={stroke * 0.5} />
      <text x={cx} y={cy + font * 0.35} textAnchor="middle" fill="#15201a">
        {text}
      </text>
    </g>
  )
  const Dot = ({ x, y }: { x: number; y: number }) => <circle cx={x} cy={y} r={dotR} fill="#111111" />

  const handle = (sash: Rect, side: 'r' | 'l' | 'b' | 't', bodyW: number, key: string) => {
    // ручка: пластина и длинный рычаг, по центру профиля створки (ширина профиля bodyW); у нижней/верхней стойки повёрнута на 90°
    const horizontal = side === 'b' || side === 't'
    const cx = side === 'r' ? sash.x + sash.w - bodyW / 2 : side === 'l' ? sash.x + bodyW / 2 : sash.x + sash.w / 2
    const cy = side === 'b' ? sash.y + sash.h - bodyW / 2 : side === 't' ? sash.y + bodyW / 2 : sash.y + sash.h / 2
    return (
      <g key={key} transform={`translate(${cx} ${cy})${horizontal ? ' rotate(-90)' : ''}`} fill="#ffffff" strokeWidth={stroke * 0.9}>
        <rect x={-HANDLE.plateW / 2} y={-HANDLE.plateH / 2} width={HANDLE.plateW} height={HANDLE.plateH} stroke="#555555" />
        <rect x={-HANDLE.gripW / 2} y={-HANDLE.plateH / 2 + HANDLE.gripTop} width={HANDLE.gripW} height={HANDLE.gripH} stroke="#8c8c8c" />
      </g>
    )
  }

  // линии сетки: границы всех ячеек и рам (позиции импостов и соединений), по возрастанию
  // (те же линии, что правит setChainSegment — номер отрезка совпадает)
  const gridX = chainLines(design, 'w')
  const gridY = chainLines(design, 'h')

  return (
    <svg
      viewBox={`${-padL} ${-padT} ${W + padL + padR} ${H + padT + padB}`}
      style={{ width: '100%', maxHeight, display: 'block' }}
      fontSize={font}
      fontFamily="system-ui, sans-serif"
    >
      <defs>
        <clipPath id={clipId}>
          <path d={inner} />
        </clipPath>
        <pattern id={netId} width={M * 0.02} height={M * 0.02} patternUnits="userSpaceOnUse">
          <path d={`M0,0 H${M * 0.02} M0,0 V${M * 0.02}`} stroke="#4a4f55" strokeWidth={stroke * 0.5} />
        </pattern>
      </defs>

      {/* рама (у составного окна — каждая рама отдельно) */}
      {composite ? (
        frames.map((f, i) => <rect key={`fr${i}`} x={f.x} y={f.y} width={f.w} height={f.h} fill={body} stroke={C.frameOuter} strokeWidth={stroke * 1.2} />)
      ) : (
        <path d={outer} fill={body} stroke={C.frameOuter} strokeWidth={stroke * 1.2} />
      )}

      <g clipPath={rise > 0 ? `url(#${clipId})` : undefined}>
        {cells.map(({ leaf, rect }) => {
          if (leaf.void) return null
          const fs = frameSides(cells, rect, W, H, joins)
          const ly = leafLayers(rect, fs, leaf)
          const sb = subLayout(leaf, ly)
          const sel = leaf.id === selectedId
          const side = leaf.opening !== 'fixed' ? handleSide(leaf.opening) : null
          const sashBody = leaf.door ? DEFAULT_DIMS.glassDoor : DEFAULT_DIMS.glassSash
          return (
            <g key={leaf.id} onClick={() => onSelect?.(leaf.id)} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
              {/* невидимая область нажатия на всю ячейку */}
              <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="transparent" />
              {ly.sash && <rect x={ly.sash.x} y={ly.sash.y} width={ly.sash.w} height={ly.sash.h} fill={sashFill} stroke={C.line} strokeWidth={stroke * 1.2} />}
              {/* контур стекла/панели (по нему считается штапик) и светлая полоска штапика */}
              {sb ? (
                <>
                  {/* импосты внутри ячейки: тело импоста между отдельными стёклами */}
                  <rect x={ly.contour.x} y={ly.contour.y} width={ly.contour.w} height={ly.contour.h} fill={ly.sash ? sashFill : body} stroke={ly.sash ? C.contourLine : C.line} strokeWidth={stroke} />
                  {sb.panes.map((pr, k) => {
                    const bw = DEFAULT_DIMS.beadWidth
                    const gl = { x: pr.x + bw, y: pr.y + bw, w: pr.w - 2 * bw, h: pr.h - 2 * bw }
                    return (
                      <g key={k}>
                        <rect x={pr.x} y={pr.y} width={pr.w} height={pr.h} fill={band} stroke={C.line} strokeWidth={stroke} />
                        <rect x={gl.x} y={gl.y} width={gl.w} height={gl.h} fill={isPanel(leaf, k) ? C.panel : C.glass} stroke={C.line} strokeWidth={stroke * 1.1} />
                        {leaf.net && leaf.opening !== 'fixed_sash' && <rect x={gl.x} y={gl.y} width={gl.w} height={gl.h} fill={`url(#${netId})`} opacity={0.6} />}
                      </g>
                    )
                  })}
                </>
              ) : (
                <>
                  <rect x={ly.contour.x} y={ly.contour.y} width={ly.contour.w} height={ly.contour.h} fill={band} stroke={ly.sash ? C.contourLine : C.line} strokeWidth={stroke} />
                  <rect x={ly.glass.x} y={ly.glass.y} width={ly.glass.w} height={ly.glass.h} fill={leaf.panel ? C.panel : C.glass} stroke={C.line} strokeWidth={stroke * 1.1} />
                  {leaf.net && leaf.opening !== 'fixed_sash' && <rect x={ly.glass.x} y={ly.glass.y} width={ly.glass.w} height={ly.glass.h} fill={`url(#${netId})`} opacity={0.6} />}
                </>
              )}
              {/* линии открывания и крест глухой части рисуются и на сэндвич-панели (как WinStudio, сверка v08) */}
              {openingLines(leaf.opening, ly.glass).map((d, i) => (
                <path key={i} d={d} fill="none" stroke="#1a1a1a" strokeWidth={stroke * 1.1} />
              ))}
              {leaf.opening === 'fixed' && (
                <path
                  d={`M${ly.glass.x + ly.glass.w / 2 - CROSS},${ly.glass.y + ly.glass.h / 2} h${CROSS * 2} M${ly.glass.x + ly.glass.w / 2},${ly.glass.y + ly.glass.h / 2 - CROSS} v${CROSS * 2}`}
                  stroke="#1a1a1a"
                  strokeWidth={stroke * 1.1}
                />
              )}
              {leaf.opening === 'fixed_sash' && (
                <path
                  d={`M${ly.glass.x + ly.glass.w / 2 - CROSS},${ly.glass.y + ly.glass.h / 2} h${CROSS * 2} M${ly.glass.x + ly.glass.w / 2},${ly.glass.y + ly.glass.h / 2 - CROSS} v${CROSS * 2}`}
                  stroke="#1a1a1a"
                  strokeWidth={stroke * 1.1}
                />
              )}
              {(leaf.opening === 'slide_l' || leaf.opening === 'slide_r') && (
                <path
                  d={
                    leaf.opening === 'slide_r'
                      ? `M${ly.glass.x + ly.glass.w * 0.25},${ly.glass.y + ly.glass.h / 2} h${ly.glass.w * 0.5} l${-font},${-font * 0.6} m${font},${font * 0.6} l${-font},${font * 0.6}`
                      : `M${ly.glass.x + ly.glass.w * 0.75},${ly.glass.y + ly.glass.h / 2} h${-ly.glass.w * 0.5} l${font},${-font * 0.6} m${-font},${font * 0.6} l${font},${font * 0.6}`
                  }
                  fill="none"
                  stroke="#1a1a1a"
                  strokeWidth={stroke * 1.1}
                />
              )}
              {ly.sash && side && handle(ly.sash, side, sashBody, `h${leaf.id}`)}
              {sb && leaf.sub && (
                <g>
                  {(() => {
                    // как WinStudio (живая сверка 26.11.2026, варианты v09, o23–o30): 2 части по вертикали — подпись у ПЕРВОЙ части
                    // (линия на 72 % высоты ячейки), 2 по горизонтали — у ПОСЛЕДНЕЙ (линия по центру); 3 части — у первой и последней
                    const n = sb.sizes.length
                    const idx = n === 2 ? (leaf.sub.dir === 'v' ? [0] : [1]) : [0, n - 1]
                    const cx = rect.x + rect.w / 2
                    const ly72 = rect.y + rect.h * 0.72
                    return idx.map((k) => {
                      const a = sb.sizes.slice(0, k).reduce((s, x) => s + x, 0)
                      const click = onSubClick ? () => onSubClick(leaf.id, k, sb.sizes[k]) : undefined
                      return leaf.sub!.dir === 'v' ? (
                        <g key={k}>
                          <line x1={sb.ref.x + a} y1={ly72} x2={sb.ref.x + a + sb.sizes[k]} y2={ly72} stroke="#111111" strokeWidth={stroke * 0.8} />
                          <Dot x={sb.ref.x + a} y={ly72} />
                          <Dot x={sb.ref.x + a + sb.sizes[k]} y={ly72} />
                          <Label cx={sb.ref.x + a + sb.sizes[k] / 2} cy={ly72} text={fmtLen(sb.sizes[k])} onClick={click} />
                        </g>
                      ) : (
                        <g key={k}>
                          <line x1={cx} y1={sb.ref.y + a} x2={cx} y2={sb.ref.y + a + sb.sizes[k]} stroke="#111111" strokeWidth={stroke * 0.8} />
                          <Dot x={cx} y={sb.ref.y + a} />
                          <Dot x={cx} y={sb.ref.y + a + sb.sizes[k]} />
                          <Label cx={cx} cy={sb.ref.y + a + sb.sizes[k] / 2} text={fmtLen(sb.sizes[k])} onClick={click} />
                        </g>
                      )
                    })
                  })()}
                </g>
              )}
              {sel && <rect x={rect.x + stroke * 2} y={rect.y + stroke * 2} width={rect.w - stroke * 4} height={rect.h - stroke * 4} fill="none" stroke="#0e9a2f" strokeWidth={stroke * 3} strokeDasharray={`${font} ${font * 0.5}`} />}
            </g>
          )
        })}
      </g>

      {/* вырез Г-/Т-образного окна: закрашиваем фоном, чтобы убрать раму габарита */}
      {cells
        .filter((c) => c.leaf.void)
        .map(({ leaf, rect }) => (
          <rect
            key={leaf.id}
            x={rect.x - stroke}
            y={rect.y - stroke}
            width={rect.w + 2 * stroke}
            height={rect.h + 2 * stroke}
            fill={composite ? 'transparent' : '#ffffff'}
            onClick={() => onSelect?.(leaf.id)}
            style={{ cursor: onSelect ? 'pointer' : 'default' }}
          />
        ))}

      {/* размеры частей по всем линиям сетки окна (импосты и границы рам), как у WinStudio: ряд под окном и столбец слева */}
      {[
        { v: true, lines: gridX },
        { v: false, lines: gridY },
      ].map(({ v, lines }) =>
        lines.length > 2 ? (
          <g key={v ? 'gx' : 'gy'}>
            <line stroke="#111111" strokeWidth={stroke * 0.8} x1={v ? lines[0] : -offP} y1={v ? H + offP : lines[0]} x2={v ? lines[lines.length - 1] : -offP} y2={v ? H + offP : lines[lines.length - 1]} />
            {lines.map((p, i) => (
              <Dot key={`d${i}`} x={v ? p : -offP} y={v ? H + offP : p} />
            ))}
            {lines.slice(0, -1).map((p, i) => {
              const size = lines[i + 1] - p
              // как WinStudio: любой отрезок цепочки меняется (двигается линия сетки со всеми импостами на ней)
              return (
                <Label
                  key={`l${i}`}
                  cx={v ? p + size / 2 : -offP}
                  cy={v ? H + offP : p + size / 2}
                  text={fmtLen(size)}
                  onClick={onChainClick ? () => onChainClick(v ? 'w' : 'h', i, size) : undefined}
                />
              )
            })}
            {/* синий кружок в конце цепочки — «Выровнять размеры?» (WinStudio) */}
            {onChainEqualize && (
              <circle
                cx={v ? lines[lines.length - 1] : -offP}
                cy={v ? H + offP : lines[lines.length - 1]}
                r={dotR * 3.2}
                fill="#4a90e2"
                fillOpacity={0.35}
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation()
                  onChainEqualize(v ? 'w' : 'h')
                }}
              />
            )}
          </g>
        ) : null,
      )}

      {/* общие размеры */}
      <g stroke="#111111" strokeWidth={stroke * 0.8}>
        <line x1={0} y1={H + offO} x2={W} y2={H + offO} />
        <line x1={-offO} y1={0} x2={-offO} y2={H} />
      </g>
      <Dot x={0} y={H + offO} />
      <Dot x={W} y={H + offO} />
      <Dot x={-offO} y={0} />
      <Dot x={-offO} y={H} />
      <Label cx={W / 2} cy={H + offO} text={fmtLen(W)} onClick={() => onSizeClick?.('w', W)} />
      <Label cx={-offO} cy={H / 2} text={fmtLen(H)} onClick={() => onSizeClick?.('h', H)} />

      {legend && legend.length > 0 && (
        <g fontSize={font * 0.8} fill="#15201a" pointerEvents="none">
          {legend.map((line, i) => (
            <text key={i} x={W - FRAME - font * 0.4} y={FRAME + font * 1.2 + i * font * 1.0} textAnchor="end" stroke="#ffffff" strokeWidth={font * 0.22} paintOrder="stroke">
              {line}
            </text>
          ))}
        </g>
      )}
      {(badge || note) && (
        <g pointerEvents="none" fill="#15201a" paintOrder="stroke" stroke="#ffffff" strokeWidth={font * 0.25}>
          {badge && (
            <text x={FRAME + font * 0.4} y={H - FRAME - font * (note ? 1.4 : 0.5)} fontSize={font * 1.1} fontWeight={700}>
              {badge}
            </text>
          )}
          {note && (
            <text x={FRAME + font * 0.4} y={H - FRAME - font * 0.5} fontSize={font * 0.7}>
              {note}
            </text>
          )}
        </g>
      )}
      {rise > 0 && (
        <text x={W + font * 0.6} y={rise / 2} fill="#62736a" fontSize={font * 0.8}>
          ⌒ {fmtLen(rise)} · {fmtLen(arcLength(W, rise))}
        </text>
      )}
    </svg>
  )
}

