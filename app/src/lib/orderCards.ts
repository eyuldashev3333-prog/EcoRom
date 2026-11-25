import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { asPage, fetchAll } from './fetchAll'
import type { WindowDesign } from './window'

// Данные карточек заказов (одни и те же карточки в «Savdo» и в «Montaj va servis»)
export interface CardData {
  id: string
  order_no: number
  status: string
  created_at: string
  status_at: string | null // когда статус сменился в последний раз
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
  job: { id: string; status: string; plan_date: string | null; accepted_by: string | null; crew: string[]; driver: string | null } | null
  shop: ShopAns | null // первый ответ цеха после последней отправки
  glass: GlassState
  glassOrdered: boolean // у всех окон стекло уже заказано (иначе «установлено» отметить нельзя)
  photo: boolean // есть фото установки
}
export interface ShopAns {
  result: string
  name: string
  note: string | null
}
export type GlassState = 'none' | 'ordered' | 'installed' | 'mixed'
export const allGlassOrdered = (list: (string | null | undefined)[]) => list.length > 0 && list.every((x) => x === 'ordered' || x === 'arrived' || x === 'installed')

/** стекло заказа одним словом: все окна в одном состоянии или вперемешку («arrived» считаем «ordered») */
export function glassOf(list: (string | null | undefined)[]): GlassState {
  const s = new Set(list.map((x) => (x === 'arrived' ? 'ordered' : x ?? 'none')))
  if (s.size === 0) return 'none'
  if (s.size > 1) return s.has('none') ? 'none' : 'mixed' // хоть одно окно без заказа — считаем «не заказано»; ordered+installed — вперемешку
  return [...s][0] as GlassState
}

export type Column = 'new' | 'shop' | 'ready' | 'install' | 'pay' | 'done'
// «pay» — установлен, но ещё не закрыт: сюда попадают заказы с долгом (собрать оплату) и без фото (закрыть нельзя); раньше они пропадали с доски
export const columnOf = (status: string): Column =>
  status === 'new' ? 'new' : status === 'in_production' ? 'shop' : status === 'ready' ? 'ready' : status === 'installing' ? 'install' : status === 'installed' ? 'pay' : 'done'

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
  status_at: string | null
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
  payments?: { amount: number }[]
  install_jobs?: { id: string; status: string; plan_date: string | null; accepted_by: string | null; driver_id: string | null; created_at: string; install_job_members: { employee_id: string }[] }[]
  order_material_checks?: { result: string; note: string | null; created_at: string; employee_id: string }[]
  install_order_photos?: { id: string }[]
}
// всё, что нужно карточке, приходит вместе с заказом (вложенные выборки): платежи, работа монтажа, ответы цеха, фото — только по нужным заказам, а не по всей базе
const SELECT =
  'id, order_no, status, created_at, status_at, deadline, install_date, address, contract_price, windows_count, area_m2, is_imported, shop_sent_at, clients(full_name, phone), ' +
  'order_items(pos, design, glass_status), payments(amount), install_jobs(id, status, plan_date, accepted_by, driver_id, created_at, install_job_members(employee_id)), ' +
  'order_material_checks(result, note, created_at, employee_id), install_order_photos(id)'

