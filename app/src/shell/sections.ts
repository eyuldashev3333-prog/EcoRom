// Разделы и пункты меню по ролям — общие для боковой панели (ПК), нижней навигации (телефон) и главной.
import {
  BarChart3, BookOpen, Box, CalendarCheck, Camera, ClipboardList, Factory, Hammer, KeyRound, LayoutGrid, PencilRuler,
  Receipt, ScrollText, Scissors, Settings2, ShieldAlert, ShoppingCart, SlidersHorizontal, Store, Table2, TriangleAlert, Truck, User, Users,
  Wallet, Wrench, type LucideIcon,
} from 'lucide-react'
import type { Role } from '../auth'
import { uz } from '../uz'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}
export interface SectionDef {
  id: string
  label: string
  short: string
  icon: LucideIcon
  items: NavItem[]
}

export function sectionsFor(role: Role): SectionDef[] {
  const h = uz.home
  const s = uz.shell.sections
  if (role === 'rahbar')
    return [
      { id: 'zavod', label: s.zavod, short: s.zavod, icon: LayoutGrid, items: [] },
      {
        id: 'savdo', label: s.savdo, short: s.savdo, icon: Store,
        items: [
          { to: '/orders', label: h.orders, icon: ClipboardList },
          { to: '/designer', label: h.designer, icon: PencilRuler },
          { to: '/photo', label: h.photo, icon: Camera },
        ],
      },
      {
        id: 'ishlab', label: uz.shell.kicker.ishlab, short: s.ishlab, icon: Hammer,
        items: [
          { to: '/stock', label: h.stock, icon: Box },
          { to: '/purchases', label: h.purchases, icon: ShoppingCart },
          { to: '/offcuts', label: uz.cutting.listTitle, icon: Scissors },
          { to: '/suppliers', label: h.suppliers, icon: Truck },
        ],
      },
      {
        id: 'montaj', label: uz.shell.kicker.montaj, short: s.montaj, icon: Wrench,
        items: [
          { to: '/service', label: h.service, icon: Wrench },
          { to: '/breakages', label: h.breakage, icon: TriangleAlert },
        ],
      },
      {
        id: 'pul', label: s.pul, short: s.pul, icon: Wallet,
        items: [
          { to: '/expenses', label: h.expenses, icon: Receipt },
          { to: '/payroll', label: h.payroll, icon: Users },
          { to: '/pay-rules', label: uz.payroll.rules, icon: ScrollText },
          { to: '/report', label: h.report, icon: BarChart3 },
          { to: '/leaks', label: h.leaks, icon: ShieldAlert },
        ],
      },
      {
        id: 'jadval', label: s.jadval, short: s.jadval, icon: Table2,
        items: [
          { to: '/jadval/registratsiya', label: 'REGISTRATSIYA', icon: Table2 },
          { to: '/jadval/savdo', label: 'SAVDO BOLIMI', icon: Table2 },
        ],
      },
      {
        id: 'sozlamalar', label: s.sozlamalar, short: s.sozlamalarShort, icon: Settings2,
        items: [
          { to: '/employees', label: h.employees, icon: Users },
          { to: '/catalog', label: h.catalog, icon: BookOpen },
          { to: '/settings', label: h.settings, icon: SlidersHorizontal },
        ],
      },
    ]
  const mine: NavItem[] = [
    { to: '/my-pay', label: h.myPay, icon: Wallet },
    { to: '/password', label: h.password, icon: KeyRound },
  ]
  if (role === 'ishlab')
    return [
      { id: 'ishlarim', label: s.ishlarim, short: s.ishlarim, icon: Hammer, items: [] },
      { id: 'profil', label: s.profil, short: s.profil, icon: User, items: mine },
    ]
  return [
    { id: 'bugun', label: s.bugun, short: s.bugun, icon: CalendarCheck, items: [] },
    { id: 'profil', label: s.profil, short: s.profil, icon: User, items: mine },
  ]
}
