// Отчёт «Teshiklar» (rpc leaks_report) — типы и подсчёт «требует действия» для значка на главной.
export interface LeakOrder {
  order_id: string
  order_no: number
  client: string
}
export interface Leaks {
  low_margin: { count: number; threshold: number; items: (LeakOrder & { contract_price: number; calc_cost: number; margin_pct: number })[] }
  overdue: { count: number; items: (LeakOrder & { deadline: string; days_late: number; status: string })[] }
  stuck: { count: number; items: (LeakOrder & { days: number })[] }
  material: { count: number; items: (LeakOrder & { result: string; note: string | null })[] }
  client_debts: { d30: number; d90: number; older: number; total: number; count: number; items: (LeakOrder & { debt: number; age_days: number })[] }
  installed_unpaid: { count: number; sum: number; items: (LeakOrder & { debt: number })[] }
  supplier_debts: { count: number; sum: number; items: { supplier_id: string; name: string; debt: number }[] }
  pricey_purchases: { count: number; excess: number; items: { name: string; unit_cost: number; catalog_price: number; qty: number; excess: number }[] }
  stock_negative: { count: number; items: { name: string; qty: number; unit: string }[] }
  breakage_undecided: { count: number; sum: number }
  service: { count: number; items: { id: string; order_no: number; client: string; description: string; flag: string }[] }
  cash: { balance: number; negative: boolean }
  unknown_status: { count: number }
  pace: { name: string; stage: string; marks: number; m2: number }[]
}

/** сколько разделов требуют действия (как в утреннем сообщении) */
export const attentionCount = (l: Leaks) =>
  [l.overdue.count, l.stuck.count, l.material.count, l.installed_unpaid.count, l.service.count, l.breakage_undecided.count, l.stock_negative.count, l.cash.negative ? 1 : 0].reduce((s, n) => s + (n > 0 ? 1 : 0), 0)
