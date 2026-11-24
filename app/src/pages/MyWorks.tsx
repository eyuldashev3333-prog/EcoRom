import { useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { supabase } from '../supabase'
import OrderCard, { whenText } from '../components/OrderCard'
import MyStats from '../components/MyStats'
import MonthPicker from '../ui/MonthPicker'
import type { CardData } from '../lib/orderCards'
import type { WindowDesign } from '../lib/window'
import { uz } from '../uz'

const t = uz.mywork
const tashkentMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' }).slice(0, 7)

interface WorkRow {
  id: string
  order_no: number
  status: string
  status_at: string | null
  deadline: string | null
  windows_count: number
  area_m2: number
  done_at: string | null
  items_count: number
  design: WindowDesign | null
  client_name: string | null
  phone: string | null
  address: string | null
}
interface ServiceRow {
  id: string
  order_no: number
  client_name: string
  address: string | null
  description: string
  work_done_at: string
}

const toCard = (r: WorkRow): CardData => ({
  id: r.id, order_no: r.order_no, status: r.status, created_at: '', status_at: r.status_at, deadline: r.deadline, install_date: null,
  address: r.address, contract_price: 0, debt: 0, windows_count: r.windows_count, area_m2: Number(r.area_m2), client: r.client_name ?? '—',
  phone: r.phone, imported: false, designs: r.design ? [r.design] : [], itemsCount: r.items_count, station: null, percent: 0, late: false,
  material: false, openService: 0, job: null, shop: null, glass: 'none', glassOrdered: false, photo: false,
})

// «Mening ishlarim»: мои заказы — в работе и выполненные (по месяцам), цифры месяца; монтажнику ещё и его сервисные заявки
export default function MyWorks() {
  const { me } = useAuth()
  const role = me?.role === 'ishlab' ? 'ishlab' : 'montajchi'
  const [month, setMonth] = useState(tashkentMonth())
  const [tab, setTab] = useState<'work' | 'done'>('work')
  const [data, setData] = useState<{ orders: WorkRow[]; service: ServiceRow[] } | null>(null)
  useEffect(() => {
    setData(null)
    supabase.rpc('my_work', { p_month: `${month}-01` }).then(({ data: d }) => setData((d as { orders: WorkRow[]; service: ServiceRow[] } | null) ?? { orders: [], service: [] }))
  }, [month])

  const rows = (data?.orders ?? []).filter((r) => (tab === 'done') === !!r.done_at)
  const open = (id: string) => (role === 'ishlab' ? `/shop/${id}` : `/install/${id}`)
  return (
    <>
      <h1>{t.title}</h1>
      <div className="inline wrap" style={{ alignItems: 'center', marginBottom: 12 }}>
        <MonthPicker value={month} onChange={setMonth} />
        <div className="seg">
          <button type="button" className={tab === 'work' ? 'on' : ''} onClick={() => setTab('work')}>
            {t.progress} <b>{(data?.orders ?? []).filter((r) => !r.done_at).length}</b>
          </button>
          <button type="button" className={tab === 'done' ? 'on' : ''} onClick={() => setTab('done')}>
            {t.done} <b>{(data?.orders ?? []).filter((r) => !!r.done_at).length}</b>
          </button>
        </div>
      </div>
      <MyStats role={role} month={month} />
      {data === null && <p className="muted">{uz.loading}</p>}
      {data && rows.length === 0 && <p className="muted">{t.empty}</p>}
      <div className="my-works">
        {rows.map((r) => (
          <OrderCard key={r.id} c={toCard(r)} to={open(r.id)} money={false} client={role === 'montajchi'} chips={false} note={r.done_at ? `${t.doneAt}: ${whenText(r.done_at)}` : undefined} />
        ))}
      </div>
      {role === 'montajchi' && data && data.service.length > 0 && (
        <>
          <h2>{t.serviceTitle}</h2>
          <div className="card">
            <table className="kv">
              <tbody>
                {data.service.map((s) => (
                  <tr key={s.id}>
                    <td>
                      №{s.order_no} · {s.client_name}
                      <br />
                      <small className="muted">{s.description}</small>
                    </td>
                    <td>{whenText(s.work_done_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
