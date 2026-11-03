import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import InstallParts, { type InstallItem } from '../components/InstallParts'
import GlassStatus from '../components/GlassStatus'
import { uz } from '../uz'

const t = uz.install

interface WOrder {
  order_no: number
  status: string
  deadline: string | null
  client_name: string | null
  address: string | null
  contact_phone: string | null
  notes: string | null
}

// заказ глазами монтажника: куда ехать, чертежи окон, отметки Rama/Shisha/Podokonnik с фото
export default function InstallOrder() {
  const { id } = useParams()
  const [order, setOrder] = useState<WOrder | null>(null)
  const [items, setItems] = useState<InstallItem[]>([])
  const [plan, setPlan] = useState<string | null>(null)

  const loadOrder = () =>
    supabase.from('w_orders').select('order_no, status, deadline, client_name, address, contact_phone, notes').eq('id', id).maybeSingle().then(({ data }) => setOrder(data as WOrder | null))
  useEffect(() => {
    loadOrder()
    supabase.from('w_install_jobs').select('plan_date').eq('order_id', id).maybeSingle().then(({ data }) => setPlan((data as { plan_date: string | null } | null)?.plan_date ?? null))
    supabase
      .from('w_order_items')
      .select('id, pos, title, width_mm, height_mm, qty, design, options, note')
      .eq('order_id', id)
      .order('pos')
      .then(({ data }) => setItems((data as InstallItem[]) ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!order) return <p className="muted">{uz.loading}</p>
  return (
    <>
      <p>
        <Link to="/">← {t.back}</Link>
      </p>
      <h1>
        №{order.order_no} <span className={`status s-${order.status}`}>{uz.order.statuses[order.status]}</span>
      </h1>
      <div className="card">
        <b>{order.client_name}</b>
        {plan && (
          <p className="muted">
            {t.date}: {plan.split('-').reverse().join('.')}
          </p>
        )}
        {order.address && <p>📍 {order.address}</p>}
        {order.contact_phone && (
          <p>
            <a className="btn-link" href={`tel:${order.contact_phone.replace(/[^\d+]/g, '')}`}>
              📞 {order.contact_phone}
            </a>
          </p>
        )}
        {order.notes && <p className="muted">{order.notes}</p>}
      </div>
      {id && <InstallParts orderId={id} items={items} status={order.status} drawings onChanged={loadOrder} />}
      {id && <GlassStatus orderId={id} locked />}
    </>
  )
}
