// Все шаблоны каталога WinStudio V44.4: структура окна восстановлена из сохранённого файла приложения (wblock), метры сняты с приложения.
// Составные шаблоны (Г, Т, ступени) — отдельные рамы, соединённые делениями join: метры считаются по рамам.
import { describe, expect, it } from 'vitest'
import templatesJson from './__fixtures__/winstudio-templates.json?raw'
import { designFromWblock } from './wblock'
import { measure } from './window'

interface Fx {
  tpl: number
  code: string
  openings: string
  area: string
  frame: string
  impost: string
  bead: string
  gasket: string
  glass: string
  sash: string
  sandwich: string
}
const fixtures: Fx[] = JSON.parse(templatesJson.replace(/^﻿/, ''))
const want = (s: string) => (s === '-' || s === '' || s === undefined ? 0 : parseFloat(s))

describe('каталог шаблонов WinStudio: метры совпадают по всем колонкам', () => {
  for (const f of fixtures) {
    it(`шаблон ${f.tpl}`, () => {
      const d = designFromWblock(f.code)
      expect(d, 'структура не разобрана').not.toBeNull()
      const m = measure(d!)
      const got: Record<string, number> = { area: m.area_m2, frame: m.frame_m, impost: m.impost_m, bead: m.bead_m, gasket: m.gasket_m, glass: m.glass_m2 }
      const bad: string[] = []
      for (const k of Object.keys(got)) {
        const w = want(f[k as keyof Fx] as string)
        if (Math.abs(got[k] - w) > 0.0051) bad.push(`${k}: WinStudio ${w}, у нас ${got[k]}`)
      }
      expect(bad).toEqual([])
    })
  }
})
