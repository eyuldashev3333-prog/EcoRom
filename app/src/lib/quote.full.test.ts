// Сквозная сверка цены окна с живой WinStudio: 6 разных окон (дверь, делённые, сетки, ламинация, сэндвич, добавки по сторонам),
// у каждой статьи прайса свои цены. Данные и ответы: __fixtures__/winstudio-full.json (scripts/winstudio/probe_full.ps1); сборка окон — quote.full.helpers.ts.
import { describe, expect, it } from 'vitest'
import fx from './__fixtures__/winstudio-full.json'
import { build, catalog } from './quote.full.helpers'
import { quoteItem } from './quote'
import { measure } from './window'

describe('сквозная цена окна: наш расчёт = живая WinStudio', () => {
  fx.windows.forEach((w, i) => {
    it(`окно ${i + 1}`, () => {
      const { d, o } = build(w)
      const q = quoteItem(measure(d), o, catalog, d.width, d.height)
      // внутренняя ламинация подобрана с остатком ≤0.0033 м² (≈0.6 при цене 190 за м²): окна с ламинацией сверяем с допуском 1.0, остальные — до копейки
      const hasLam = !!(w.extra as unknown as Record<string, string>).winLaminationInner || !!(w.extra as unknown as Record<string, string>).winLaminationOuter
      expect(Math.abs(q.cost - (fx.expected[i] as number)), `ожидание WinStudio ${fx.expected[i]}, наш ${q.cost}`).toBeLessThanOrEqual(hasLam ? 1.0 : 0.05)
    })
  })
})
