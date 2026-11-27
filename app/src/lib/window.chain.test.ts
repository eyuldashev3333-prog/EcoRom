// Цепочка размеров как в WinStudio: живая сверка 27.11.2026 (жалоба клиента, видео 27.11.2026) на шаблонах
// «сверху 2, снизу 3» (A) и «фрамуга, снизу 3» (B). Все цифры сняты с экрана WinStudio V44.4.
import { describe, expect, it } from 'vitest'
import { chainLines, equalizeChain, layout, measure, resizeChain, setChainSegment, type WindowDesign } from './window'
import { designFromWblock } from './wblock'
import { WINSTUDIO_TEMPLATES } from './winstudioTemplates'

const tpl = (i: number) => designFromWblock(WINSTUDIO_TEMPLATES[i])!
const A = () => tpl(33) // vsx 0 600 900 1200 1800, vsy 0 600 1800
const B = () => tpl(38) // vsx 0 600 1200 1800, vsy 0 600 1800
const segs = (d: WindowDesign, axis: 'w' | 'h') => {
  const l = chainLines(d, axis)
  return l.slice(1).map((x, i) => Math.round(x - l[i]))
}
/** нижний ряд: ширины ячеек, у которых низ = низ окна */
const bottomRow = (d: WindowDesign) =>
  layout(d)
    .cells.filter((c) => Math.round(c.rect.y + c.rect.h) === d.height)
    .sort((a, b) => a.rect.x - b.rect.x)
    .map((c) => Math.round(c.rect.w))
const topRow = (d: WindowDesign) =>
  layout(d)
    .cells.filter((c) => c.rect.y === 0)
    .sort((a, b) => a.rect.x - b.rect.x)
    .map((c) => Math.round(c.rect.w))
/** ячейки покрывают окно целиком: суммы площадей = площадь окна */
const filled = (d: WindowDesign) => layout(d).cells.reduce((s, c) => s + c.rect.w * c.rect.h, 0) === d.width * d.height

describe('цепочка размеров как WinStudio', () => {
  it('шаблоны клиента: исходные цепочки', () => {
    expect(segs(A(), 'w')).toEqual([600, 300, 300, 600])
    expect(segs(B(), 'w')).toEqual([600, 600, 600])
    expect(segs(B(), 'h')).toEqual([600, 1200])
  })

  it('B: ширина 1800→1500 — последний отрезок забирает разницу, без выравнивания', () => {
    const d = resizeChain(B(), 1500, 1800)
    expect(bottomRow(d)).toEqual([600, 600, 300])
    expect(filled(d)).toBe(true)
  })

  it('B: 600→500, затем 700→500 даёт три по 500, пустот нет', () => {
    let d = resizeChain(B(), 1500, 1800)
    d = setChainSegment(d, 'w', 0, 500)
    expect(bottomRow(d)).toEqual([500, 700, 300])
    expect(filled(d)).toBe(true)
    d = setChainSegment(d, 'w', 1, 500)
    expect(bottomRow(d)).toEqual([500, 500, 500])
    expect(filled(d)).toBe(true)
    expect(measure(d).panes.every((p) => p.w > 0 && p.h > 0)).toBe(true)
  })

  it('B: 1500→900 — минимум 300 с переносом влево', () => {
    let d = resizeChain(B(), 1500, 1800)
    d = setChainSegment(setChainSegment(d, 'w', 0, 500), 'w', 1, 500)
    expect(bottomRow(resizeChain(d, 900, 1800))).toEqual([300, 300, 300])
  })

  it('A: шаги клиента — ширина 1500, высота 1560, верх 400, первый размер 500 двигает нижний импост', () => {
    let d = resizeChain(A(), 1500, 1800)
    expect(topRow(d)).toEqual([900, 600])
    expect(bottomRow(d)).toEqual([600, 600, 300])
    d = resizeChain(d, 1500, 1560)
    expect(segs(d, 'h')).toEqual([600, 960])
    d = setChainSegment(d, 'h', 0, 400)
    expect(segs(d, 'h')).toEqual([400, 1160])
    d = setChainSegment(d, 'w', 0, 500)
    expect(segs(d, 'w')).toEqual([500, 400, 300, 300])
    expect(topRow(d)).toEqual([900, 600])
    expect(bottomRow(d)).toEqual([500, 700, 300])
    expect(filled(d)).toBe(true)
  })

  it('A: 100 меньше минимума — ничего не меняется (WinStudio ставит 300)', () => {
    let d = setChainSegment(resizeChain(A(), 1500, 1800), 'w', 0, 500)
    d = setChainSegment(d, 'w', 2, 100)
    expect(segs(d, 'w')).toEqual([500, 400, 300, 300])
  })

  it('A: последний отрезок 300→500 — нехватка уходит влево: 400·300·300·500', () => {
    let d = setChainSegment(resizeChain(A(), 1500, 1800), 'w', 0, 500)
    d = setChainSegment(d, 'w', 3, 500)
    expect(segs(d, 'w')).toEqual([400, 300, 300, 500])
    expect(topRow(d)).toEqual([700, 800])
    expect(bottomRow(d)).toEqual([400, 600, 500])
  })

  it('A: ширина 1500→1800 — последний отрезок +300', () => {
    let d = setChainSegment(resizeChain(A(), 1500, 1800), 'w', 0, 500)
    d = setChainSegment(d, 'w', 3, 500)
    d = resizeChain(d, 1800, 1800)
    expect(segs(d, 'w')).toEqual([400, 300, 300, 800])
  })

  it('A: «Уравнять размеры?» → ДА на 400·300·300·800 даёт 450×4 (верх 900|900, низ 450|900|450)', () => {
    let d = setChainSegment(resizeChain(A(), 1500, 1800), 'w', 0, 500)
    d = resizeChain(setChainSegment(d, 'w', 3, 500), 1800, 1800)
    d = equalizeChain(d, 'w')
    expect(segs(d, 'w')).toEqual([450, 450, 450, 450])
    expect(topRow(d)).toEqual([900, 900])
    expect(bottomRow(d)).toEqual([450, 900, 450])
  })

  it('выровнять: все отрезки цепочки равны', () => {
    const d = equalizeChain(resizeChain(B(), 1500, 1800), 'w')
    expect(bottomRow(d)).toEqual([500, 500, 500])
    expect(filled(d)).toBe(true)
  })
})
