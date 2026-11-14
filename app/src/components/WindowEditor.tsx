import { useEffect, useMemo, useState } from 'react'
import WindowSvg from './WindowSvg'
import NumPad from './NumPad'
import ConfigPicker from './ConfigPicker'
import CellDialog from './CellDialog'
import MeasureTable from './MeasureTable'
import { fmtLen, lenToMm, lenUnit, withLenUnit } from '../lib/units'
import { Confirm } from './Dialog'
import {
  OPENINGS,
  equalize,
  findNode,
  hasUnequalParts,
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

// готовые схемы с открываниями и каталог конфигураций — в lib/configs.ts
export { PRESETS } from '../lib/configs'

// запрос числа через цифровую клавиатуру (вместо window.prompt)
interface PadReq {
  title: string
  value: number
  min: number
  max: number
  apply: (n: number) => void
}

// поле размера: применяется по Enter или при выходе из поля
export function SizeInput({ label, value, min, onCommit }: { label: string; value: number; min: number; onCommit: (n: number) => void }) {
  const [v, setV] = useState(fmtLen(value))
  useEffect(() => setV(fmtLen(value)), [value])
  const commit = () => {
    const n = lenToMm(Number(v.replace(',', '.')))
    if (Number.isFinite(n) && n >= min) onCommit(n)
    else setV(fmtLen(value))
  }
  return (
    <label>
      {withLenUnit(label)}
      <input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    </label>
  )
}

interface Props {
  value: WindowDesign
  onChange: (d: WindowDesign) => void
  frameColor?: string
  legend?: string[] // выбранные опции окна — показываются на чертеже при включённом «Nazorat»
  qty?: number
  note?: string
  cost?: number // себестоимость одного окна (для нижней таблицы)
  price?: number // цена одного окна для клиента (своя цена / скидка учтены)
}

export default function WindowEditor({ value: design, onChange, frameColor, legend, qty, note, cost, price }: Props) {
  const [control, setControl] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [pad, setPad] = useState<PadReq | null>(null)
  const [eq, setEq] = useState<{ w: number; h: number } | null>(null)
  const [picking, setPicking] = useState(false)
  const [cellOpen, setCellOpen] = useState(false)
  const m = useMemo(() => measure(design), [design])
  const sel = selected ? (findNode(design.root, selected) as Leaf | null) : null
  const set = (fn: (d: WindowDesign) => WindowDesign) => onChange(fn(design))

  // смена габарита: если части неравные — спрашиваем «Уравнять размеры?»
  const changeSize = (w: number, h: number) => {
    if (hasUnequalParts(design)) setEq({ w, h })
    else onChange(resize(design, w, h))
  }
  const setSize = (axis: 'w' | 'h', current: number) =>
    setPad({
      title: withLenUnit(axis === 'w' ? t.width : t.height),
      value: current,
      min: 300,
      max: 6000,
      apply: (n) => changeSize(axis === 'w' ? n : design.width, axis === 'h' ? n : design.height),
    })

  return (
    <>
      <div className="inline wrap" style={{ marginBottom: 10, alignItems: 'center' }}>
        <button type="button" className="ghost" onClick={() => setPicking(true)}>
          ▦ {t.pickConfig}
        </button>
        <label className="ctrl">
          <input type="checkbox" checked={control} onChange={(e) => setControl(e.target.checked)} />
          {t.control}
        </label>
      </div>

      <div className="designer">
        <div className="card">
          <WindowSvg
            design={design}
            frameColor={frameColor}
            selectedId={selected}
            legend={control ? legend : undefined}
            badge={control && qty && qty > 0 ? `${qty} ${t.pcs}` : undefined}
            note={control ? note : undefined}
            onSelect={(id) => {
              setSelected(id)
              setCellOpen(true)
            }}
            onSizeClick={setSize}
            onPartClick={(splitId, i, cur) =>
              setPad({ title: withLenUnit(t.partSize), value: cur, min: 100, max: 6000, apply: (n) => set((d) => setPartSize(d, splitId, i, n)) })
            }
          />
          <p className="muted hint">{t.hint}</p>
        </div>

        <div className="side">
          <div className="card form">
            <div className="inline">
              <SizeInput label={t.width} value={design.width} min={300} onCommit={(n) => changeSize(n, design.height)} />
              <SizeInput label={t.height} value={design.height} min={300} onCommit={(n) => changeSize(design.width, n)} />
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
              <button type="button" onClick={() => setCellOpen(true)}>
                ✎ {t.cellTitle}
              </button>
            )}
          </div>

          <div className="card">
            <h2>{t.panes}</h2>
            <ul className="panes">
              {m.panes.map((p, i) => (
                <li key={p.leafId}>
                  {i + 1}. {fmtLen(p.w)} × {fmtLen(p.h)} {lenUnit()} {p.sash ? `· ${t.inSash}` : ''}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <MeasureTable m={m} qty={qty} cost={cost} price={price} />

      {cellOpen && sel && <CellDialog design={design} leafId={sel.id} onChange={onChange} onClose={() => setCellOpen(false)} />}
      {picking && (
        <ConfigPicker
          onClose={() => setPicking(false)}
          onPick={(d) => {
            onChange(d)
            setSelected(null)
            setPicking(false)
          }}
        />
      )}
      {pad && (
        <NumPad
          title={pad.title}
          value={pad.value}
          min={pad.min}
          max={pad.max}
          onCancel={() => setPad(null)}
          onOk={(n) => {
            pad.apply(n)
            setPad(null)
          }}
        />
      )}
      {eq && (
        <Confirm
          title={t.equalizeQ}
          text={t.equalizeSub}
          no={t.no}
          yes={t.yes}
          onNo={() => {
            onChange(resize(design, eq.w, eq.h))
            setEq(null)
          }}
          onYes={() => {
            onChange(equalize(resize(design, eq.w, eq.h)))
            setEq(null)
          }}
        />
      )}
    </>
  )
}
