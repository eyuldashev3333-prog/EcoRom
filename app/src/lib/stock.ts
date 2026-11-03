// Склад: строки остатка (позиция каталога + часть) из v_stock_balance.
import { supabase } from '../supabase'
import { uz } from '../uz'

export interface StockRow {
  item_id: string
  part: string
  kind: string
  sort: number
  name: string
  unit: string
  qty: number
  price: number
  value: number
}

export const stockKey = (item_id: string, part: string) => `${item_id}|${part}`
export const unitLabel = (u: string) => uz.catalog.units[u] ?? u
export const fmtQty = (n: number) => String(Math.round(n * 1000) / 1000).replace('.', ',')

export async function loadStock(): Promise<StockRow[]> {
  const { data } = await supabase.from('v_stock_balance').select('*').order('kind').order('sort').order('name')
  return ((data as StockRow[]) ?? []).map((r) => ({ ...r, qty: Number(r.qty), price: Number(r.price), value: Number(r.value) }))
}
