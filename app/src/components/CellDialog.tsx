import { useState } from 'react'
import { Dialog } from './Dialog'
import { openingLines } from './WindowSvg'
import { OPENINGS, findNode, gridLeaf, layout, mergeParent, splitLeaf, updateLeaf, type Leaf, type Opening, type WindowDesign } from '../lib/window'
import { uz } from '../uz'

const t = uz.designer
const MAX = 27

// значок типа открывания: квадрат створки с линиями открывания
export function OpeningIcon({ o }: { o: Opening }) {
  const g = { x: 7, y: 7, w: 26, h: 26 }
  return (
    <svg viewBox="0 0 40 40" width="38" height="38" aria-hidden="true">
      <rect x="3" y="3" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x={g.x} y={g.y} width={g.w} height={g.h} fill="#e4eef6" stroke="currentColor" strokeWidth="1" />
      {openingLines(o, g).map((d, i) => (
        <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth="1.3" />
      ))}
      {o === 'fixed' && <path d="M14,20 h12 M20,14 v12" stroke="currentColor" strokeWidth="1.3" />}
      {o === 'fixed_sash' && <path d="M12,12 L28,28 M28,12 L12,28" stroke="currentColor" strokeWidth="1.3" />}
      {o === 'slide_r' && <path d="M11,20 h18 l-4,-3 m4,3 l-4,3" fill="none" stroke="currentColor" strokeWidth="1.5" />}
      {o === 'slide_l' && <path d="M29,20 h-18 l4,-3 m-4,3 l4,3" fill="none" stroke="currentColor" strokeWidth="1.5" />}
    </svg>
  )
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="stepper">
      <span>{label}</span>
      <button type="button" className="ghost small-btn" disabled={value <= 0} onClick={() => onChange(value - 1)} aria-label="−">
        −
      </button>
      <b aria-live="polite">{value}</b>
      <button type="button" className="ghost small-btn" disabled={value >= MAX} onClick={() => onChange(value + 1)} aria-label="+">
        +
      </button>
    </div>
  )
}

// диалог «импосты | открывание» для выбранной части окна
export default function CellDialog({ design, leafId, onChange, onClose }: { design: WindowDesign; leafId: string; onChange: (d: WindowDesign) => void; onClose: () => void }) {
  const [cols, setCols] = useState(0) // число вертикальных импостов
  const [rows, setRows] = useState(0) // число горизонтальных импостов
  const lf = findNode(design.root, leafId) as Leaf | null
  if (!lf || lf.kind !== 'leaf') return null
  const patch = (p: Partial<Leaf>) => onChange(updateLeaf(design, leafId, p))
  const hasParent = layout(design).cells.length > 1
  const pick = (o: Opening) => patch({ opening: o, panel: false, net: o === 'fixed' ? false : lf.net, door: o === 'fixed' ? false : lf.door })

  return (
    <Dialog title={t.cellTitle} onClose={onClose} wide>
      <section className="cd-sec">
        <h4>{t.dividers}</h4>
        <div className="cd-quick">
          <button type="button" className="ghost small-btn" onClick={() => onChange(splitLeaf(design, leafId, 'v', 2))}>
            ┃ 2
          </button>
          <button type="button" className="ghost small-btn" onClick={() => onChange(splitLeaf(design, leafId, 'v', 3))}>
            ┃ 3
          </button>
          <button type="button" className="ghost small-btn" onClick={() => onChange(splitLeaf(design, leafId, 'h', 2))}>
            ━ 2
          </button>
          <button type="button" className="ghost small-btn" onClick={() => onChange(splitLeaf(design, leafId, 'h', 3))}>
            ━ 3
          </button>
          {hasParent && (
            <button type="button" className="ghost small-btn" onClick={() => { onChange(mergeParent(design, leafId)); onClose() }}>
              ⧈ {t.merge}
            </button>
          )}
        </div>
        <Stepper label={t.vImposts} value={cols} onChange={setCols} />
        <Stepper label={t.hImposts} value={rows} onChange={setRows} />
        <button
          type="button"
          disabled={cols === 0 && rows === 0}
          onClick={() => {
            onChange(gridLeaf(design, leafId, cols + 1, rows + 1))
            setCols(0)
            setRows(0)
          }}
        >
          {t.applyGrid}: {cols + 1} × {rows + 1}
        </button>
      </section>

      <section className="cd-sec">
        <h4>{t.opening}</h4>
        <div className="op-grid" role="radiogroup" aria-label={t.opening}>
          {OPENINGS.map((o) => (
            <button key={o} type="button" role="radio" aria-checked={lf.opening === o && !lf.panel} className={lf.opening === o && !lf.panel ? 'op on' : 'op'} onClick={() => pick(o)} title={t.openings[o]}>
              <OpeningIcon o={o} />
              <small>{t.openings[o]}</small>
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={!!lf.panel} onChange={(e) => patch(e.target.checked ? { panel: true, opening: 'fixed', door: false, net: false } : { panel: false })} />
          {t.panel}
        </label>
        <label className="check">
          <input type="checkbox" checked={!!lf.door} disabled={lf.opening === 'fixed' || !!lf.panel} onChange={(e) => patch({ door: e.target.checked })} />
          {t.door}
        </label>
        <label className="check">
          <input type="checkbox" checked={!!lf.net} disabled={lf.opening === 'fixed' || !!lf.panel} onChange={(e) => patch({ net: e.target.checked })} />
          {t.net}
        </label>
      </section>

      <button type="button" onClick={onClose}>
        OK
      </button>
    </Dialog>
  )
}
