import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import type { CatalogItem } from './quote'

export interface CatalogState {
  items: CatalogItem[]
  byId: Map<string, CatalogItem>
  byKind: (kind: string) => CatalogItem[]
  markup: number
  loading: boolean
}

// активный каталог + наценка из настроек (одна загрузка на страницу)
export function useCatalog(): CatalogState {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [markup, setMarkup] = useState(0.37)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    Promise.all([
      supabase.from('catalog_items').select('id, kind, name, unit, price, params').eq('is_active', true).order('sort').order('name'),
      supabase.from('app_settings').select('value').eq('key', 'markup').maybeSingle(),
    ]).then(([c, s]) => {
      setItems(((c.data as CatalogItem[]) ?? []).map((i) => ({ ...i, price: Number(i.price) })))
      if (s.data) setMarkup(Number(s.data.value))
      setLoading(false)
    })
  }, [])
  const byId = new Map(items.map((i) => [i.id, i]))
  return { items, byId, byKind: (k) => items.filter((i) => i.kind === k), markup, loading }
}

// цвета профиля для чертежа (по названию из каталога)
const COLOR_HEX: Record<string, string> = {
  'белый': '#f4f4f2', 'антрацит': '#3d4246', 'дуб-мокко': '#5e4636', 'зол-дуб': '#b07b3e', 'шеффилд': '#cfb185',
  'береза': '#e4cfa4', 'бук': '#d39c66', 'вишня': '#8e3b2a', 'гикори': '#a87a4f', 'дуб': '#a8784a', 'желтый': '#e8c547',
  'зеленый': '#4c7a4c', 'клен': '#e2b97b', 'красное дерево': '#6e2c1f', 'красный': '#b22d2d', 'темный дуб': '#4a3426',
  'бордо': '#6d1f2a', 'серый': '#8a8f93',
  // узбекские названия каталога (после миграции 036)
  'oq': '#f4f4f2', 'antratsit': '#3d4246', 'eman-mokko': '#5e4636', 'oltin eman': '#b07b3e', 'sheffild': '#cfb185',
  'qayin': '#e4cfa4', 'buk': '#d39c66', 'olcha': '#8e3b2a', 'gikori': '#a87a4f', 'eman': '#a8784a', 'sariq': '#e8c547',
  'yashil': '#4c7a4c', 'zarang': '#e2b97b', 'qizil daraxt': '#6e2c1f', 'qizil': '#b22d2d', "to'q eman": '#4a3426',
  'bordo': '#6d1f2a', 'kulrang': '#8a8f93',
}
export const colorHex = (name?: string): string => COLOR_HEX[(name ?? '').trim().toLowerCase()] ?? '#f4f4f2'
