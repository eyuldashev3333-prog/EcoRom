// Цена по формуле WinStudio: сначала скидка на сумму по прайсу, затем наценка.
// Проверено на кадрах: 72490.29 (−5% +20%) → 82638.9 ; 1527201.41 (−0% +37%) → 2092265.93
export const round2 = (n: number): number => Math.round(n * 100) / 100

export function suggestedPrice(cost: number, markup = 0.37, discountPct = 0): number {
  return round2(cost * (1 - discountPct / 100) * (1 + markup))
}

/**
 * Цена одного окна для клиента. Своя цена (как в WinStudio) заменяет расчётную, скидка применяется и к ней:
 * 2255 при скидке 1% → 2232.45. Без своей цены: скидка на сумму по прайсу, затем наценка.
 * Скидка окна, если задана, главнее скидки заказа.
 */
export function itemPrice(
  cost: number,
  workCost: number,
  markup: number,
  orderDiscountPct: number,
  o: { own_price?: number },
  scheme?: { discount: number; margin: number; margin_work: number },
): number {
  const d = scheme ? scheme.discount : orderDiscountPct
  const own = Number(o.own_price)
  if (own > 0) return round2(own * (1 - d / 100))
  // схема: скидка на всё, затем своя маржа на материалы и на работы; без схемы — общая наценка на всё
  const mm = scheme ? scheme.margin / 100 : markup
  const mw = scheme ? scheme.margin_work / 100 : markup
  const mat = Math.max(cost - workCost, 0)
  return round2(mat * (1 - d / 100) * (1 + mm) + workCost * (1 - d / 100) * (1 + mw))
}

/** Прибыль и маржа по заказу: договорная цена минус себестоимость. */
export function profit(contractPrice: number, cost: number): { profit: number; marginPct: number } {
  const p = round2(contractPrice - cost)
  return { profit: p, marginPct: contractPrice > 0 ? round2((p / contractPrice) * 100) : 0 }
}

export const formatSum = (n: number): string => new Intl.NumberFormat('ru-RU').format(Math.round(n))
