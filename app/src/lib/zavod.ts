// Живое состояние цеха (RPC workshop_state) — общие типы для главной и 3D-завода (без three.js).
// У цеха 2 этапа: «Jarayonda» (work) и «Tayyor» (ready); галочек по окнам нет (решение 24.11.2026).
export type Station = 'new' | 'work' | 'ready' | 'install'
export const STATIONS: Station[] = ['new', 'work', 'ready', 'install']
// точка на 3D-кадре: «Jarayonda» стоит у станков сборки (участок рисовался под старые этапы)
export const ANCHOR: Record<Station, string> = { new: 'new', work: 'assemble', ready: 'ready', install: 'install' }

export interface WOrder {
  order_id: string
  order_no: number
  client: string
  deadline: string | null
  status: string
  windows: number
  items: number
  station: Station | string
  accepted?: boolean
  percent: number
  late: boolean
  material: boolean
  stuck: boolean
}
export interface ZavodState {
  orders: WOrder[]
}

export const stationOf = (o: WOrder): Station => (STATIONS.includes(o.station as Station) ? (o.station as Station) : o.status === 'ready' ? 'ready' : o.status === 'new' ? 'new' : o.status === 'in_production' ? 'work' : 'install')
