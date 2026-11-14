import { formatSum } from '../lib/pricing'
import type { Measure } from '../lib/window'
import { fmtM, fmtM2, m2Unit, mUnit } from '../lib/units'
import { uz } from '../uz'

const t = uz.designer
const r2 = (n: number) => Math.round(n * 100) / 100
const r3 = (n: number) => Math.round(n * 1000) / 1000

// Нижняя таблица метров как в WinStudio: строка «одно окно» и «все окна» (× количество), в конце — себестоимость.
// Колонки без данных (0) показываются прочерком, чтобы строка не разрасталась шумом.
export default function MeasureTable({ m, qty = 1, cost, price }: { m: Measure; qty?: number; cost?: number; price?: number }) {
  const cols: { key: string; label: string; unit: string; v: number; dp: 2 | 3 }[] = [
    { key: 'area', label: t.area, unit: 'm²', v: m.area_m2, dp: 2 },
    { key: 'frame', label: t.frame, unit: 'm', v: m.frame_m, dp: 2 },
    { key: 'impost', label: t.impost, unit: 'm', v: m.impost_m, dp: 2 },
    { key: 'bead', label: t.bead, unit: 'm', v: m.bead_m, dp: 2 },
    { key: 'gasket', label: t.gasket, unit: 'm', v: m.gasket_m, dp: 2 },
    { key: 'sash', label: t.sash, unit: 'm', v: r2(m.sash_m - m.door_sash_m), dp: 2 },
    { key: 'door', label: t.doorSash, unit: 'm', v: m.door_sash_m, dp: 2 },
    { key: 'glass', label: t.glass, unit: 'm²', v: m.glass_m2, dp: 3 },
    { key: 'sandwich', label: t.panel, unit: 'm²', v: m.sandwich_m2, dp: 3 },
    { key: 'net', label: t.net, unit: 'm²', v: m.nets_m2, dp: 3 },
  ]
  // единицы показа: м/м² или футы/кв. футы (переключатель в «Sozlamalar»)
  const shown = cols.map((c) => ({ ...c, v: c.unit === 'm' ? fmtM(c.v) : fmtM2(c.v), unit: c.unit === 'm' ? mUnit() : m2Unit() }))
  const fmt = (v: number, dp: 2 | 3, k: number) => {
    const x = dp === 2 ? r2(v * k) : r3(v * k)
    return x === 0 ? '—' : x.toFixed(dp === 2 ? 2 : 3)
  }
  return (
    <div className="card tbl-scroll" role="region" aria-label={t.measures} tabIndex={0}>
      <table className="mtable">
        <thead>
          <tr>
            <th />
            {shown.map((c) => (
              <th key={c.key}>
                {c.label}
                <small>{c.unit}</small>
              </th>
            ))}
            {cost !== undefined && (
              <th>
                {t.tblCost}
                <small>so‘m</small>
              </th>
            )}
            {price !== undefined && (
              <th>
                {t.tblPrice}
                <small>so‘m</small>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">{t.tblOne}</th>
            {shown.map((c) => (
              <td key={c.key}>{fmt(c.v, c.dp, 1)}</td>
            ))}
            {cost !== undefined && <td>{formatSum(cost)}</td>}
            {price !== undefined && <td>{formatSum(price)}</td>}
          </tr>
          <tr>
            <th scope="row">
              {t.tblAll} <small>× {qty}</small>
            </th>
            {shown.map((c) => (
              <td key={c.key}>{fmt(c.v, c.dp, qty)}</td>
            ))}
            {cost !== undefined && (
              <td>
                <b>{formatSum(cost * qty)}</b>
              </td>
            )}
            {price !== undefined && (
              <td>
                <b>{formatSum(price * qty)}</b>
              </td>
            )}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
