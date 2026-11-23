// Вывод наших чертежей в SVG для сравнения с эталонами WinStudio. Запуск: cd app; npx vite-node ../scripts/winstudio/render_ours.tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdirSync, writeFileSync } from 'node:fs'
import WindowSvg from '../../app/src/components/WindowSvg'
import { designFromWblock } from '../../app/src/lib/wblock'
import { WINSTUDIO_TEMPLATES } from '../../app/src/lib/winstudioTemplates'
import { leaf, uid, type Leaf, type Node, type Opening, type WindowDesign } from '../../app/src/lib/window'

const out = 'C:/wsre/ours'
mkdirSync(out, { recursive: true })
const L = (opening: Opening, o: { door?: boolean; panel?: boolean } = {}): Leaf => ({ ...leaf(opening), door: o.door, panel: o.panel })
const split = (dir: 'v' | 'h', sizes: number[], children: Node[]): Node => ({ kind: 'split', id: uid(), dir, sizes, children })
const d = (W: number, H: number, root: Node): WindowDesign => ({ width: W, height: H, shape: 'rect', root })

const cases: Record<string, WindowDesign> = {
  A_fixed: d(1500, 1500, L('fixed')),
  B_turn: d(1500, 1500, L('turn_r')),
  C_door: d(1500, 1500, L('turn_r', { door: true })),
  A500_fixed: d(500, 500, L('fixed')),
  B500_turn: d(500, 500, L('turn_r')),
  C500_door: d(500, 500, L('turn_r', { door: true })),
  D_v2_sash_fixed: d(1500, 1500, split('v', [750, 750], [L('turn_r'), L('fixed')])),
  E_h2: d(1500, 1500, split('h', [750, 750], [L('fixed'), L('fixed')])),
  F_v3: d(1800, 1500, split('v', [600, 600, 600], [L('fixed'), L('fixed'), L('fixed')])),
  H_tilt: d(1500, 1500, L('tilt')),
  I_tt: d(1500, 1500, L('tt_r')),
  T6: designFromWblock(WINSTUDIO_TEMPLATES[6])!,
  T30: designFromWblock(WINSTUDIO_TEMPLATES[30])!,
}
for (const [name, design] of Object.entries(cases)) {
  const svg = renderToStaticMarkup(<WindowSvg design={design} maxHeight={900} />)
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#ccc"><div style="width:1000px;height:900px">${svg.replace('<svg', '<svg width="1000" height="900"')}</div>`
  writeFileSync(`${out}/${name}.html`, html)
}
console.log('rendered', Object.keys(cases).length)

