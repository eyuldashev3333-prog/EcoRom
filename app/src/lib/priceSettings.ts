// Настройки прайса из app_settings: валюта и курс, налог, финансовые схемы (как «ВСЕ ПРАЙСЫ» в WinStudio).
import type { CatalogItem } from './quote'

export interface Scheme {
  id: string
  name: string
  discount: number // общая скидка, %
  margin: number // маржа на изделие и материалы, %
  margin_work: number // маржа на работы, %
}
export interface PriceSettings {
  currency: string // валюта, в которой внесён прайс
  rate: number // курс: сколько единиц валюты результатов в одной единице валюты прайса
  resultCurrency: string
  taxName: string
  taxPct: number
  markup: number // маржа компании по умолчанию для нового заказа (доля, 0.35 = 35%); схема добавляет свою маржу поверх
  markupMin: number // меньше этой маржи заказ не сохранить (решение Asad 28.11.2026: только 35% и выше)
  schemes: Scheme[]
}

export const SETTING_KEYS = ['markup', 'markup_min', 'price_currency', 'currency_rate', 'result_currency', 'tax_name', 'tax_pct', 'finance_schemes'] as const

const num = (v: unknown, def: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}
const str = (v: unknown, def: string) => (typeof v === 'string' && v.trim() ? v : def)

/** схемы по умолчанию — скидки 1/2/3/5%; своей маржи нет: маржа компании заказа идёт поверх (иначе она сложилась бы дважды) */
export const defaultSchemes = (): Scheme[] => [1, 2, 3, 5].map((d) => ({ id: `d${d}`, name: `Chegirma ${d}%`, discount: d, margin: 0, margin_work: 0 }))

export function parsePriceSettings(rows: { key: string; value: unknown }[]): PriceSettings {
  const m = new Map(rows.map((r) => [r.key, r.value]))
  const markupMin = Math.max(num(m.get('markup_min'), 0.35), 0)
  const markup = Math.max(num(m.get('markup'), 0.35), markupMin)
  const raw = m.get('finance_schemes')
  const schemes = Array.isArray(raw)
    ? (raw as Partial<Scheme>[])
        .filter((s) => s && typeof s.id === 'string')
        .map((s) => ({ id: String(s.id), name: str(s.name, String(s.id)), discount: num(s.discount, 0), margin: num(s.margin, 0), margin_work: num(s.margin_work, 0) }))
    : defaultSchemes()
  const cur = str(m.get('price_currency'), "so'm")
  return {
    currency: cur,
    rate: Math.max(num(m.get('currency_rate'), 1), 0) || 1,
    resultCurrency: str(m.get('result_currency'), cur),
    taxName: str(m.get('tax_name'), 'QQS'),
    taxPct: Math.max(num(m.get('tax_pct'), 0), 0),
    markup,
    markupMin,
    schemes,
  }
}

/** пересчёт цен каталога в валюту результатов: цена и все числовые параметры-цены умножаются на курс */
export function scaleItem(it: CatalogItem, rate: number): CatalogItem {
  if (rate === 1) return it
  const params: CatalogItem['params'] = {}
  for (const [k, v] of Object.entries(it.params ?? {})) params[k] = typeof v === 'number' ? v * rate : v
  return { ...it, price: it.price * rate, params }
}
