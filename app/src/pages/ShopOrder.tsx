import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import OrderCard from '../components/OrderCard'
import { ShopActions } from '../components/OrderActions'
import WindowSvg from '../components/WindowSvg'
import { useWorkCards } from '../lib/orderCards'
import type { WindowDesign } from '../lib/window'
import { uz } from '../uz'

const t = uz.stages
const UNITS: Record<string, string> = { m: 'm', m2: 'm²', pcs: 'ta' }

interface Item {
  id: string
  pos: number
  title: string | null
  width_mm: number
  height_mm: number
  qty: number
  design: WindowDesign
  note: string | null
  materials: { items?: { name: string; qty: number; unit: string }[]; panes?: { w: number; h: number }[]; legend?: string[]; color?: string }
}

// заказ глазами цеха: та же карточка с кнопками («Qabul qildim / Material yetmaydi», «Tayyor»), чертежи и материалы (без цен)
export default function ShopOrder() {
  const { id } = useParams()
  const { cards, reload } = useWorkCards('ishlab', id)
  const [items, setItems] = useState<Item[]>([])
  const [notes, setNotes] = useState<string | null>(null)
  useEffect(() => {
    supabase.from('w_order_items').select('id, pos, title, width_mm, height_mm, qty, design, materials, note').eq('order_id', id).order('pos').then(({ data }) => setItems((data as Item[]) ?? []))
    supabase.from('w_orders').select('notes').eq('id', id).maybeSingle().then(({ data }) => setNotes((data as { notes: string | null } | null)?.notes ?? null))
  }, [id])

  const c = cards?.find((x) => x.id === id)
  if (cards === null) return <p className="muted">{uz.loading}</p>

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
      {!c ? (
        <p className="muted">{uz.order.notFound}</p>
      ) : (
        <div className="ocard-solo">
          <OrderCard c={c} to={`/shop/${c.id}`} money={false} client={false}>
            <ShopActions c={c} onDone={reload} />
          </OrderCard>
        </div>
      )}
      {notes && <div className="card note">{notes}</div>}
      {/* чертежи — сразу, крупно, с размерами: по ним цех работает */}
      {items.map((it) => (
        <div key={it.id} className="card shop-draw">
          <div className="inline head" style={{ marginBottom: 6 }}>
            <b>
              {it.pos}) {it.title ? `${it.title} · ` : ''}
              {it.width_mm}×{it.height_mm}
            </b>
            <span className="status">{it.qty} {uz.home.windows}</span>
          </div>
          <WindowSvg design={it.design} frameColor={it.materials?.color} maxHeight={440} />
          {it.materials?.panes?.length ? (
            <p className="small">
              <b>{t.panes}:</b> {it.materials.panes.map((p) => `${p.w}×${p.h}`).join(', ')}
            </p>
          ) : null}
          {it.materials?.legend?.length ? (
            <ul className="shop-legend">
              {it.materials.legend.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          ) : null}
          {it.note && <p className="muted small">{it.note}</p>}
        </div>
      ))}      {total.size > 0 && (
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