/** какие заказы нужны экрану: доска (активные), один заказ, завершённые (по месяцу и/или поиску) — остальное с сервера не загружается */
export type CardScope = { kind: 'active' } | { kind: 'id'; id: string } | { kind: 'done'; month: string | null; q: string }
const DONE = ['closed', 'unknown']
const nextMonthStart = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  return mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`
}

export function useOrderCards(scope: CardScope = { kind: 'active' }): { cards: CardData[] | null; names: Map<string, string>; reload: () => void; doneCount: number | null } {
  const [cards, setCards] = useState<CardData[] | null>(null)
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [doneCount, setDoneCount] = useState<number | null>(null)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((x) => x + 1), [])
  const key = JSON.stringify(scope)

  useEffect(() => {
    let live = true
    const sc = JSON.parse(key) as CardScope
    ;(async () => {
      // какие заказы грузим
      let ids: string[] | null = null
      if (sc.kind === 'done' && sc.q.trim().length >= 2) {
        const r = await supabase.rpc('orders_search', { p_q: sc.q.trim(), p_statuses: DONE, p_limit: 300 })
        ids = ((r.data as { id: string }[] | null) ?? []).map((x) => x.id)
      }
      const build = (a: number, b: number) => {
        let q = supabase.from('orders').select(SELECT)
        if (sc.kind === 'active') q = q.in('status', ACTIVE).eq('is_imported', false)
        else if (sc.kind === 'id') q = q.eq('id', sc.id)
        else {
          q = q.in('status', DONE)
          if (ids) q = q.in('id', ids)
          if (sc.month) q = q.gte('status_at', `${sc.month}-01`).lt('status_at', nextMonthStart(sc.month))
        }
        return asPage(q.order('order_no', { ascending: false }).order('id').range(a, b))
      }
      const [orders, ws, svc, emps, done] = await Promise.all([
        ids && ids.length === 0 ? Promise.resolve({ data: [], error: null }) : fetchAll(build, 200),
        sc.kind === 'id' ? Promise.resolve({ data: null }) : supabase.rpc('workshop_state'),
        fetchAll((a, b) => asPage(supabase.from('service_tickets').select('order_id').neq('status', 'closed').order('id').range(a, b))),
        fetchAll((a, b) => asPage(supabase.from('employees').select('id, full_name').order('id').range(a, b))),
        sc.kind === 'active' ? supabase.from('orders').select('id', { count: 'exact', head: true }).in('status', DONE) : Promise.resolve({ count: null }),
      ])
      if (!live) return
      const empName = new Map(((emps.data as { id: string; full_name: string }[]) ?? []).map((e) => [e.id, e.full_name]))
      const st = new Map(((ws.data as { orders?: { order_id: string; station: string; percent: number; late: boolean; material: boolean }[] } | null)?.orders ?? []).map((o) => [o.order_id, o]))
      const openSvc = new Map<string, number>()
      for (const s of ((svc.data as { order_id: string }[]) ?? [])) openSvc.set(s.order_id, (openSvc.get(s.order_id) ?? 0) + 1)
      setNames(empName)
      setDoneCount(sc.kind === 'active' ? (done as { count: number | null }).count ?? 0 : null)
      setCards(
        ((orders.data as unknown as OrderRow[]) ?? []).map((o) => {
          const it = [...(o.order_items ?? [])].sort((a, b) => a.pos - b.pos)
          const w = st.get(o.id)
          // первый ответ цеха после последней отправки (как в shop_state)
          const ans = [...(o.order_material_checks ?? [])]
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .find((c) => !!o.shop_sent_at && c.created_at >= o.shop_sent_at)
          const j = [...(o.install_jobs ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
          const paid = (o.payments ?? []).reduce((s, p) => s + Number(p.amount), 0) // платежи ЭТОГО заказа (сам заказ загружен целиком — сумма полная)
          return {
            id: o.id,
            order_no: o.order_no,
            status: o.status,
            created_at: o.created_at,
            status_at: o.status_at,
            deadline: o.deadline,
            install_date: o.install_date,
            address: o.address,
            contract_price: Number(o.contract_price),
            debt: o.status === 'cancelled' ? 0 : Number(o.contract_price) - paid,
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
            job: j ? { id: j.id, status: j.status, plan_date: j.plan_date, accepted_by: j.accepted_by, driver: j.driver_id, crew: j.install_job_members.map((m) => m.employee_id) } : null,
            shop: ans ? { result: ans.result, note: ans.note, name: empName.get(ans.employee_id) ?? '' } : null,
            glass: glassOf(it.map((x) => x.glass_status)),
            glassOrdered: allGlassOrdered(it.map((x) => x.glass_status)),
            photo: (o.install_order_photos ?? []).length > 0,
          }
        }),
      )
    })()
    return () => {
      live = false
    }
  }, [key, tick])

  return { cards, names, reload, doneCount }
}
// Карточки цеха и монтажника: те же карточки, но из «рабочих» представлений (w_*) — без денег и чужих данных
export interface WorkCard extends CardData {
  accepted: boolean // цех: «Qabul qildim» нажато (кем-то из команды)
  jobAccepted: string | null // монтаж: кто принял
}
// onlyId — страница одного заказа: берём заказ в любом статусе (в т.ч. завершённый), без фильтра очереди
export function useWorkCards(role: 'ishlab' | 'montajchi', onlyId?: string): { cards: WorkCard[] | null; reload: () => void } {
  const [cards, setCards] = useState<WorkCard[] | null>(null)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((x) => x + 1), [])
  useEffect(() => {
    let live = true
    ;(async () => {
      let q = supabase
        .from('w_orders')
        .select('id, order_no, status, status_at, deadline, address, contact_phone, client_name, windows_count, area_m2, install_date, shop_accepted_at')
      q = onlyId ? q.eq('id', onlyId) : q.in('status', role === 'ishlab' ? ['in_production', 'ready'] : ['ready', 'installing', 'installed'])
      const { data: os } = await q.order('deadline', { ascending: true, nullsFirst: false })
      const orders = (os as { id: string; order_no: number; status: string; status_at: string | null; deadline: string | null; address: string | null; contact_phone: string | null; client_name: string | null; windows_count: number; area_m2: number; install_date: string | null; shop_accepted_at: string | null }[]) ?? []
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
          .filter((o) => !!onlyId || o.status !== 'installed' || !withPhoto.has(o.id) || (items.get(o.id) ?? []).some((i) => i.glass_status !== 'installed'))
          .map((o) => {
            const it = (items.get(o.id) ?? []).sort((a, b) => a.pos - b.pos)
            const j = job.get(o.id)
            const first = st.get(o.id)?.first ?? null
            return {
              id: o.id,
              order_no: o.order_no,
              status: o.status,
              created_at: '',
              status_at: o.status_at,
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
              job: j ? { id: j.id, status: j.status, plan_date: j.plan_date, accepted_by: null, crew: [], driver: null } : null,
              shop: first ? { result: first.result, name: first.name, note: first.note } : null,
              glass: glassOf(it.map((x) => x.glass_status)),
              glassOrdered: allGlassOrdered(it.map((x) => x.glass_status)),
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
  }, [role, tick, onlyId])
  return { cards, reload }
}
