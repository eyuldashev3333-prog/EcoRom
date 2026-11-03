import { useEffect, useState } from 'react'
import type { Material } from '../lib/quote'
import { fmtQty, loadStock, stockKey, unitLabel, type StockRow } from '../lib/stock'
import { uz } from '../uz'

const t = uz.stock

// новый заказ: сколько материала нужно и сколько есть на складе («есть остатки — заказывать не обязательно»)
export default function StockHint({ items }: { items: { materials: Material[]; qty: number }[] }) {
  const [stock, setStock] = useState<Map<string, StockRow> | null>(null)
  useEffect(() => {
    loadStock().then((rows) => setStock(new Map(rows.map((r) => [stockKey(r.item_id, r.part), r]))))
  }, [])
  if (!stock) return null

  const need = new Map<string, { name: string; unit: string; qty: number; have: number }>()
  for (const it of items)
    for (const m of it.materials) {
      const key = stockKey(m.item_id, m.part ?? '')
      const s = stock.get(key)
      if (!s) continue // не учитывается на складе (работы, цвет)
      const prev = need.get(key)
      need.set(key, { name: s.name, unit: s.unit, have: s.qty, qty: (prev?.qty ?? 0) + m.qty * it.qty })
    }
  if (!need.size) return null

  return (
    <div className="card">
      <h2>{t.hintTitle}</h2>
      <table className="tbl">
        <thead>
          <tr>
            <th>{t.item}</th>
            <th className="num">{t.need}</th>
            <th className="num">{t.inStock}</th>
            <th className="num">{t.after}</th>
          </tr>
        </thead>
        <tbody>
          {[...need.values()].map((n) => (
            <tr key={n.name} className={n.have - n.qty < 0 ? 'neg' : ''}>
              <td>{n.name}</td>
              <td className="num">{fmtQty(n.qty)}</td>
              <td className="num">
                {fmtQty(n.have)} {unitLabel(n.unit)}
              </td>
              <td className="num">{fmtQty(n.have - n.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">{t.hintNote}</p>
    </div>
  )
}
