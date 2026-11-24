import { fmtM, fmtM2, m2Unit, mUnit } from '../lib/units'
import { uz } from '../uz'
import { WS_COLS, type CostMap, type QtyMap } from './columns'

const t = uz.ws

const f2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2)
// деньги коротко и читаемо: «1 240 458» (с неразрывными пробелами, без копеек от 1000), мелкие суммы — с копейками
// (длинные «1240458.49 so'm» налезали друг на друга в узких колонках Telegram)
const money = (n: number) => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('ru-RU') : f2(n))

export interface TableData {
  // выбранное окно (строки «окно» и «цена»)
  one: { qty: QtyMap; cost: CostMap; price: { withDiscount: number; noDiscount: number; discountPct: number }; ownPrice: boolean }
  // весь заказ (строки «все окна» и «стоимость»)
  all: { qty: QtyMap; cost: CostMap; noDiscount: number; withDiscount: number }
  taxPct: number // налог прибавляется только к итогу «стоимость»
}

// Нижняя таблица как у WinStudio: колонка «позиция» и «всего» закреплены, колонки между ними листаются вбок.
// Строки: окно (метры выбранного окна) · цена (его стоимость по колонкам) · все окна (метры всех окон заказа) · стоимость (стоимость всех окон).
export default function WsTable({ data, currency }: { data: TableData | null; currency: string }) {
  const one = data?.one
  const all = data?.all
  const qtyText = (m: QtyMap | undefined, col: (typeof WS_COLS)[number]) => {
    const x = m?.[col]
    if (!x || x.v === 0) return ''
    if (x.unit === 'm2') return `${fmtM2(x.v).toFixed(2)} ${m2Unit()}`
    if (x.unit === 'm') return `${fmtM(x.v).toFixed(2)} ${mUnit()}`
    return String(x.v)
  }
  const costText = (m: CostMap | undefined, col: (typeof WS_COLS)[number]) => (m?.[col] ? money(m[col]!) : '')
  const pctOne = `(-${Math.round((one?.price.discountPct ?? 0) * 100) / 100}%)`
  const tax = data?.taxPct ?? 0
  const pctAllNum = all && all.noDiscount > 0 ? Math.round((1 - all.withDiscount / all.noDiscount) * 10000) / 100 : 0
  const pctAll = `(-${pctAllNum}%${tax > 0 ? `+${tax}%` : ''})`
  const allTotal = (all?.withDiscount ?? 0) * (1 + tax / 100)
  const dash = (s: string) => (s === '' ? '-' : s)
  // колонка «jami»: сумма крупно, под ней мелко валюта или скидка — две строки вместо одной длинной, которая налезала на соседей
  const rows: { cls: string; cells: (col: (typeof WS_COLS)[number]) => string; label: string; labelCls?: string; total: string; sub: string; totalCls: string }[] = [
    { cls: 'ws-r1', label: t.rowOne, cells: (col) => dash(qtyText(one?.qty, col)), total: money(one?.price.noDiscount ?? 0), sub: currency, totalCls: 'ws-val-blue' },
    { cls: 'ws-r2', label: t.rowPrice, labelCls: 'ws-lbl-price', cells: (col) => dash(costText(one?.cost, col)), total: money(one?.price.withDiscount ?? 0), sub: pctOne, totalCls: 'ws-val-blue' },
    { cls: 'ws-r3', label: t.rowAll, cells: (col) => dash(qtyText(all?.qty, col)), total: money(all?.noDiscount ?? 0), sub: currency, totalCls: 'ws-val-red' },
    { cls: 'ws-r4', label: t.rowCost, labelCls: 'ws-lbl-cost', cells: (col) => dash(costText(all?.cost, col)), total: money(allTotal), sub: pctAll, totalCls: 'ws-val-red' },
  ]
  const yel = one?.ownPrice ? 'ws-val-yellow' : ''
  return (
    <div className="ws-table" role="region" aria-label="table">
      <div className="ws-tl">
        <div className="ws-trow ws-r0">{t.position}</div>
        {rows.map((r) => (
          <div key={r.label} className={`ws-trow ${r.cls} ${r.labelCls ?? ''}`}>
            {r.label}
          </div>
        ))}
      </div>
      <div className="ws-ts">
        <table>
          <thead>
            <tr className="ws-r0">
              {WS_COLS.map((col) => (
                <th key={col}>{t.cols[col]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className={r.cls}>
                {WS_COLS.map((col) => (
                  <td key={col} className={r.labelCls === 'ws-lbl-price' || r.labelCls === 'ws-lbl-cost' ? r.labelCls : ''}>
                    {r.cells(col)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ws-tr">
        <div className="ws-trow ws-r0 ws-th-all">{t.total}</div>
        {rows.map((r, i) => (
          <div key={r.label} className={`ws-trow ${r.cls} ${r.totalCls} ${i < 2 ? yel : ''}`}>
            <span className="v">{r.total}</span>
            <small>{r.sub}</small>
          </div>
        ))}
      </div>
    </div>
  )
}
