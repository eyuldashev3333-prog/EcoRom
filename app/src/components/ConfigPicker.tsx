import { useState } from 'react'
import { Dialog } from './Dialog'
import { CONFIGS, PRESETS } from '../lib/configs'
import { layout, type WindowDesign } from '../lib/window'
import { uz } from '../uz'

const t = uz.designer

// миниатюра схемы: контур, ячейки, вырезы не рисуются
export function MiniWindow({ design }: { design: WindowDesign }) {
  const { width: W, height: H } = design
  const cells = layout(design).cells
  const sw = Math.max(W, H) * 0.02
  return (
    <svg viewBox={`${-sw} ${-sw} ${W + 2 * sw} ${H + 2 * sw}`} role="img" aria-hidden="true" style={{ width: '100%', height: 64, display: 'block' }}>
      {cells.map(({ leaf, rect }) =>
        leaf.void ? null : (
          <rect key={leaf.id} x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="#e4eef6" stroke="#3c4a42" strokeWidth={sw} />
        ),
      )}
    </svg>
  )
}

// окно «конфигурация»: сетка миниатюр, выбор → «Tanlash»
export default function ConfigPicker({ onPick, onClose }: { onPick: (d: WindowDesign) => void; onClose: () => void }) {
  const [sel, setSel] = useState<string | null>(null)
  const items = [...CONFIGS, ...PRESETS.map((p) => ({ ...p, key: `p_${p.key}` }))]
  const chosen = items.find((i) => i.key === sel)
  return (
    <Dialog title={t.config} onClose={onClose} wide>
      <div className="cfg-grid" role="listbox" aria-label={t.config}>
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            role="option"
            aria-selected={sel === it.key}
            className={sel === it.key ? 'cfg on' : 'cfg'}
            onClick={() => setSel(it.key)}
            onDoubleClick={() => onPick(it.build())}
          >
            <MiniWindow design={it.build()} />
          </button>
        ))}
      </div>
      <div className="dialog-actions">
        <button type="button" className="ghost" onClick={onClose}>
          {t.no}
        </button>
        <button type="button" disabled={!chosen} onClick={() => chosen && onPick(chosen.build())}>
          {t.yes}
        </button>
      </div>
    </Dialog>
  )
}
