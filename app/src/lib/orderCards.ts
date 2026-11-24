import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import type { WindowDesign } from './window'

// Данные карточек заказов (одни и те же карточки в «Savdo» и в «Montaj va servis»)
export interface CardData {
  id: string
  order_no: number
  status: string
  created_at: string
  deadline: string | null
  install_date: string | null
  address: string | null
  contract_price: number
  debt: number
  windows_count: number
  area_m2: number
  client: string
  phone: string | null
  imported: boolean
  designs: WindowDesign[] // чертежи окон (первое показываем, остальные «+N»)
  itemsCount: number
  station: string | null
  percent: number
  late: boolean
  material: boolean
  openService: number
  job: { id: string; status: string; plan_date: string | null; accepted_by: string | null; crew: string[] } | null
  shop: ShopAns | null // первый ответ цеха после последней отправки
  glass: GlassState
  photo: boolean // есть фото установки
}
export interface ShopAns {
  result: string
  name: string
  note: string | null
}
export type GlassState = 'none' | 'ordered' | 'installed' | 'mixed'

/** стекло заказа одним словом: все окна в одном состоянии или вперемешку («arrived» считаем «ordered») */
export function glassOf(list: (string | null | undefined)[]): GlassState {
  const s = new Set(list.map((x) => (x === 'arrived' ? 'ordered' : x ?? 'none')))
  if (s.size === 0) return 'none'
  if (s.size > 1) return s.has('installed') ? 'mixed' : s.has('ordered') ? 'ordered' : 'none'
  return [...s][0] as GlassState
}

export type Column = 'new' | 'shop' | 'ready' | 'install' | 'done'
export const columnOf = (status: string): Column =>
  status === 'new' ? 'new' : status === 'in_production' ? 'shop' : status === 'ready' ? 'ready' : status === 'installing' ? 'install' : 'done'

const ACTIVE = ['new', 'in_production', 'ready', 'installing', 'installed']
const DAY = 864e5

/** дней до срока: <0 — просрочено; null — срока нет или заказ завершён */
export function daysLeft(c: Pick<CardData, 'deadline' | 'status'>): number | null {
  if (!c.deadline || ['installed', 'closed', 'cancelled', 'unknown'].includes(c.status)) return null
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' })
  return Math.round((Date.parse(c.deadline) - Date.parse(today)) / DAY)
}

interface OrderRow {
  id: string
  order_no: number
  status: string
  created_at: string
  deadline: string | null
  install_date: string | null
  address: string | null
  contract_price: number
  windows_count: number
  area_m2: number
  is_imported: boolean
  shop_sent_at: string | null
  clients: { full_name: string; phone: string | null } | null
  order_items?: { pos: number; design: WindowDesign; glass_status: string | null }[]
}
const SELECT = 'id, order_no, status, created_at, deadline, install_date, address, contract_price, windows_count, area_m2, is_imported, shop_sent_at, clients(full_name, phone)'

