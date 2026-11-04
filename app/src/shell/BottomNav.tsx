import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { setSection, useSection } from './pager'
import { sectionsFor } from './sections'

// телефон: монохромная нижняя навигация по разделам (активный — чёрный текст и тонкая черта сверху)
export default function BottomNav({ badges = {} }: { badges?: Record<string, number> }) {
  const { me } = useAuth()
  const loc = useLocation()
  const nav = useNavigate()
  const current = useSection()
  if (!me) return null
  const sections = sectionsFor(me.role)
  if (sections.length < 2) return null
  const home = loc.pathname === '/'
  return (
    <nav className="bottomnav" aria-label="bo‘limlar">
      {sections.map((s) => {
        const Icon = s.icon
        const on = home ? current === s.id : s.items.some((i) => loc.pathname.startsWith(i.to))
        return (
          <button
            key={s.id}
            type="button"
            className={`bn-btn ${on ? 'on' : ''}`}
            onClick={() => {
              setSection(s.id)
              if (!home) nav('/')
            }}
          >
            <Icon size={20} strokeWidth={on ? 1.9 : 1.5} />
            <span>{s.short}</span>
            {!!badges[s.id] && <i className="bn-dot" />}
          </button>
        )
      })}
    </nav>
  )
}
