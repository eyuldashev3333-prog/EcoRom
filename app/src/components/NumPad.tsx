import { useEffect, useState } from 'react'
import { Dialog } from './Dialog'
import { fmtLen, lenToMm, lenUnit } from '../lib/units'

// Цифровая клавиатура как в WinStudio: 7-8-9 / 4-5-6 / 1-2-3 / ◄ 0 . / ✕ ◂◂ ✔.
// При открытии в поле текущее значение; цифры дописываются, ◄ стирает символ, ◂◂ очищает, ✔ применяет, ✕ закрывает.
export default function NumPad({
  title,
  value,
  min,
  max,
  onOk,
  onCancel,
}: {
  title: string
  value: number
  min: number
  max: number
  onOk: (n: number) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(fmtLen(value))
  const n = Number(text.replace(',', '.'))
  const mm = lenToMm(n)
  const valid = text !== '' && Number.isFinite(n) && mm >= min && mm <= max
  const push = (c: string) => setText((s) => (c === '.' && (s.includes('.') || s === '') ? s : s.length >= 7 ? s : s + c))
  const ok = () => valid && onOk(mm)

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) push(e.key)
      else if (e.key === '.' || e.key === ',') push('.')
      else if (e.key === 'Backspace') setText((s) => s.slice(0, -1))
      else if (e.key === 'Enter') ok()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  const key = (label: string, onClick: () => void, cls = 'ghost', aria?: string) => (
    <button key={label} type="button" className={`numkey ${cls}`} onClick={onClick} aria-label={aria ?? label}>
      {label}
    </button>
  )
  return (
    <Dialog title={title} onClose={onCancel}>
      <div className={valid || text === '' ? 'numfield' : 'numfield bad'} aria-live="polite">
        {text === '' ? '0' : text}
      </div>
      <p className="muted numrange">
        {fmtLen(min)} – {fmtLen(max)} {lenUnit()}
      </p>
      <div className="numpad">
        {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((d) => key(d, () => push(d)))}
        {key('◄', () => setText((s) => s.slice(0, -1)), 'ghost', '⌫')}
        {key('0', () => push('0'))}
        {key('.', () => push('.'))}
        {key('✕', onCancel, 'ghost', 'Cancel')}
        {key('◂◂', () => setText(''), 'ghost', 'Clear')}
        <button type="button" className="numkey" disabled={!valid} onClick={ok} aria-label="OK">
          ✔
        </button>
      </div>
    </Dialog>
  )
}