export function useOrderCards(): { cards: CardData[] | null; names: Map<string, string>; reload: () => void } {
  const [cards, setCards] = useState<CardData[] | null>(null)
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((x) => x + 1), [])

  useEffect(() => {
    let live = true
    ;(async () => {
      const [all, act, paid, ws, svc, jobs, emps, checks, photos] = await Promise.all([
        supabase.from('orders').select(SELECT).order('order_no', { ascending: false }).limit(5000),
        supabase.from('orders').select(`${SELECT}, order_items(pos, design, glass_status)`).in('status', ACTIVE).eq('is_imported', false).order('order_no', { ascending: false }).limit(400),
        supabase.from('v_order_paid').select('order_id, debt'),
        supabase.rpc('workshop_state'),
        supabase.from('service_tickets').select('order_id').neq('status', 'closed'),
        supabase.from('install_jobs').select('id, order_id, status, plan_date, accepted_by, created_at, install_job_members(employee_id)').order('created_at', { ascending: false }),
        supabase.from('employees').select('id, full_name'),
        supabase.from('order_material_checks').select('order_id, result, note, created_at, employee_id').order('created_at').limit(3000),
        supabase.from('install_order_photos').select('order_id'),
      ])
      if (!live) return
      const items = new Map<string, { pos: number; design: WindowDesign; glass_status: string | null }[]>()
      const sent = new Map<string, string | null>()
      for (const o of ((act.data as unknown as OrderRow[]) ?? [])) {
        items.set(o.id, [...(o.order_items ?? [])].sort((a, b) => a.pos - b.pos))
        sent.set(o.id, o.shop_sent_at)
      }
      const empName = new Map(((emps.data as { id: string; full_name: string }[]) ?? []).map((e) => [e.id, e.full_name]))
      // первый ответ цеха после последней отправки (как в shop_state)
      const shop = new Map<string, ShopAns>()
      for (const c of ((checks.data as { order_id: string; result: string; note: string | null; created_at: string; employee_id: string }[]) ?? [])) {
        const at = sent.get(c.order_id)
        if (!at || c.created_at < at || shop.has(c.order_id)) continue
        shop.set(c.order_id, { result: c.result, note: c.note, name: empName.get(c.employee_id) ?? '' })
      }
      const withPhoto = new Set(((photos.data as { order_id: string }[]) ?? []).map((p) => p.order_id))
      const debt = new Map(((paid.data as { order_id: string; debt: string }[]) ?? []).map((d) => [d.order_id, Number(d.debt)]))
      const st = new Map(((ws.data as { orders?: { order_id: string; station: string; percent: number; late: boolean; material: boolean }[] } | null)?.orders ?? []).map((o) => [o.order_id, o]))
      const openSvc = new Map<string, number>()
      for (const s of ((svc.data as { order_id: string }[]) ?? [])) openSvc.set(s.order_id, (openSvc.get(s.order_id) ?? 0) + 1)
      const job = new Map<string, NonNullable<CardData['job']>>()
      for (const j of ((jobs.data as unknown as { id: string; order_id: string; status: string; plan_date: string | null; accepted_by: string | null; install_job_members: { employee_id: string }[] }[]) ?? [])) {
        if (!job.has(j.order_id)) job.set(j.order_id, { id: j.id, status: j.status, plan_date: j.plan_date, accepted_by: j.accepted_by, crew: j.install_job_members.map((m) => m.employee_id) })
      }
      setNames(empName)
      setCards(
        ((all.data as unknown as OrderRow[]) ?? []).map((o) => {
          const it = items.get(o.id) ?? []
          const w = st.get(o.id)
          return {
            id: o.id,
            order_no: o.order_no,
            status: o.status,
            created_at: o.created_at,
            deadline: o.deadline,
            install_date: o.install_date,
            address: o.address,
            contract_price: Number(o.contract_price),
            debt: o.status === 'cancelled' ? 0 : debt.get(o.id) ?? 0,
            windows_count: o.windows_count,
            area_m2: Number(o.area_m2),
            client: o.clients?.full_name ?? '—',
            phone: o.clients?.phone ?? null,
            imported: o.is_imported,
            designs: it.map((x) => x.design),
            itemsCount: it.length,
            station: w?.station ?? null,
            percent: Number(w?.percent ?? 0),
            late: !!w?.late,
            material: !!w?.material,
            openService: openSvc.get(o.id) ?? 0,
            job: job.get(o.id) ?? null,
            shop: shop.get(o.id) ?? null,
            glass: glassOf(it.map((x) => x.glass_status)),
            photo: withPhoto.has(o.id),
          }
        }),
      )
    })()
    return () => {
      live = false
    }
  }, [tick])

  return { cards, names, reload }
}

