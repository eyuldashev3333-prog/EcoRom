// Разделы и пункты меню по ролям — общие для боковой панели (ПК), нижней навигации (телефон) и главной.
// tone — цвет плитки с иконкой: зелёный деньги, синий заказы, оранжевый склад/цех, фиолетовый монтаж/сервис, красный риски, серый настройки.
import {
  ArrowLeftRight, BarChart3, BookOpen, Box, CalendarCheck, Camera, ClipboardList, Factory, Hammer, KeyRound, LayoutGrid, PencilRuler,
  Receipt, ScrollText, Scissors, Settings2, ShieldAlert, ShoppingCart, SlidersHorizontal, Store, Table2, TriangleAlert, Truck, User, Users,
  Wallet, Wrench, type LucideIcon,
} from 'lucide-react'
import type { Role } from '../auth'
import { uz } from '../uz'
import type { Tone } from '../ui/Tile'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  tone?: Tone
}
export interface SectionDef {
  id: string
  label: string
  short: string
  icon: LucideIcon
  tone: Tone
  items: NavItem[]
}

export function sectionsFor(role: Role): SectionDef[] {
  const h = uz.home
  const s = uz.shell.sections
  if (role === 'rahbar')
    return [
      { id: 'zavod', label: s.zavod, short: s.zavod, icon: LayoutGrid, tone: 'gray', items: [] },
      {
        id: 'savdo', label: s.savdo, short: s.savdo, icon: Store, tone: 'blue',
        items: [
          { to: '/orders', label: h.orders, icon: ClipboardList, tone: 'blue' },
          { to: '/designer', label: h.designer, icon: PencilRuler, tone: 'blue' },
          { to: '/photo', label: h.photo, icon: Camera, tone: 'blue' },
        ],
      },
      {
        id: 'ishlab', label: uz.shell.kicker.ishlab, short: s.ishlab, icon: Hammer, tone: 'orange',
        items: [
          { to: '/stock', label: h.stock, icon: Box, tone: 'orange' },
          { to: '/purchases', label: h.purchases, icon: ShoppingCart, tone: 'orange' },
          { to: '/offcuts', label: uz.cutting.listTitle, icon: Scissors, tone: 'orange' },
          { to: '/suppliers', label: h.suppliers, icon: Truck, tone: 'orange' },
        ],
      },
      {
        id: 'montaj', label: uz.shell.kicker.montaj, short: s.montaj, icon: Wrench, tone: 'purple',
        items: [
          { to: '/service', label: h.service, icon: Wrench, tone: 'purple' },
          { to: '/breakages', label: h.breakage, icon: TriangleAlert, tone: 'red' },
        ],
      },
      {
        id: 'pul', label: s.pul, short: s.pul, icon: Wallet, tone: 'green',
        items: [
          { to: '/expenses', label: h.expenses, icon: Receipt, tone: 'red' },
          { to: '/payroll', label: h.payroll, icon: Users, tone: 'green' },
          { to: '/pay-rules', label: uz.payroll.rules, icon: ScrollText, tone: 'green' },
          { to: '/report', label: h.report, icon: BarChart3, tone: 'green' },
          { to: '/leaks', label: h.leaks, icon: ShieldAlert, tone: 'red' },
        ],
      },
      {
        id: 'jadval', label: s.jadval, short: s.jadval, icon: Table2, tone: 'gray',
        items: [
          { to: '/jadval/registratsiya', label: 'REGISTRATSIYA', icon: Table2, tone: 'gray' },
          { to: '/jadval/savdo', label: 'SAVDO BOLIMI', icon: Table2, tone: 'gray' },
        ],
      },
      {
        id: 'sozlamalar', label: s.sozlamalar, short: s.sozlamalarShort, icon: Settings2, tone: 'gray',
        items: [
          { to: '/employees', label: h.employees, icon: Users, tone: 'gray' },
          { to: '/catalog', label: h.catalog, icon: BookOpen, tone: 'gray' },
          { to: '/exchange', label: uz.exchange.title, icon: ArrowLeftRight, tone: 'gray' },
          { to: '/settings', label: h.settings, icon: SlidersHorizontal, tone: 'gray' },
        ],
      },
    ]
  const mine: NavItem[] = [
    { to: '/my-pay', label: h.myPay, icon: Wallet, tone: 'green' },
    { to: '/password', label: h.password, icon: KeyRound, tone: 'gray' },
  ]
  if (role === 'ishlab')
    return [
      { id: 'ishlarim', label: s.ishlarim, short: s.ishlarim, icon: Hammer, tone: 'orange', items: [] },
      { id: 'profil', label: s.profil, short: s.profil, icon: User, tone: 'green', items: mine },
    ]
  return [
    { id: 'bugun', label: s.bugun, short: s.bugun, icon: CalendarCheck, tone: 'purple', items: [] },
    { id: 'profil', label: s.profil, short: s.profil, icon: User, tone: 'green', items: mine },
  ]
}
