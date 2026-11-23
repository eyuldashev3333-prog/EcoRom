// Импосты внутри ячейки (левая колонка окна «импосты / открывание»): сверка метров с замерами живой WinStudio V44.4 (23.11.2026).
// Данные: __fixtures__/winstudio-leaf-imposts.csv (scripts/winstudio/scenario_leaf_imposts.ps1, описание: docs/winstudio-study/REVERIFY-2.md).
import { describe, expect, it } from 'vitest'
import csv from './__fixtures__/winstudio-leaf-imposts.csv?raw'
import { leaf, measure, resize, withSub, type Leaf, type WindowDesign } from './window'

const COLS = ['area', 'frame', 'impost', 'bead', 'gasket', 'sash', 'doorsash', 'glass', 'sandwich'] as const
const KEY: Record<(typeof COLS)[number], (m: ReturnType<typeof measure>) => number> = {
  area: (m) => m.area_m2,
  frame: (m) => m.frame_m,
  impost: (m) => m.impost_m,
  bead: (m) => m.bead_m,
  gasket: (m) => m.gasket_m,
  sash: (m) => Math.round((m.sash_m - m.door_sash_m) * 100) / 100,
  doorsash: (m) => m.door_sash_m,
  glass: (m) => m.glass_m2,
  sandwich: (m) => m.sandwich_m2,
}
const SUBS: Record<string, { dir: 'v' | 'h'; parts: number } | null> = { none: null, v2: { dir: 'v', parts: 2 }, h2: { dir: 'h', parts: 2 }, v3: { dir: 'v', parts: 3 }, h3: { dir: 'h', parts: 3 } }
const KINDS: Record<string, Leaf> = {
  fixed: leaf('fixed'),
  tt: leaf('tt_r'),
  door: { ...leaf('turn_r'), door: true },
  sandwich: { ...leaf('fixed'), panel: true },
}
// как снимали замеры: окно 1500×1500 → импосты → панель в одной части (вторая/средняя) → потом размер меняется (первые части сохраняют размер, последняя забирает остаток)
const panelsFor = (kind: string, parts: number): boolean[] | undefined => (kind === 'sandwich' ? Array.from({ length: parts }, (_, i) => i === 1) : undefined)

const rows = csv.replace(/^﻿/, '').trim().split(/\r?\n/).slice(1).map((l) => {
  const c = l.split(',')
  const v: Record<string, number> = {}
  COLS.forEach((k, i) => (v[k] = c[3 + i] === '-' || c[3 + i] === '' || c[3 + i] === undefined ? 0 : parseFloat(c[3 + i])))
  return { tag: c[0], w: +c[1], h: +c[2], v }
})

describe('импосты внутри ячейки: замеры WinStudio', () => {
  it('замеры загружены', () => expect(rows.length).toBeGreaterThan(20))
  for (const r of rows) {
    const [kind, sub] = r.tag.split('_')
    it(`${r.tag} ${r.w}×${r.h}`, () => {
      const spec = SUBS[sub]
      const lf: Leaf = { ...KINDS[kind], id: 'x', panel: kind === 'sandwich' && !spec }
      const base: WindowDesign = { width: 1500, height: 1500, shape: 'rect', root: lf }
      const d: WindowDesign = resize(spec ? withSub(base, 'x', spec, panelsFor(kind, spec.parts)) : base, r.w, r.h)
      const m = measure(d)
      for (const k of COLS) expect(Math.abs(KEY[k](m) - r.v[k]), `${k}: наш ${KEY[k](m)} / WinStudio ${r.v[k]}`).toBeLessThanOrEqual(0.0101)
    })
  }
})
