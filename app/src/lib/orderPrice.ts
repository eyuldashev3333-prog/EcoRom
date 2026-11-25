import { round2 } from './pricing'

/** Итог заказа клиенту: цены окон (без налога, со скидкой) × количество, затем налог — ОДИН раз на сумму (как «стоимость» в WinStudio).
 *  Одна формула и для редактора «как WinStudio», и для карточки заказа: раньше налог округлялся на каждое окно и итоги расходились на 1 000 so'm. */
export function suggestedTotal(prices: number[], qtys: number[], taxK: number): number {
  return round2(prices.reduce((s, p, i) => s + p * (qtys[i] ?? 1), 0) * taxK)
}

export const roundDown1000 = (n: number) => Math.floor(n / 1000) * 1000
