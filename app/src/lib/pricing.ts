// Цена по формуле WinStudio: сначала скидка на сумму по прайсу, затем наценка.
// Проверено на кадрах: 72490.29 (−5% +20%) → 82638.9 ; 1527201.41 (−0% +37%) → 2092265.93
export const round2 = (n: number): number => Math.round(n * 100) / 100

export function suggestedPrice(cost: number, markup = 0.37, discountPct = 0): number {
  return round2(cost * (1 - discountPct / 100) * (1 + markup))
}

/** Прибыль и маржа по заказу: договорная цена минус себестоимость. */
export function profit(contractPrice: number, cost: number): { profit: number; marginPct: number } {
  const p = round2(contractPrice - cost)
  return { profit: p, marginPct: contractPrice > 0 ? round2((p / contractPrice) * 100) : 0 }
}

export const formatSum = (n: number): string => new Intl.NumberFormat('ru-RU').format(Math.round(n))
