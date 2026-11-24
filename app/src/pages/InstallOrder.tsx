import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import OrderCard from '../components/OrderCard'
import { InstallActions } from '../components/OrderActions'
import WindowSvg from '../components/WindowSvg'
import GlassStatus from '../components/GlassStatus'
import BreakageForm from '../components/BreakageForm'
import { useWorkCards } from '../lib/orderCards'
import type { WindowDesign } from '../lib/window'
import { uz } from '../uz'

const t = uz.install

interface Item {
  id: string
  pos: number
  title: string | null
  width_mm: number
  height_mm: number
  qty: number
  design: WindowDesign
  note: string | null
}

// заказ глазами монтажника: та же карточка с кнопками («Qabul qildim», «O'rnatildi»), куда ехать, чертежи, стекло
export default function InstallOrder() {
  const { id } = useParams()
  const { cards, reload } = useWorkCards('montajchi', id)
  const [items, setItems] = useState<Item[]>([])
  const [notes, setNotes] = useState<string | null>(null)
  useEffect(() => {
    supabase.from('w_order_items').select('id, pos, title, width_mm, height_mm, qty, design, note').eq('order_id', id).order('pos').then(({ data }) => setItems((data as Item[]) ?? []))
    supabase.from('w_orders').select('notes').eq('id', id).maybeSingle().then(({ data }) => setNotes((data as { notes: string | null } | null)?.notes ?? null))
  }, [id])

  const c = cards?.find((x) => x.id === id)
  if (cards === null) return <p className="muted">{uz.loading}</p>
  return (
    <>
      <p>
        <Link to="/">← {t.back}</Link>
      </p>
      {!c ? (
        <p className="muted">{uz.order.notFound}</p>
      ) : (
        <div className="ocard-solo">
          <OrderCard c={c} to={`/install/${c.id}`} money={false}>
            <InstallActions c={c} onDone={reload} />
          </OrderCard>
          {c.phone && (
            <a className="btn-link" href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}>
              {t.call}: {c.phone}
            </a>
          )}
        </div>
      )}
      {notes && <div className="card note">{notes}</div>}
      <div className="card install-items">
        {items.map((it) => (
          <div key={it.id} className="install-item">
            <WindowSvg design={it.design} maxHeight={150} />
            <div className="small">
              <b>{it.pos})</b> {it.title ? `${it.title} · ` : ''}
              {it.width_mm}×{it.height_mm}
              {it.qty > 1 ? ` · ${it.qty} ${uz.home.windows}` : ''}
              {it.note && <div className="muted">{it.note}</div>}
            </div>
          </div>
        ))}
      </div>
      {id && c && <GlassStatus orderId={id} status={c.status} />}
      {id && c && ['ready', 'installing', 'installed'].includes(c.status) && <BreakageForm orderId={id} items={items} />}
    </>
  )
}
