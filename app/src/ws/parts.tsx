import { useEffect, useState, type ReactNode } from 'react'
import { fmtLen, lenToMm, lenUnit } from '../lib/units'
import type { Side } from '../lib/quote'

// ---- значки ----
export const Burger = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
)
export const Compass = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="9" r="4.5" fill="none" stroke="currentColor" strokeWidth="3" />
    <circle cx="24" cy="9" r="1.3" fill="currentColor" />
    <path d="M22 13 L11 44 M26 13 L37 44" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
    <path d="M17 31 H31" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
)
export const Trash = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M11 11 H37 M18 11 V7 H30 V11 M13 11 L15 42 H33 L35 11" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
    <path d="M20 19 L28 35 M28 19 L20 35" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
)
export const Pen = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path d="M4 20 L5 15 L16 4 L20 8 L9 19 Z" fill="currentColor" />
  </svg>
)

/** значок стороны окна: квадрат с жирной линией на нужной стороне (как «соединительные профили» у WinStudio) */
export function SidePic({ side, on }: { side: Side; on?: boolean }) {
  const line = { l: 'M3,3 V21', t: 'M3,3 H21', r: 'M21,3 V21', b: 'M3,21 H21' }[side]
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" fill={on ? '#cfe3f7' : '#fff'} stroke="#26435f" strokeWidth="1.4" />
      <path d={line} stroke="#26435f" strokeWidth="5" />
    </svg>
  )
}

// ---- рамка телефона ----
export function Phone({ children }: { children: ReactNode }) {
  return (
    <div className="ws-root">
      <div className="ws-phone">{children}</div>
    </div>
  )
}

// ---- диалог с кнопками НЕТ / ДА ----
export function Dlg({ title, children, onNo, onYes, no, yes, yesDisabled, bodyClass }: { title?: string; children: ReactNode; onNo: () => void; onYes: () => void; no: string; yes: string; yesDisabled?: boolean; bodyClass?: string }) {
  return (
    <div className="ws-ov" onMouseDown={(e) => e.target === e.currentTarget && onNo()}>
      <div className="ws-dlg" role="dialog" aria-modal="true" aria-label={title}>
        {title && <div className="ws-dlg-h">{title}</div>}
        <div className={`ws-dlg-body ${bodyClass ?? ''}`}>{children}</div>
        <div className="ws-dlg-act">
          <button type="button" className="no" onClick={onNo}>
            {no}
          </button>
          <button type="button" className="yes" disabled={yesDisabled} onClick={onYes}>
            {yes}
          </button>
        </div>
      </div>
    </div>
  )
}

export function AskDlg({ text, no, yes, onNo, onYes }: { text: string; no: string; yes: string; onNo: () => void; onYes: () => void }) {
  return (
    <Dlg no={no} yes={yes} onNo={onNo} onYes={onYes} bodyClass="plain">
      <div className="ws-text">{text}</div>
    </Dlg>
  )
}

// ---- цифровая клавиатура: 7-8-9 / 4-5-6 / 1-2-3 / ◄ 0 . / ✕ ◂◂ ✔ ----
export function Keypad({ value, min, max, onOk, onCancel, plain }: { value: number; min: number; max: number; onOk: (mm: number) => void; onCancel: () => void; plain?: boolean }) {
  // plain — обычное число (цена, количество), иначе длина в выбранных единицах (мм / дюймы), результат в мм
  const [text, setText] = useState(plain ? (value ? String(value) : '') : fmtLen(value))
  const n = Number(text.replace(',', '.'))
  const mm = plain ? n : lenToMm(n)
  const valid = text !== '' && Number.isFinite(n) && mm >= min && mm <= max
  const push = (c: string) => setText((s) => (c === '.' && (s.includes('.') || s === '') ? s : s.length >= 7 ? s : s + c))
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) push(e.key)
      else if (e.key === '.' || e.key === ',') push('.')
      else if (e.key === 'Backspace') setText((s) => s.slice(0, -1))
      else if (e.key === 'Enter' && valid) onOk(mm)
      else if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })
  return (
    <div className="ws-ov" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="ws-pad" role="dialog" aria-modal="true" aria-label={lenUnit()}>
        <div className="ws-pad-val" aria-live="polite">
          {text === '' ? '' : text}
        </div>
        <div className="ws-pad-keys">
          {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((d) => (
            <button key={d} type="button" onClick={() => push(d)}>
              {d}
            </button>
          ))}
          <button type="button" className="g" aria-label="⌫" onClick={() => setText((s) => s.slice(0, -1))}>
            ◂
          </button>
          <button type="button" onClick={() => push('0')}>
            0
          </button>
          <button type="button" className="g" onClick={() => push('.')}>
            .
          </button>
          <button type="button" className="g" aria-label="Cancel" onClick={onCancel}>
            ✕
          </button>
          <button type="button" className="g" aria-label="Clear" onClick={() => setText('')}>
            ◂◂
          </button>
          <button type="button" className="dk" aria-label="OK" disabled={!valid} onClick={() => valid && onOk(mm)}>
            ✔
          </button>
        </div>
      </div>
    </div>
  )
}
