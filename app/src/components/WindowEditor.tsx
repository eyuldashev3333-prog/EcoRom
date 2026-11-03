import { useEffect, useMemo, useState } from 'react'
import WindowSvg from './WindowSvg'
import {
  OPENINGS,
  findNode,
  layout,
  measure,
  mergeParent,
  newDesign,
  resize,
  setPartSize,
  splitLeaf,
  updateLeaf,
  type Leaf,
  type Opening,
  type WindowDesign,
} from '../lib/window'
import { uz } from '../uz'

const t = uz.designer

// готовые схемы (как «конфигурация» в WinStudio)
export const PRESETS: { key: string; build: () => WindowDesign }[] = [
  { key: 'fixed', build: () => newDesign(1200, 1500) },
  {
    key: 'two',
    build: () => {
      const b = newDesign(1200, 1500)
      const d = splitLeaf(b, b.root.id, 'v')
      return updateLeaf(d, layout(d).cells[1].leaf.id, { opening: 'tt_r' })
    },
  },
  {
    key: 'three',
    build: () => {
      const b = newDesign(1800, 1500)
      const d = splitLeaf(b, b.root.id, 'v', 3)
      const c = layout(d).cells
      return updateLeaf(updateLeaf(d, c[0].leaf.id, { opening: 'tt_l' }), c[2].leaf.id, { opening: 'tt_r' })
    },
  },
  {
    key: 'transom',
    build: () => {
      const b = newDesign(1500, 2000)
      let d = splitLeaf(b, b.root.id, 'h')
      d = setPartSize(d, d.root.id, 0, 500)
      const bottom = layout(d).cells[1].leaf.id
      d = splitLeaf(d, bottom, 'v')
      return updateLeaf(d, layout(d).cells[2].leaf.id, { opening: 'tt_r' })
    },
  },
  {
    key: 'balcony',
    build: () => {
      const b = newDesign(2100, 2150)
      let d = splitLeaf(b, b.root.id, 'v')
      d = setPartSize(d, d.root.id, 0, 750)
      return updateLeaf(d, layout(d).cells[0].leaf.id, { opening: 'tt_l', door: true })
    },
  },
  { key: 'arch', build: () => ({ ...newDesign(1200, 1800), shape: 'arch', archRise: 400 }) },
]

const askNumber = (label: string, current: number): number | null => {
  const v = window.prompt(label, String(current))
  if (v === null) return null
  const n = Math.round(Number(v.replace(',', '.')))
  return Number.isFinite(n) && n > 0 ? n : null
}

// поле размера: применяется по Enter или при выходе из поля
export function SizeInput({ label, value, min, onCommit }: { label: string; value: number; min: number; onCommit: (n: number) => void }) {
  const [v, setV] = useState(String(value))
  useEffect(() => setV(String(value)), [value])
  const commit = () => {
    const n = Math.round(Number(v.replace(',', '.')))
    if (Number.isFinite(n) && n >= min) onCommit(n)
    else setV(String(value))
  }
  return (
    <label>
      {label}
      <input inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    </label>
  )
}

interface Props {
  value: WindowDesign
  onChange: (d: WindowDesign) => void
  frameColor?: string
}

