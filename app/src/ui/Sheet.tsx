import { useEffect, useRef, useState, type ReactNode } from 'react'

// Таблица «как в Excel»: липкая шапка и первые колонки, правка прямо в ячейке (двойной клик / Enter),
// Enter — сохранить, Esc — отмена, Tab — следующая ячейка; строка итогов внизу.
export type ColType = 'text' | 'num' | 'money' | 'date' | 'select'
export interface Col<R> {
  key: string
  label: string
  width?: number
  type?: ColType
  editable?: boolean | ((r: R) => boolean)
  options?: { value: string; label: string }[]
  total?: boolean
  sticky?: boolean
  render?: (r: R) => ReactNode
  get?: (r: R) => unknown
  className?: (r: R) => string
}

const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })
export const fmtCell = (v: unknown, type: ColType = 'text') => {
  if (v === null || v === undefined || v === '') return ''
  if (type === 'money') return nf.format(Math.round(Number(v)))
  if (type === 'num') return nf.format(Number(v))
  if (type === 'date') return String(v).slice(0, 10).split('-').reverse().join('.')
  return String(v)
}

export default function Sheet<R extends { id: string }>({
  cols,
  rows,
  onEdit,
  onOpen,
  totalsLabel = 'JAMI',
}: {
  cols: Col<R>[]
  rows: R[]
  onEdit?: (row: R, key: string, value: string) => Promise<string | null>
  onOpen?: (row: R) => void
  totalsLabel?: string
}) {
  const [edit, setEdit] = useState<{ id: string; key: string } | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<{ id: string; key: string; text: string } | null>(null)
  const input = useRef<HTMLInputElement & HTMLSelectElement>(null)
  useEffect(() => {
    input.current?.focus()
    if (input.current && 'select' in input.current && input.current.tagName === 'INPUT') input.current.select()
  }, [edit])

  const val = (r: R, c: Col<R>) => (c.get ? c.get(r) : (r as unknown as Record<string, unknown>)[c.key])
  const canEdit = (r: R, c: Col<R>) => !!onEdit && (typeof c.editable === 'function' ? c.editable(r) : !!c.editable)
  const start = (r: R, c: Col<R>) => {
    if (!canEdit(r, c)) return
    const v = val(r, c)
    setDraft(v === null || v === undefined ? '' : c.type === 'date' ? String(v).slice(0, 10) : String(v))
    setErr(null)
    setEdit({ id: r.id, key: c.key })
  }
  const editable = cols.filter((c) => c.editable)
  const commit = async (r: R, c: Col<R>, next?: 'tab') => {
    const before = val(r, c)
    const same = String(before ?? '') === draft || (c.type === 'date' && String(before ?? '').slice(0, 10) === draft)
    if (!same && onEdit) {
      setBusy(true)
      const e = await onEdit(r, c.key, draft)
      setBusy(false)
      if (e) {
        setErr({ id: r.id, key: c.key, text: e })
        return
      }
    }
    if (next === 'tab') {
      const i = editable.findIndex((x) => x.key === c.key)
      const nc = editable[i + 1]
      if (nc) return start(r, nc)
    }
    setEdit(null)
  }

  const totals = cols.map((c) => (c.total ? rows.reduce((s, r) => s + (Number(val(r, c)) || 0), 0) : null))
  let left = 0
  const stickyLeft = cols.map((c) => {
    const l = c.sticky ? left : null
    if (c.sticky) left += c.width ?? 120
    return l
  })

  return (
    <div className="sheet-wrap">
      <table className="xl">
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th key={c.key} style={{ minWidth: c.width, width: c.width, left: stickyLeft[i] ?? undefined }} className={`${c.sticky ? 'stk' : ''} ${c.type === 'money' || c.type === 'num' ? 'rt' : ''}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} onDoubleClick={() => !onEdit && onOpen?.(r)}>
              {cols.map((c, i) => {
                const isEdit = edit?.id === r.id && edit.key === c.key
                const e = err?.id === r.id && err.key === c.key ? err.text : ''
                const cls = [c.sticky ? 'stk' : '', c.type === 'money' || c.type === 'num' ? 'rt' : '', canEdit(r, c) ? 'ed' : '', isEdit ? 'editing' : '', e ? 'bad' : '', c.className?.(r) ?? ''].join(' ')
                return (
                  <td
                    key={c.key}
                    className={cls}
                    style={{ left: stickyLeft[i] ?? undefined }}
                    title={e || undefined}
                    onDoubleClick={(ev) => {
                      ev.stopPropagation()
                      if (canEdit(r, c)) start(r, c)
                      else onOpen?.(r)
                    }}
                  >
                    {isEdit ? (
                      c.type === 'select' ? (
                        <select ref={input} value={draft} disabled={busy} onChange={(ev) => setDraft(ev.target.value)} onBlur={() => commit(r, c)} onKeyDown={(ev) => ev.key === 'Escape' && setEdit(null)}>
                          {c.options?.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          ref={input}
                          type={c.type === 'date' ? 'date' : 'text'}
                          inputMode={c.type === 'money' || c.type === 'num' ? 'decimal' : undefined}
                          value={draft}
                          disabled={busy}
                          onChange={(ev) => setDraft(ev.target.value)}
                          onBlur={() => commit(r, c)}
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter') commit(r, c)
                            if (ev.key === 'Escape') setEdit(null)
                            if (ev.key === 'Tab') {
                              ev.preventDefault()
                              commit(r, c, 'tab')
                            }
                          }}
                        />
                      )
                    ) : c.render ? (
                      c.render(r)
                    ) : (
                      fmtCell(val(r, c), c.type)
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
        {totals.some((t) => t !== null) && (
          <tfoot>
            <tr>
              {cols.map((c, i) => (
                <td key={c.key} className={`${c.sticky ? 'stk' : ''} ${c.type === 'money' || c.type === 'num' ? 'rt' : ''}`} style={{ left: stickyLeft[i] ?? undefined }}>
                  {i === 0 ? totalsLabel : totals[i] !== null ? fmtCell(totals[i], c.type) : ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
