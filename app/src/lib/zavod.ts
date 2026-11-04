// Живое состояние цеха (RPC workshop_state) — общие типы и расчёты для главной и 3D-завода (без three.js).
export type Station = 'new' | 'cut' | 'assemble' | 'glass_fit' | 'ready' | 'install'
export const STATIONS: Station[] = ['new', 'cut', 'assemble', 'glass_fit', 'ready', 'install']

export interface WOrder {
  order_id: string
  order_no: number
  client: string
  deadline: string | null
  status: string
  windows: number
  items: number
  station: Station | string
  done: Record<string, number>
  percent: number
  late: boolean
  material: boolean
  stuck: boolean
}
export interface ZavodState {
  orders: WOrder[]
  stages: { code: string; name: string }[]
}

export const stationOf = (o: WOrder): Station => (STATIONS.includes(o.station as Station) ? (o.station as Station) : 'glass_fit')

// узкое место — рабочий участок цеха (резка/сборка/стекло), где больше всего окон ждёт; нужен перевес хотя бы в 2 окна над следующим
export function bottleneck(orders: WOrder[]): { station: Station; windows: number } | null {
  const loads = (['cut', 'assemble', 'glass_fit'] as Station[]).map((s) => ({
    station: s,
    windows: orders.filter((o) => stationOf(o) === s).reduce((n, o) => n + Number(o.windows || 0), 0),
  }))
  loads.sort((a, b) => b.windows - a.windows)
  if (!loads[0] || loads[0].windows === 0) return null
  return loads[0].windows - loads[1].windows >= 2 ? loads[0] : null
}