export default function WindowEditor({ value: design, onChange, frameColor }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const m = useMemo(() => measure(design), [design])
  const sel = selected ? (findNode(design.root, selected) as Leaf | null) : null
  const set = (fn: (d: WindowDesign) => WindowDesign) => onChange(fn(design))

  const setSize = (axis: 'w' | 'h', current: number) => {
    const n = askNumber(axis === 'w' ? t.width : t.height, current)
    if (n && n >= 300) set((d) => resize(d, axis === 'w' ? n : d.width, axis === 'h' ? n : d.height))
  }

  return (
    <>
      <div className="tabs">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className="tab"
            onClick={() => {
              onChange(p.build())
              setSelected(null)
            }}
          >
            {t.presets[p.key]}
          </button>
        ))}
      </div>

      <div className="designer">
        <div className="card">
          <WindowSvg
            design={design}
            frameColor={frameColor}
            selectedId={selected}
            onSelect={setSelected}
            onSizeClick={setSize}
            onPartClick={(splitId, i, cur) => {
              const n = askNumber(t.partSize, cur)
              if (n) set((d) => setPartSize(d, splitId, i, n))
            }}
          />
          <p className="muted hint">{t.hint}</p>
        </div>

        <div className="side">
          <div className="card form">
            <div className="inline">
              <SizeInput label={t.width} value={design.width} min={300} onCommit={(n) => set((d) => resize(d, n, d.height))} />
              <SizeInput label={t.height} value={design.height} min={300} onCommit={(n) => set((d) => resize(d, d.width, n))} />
            </div>
            <label>
              {t.shape}
              <select
                value={design.shape}
                onChange={(e) => set((d) => ({ ...d, shape: e.target.value as 'rect' | 'arch', archRise: d.archRise ?? Math.round(d.width / 3) }))}
              >
                <option value="rect">{t.rect}</option>
                <option value="arch">{t.arch}</option>
              </select>
            </label>
            {design.shape === 'arch' && (
              <SizeInput
                label={t.archRise}
                value={design.archRise ?? 0}
                min={1}
                onCommit={(n) => set((d) => ({ ...d, archRise: Math.min(n, Math.round(d.width / 2), d.height) }))}
              />
            )}
          </div>

          <div className="card form">
            <h2>{sel ? t.cell : t.pickCell}</h2>
            {sel && (
              <>
                <div className="inline wrap">
                  <button type="button" className="ghost" onClick={() => set((d) => splitLeaf(d, sel.id, 'v'))}>
                    ┃ {t.splitV}
                  </button>
                  <button type="button" className="ghost" onClick={() => set((d) => splitLeaf(d, sel.id, 'h'))}>
                    ━ {t.splitH}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      set((d) => mergeParent(d, sel.id))
                      setSelected(null)
                    }}
                  >
                    ⧈ {t.merge}
                  </button>
                </div>
                <div className="openings">
                  {OPENINGS.map((o: Opening) => (
                    <button key={o} type="button" className={sel.opening === o ? 'tab on' : 'tab'} onClick={() => set((d) => updateLeaf(d, sel.id, { opening: o, net: o === 'fixed' ? false : sel.net }))}>
                      {t.openings[o]}
                    </button>
                  ))}
                </div>
                <label className="check">
                  <input type="checkbox" checked={!!sel.door} onChange={(e) => set((d) => updateLeaf(d, sel.id, { door: e.target.checked }))} />
                  {t.door}
                </label>
                <label className="check">
                  <input type="checkbox" checked={!!sel.net} disabled={sel.opening === 'fixed'} onChange={(e) => set((d) => updateLeaf(d, sel.id, { net: e.target.checked }))} />
                  {t.net}
                </label>
              </>
            )}
          </div>

          <div className="card">
            <h2>{t.measures}</h2>
            <table className="kv">
              <tbody>
                <tr><td>{t.area}</td><td>{m.area_m2} m²</td></tr>
                <tr><td>{t.frame}</td><td>{m.frame_m} m</td></tr>
                <tr><td>{t.impost}</td><td>{m.impost_m} m</td></tr>
                <tr><td>{t.sash}</td><td>{m.sash_m} m ({m.sashes})</td></tr>
                <tr><td>{t.bead}</td><td>{m.bead_m} m</td></tr>
                <tr><td>{t.gasket}</td><td>{m.gasket_m} m</td></tr>
                <tr><td>{t.glass}</td><td>{m.glass_m2} m²</td></tr>
                {m.nets_m2 > 0 && <tr><td>{t.net}</td><td>{m.nets_m2} m²</td></tr>}
              </tbody>
            </table>
            <h2>{t.panes}</h2>
            <ul className="panes">
              {m.panes.map((p, i) => (
                <li key={p.leafId}>
                  {i + 1}. {Math.round(p.w)} × {Math.round(p.h)} mm {p.sash ? `· ${t.inSash}` : ''}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  )
}
