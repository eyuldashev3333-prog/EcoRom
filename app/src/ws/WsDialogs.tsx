import { useState } from 'react'
import { MiniWindow } from '../components/ConfigPicker'
import { openingLines } from '../components/WindowSvg'
import { CONFIGS } from '../lib/configs'
import { findNode, updateLeaf, withSub, type Leaf, type LeafSub, type Opening, type WindowDesign } from '../lib/window'
import { uz } from '../uz'
import { Dlg } from './parts'

const t = uz.ws

// порядок плиток открывания как в окне «импосты / открывание» WinStudio (3 колонки)
const OPEN_TILES: Opening[] = ['slide_r', 'tilt', 'slide_l', 'turn_r', 'fixed', 'turn_l', 'tt_r', 'top', 'tt_l', 'fixed_sash']

// импосты внутри ячейки (левая колонка): нет / 1 вертикальный / 1 горизонтальный / 2 вертикальных / 2 горизонтальных
type Split = { dir: 'v' | 'h'; n: number } | null
const SPLIT_TILES: { key: string; split: Split }[] = [
  { key: 'none', split: null },
  { key: 'v2', split: { dir: 'v', n: 2 } },
  { key: 'h2', split: { dir: 'h', n: 2 } },
  { key: 'v3', split: { dir: 'v', n: 3 } },
  { key: 'h3', split: { dir: 'h', n: 3 } },
]
const keyOfSub = (s?: LeafSub) => (s ? `${s.dir}${s.parts}` : 'none')

// значок открывания в стиле WinStudio: тонкий контур, светлое стекло, тонкие линии
function WsOpeningIcon({ o }: { o: Opening }) {
  const g = { x: 6, y: 6, w: 28, h: 28 }
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <rect x="1.5" y="1.5" width="37" height="37" fill="#fff" stroke="#8a8a8a" strokeWidth="1" />
      <rect x={g.x} y={g.y} width={g.w} height={g.h} fill="#cddbeb" stroke="#444" strokeWidth="1" />
      {openingLines(o, g).map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#1c1c1c" strokeWidth="1" />
      ))}
      {o === 'fixed' && <path d="M14,20 h12 M20,14 v12" stroke="#1c1c1c" strokeWidth="1" />}
      {o === 'fixed_sash' && <path d="M6,6 L34,34 M34,6 L6,34" stroke="#1c1c1c" strokeWidth="1" />}
      {o === 'slide_r' && <path d="M10,26 V18 H26 M22,14 L27,18 L22,22" fill="none" stroke="#1c1c1c" strokeWidth="1.2" />}
      {o === 'slide_l' && <path d="M30,26 V18 H14 M18,14 L13,18 L18,22" fill="none" stroke="#1c1c1c" strokeWidth="1.2" />}
    </svg>
  )
}

function SplitIcon({ split }: { split: Split }) {
  const parts = split ? split.n : 1
  const rects = Array.from({ length: parts }, (_, i) => (split?.dir === 'h' ? { x: 4, y: 4 + (i * 32) / parts, w: 32, h: 32 / parts } : { x: 4 + (i * 32) / parts, y: 4, w: 32 / parts, h: 32 }))
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <rect x="2" y="2" width="36" height="36" fill="#fff" stroke="#555" strokeWidth="1.6" />
      {rects.map((r, i) => (
        <rect key={i} x={r.x + 1.5} y={r.y + 1.5} width={Math.max(r.w - 3, 1)} height={Math.max(r.h - 3, 1)} fill="#cddbeb" stroke="#555" strokeWidth="1" />
      ))}
    </svg>
  )
}

// окно «конфигурация»: сетка миниатюр (все схемы WinStudio), НЕТ / ДА
export function ConfigDialog({ onPick, onClose }: { onPick: (d: WindowDesign) => void; onClose: () => void }) {
  const [sel, setSel] = useState<string | null>(null)
  const items = CONFIGS.filter((c) => c.key.startsWith('ws'))
  const chosen = items.find((i) => i.key === sel)
  return (
    <Dlg title={t.config} no={t.no} yes={t.yes} onNo={onClose} onYes={() => chosen && onPick(chosen.build())} yesDisabled={!chosen}>
      <div className="ws-cfg" role="listbox" aria-label={t.config}>
        {items.map((it) => (
          <button key={it.key} type="button" role="option" aria-selected={sel === it.key} className={sel === it.key ? 'on' : ''} onClick={() => setSel(it.key)} onDoubleClick={() => onPick(it.build())}>
            <div className="mini">
              <MiniWindow design={it.build()} />
            </div>
          </button>
        ))}
      </div>
    </Dlg>
  )
}

