import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import StageGrid, { type StageItem } from '../components/StageGrid'
import GlassStatus from '../components/GlassStatus'
import type { WindowDesign } from '../lib/window'
import { uz } from '../uz'

const t = uz.stages
const UNITS: Record<string, string> = { m: 'm', m2: 'm²', pcs: 'ta' }

interface WOrder {
  order_no: number
  status: string
  deadline: string | null
  client_name: string | null
  notes: string | null
}
interface WItem extends StageItem {
  materials: { items?: { name: string; qty: number; unit: string }[]; panes?: { w: number; h: number; sash?: boolean }[] }
}

// заказ глазами цеха: чертежи, размеры стеклопакетов, материалы (без цен) и галочки этапов
export default function ShopOrder() {
  const { id } = useParams()
  const [order, setOrder] = useState<WOrder | null>(null)
  const [items, setItems] = useState<WItem[]>([])

  const loadOrder = () =>
    supabase.from('w_orders').select('order_no, status, deadline, client_name, notes').eq('id', id).maybeSingle().then(({ data }) => setOrder(data as WOrder | null))
  useEffect(() => {
    loadOrder()
    supabase
      .from('w_order_items')
      .select('id, pos, title, width_mm, height_mm, qty, design, materials, note')
      .eq('order_id', id)
      .order('pos')
      .then(({ data }) =>
        setItems(((data as (WItem & { design: WindowDesign })[]) ?? []).map((x) => ({ ...x, panes: x.materials?.panes }))),
      )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!order) return <p className="muted">{uz.loading}</p>

  // материалы по всему заказу: позиция × количество
  const total = new Map<string, { qty: number; unit: string }>()
  for (const it of items)
    for (const m of it.materials?.items ?? []) {
      const prev = total.get(m.name)
      total.set(m.name, { unit: m.unit, qty: (prev?.qty ?? 0) + m.qty * it.qty })
    }

  return (
    <>
      <p>
        <Link to="/">← {t.back}</Link>
      </p>
      <h1>
        №{order.order_no} <span className={`status s-${order.status}`}>{uz.order.statuses[order.status]}</span>
      </h1>
      <p className="muted">
        {order.client_name}
        {order.deadline && ` · ${uz.home.deadline}: ${order.deadline.split('-').reverse().join('.')}`}
      </p>
      {order.notes && <div className="card note">{order.notes}</div>}

      <StageGrid items={items} status={order.status} drawings onChanged={loadOrder} />

      {id && <GlassStatus orderId={id} />}

      {total.size > 0 && (
        <div className="card">
          <h2>{t.materials}</h2>
          <table className="kv">
            <tbody>
              {[...total.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([name, m]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td>
                      {Math.round(m.qty * 100) / 100} {UNITS[m.unit] ?? m.unit}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
