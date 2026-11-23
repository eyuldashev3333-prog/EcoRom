// Сверка нашего расчёта метров с замерами настоящей WinStudio V44.4 (приложение в эмуляторе, чтение таблицы метров).
// Данные: __fixtures__/winstudio-grid.csv (снято скриптами scripts/winstudio, описание: docs/winstudio-study/FINDINGS.md).
import { describe, expect, it } from 'vitest'
import gridCsv from './__fixtures__/winstudio-grid.csv?raw'
import { leaf, measure, uid, type Leaf, type Node, type Opening, type WindowDesign } from './window'

interface Row {
  tag: string
  w: number
  h: number
  v: Record<string, number | null>
}

const COLS = ['area', 'frame', 'impost', 'bead', 'gasket', 'sash', 'doorsash', 'glass', 'sandwich']
function loadRows(): Row[] {
  const text = gridCsv.replace(/^﻿/, '').trim()
  const lines = text.split(/\r?\n/)
  const head = lines[0].replace(/"/g, '').split(',')
  return lines.slice(1).map((l) => {
    const cells = l.replace(/"/g, '').split(',')
    const o = Object.fromEntries(head.map((h, i) => [h, cells[i]]))
    const v: Record<string, number | null> = {}
    for (const c of COLS) v[c] = o[c] === '-' || o[c] === '' || o[c] === undefined ? null : parseFloat(o[c])
    return { tag: o.tag, w: +o.w, h: +o.h, v }
  })
}

const L = (opening: Opening, o: { door?: boolean; panel?: boolean } = {}): Leaf => ({ ...leaf(opening), door: o.door, panel: o.panel })
const split = (dir: 'v' | 'h', sizes: number[], children: Node[]): Node => ({ kind: 'split', id: uid(), dir, sizes, children })

/** секции по умолчанию (из файлов .wnd WinStudio): первые секции сохраняют размер, последняя забирает остаток */
function parts(kind: 'v2' | 'v3' | 'h2' | 'h3', W: number, H: number): { dir: 'v' | 'h'; sizes: number[] } {
  if (kind === 'v2') return { dir: 'v', sizes: [750, W - 750] }
  if (kind === 'v3') return { dir: 'v', sizes: [600, 600, W - 1200] }
  if (kind === 'h2') return { dir: 'h', sizes: [750, H - 750] }
  // три горизонтальные: при исходной высоте 1500 секции равны, при росте высоты первые две фиксируются (замеры при H≥1800)
  return { dir: 'h', sizes: H <= 1500 ? [H / 3, H / 3, H / 3] : [600, 900, H - 1500] }
}

type Code = 'fx' | 'sh' | 'dr' | 'sw' | 'ss' // глухое, створка, дверь, сэндвич глухой, сэндвич в створке
const cellOf = (c: Code): Leaf => {
  if (c === 'sh') return L('turn_r')
  if (c === 'dr') return L('turn_r', { door: true })
  if (c === 'sw') return L('fixed', { panel: true })
  if (c === 'ss') return L('turn_r', { panel: true })
  return L('fixed')
}

/** собрать изделие по тегу замера; null — тег не поддерживается или замер признан недостоверным */
function build(r: Row): WindowDesign | null {
  const t = r.tag.split('_')
  const mk = (kind: 'v2' | 'v3' | 'h2' | 'h3', codes: Code[]): WindowDesign => {
    const p = parts(kind, r.w, r.h)
    return { width: r.w, height: r.h, shape: 'rect', root: split(p.dir, p.sizes, codes.map(cellOf)) }
  }
  const single = (leafNode: Leaf): WindowDesign => ({ width: r.w, height: r.h, shape: 'rect', root: leafNode })
  const code = (s: string): Code => s as Code

  if (r.tag === 'door_turnR_1leaf') return single(L('turn_r', { door: true }))
  if (r.tag === 'win_turnR_1leaf') return single(L('turn_r'))
  if (/^win_op[0-8]$/.test(r.tag)) return single(r.tag === 'win_op4' ? L('fixed') : L('turn_r'))
  if (t[0] === 'fx' && t[1] === 'tpl1') return mk('v2', ['fx', 'fx'])
  if (t[0] === 'fx' && t[1] === 'tpl2') return mk('v3', ['fx', 'fx', 'fx'])
  if (t[0] === 'fx' && t[1] === 'tpl4') return mk('h2', ['fx', 'fx'])
  if (t[0] === 'fx' && t[1] === 'tpl5') return mk('h3', ['fx', 'fx', 'fx'])
  if (t[0] === 'v2' || t[0] === 'h2') {
    // замеры шириной 1800 для v2 и часть h2 при 1800 сняты с промахом по нажатию в ячейку
    if (r.w === 1800 && t[0] === 'v2') return null
    if (r.w === 1800 && t[0] === 'h2' && r.tag !== 'h2_fx_fx' && r.tag !== 'h2_fx_sh') return null
    return mk(t[0], [code(t[1]), code(t[2])])
  }
  if (t[0] === 'sh2') return mk(t[1] === 'v' ? 'v2' : 'h2', t.slice(2).map(code))
  if (t[0] === 'sh3') return mk('v3', t.slice(2).map(code))
  if (t[0] === 'dr2') return mk(t[1] === 'v' ? 'v2' : 'h2', t.slice(2).map(code))
  if (t[0] === 'dr3') return mk('v3', t.slice(2).map(code))
  if (t[0] === 'swF') {
    const codes = t.slice(t[1] === 'v' || t[1] === 'h' ? 2 : 1).map((x) => (x === 'sw' ? 'sw' : 'fx')) as Code[]
    if (t[1] === '1') return null
    return mk(t[1] === 'v' ? (codes.length === 3 ? 'v3' : 'v2') : 'h2', codes)
  }
  if (t[0] === 'swS') return mk('v2', t.slice(3).length ? ['ss', 'fx'] : ['ss', 'fx'])
  return null
}

const rows = loadRows()

// единственная известная граница округления: площадь стекла 2000×900 = 1,275 приложение показало как 1,27
const KNOWN: Record<string, true> = { 'win_turnR_1leaf 2000x900 glass': true, 'win_op0 2000x900 glass': true }

describe('расчёт метров совпадает с замерами WinStudio V44.4', () => {
  const byTag = new Map<string, Row[]>()
  for (const r of rows) {
    if (!build(r)) continue
    byTag.set(r.tag, [...(byTag.get(r.tag) ?? []), r])
  }
  it('есть что проверять', () => {
    expect([...byTag.values()].reduce((s, a) => s + a.length, 0)).toBeGreaterThan(300)
  })
  for (const [tag, list] of byTag) {
    it(tag, () => {
      const bad: string[] = []
      for (const r of list) {
        const d = build(r)!
        const m = measure(d)
        const got: Record<string, number | null> = {
          area: m.area_m2,
          frame: m.frame_m,
          impost: m.impost_m || null,
          bead: m.bead_m,
          gasket: m.gasket_m,
          sash: Math.round((m.sash_m - m.door_sash_m) * 100) / 100 || null,
          doorsash: m.door_sash_m || null,
          glass: m.glass_m2 || null,
          sandwich: m.sandwich_m2 || null,
        }
        for (const c of COLS) {
          const want = r.v[c]
          const g = got[c]
          if (want === null && g === null) continue
          // тег win_op4 / дверь без створки и т. п.: пустая колонка в WinStudio = ноль у нас
          if ((want ?? 0) === 0 && (g ?? 0) === 0) continue
          const diff = Math.abs((g ?? 0) - (want ?? 0))
          if (diff > 0.0051 && !KNOWN[`${tag} ${r.w}x${r.h} ${c}`]) bad.push(`${r.w}x${r.h} ${c}: WinStudio ${want}, у нас ${g}`)
        }
      }
      expect(bad).toEqual([])
    })
  }
})

