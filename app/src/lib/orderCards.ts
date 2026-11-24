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
  clients: { full_name: string; phone: string | null } | null
  order_items?: { pos: number; design: WindowDesign }[]
}
const SELECT = 'id, order_no, status, created_at, deadline, install_date, address, contract_price, windows_count, area_m2, is_imported, clients(full_name, phone)'

export function useOrderCards(): { cards: CardData[] | null; names: Map<string, string>; reload: () => void } {
  const [cards, setCards] = useState<CardData[] | null>(null)
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((x) => x + 1), [])

  useEffect(() => {
    let live = true
    ;(async () => {
      const [all, act, paid, ws, svc, jobs, emps] = await Promise.all([
        supabase.from('orders').select(SELECT).order('order_no', { ascending: false }).limit(5000),
        supabase.from('orders').select(`${SELECT}, order_items(pos, design)`).in('status', ACTIVE).eq('is_imported', false).order('order_no', { ascending: false }).limit(400),
        supabase.from('v_order_paid').select('order_id, debt'),
        supabase.rpc('workshop_state'),
        supabase.from('service_tickets').select('order_id').neq('status', 'closed'),
        supabase.from('install_jobs').select('id, order_id, status, plan_date, accepted_by, created_at, install_job_members(employee_id)').order('created_at', { ascending: false }),
        supabase.from('employees').select('id, full_name'),
      ])
      if (!live) return
      const items = new Map<string, { pos: number; design: WindowDesign }[]>()
      for (const o of ((act.data as unknown as OrderRow[]) ?? [])) items.set(o.id, [...(o.order_items ?? [])].sort((a, b) => a.pos - b.pos))
      const debt = new Map(((paid.data as { order_id: string; debt: string }[]) ?? []).map((d) => [d.order_id, Number(d.debt)]))
      const st = new Map(((ws.data as { orders?: { order_id: string; station: string; percent: number; late: boolean; material: boolean }[] } | null)?.orders ?? []).map((o) => [o.order_id, o]))
      const openSvc = new Map<string, number>()
      for (const s of ((svc.data as { order_id: string }[]) ?? [])) openSvc.set(s.order_id, (openSvc.get(s.order_id) ?? 0) + 1)
      const job = new Map<string, NonNullable<CardData['job']>>()
      for (const j of ((jobs.data as unknown as { id: string; order_id: string; status: string; plan_date: string | null; accepted_by: string | null; install_job_members: { employee_id: string }[] }[]) ?? [])) {
        if (!job.has(j.order_id)) job.set(j.order_id, { id: j.id, status: j.status, plan_date: j.plan_date, accepted_by: j.accepted_by, crew: j.install_job_members.map((m) => m.employee_id) })
      }
      setNames(new Map(((emps.data as { id: string; full_name: string }[]) ?? []).map((e) => [e.id, e.full_name])))
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
