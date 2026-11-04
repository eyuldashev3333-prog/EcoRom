import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, type LucideIcon } from 'lucide-react'

export type Tone = 'green' | 'blue' | 'orange' | 'red' | 'purple' | 'graphite' | 'teal' | 'indigo'

// цветной квадратик с иконкой — как в «Настройках» iPhone
export function IconTile({ icon: Icon, tone = 'green', size = 30 }: { icon: LucideIcon; tone?: Tone; size?: number }) {
  return (
    <span className={`icon-tile t-${tone}`} style={{ width: size, height: size }}>
      <Icon size={size * 0.58} strokeWidth={2.1} />
    </span>
  )
}

// сгруппированный список (inset grouped)
export function ListGroup({ title, footer, children }: { title?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="lgroup">
      {title && <h3 className="lgroup-title">{title}</h3>}
      <div className="lgroup-body">{children}</div>
      {footer && <p className="lgroup-foot">{footer}</p>}
    </section>
  )
}

interface RowProps {
  to?: string
  onClick?: () => void
  icon?: LucideIcon
  tone?: Tone
  title: ReactNode
  subtitle?: ReactNode
  detail?: ReactNode
  badge?: number | string | null
  badgeTone?: 'red' | 'orange' | 'green' | 'graphite'
  chevron?: boolean
}
export function ListRow({ to, onClick, icon, tone, title, subtitle, detail, badge, badgeTone = 'red', chevron = true }: RowProps) {
  const inner = (
    <>
      {icon && <IconTile icon={icon} tone={tone} />}
      <span className="lrow-main">
        <span className="lrow-title">{title}</span>
        {subtitle && <span className="lrow-sub">{subtitle}</span>}
      </span>
      {detail !== undefined && detail !== null && <span className="lrow-detail">{detail}</span>}
      {badge !== undefined && badge !== null && badge !== 0 && badge !== '' && <span className={`lbadge b-${badgeTone}`}>{badge}</span>}
      {chevron && (to || onClick) && <ChevronRight className="lrow-chev" size={18} strokeWidth={2.2} />}
    </>
  )
  if (to)
    return (
      <Link to={to} className="lrow">
        {inner}
      </Link>
    )
  if (onClick)
    return (
      <button type="button" className="lrow" onClick={onClick}>
        {inner}
      </button>
    )
  return <div className="lrow">{inner}</div>
}

// крупная цифра на стекле
export function Metric({ label, value, tone, sub }: { label: ReactNode; value: ReactNode; tone?: 'red' | 'green'; sub?: ReactNode }) {
  return (
    <div className={`metric ${tone ? `m-${tone}` : ''}`}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
      {sub && <span className="metric-sub">{sub}</span>}
    </div>
  )
}
