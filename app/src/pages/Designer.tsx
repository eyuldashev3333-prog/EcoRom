import { useState } from 'react'
import { Link } from 'react-router-dom'
import WindowEditor, { PRESETS } from '../components/WindowEditor'
import type { WindowDesign } from '../lib/window'
import { uz } from '../uz'

// свободный конструктор (без заказа) — посчитать/показать клиенту
export default function Designer() {
  const [design, setDesign] = useState<WindowDesign>(PRESETS[1].build())
  return (
    <>
      <p>
        <Link to="/">←</Link>
      </p>
      <h1>{uz.designer.title}</h1>
      <WindowEditor value={design} onChange={setDesign} />
    </>
  )
}
