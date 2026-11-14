import { useEffect, type ReactNode } from 'react'

// Простой модальный диалог в стиле системы: затемнение, карточка, закрытие по Esc.
export function Dialog({ title, children, onClose, wide }: { title?: string; children: ReactNode; onClose?: () => void; wide?: boolean }) {
  useEffect(() => {
    if (!onClose) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={wide ? 'dialog wide' : 'dialog'} role="dialog" aria-modal="true" aria-label={title}>
        {title && <h3 className="dialog-title">{title}</h3>}
        {children}
      </div>
    </div>
  )
}

// Вопрос с двумя кнопками (НЕТ / ДА)
export function Confirm({
  title,
  text,
  no,
  yes,
  onNo,
  onYes,
}: {
  title?: string
  text: string
  no: string
  yes: string
  onNo: () => void
  onYes: () => void
}) {
  return (
    <Dialog title={title} onClose={onNo}>
      <p className="dialog-text">{text}</p>
      <div className="dialog-actions">
        <button type="button" className="ghost" onClick={onNo}>
          {no}
        </button>
        <button type="button" autoFocus onClick={onYes}>
          {yes}
        </button>
      </div>
    </Dialog>
  )
}
