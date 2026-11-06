import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { LogoMark, Wordmark } from '../ui/Logo'
import Tile from '../ui/Tile'
import { setSection, useSection } from './pager'
import { sectionsFor } from './sections'

// ПК: белая боковая панель — разделы (открывают обзор на главной) и их пункты (экраны)
export default function Sidebar({ badges = {} }: { badges?: Record<string, number> }) {
  const { me } = useAuth()
  const loc = useLocation()
  const nav = useNavigate()
  const current = useSection()
  if (!me) return null
  const home = loc.pathname === '/'
  const sections = sectionsFor(me.role)
  const openSection = (id: string) => {
    setSection(id)
    if (!home) nav('/')
  }
  return (
    <aside className="sidebar">
      <Link to="/" className="side-brand" onClick={() => setSection(sections[0].id)}>
        <LogoMark size={18} />
        <Wordmark />
      </Link>
      <nav className="side-nav">
        {sections.map((s) => {
          const Icon = s.icon
          const active = home && current === s.id
          const childActive = s.items.some((i) => loc.pathname.startsWith(i.to))
          return (
            <div key={s.id} className="side-group">
              <button type="button" className={`side-sec ${active ? 'on' : ''} ${childActive ? 'child-on' : ''}`} onClick={() => openSection(s.id)}>
                <Tile icon={Icon} tone={s.tone} size="sm" />
                <span>{s.label}</span>
                {!!badges[s.id] && <span className="side-badge">{badges[s.id]}</span>}
              </button>
              {(active || childActive) &&
                s.items.map((i) => (
                  <Link key={i.to} to={i.to} className={`side-item ${loc.pathname.startsWith(i.to) ? 'on' : ''}`}>
                    <Tile icon={i.icon} tone={i.tone} size="sm" />
                    {i.label}
                  </Link>
                ))}
            </div>
          )
        })}
      </nav>
      <div className="side-foot">ECOROM · Sifat va ishonch</div>
    </aside>
  )
}
