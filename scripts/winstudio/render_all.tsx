// Проверка: чертёж и миниатюра рендерятся без ошибок для всей каталожной выборки. Запуск: cd app; npx vite-node ../scripts/winstudio/render_all.tsx
import { renderToStaticMarkup } from 'react-dom/server'
import WindowSvg from '../../app/src/components/WindowSvg'
import { MiniWindow } from '../../app/src/components/ConfigPicker'
import { CONFIGS, PRESETS } from '../../app/src/lib/configs'

let n = 0
for (const c of [...CONFIGS, ...PRESETS]) {
  const d = c.build()
  const a = renderToStaticMarkup(<WindowSvg design={d} maxHeight={400} />)
  const b = renderToStaticMarkup(<MiniWindow design={d} />)
  if (!a.includes('<svg') || !b.includes('<svg')) throw new Error('пустой чертёж: ' + c.key)
  n++
}
console.log('отрисовано без ошибок:', n)