// окно «импосты / открывание» для выбранной части окна; изменения применяются по ДА.
// Левая колонка — импосты ВНУТРИ ячейки (одна створка/стекло, поделённые импостами), сэндвич-панель задаётся отдельно для каждой части.
export function CellDialog({ design, leafId, onApply, onClose }: { design: WindowDesign; leafId: string; onApply: (d: WindowDesign) => void; onClose: () => void }) {
  const lf = findNode(design.root, leafId) as Leaf | null
  const [split, setSplit] = useState<string>(keyOfSub(lf?.sub))
  const [opening, setOpening] = useState<Opening>(lf?.opening ?? 'fixed')
  const [flags, setFlags] = useState<boolean[]>(lf?.sub ? [...(lf.panels ?? []), false, false, false].slice(0, 3) : [!!lf?.panel, false, false])
  const [door, setDoor] = useState(!!lf?.door)
  const [net, setNet] = useState(!!lf?.net)
  if (!lf || lf.kind !== 'leaf') return null
  const noSash = opening === 'fixed'
  const noNet = noSash || opening === 'fixed_sash' // у глухой створки сетки нет (как в WinStudio)
  const sp = SPLIT_TILES.find((s) => s.key === split)?.split
  const parts = sp ? sp.n : 1
  const apply = () => {
    const f = Array.from({ length: parts }, (_, i) => !!flags[i])
    let d = updateLeaf(design, leafId, { opening, door: noSash ? false : door, net: noNet ? false : net, panel: sp ? false : f[0], ...(sp ? {} : { sub: undefined, panels: undefined }) })
    if (sp) {
      // положение импостов сбрасывается на «поровну», только если деление изменили
      d = keyOfSub(lf.sub) === split ? updateLeaf(d, leafId, { panels: f }) : withSub(d, leafId, { dir: sp.dir, parts: sp.n }, f)
    }
    onApply(d)
  }
  return (
    <Dlg no={t.no} yes={t.yes} onNo={onClose} onYes={apply}>
      <div className="ws-cell">
        <div className="left">
          <h5>{t.imposts}</h5>
          <div className="ws-igrid c2">
            <div className="ws-tile" aria-hidden="true" style={{ opacity: 0.35 }}>
              <svg viewBox="0 0 40 40">
                <rect x="2" y="2" width="36" height="36" fill="#fff" stroke="#555" strokeWidth="1.6" />
                <path d="M14 2 V38 M26 2 V38 M2 14 H38 M2 26 H38" stroke="#555" strokeWidth="1.6" />
              </svg>
            </div>
            {SPLIT_TILES.map((s) => (
              <button key={s.key} type="button" className={split === s.key ? 'ws-tile on' : 'ws-tile'} aria-pressed={split === s.key} onClick={() => setSplit(s.key)}>
                <SplitIcon split={s.split} />
              </button>
            ))}
          </div>
          <div className="ws-chk" style={{ paddingBottom: 0 }}>
            <span aria-hidden="true">▣</span> {t.sandwich}
          </div>
          <div className="ws-chk" style={{ paddingTop: 2, gap: 14 }} aria-label={t.sandwich}>
            {Array.from({ length: parts }, (_, i) => (
              <input key={i} type="checkbox" checked={!!flags[i]} aria-label={`${t.sandwich} ${i + 1}`} onChange={(e) => setFlags((x) => x.map((v, j) => (j === i ? e.target.checked : v)))} />
            ))}
          </div>
          <label className={noSash ? 'ws-chk off' : 'ws-chk'}>
            <span aria-hidden="true">▮</span>
            <input type="checkbox" checked={door && !noSash} disabled={noSash} onChange={(e) => setDoor(e.target.checked)} /> {t.door}
          </label>
          <label className={noNet ? 'ws-chk off' : 'ws-chk'}>
            <span aria-hidden="true">▦</span>
            <input type="checkbox" checked={net && !noNet} disabled={noNet} onChange={(e) => setNet(e.target.checked)} /> {t.mosq}
          </label>
        </div>
        <div className="right">
          <h5>{t.opening}</h5>
          <div className="ws-igrid c3" role="radiogroup" aria-label={t.opening}>
            {OPEN_TILES.map((o) => (
              <button key={o} type="button" role="radio" aria-checked={opening === o} className={opening === o ? 'ws-tile sel-dark on' : 'ws-tile sel-dark'} onClick={() => setOpening(o)} title={uz.designer.openings[o]}>
                <WsOpeningIcon o={o} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </Dlg>
  )
}