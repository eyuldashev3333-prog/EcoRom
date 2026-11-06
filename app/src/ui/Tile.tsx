import type { LucideIcon } from 'lucide-react'

export type Tone = 'green' | 'red' | 'blue' | 'orange' | 'purple' | 'gray'

// Плитка с линейной иконкой на мягкой заливке своего цвета (разделы, пункты меню, заголовки)
export default function Tile({ icon: Icon, tone = 'gray', size = 'md' }: { icon: LucideIcon; tone?: Tone; size?: 'sm' | 'md' | 'lg' }) {
  const px = size === 'lg' ? 20 : size === 'sm' ? 15 : 17
  return (
    <span className={`itile t-${tone} ${size === 'md' ? '' : size}`} aria-hidden="true">
      <Icon size={px} strokeWidth={1.7} />
    </span>
  )
}
