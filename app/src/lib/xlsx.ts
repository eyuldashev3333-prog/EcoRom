// Выгрузка таблиц в .xlsx в привычном виде (лист на месяц, те же колонки). exceljs грузится только при выгрузке.
import { download } from './export'

export interface XCol {
  header: string
  key: string
  width?: number
  type?: 'text' | 'num' | 'money' | 'date'
  total?: boolean
}
export interface XSheet {
  name: string
  cols: XCol[]
  rows: Record<string, unknown>[]
}

export async function exportXlsx(file: string, sheets: XSheet[]) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ECOROM'
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] })
    ws.columns = s.cols.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 14 }))
    for (const r of s.rows) {
      const row: Record<string, unknown> = {}
      for (const c of s.cols) {
        const v = r[c.key]
        row[c.key] = v === null || v === undefined || v === '' ? null : c.type === 'money' || c.type === 'num' ? Number(v) : c.type === 'date' ? new Date(String(v).slice(0, 10)) : v
      }
      ws.addRow(row)
    }
    if (s.cols.some((c) => c.total)) {
      const t: Record<string, unknown> = { [s.cols[0].key]: 'JAMI' }
      s.cols.forEach((c) => c.total && (t[c.key] = s.rows.reduce((a, r) => a + (Number(r[c.key]) || 0), 0)))
      const tr = ws.addRow(t)
      tr.font = { bold: true }
    }
    const head = ws.getRow(1)
    head.font = { bold: true }
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F2F4' } }
    s.cols.forEach((c, i) => {
      const col = ws.getColumn(i + 1)
      if (c.type === 'money') col.numFmt = '# ##0'
      if (c.type === 'num') col.numFmt = '0.00'
      if (c.type === 'date') col.numFmt = 'dd.mm.yyyy'
    })
    ws.eachRow((row) =>
      row.eachCell((cell) => {
        cell.border = { top: { style: 'thin', color: { argb: 'FFD5D8DC' } }, bottom: { style: 'thin', color: { argb: 'FFD5D8DC' } }, left: { style: 'thin', color: { argb: 'FFD5D8DC' } }, right: { style: 'thin', color: { argb: 'FFD5D8DC' } } }
      }),
    )
  }
  const buf = await wb.xlsx.writeBuffer()
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), file)
}

/** лист из нескольких блоков друг под другом (как месячный лист SAVDO BOLIMI): заголовок блока, шапка, строки, итог */
export async function exportBlocks(file: string, sheet: string, blocks: { title: string; cols: XCol[]; rows: Record<string, unknown>[] }[]) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(sheet.slice(0, 31))
  const widths: number[] = []
  const thin = { style: 'thin' as const, color: { argb: 'FFD5D8DC' } }
  for (const b of blocks) {
    const t = ws.addRow([b.title])
    t.font = { bold: true, size: 12 }
    const h = ws.addRow(b.cols.map((c) => c.header))
    h.font = { bold: true }
    h.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F2F4' } }
      c.border = { top: thin, bottom: thin, left: thin, right: thin }
    })
    b.cols.forEach((c, i) => (widths[i] = Math.max(widths[i] ?? 10, c.width ?? 14)))
    const put = (vals: unknown[], bold = false) => {
      const row = ws.addRow(vals)
      if (bold) row.font = { bold: true }
      row.eachCell((cell, ci) => {
        const c = b.cols[ci - 1]
        cell.border = { top: thin, bottom: thin, left: thin, right: thin }
        if (c?.type === 'money') cell.numFmt = '# ##0'
        if (c?.type === 'num') cell.numFmt = '0.00'
        if (c?.type === 'date') cell.numFmt = 'dd.mm.yyyy'
      })
    }
    for (const r of b.rows)
      put(b.cols.map((c) => {
        const v = r[c.key]
        if (v === null || v === undefined || v === '') return null
        return c.type === 'money' || c.type === 'num' ? Number(v) : c.type === 'date' ? new Date(String(v).slice(0, 10)) : v
      }))
    if (b.cols.some((c) => c.total)) put(b.cols.map((c, i) => (i === 0 ? 'JAMI' : c.total ? b.rows.reduce((a, r) => a + (Number(r[c.key]) || 0), 0) : null)), true)
    ws.addRow([])
  }
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w))
  const buf = await wb.xlsx.writeBuffer()
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), file)
}

const MONTHS = ['YANVAR', 'FEVRAL', 'MART', 'APREL', 'MAY', 'IYUN', 'IYUL', 'AVGUST', 'SENTABR', 'OKTABR', 'NOYABR', 'DEKABR']
/** «2026-11» → «NOYABR-2026» (как названия листов в ваших таблицах) */
export const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]}-${ym.slice(0, 4)}`