// Карточки цеха и монтажника: те же карточки, но из «рабочих» представлений (w_*) — без денег и чужих данных
export interface WorkCard extends CardData {
  accepted: boolean // цех: «Qabul qildim» нажато (кем-то из команды)
  jobAccepted: string | null // монтаж: кто принял
}
export function useWorkCards(role: 'ishlab' | 'montajchi'): { cards: WorkCard[] | null; reload: () => void } {
  const [cards, setCards] = useState<WorkCard[] | null>(null)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((x) => x + 1), [])
  useEffect(() => {
    let live = true
    ;(async () => {
      const { data: os } = await supabase
        .from('w_orders')
        .select('id, order_no, status, deadline, address, contact_phone, client_name, windows_count, area_m2, install_date, shop_accepted_at')
        .in('status', role === 'ishlab' ? ['in_production', 'ready'] : ['ready', 'installing', 'installed'])
        .order('deadline', { ascending: true, nullsFirst: false })
      const orders = (os as { id: string; order_no: number; status: string; deadline: string | null; address: string | null; contact_phone: string | null; client_name: string | null; windows_count: number; area_m2: number; install_date: string | null; shop_accepted_at: string | null }[]) ?? []
      if (!orders.length) {
        if (live) setCards([])
        return
      }
      const ids = orders.map((o) => o.id)
      const [its, jobs, states, photos] = await Promise.all([
        supabase.from('w_order_items').select('order_id, pos, design, glass_status').in('order_id', ids),
        role === 'montajchi' ? supabase.from('w_install_jobs').select('id, order_id, plan_date, status, accepted_name').in('order_id', ids) : Promise.resolve({ data: [] }),
        role === 'ishlab' ? Promise.all(ids.map((id) => supabase.rpc('shop_state', { p_order: id }).then((r) => [id, r.data] as const))) : Promise.resolve([] as const),
        role === 'montajchi' ? supabase.from('install_order_photos').select('order_id').in('order_id', ids) : Promise.resolve({ data: [] }),
      ])
      if (!live) return
      const items = new Map<string, { pos: number; design: WindowDesign; glass_status: string | null }[]>()
      for (const x of ((its.data as { order_id: string; pos: number; design: WindowDesign; glass_status: string | null }[]) ?? [])) items.set(x.order_id, [...(items.get(x.order_id) ?? []), x])
      const job = new Map(((jobs.data as { id: string; order_id: string; plan_date: string | null; status: string; accepted_name: string | null }[]) ?? []).map((j) => [j.order_id, j]))
      const st = new Map(states.map(([id, s]) => [id, s as { first: { name: string; result: string; note: string | null } | null } | null]))
      const withPhoto = new Set(((photos.data as { order_id: string }[]) ?? []).map((p) => p.order_id))
      setCards(
        orders
          .filter((o) => role === 'ishlab' || job.has(o.id))
          .filter((o) => o.status !== 'installed' || !withPhoto.has(o.id) || (items.get(o.id) ?? []).some((i) => i.glass_status !== 'installed'))
          .map((o) => {
            const it = (items.get(o.id) ?? []).sort((a, b) => a.pos - b.pos)
            const j = job.get(o.id)
            const first = st.get(o.id)?.first ?? null
            return {
              id: o.id,
              order_no: o.order_no,
              status: o.status,
              created_at: '',
              deadline: o.deadline,
              install_date: o.install_date,
              address: o.address,
              contract_price: 0,
              debt: 0,
              windows_count: o.windows_count,
              area_m2: Number(o.area_m2),
              client: o.client_name ?? '—',
              phone: o.contact_phone,
              imported: false,
              designs: it.map((x) => x.design),
              itemsCount: it.length,
              station: null,
              percent: 0,
              late: false,
              material: false,
              openService: 0,
              job: j ? { id: j.id, status: j.status, plan_date: j.plan_date, accepted_by: null, crew: [] } : null,
              shop: first ? { result: first.result, name: first.name, note: first.note } : null,
              glass: glassOf(it.map((x) => x.glass_status)),
              photo: withPhoto.has(o.id),
              accepted: !!o.shop_accepted_at,
              jobAccepted: j?.accepted_name ?? null,
            }
          }),
      )
    })()
    return () => {
      live = false
    }
  }, [role, tick])
  return { cards, reload }
}
