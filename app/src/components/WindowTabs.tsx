import { MiniWindow } from './ConfigPicker'
import type { WindowDesign } from '../lib/window'
import { uz } from '../uz'

const t = uz.designer

// Лента вкладок окон заказа (внизу конструктора в WinStudio): миниатюра, номер, количество; «+» — новое окно.
export default function WindowTabs({
  items,
  active,
  onPick,
  onAdd,
  disabled,
}: {
  items: { key: string; design: WindowDesign; qty: number }[]
  active: string | null
  onPick: (key: string) => void
  onAdd: () => void
  disabled?: boolean
}) {
  return (
    <div className="wtabs" role="tablist" aria-label={uz.order.items}>
      {items.map((it, i) => (
        <button key={it.key} type="button" role="tab" aria-selected={active === it.key} className={active === it.key ? 'wtab on' : 'wtab'} onClick={() => onPick(it.key)}>
          <span className="no">{i + 1}</span>
          <MiniWindow design={it.design} />
          {it.qty > 1 && (
            <span className="qty">
              {it.qty} {t.pcs}
            </span>
          )}
        </button>
      ))}
      <button type="button" className="ghost wtab-add" onClick={onAdd} disabled={disabled} aria-label={t.addWindow} title={t.addWindow}>
        +
      </button>
    </div>
  )
}
