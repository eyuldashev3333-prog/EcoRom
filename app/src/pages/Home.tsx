import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronRight, Hammer, LogOut, Plus, Wallet, type LucideIcon } from 'lucide-react'
import Tile, { type Tone } from '../ui/Tile'
import { useAuth } from '../auth'
import { supabase } from '../supabase'
import OrderCard from '../components/OrderCard'
import MyStats from '../components/MyStats'
import { InstallActions, ShopActions } from '../components/OrderActions'
import { OrdersBoard } from './Orders'
import { useWorkCards, type WorkCard } from '../lib/orderCards'
import { type Leaks } from '../lib/leaks'
import { stationOf, type WOrder, type ZavodState } from '../lib/zavod'
import { setSection, useSection } from '../shell/pager'
import { sectionsFor, type SectionDef } from '../shell/sections'
import MontajBoard from '../components/MontajBoard'
import FinanceCharts from '../components/FinanceCharts'
import { uz } from '../uz'

const s = uz.shell
const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n))
const dmy = (d: string | null) => (d ? d.split('-').reverse().join('.') : '')

// ============ данные главной Rahbar (одна загрузка на все разделы) ============
interface RahbarData {
  cash: number | null
  since: string
  orders: number | null
  debt: number | null
  supDebt: number | null
  openService: number | null
  leaks: Leaks | null
  zavod: ZavodState | null
}
function useRahbarData(enabled: boolean): RahbarData {
  const [d, setD] = useState<RahbarData>({ cash: null, since: '', orders: null, debt: null, supDebt: null, openService: null, leaks: null, zavod: null })
  useEffect(() => {
    if (!enabled) return
    const up = (p: Partial<RahbarData>) => setD((x) => ({ ...x, ...p }))
    supabase.rpc('leaks_report').then(({ data }) => data && up({ leaks: data as Leaks }))
    supabase.rpc('workshop_state').then(({ data }) => data && up({ zavod: data as ZavodState }))
    // все цифры считает сервер одним запросом (home_summary): касса, долги (без отменённых), число заказов, открытый сервис
    supabase.rpc('home_summary').then(({ data }) => {
      const s = data as { cash: number; since: string | null; client_debt: number; supplier_debt: number; orders: number; open_service: number } | null
      if (!s) return
      up({ cash: Number(s.cash), since: s.since ?? '', debt: Number(s.client_debt), supDebt: Number(s.supplier_debt), orders: Number(s.orders), openService: Number(s.open_service) })
    })
  }, [enabled])
  return d
}

// ============ строгие составные части ============
const sum = (n: number | null) => (n === null ? <span className="skel" /> : <>{fmt(n)}<small> so‘m</small></>)

type KTone = 'red' | 'green' | 'blue' | 'orange' | 'purple'
function Kpis({ items }: { items: { label: string; value: ReactNode; tone?: KTone; sub?: string }[] }) {
  return (
    <div className="kpis">
      {items.map((k) => (
        <div key={k.label} className={`kpi ${k.tone ? `k-${k.tone}` : ''}`}>
          <span className="kpi-label">{k.label}</span>
          <span className="kpi-value">{k.value}</span>
          {k.sub && <span className="kpi-sub">{k.sub}</span>}
        </div>
      ))}
    </div>
  )
}

function Panel({ title, action, children, foot, tone, icon }: { title: string; action?: { to: string; label: string }; children: ReactNode; foot?: ReactNode; tone?: Exclude<Tone, 'gray'>; icon?: LucideIcon }) {
  return (
    <section className={`panel ${tone ? `p-${tone}` : ''}`}>
      <header className="panel-head">
        <h2>{icon && <Tile icon={icon} tone={tone} size="sm" />}{title}</h2>
        {action && (
          <Link to={action.to} className="panel-link">
            {action.label} <ChevronRight size={14} strokeWidth={1.8} />
          </Link>
        )}
      </header>
      <div className="panel-body">{children}</div>
      {foot && <footer className="panel-foot">{foot}</footer>}
    </section>
  )
}

function Row({ to, title, sub, right, onClick }: { to?: string; title: ReactNode; sub?: ReactNode; right?: ReactNode; onClick?: () => void }) {
  const inner = (
    <>
      <span className="r-main">
        <span className="r-title">{title}</span>
        {sub && <span className="r-sub">{sub}</span>}
      </span>
      {right !== undefined && <span className="r-right">{right}</span>}
      {(to || onClick) && <ChevronRight className="r-chev" size={16} strokeWidth={1.6} />}
    </>
  )
  if (to) return <Link to={to} className="r">{inner}</Link>
  if (onClick) return <button type="button" className="r" onClick={onClick}>{inner}</button>
  return <div className="r">{inner}</div>
}
const Empty = ({ text }: { text: string }) => <div className="r r-empty">{text}</div>
// цех ответил? (вместо процентов: у цеха только «Jarayonda» → «Tayyor»)
const ShopMark = ({ o }: { o: WOrder }) =>
  o.material ? <span className="debt-tag">{uz.workshop.legend.material}</span> : <span className={o.late ? 'today' : 'muted'}>{o.accepted ? uz.flow.accepted : uz.flow.waiting}</span>

function SectionHead({ sec, actions }: { sec: SectionDef; actions?: ReactNode }) {
  return (
    <header className="sec-head">
      <div className="sec-title">
        <Tile icon={sec.icon} tone={sec.tone} size="lg" />
        <div>
          <div className="sec-kicker">{s.kicker[sec.id]}</div>
          <h1>{s.title[sec.id]}</h1>
        </div>
      </div>
      {actions && <div className="sec-actions">{actions}</div>}
    </header>
  )
}
function Links({ sec }: { sec: SectionDef }) {
  if (!sec.items.length) return null
  return (
    <div className="quick">
      {sec.items.map((i) => {
        const Icon = i.icon
        return (
          <Link key={i.to} to={i.to} className="quick-item">
            <Tile icon={Icon} tone={i.tone ?? sec.tone} />
            <span>{i.label}</span>
          </Link>
        )
      })}
    </div>
  )
}

// ============ разделы Rahbar ============
function inShopOf(d: RahbarData) {
  return (d.zavod?.orders ?? []).filter((o) => !['new', 'ready', 'install'].includes(stationOf(o)))
}

// «Diqqat talab»: показываем только то, что реально требует действия, обычными словами (без кнопок-счётчиков)
function attentionRows(l: Leaks | null): { key: string; to: string; text: string; n?: number }[] {
  if (!l) return []
  const t = uz.leaks
  const rows = [
    { key: 'overdue', to: '/leaks', text: t.overdue, n: l.overdue.count },
    { key: 'material', to: '/leaks', text: t.material, n: l.material.count },
    { key: 'stuck', to: '/leaks', text: t.stuck, n: l.stuck.count },
    { key: 'stock', to: '/stock', text: t.stockNeg, n: l.stock_negative.count },
    { key: 'service', to: '/service', text: t.service, n: l.service.count },
    { key: 'unpaid', to: '/leaks', text: t.installedUnpaid, n: l.installed_unpaid.count },
    { key: 'breakage', to: '/breakages', text: t.breakage, n: l.breakage_undecided.count },
  ].filter((r) => r.n > 0)
  if (l.cash.negative) rows.push({ key: 'cash', to: '/leaks', text: t.cashNeg, n: 0 })
  return rows
}

function ZavodPane({ sec, d }: { sec: SectionDef; d: RahbarData }) {
  const inShop = inShopOf(d)
  const alerts = attentionRows(d.leaks)
  return (
    <>
      <SectionHead sec={sec} actions={<Link to="/workshop" className="btn-link">{uz.shell.open3d}</Link>} />
      <Kpis
        items={[
          { label: uz.home.cash, value: sum(d.cash), tone: d.cash !== null && d.cash < 0 ? 'red' : 'green', sub: d.since ? `${dmy(d.since)} dan` : undefined },
          { label: uz.home.clientDebt, value: sum(d.debt), tone: d.debt ? 'red' : undefined },
          { label: uz.home.supplierDebt, value: sum(d.supDebt), tone: d.supDebt ? 'red' : undefined },
          { label: uz.home.orders, value: d.orders === null ? <span className="skel" /> : fmt(d.orders), tone: 'blue' },
        ]}
      />
      <div className="cols">
        <Panel title={s.attention} tone="red" icon={AlertTriangle}>
          {!d.leaks && <Empty text={uz.loading} />}
          {d.leaks && alerts.length === 0 && <Empty text={uz.leaks.ok} />}
          {alerts.map((a) => (
            <Row key={a.key} to={a.to} title={a.text} right={a.n ? <span className="count">{a.n}</span> : undefined} />
          ))}
        </Panel>
        <Panel title={s.inShop} action={{ to: '/zavod', label: s.open }} tone="orange" icon={Hammer}>
          {inShop.length === 0 && <Empty text={d.zavod ? s.nothing : uz.loading} />}
          {inShop.slice(0, 6).map((o) => (
            <Row key={o.order_id} to={`/orders/${o.order_id}`} title={`№${o.order_no} · ${o.client}`} sub={`${uz.workshop.stations[stationOf(o)]} · ${o.windows} ${uz.home.windows}`} right={<ShopMark o={o} />} />
          ))}
        </Panel>
      </div>
    </>
  )
}

// Savdo: сразу канбан заказов с кнопками под карточками (списка нет)
function SavdoPane({ sec }: { sec: SectionDef }) {
  return (
    <>
      <SectionHead
        sec={sec}
        actions={
          <Link to="/orders/new" className="btn-primary">
            <Plus size={16} strokeWidth={2} /> {s.newOrder}
          </Link>
        }
      />
      <Links sec={sec} />
      <OrdersBoard />
    </>
  )
}

function IshlabPane({ sec, d }: { sec: SectionDef; d: RahbarData }) {
  const inShop = inShopOf(d)
  return (
    <>
      <SectionHead sec={sec} />
      <Links sec={sec} />
      <Panel title={s.inShop} action={{ to: '/zavod', label: s.open }} tone="orange" icon={Hammer}>
        {inShop.length === 0 && <Empty text={d.zavod ? s.nothing : uz.loading} />}
        {inShop.map((o) => (
          <Row
            key={o.order_id}
            to={`/orders/${o.order_id}`}
            title={`№${o.order_no} · ${o.client}`}
            sub={`${uz.workshop.stations[stationOf(o)]} · ${o.windows} ${uz.home.windows}${o.material ? ` · ${uz.workshop.legend.material}` : ''}`}
            right={<ShopMark o={o} />}
          />
        ))}
      </Panel>
    </>
  )
}

function MontajPane({ sec, d }: { sec: SectionDef; d: RahbarData }) {
  return (
    <>
      <SectionHead sec={sec} />
      <Kpis items={[{ label: uz.home.service, value: d.openService ?? <span className="skel" />, tone: d.openService ? 'orange' : undefined }]} />
      <Links sec={sec} />
      <MontajBoard />
    </>
  )
}
function PulPane({ sec, d }: { sec: SectionDef; d: RahbarData }) {
  return (
    <>
      <SectionHead sec={sec} />
      <Kpis
        items={[
          { label: uz.home.cash, value: sum(d.cash), tone: d.cash !== null && d.cash < 0 ? 'red' : 'green' },
          { label: uz.home.clientDebt, value: sum(d.debt), tone: d.debt ? 'red' : undefined },
          { label: uz.home.supplierDebt, value: sum(d.supDebt), tone: d.supDebt ? 'red' : undefined },
        ]}
      />
      <FinanceCharts />
      <Links sec={sec} />
    </>
  )
}

function SozlamalarPane({ sec }: { sec: SectionDef }) {
  const { signOut } = useAuth()
  return (
    <>
      <SectionHead sec={sec} />
      <Links sec={sec} />
      <Panel title={uz.shell.sections.profil}>
        <Row to="/password" title={uz.home.password} />
        <Row onClick={signOut} title={<span className="inline" style={{ gap: 8 }}><LogOut size={15} strokeWidth={1.6} /> {uz.signOut}</span>} />
      </Panel>
    </>
  )
}

// ============ мои деньги за текущий месяц (цех и монтажник) ============
function MyMoney() {
  const [r, setR] = useState<{ accrued: number; paid: number; remaining: number } | null>(null)
  useEffect(() => {
    const m = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' }).slice(0, 7) + '-01'
    supabase.rpc('payroll_summary', { p_month: m }).then(({ data }) => {
      const x = ((data as { accrued: number; paid: number; remaining: number }[]) ?? [])[0]
      setR(x ? { accrued: Number(x.accrued), paid: Number(x.paid), remaining: Number(x.remaining) } : { accrued: 0, paid: 0, remaining: 0 })
    })
  }, [])
  return (
    <Panel title={uz.payroll.my} action={{ to: '/my-pay', label: s.open }} tone="green" icon={Wallet}>
      <Kpis items={[
        { label: uz.payroll.accrued, value: sum(r?.accrued ?? null), tone: 'green' },
        { label: uz.payroll.paid, value: sum(r?.paid ?? null), tone: 'green' },
        { label: uz.payroll.remaining, value: sum(r?.remaining ?? null), tone: r && r.remaining > 0 ? 'orange' : undefined },
      ]} />
    </Panel>
  )
}

// ============ цех: те же карточки заказов, кнопки «Qabul qildim / Material yetmaydi», потом «Tayyor» ============
function ShopPane({ sec }: { sec: SectionDef }) {
  const { cards, reload } = useWorkCards('ishlab')
  const req = (cards ?? []).filter((c) => c.status === 'in_production' && !c.accepted)
  const work = (cards ?? []).filter((c) => c.accepted || c.status !== 'in_production')
  const col = (title: string, list: WorkCard[]) => (
    <section className="kcol">
      <header>
        <span>{title}</span>
        <b>{list.length}</b>
      </header>
      {cards === null && <div className="kempty">{uz.loading}</div>}
      {cards && list.length === 0 && <div className="kempty">—</div>}
      {list.map((c) => (
        <OrderCard key={c.id} c={c} to={`/shop/${c.id}`} money={false} client={false}>
          <ShopActions c={c} onDone={reload} />
        </OrderCard>
      ))}
    </section>
  )
  return (
    <>
      <SectionHead sec={sec} />
      <MyStats role="ishlab" first={[{ label: uz.shop.tabRequest, value: req.length }, { label: uz.shop.tabWork, value: (cards ?? []).filter((c) => c.status === 'in_production' && c.accepted).length }]} />
      <MyMoney />
      <div className="montaj-board">
        {col(uz.shop.tabRequest, req)}
        {col(uz.shop.tabWork, work)}
      </div>
    </>
  )
}

// ============ монтажник: карточки, «Qabul qildim» → «O'rnatildi» (+ «Shisha o'rnatildimi?»), фото — в бота ============
function InstallPane({ sec }: { sec: SectionDef }) {
  const { cards, reload } = useWorkCards('montajchi')
  const [svc, setSvc] = useState<{ id: string; order_no: number; client_name: string | null; address: string | null; due_date: string | null; description: string; work_done_at: string | null }[]>([])
  useEffect(() => {
    supabase.from('w_service_tickets').select('id, order_no, client_name, address, due_date, description, work_done_at').order('due_date', { nullsFirst: false }).then(({ data }) => setSvc((data as typeof svc) ?? []))
  }, [])
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' })
  const isNow = (c: WorkCard) => c.status === 'installed' || (c.job?.plan_date ?? '9999') <= today
  const col = (title: string, list: WorkCard[]) => (
    <section className="kcol">
      <header>
        <span>{title}</span>
        <b>{list.length}</b>
      </header>
      {cards === null && <div className="kempty">{uz.loading}</div>}
      {cards && list.length === 0 && <div className="kempty">{uz.install.noJobs}</div>}
      {list.map((c) => (
        <OrderCard key={c.id} c={c} to={`/install/${c.id}`} money={false}>
          <InstallActions c={c} onDone={reload} />
        </OrderCard>
      ))}
    </section>
  )
  return (
    <>
      <SectionHead sec={sec} />
      <MyStats role="montajchi" first={[{ label: uz.install.today, value: (cards ?? []).filter(isNow).length }, { label: uz.install.next, value: (cards ?? []).filter((c) => !isNow(c)).length }]} />
      <MyMoney />
      <div className="montaj-board">
        {col(uz.install.today, (cards ?? []).filter(isNow))}
        {col(uz.install.next, (cards ?? []).filter((c) => !isNow(c)))}
      </div>
      {svc.length > 0 && (
        <Panel title={uz.service.mine}>
          {svc.map((v) => (
            <Row key={v.id} to={`/servis/${v.id}`} title={`№${v.order_no} · ${v.client_name ?? ''}`} sub={v.work_done_at ? uz.service.done : v.description} right={<span className="muted">{dmy(v.due_date)}</span>} />
          ))}
        </Panel>
      )}
    </>
  )
}

function ProfilPane({ sec }: { sec: SectionDef }) {
  const { me, signOut } = useAuth()
  return (
    <>
      <SectionHead sec={sec} />
      <Panel title={me?.full_name ?? ''}>
        <Row to="/my-works" title={uz.mywork.title} />
        <Row to="/my-pay" title={uz.home.myPay} />
        <Row to="/password" title={uz.home.password} />
        <Row onClick={signOut} title={uz.signOut} />
      </Panel>
    </>
  )
}

function render(sec: SectionDef, d: RahbarData): ReactNode {
  switch (sec.id) {
    case 'zavod': return <ZavodPane sec={sec} d={d} />
    case 'savdo': return <SavdoPane sec={sec} />
    case 'ishlab': return <IshlabPane sec={sec} d={d} />
    case 'montaj': return <MontajPane sec={sec} d={d} />
    case 'pul': return <PulPane sec={sec} d={d} />
    case 'sozlamalar': return <SozlamalarPane sec={sec} />
    case 'jadval': return <><SectionHead sec={sec} /><Links sec={sec} /></>
    case 'ishlarim': return <ShopPane sec={sec} />
    case 'bugun': return <InstallPane sec={sec} />
    default: return <ProfilPane sec={sec} />
  }
}

// ERP-главная: разделы с цифрами и таблицами; на телефоне листаются свайпом (3D-завод — отдельный режим /zavod)
export default function Home() {
  const { me } = useAuth()
  const sections = sectionsFor(me!.role)
  const ids = sections.map((x) => x.id)
  const d = useRahbarData(me!.role === 'rahbar')
  const stored = useSection()
  const current = ids.includes(stored) ? stored : ids[0]
  const idx = ids.indexOf(current)
  const pager = useRef<HTMLDivElement>(null)
  const raf = useRef(0)
  const fromScroll = useRef(false)

  // раздел сменили снаружи (боковая панель / нижняя навигация) → прокрутить пейджер
  useLayoutEffect(() => {
    const el = pager.current
    if (!el) return
    if (fromScroll.current) {
      fromScroll.current = false
      return
    }
    const left = idx * el.clientWidth
    if (Math.abs(el.scrollLeft - left) > 2) el.scrollTo({ left, behavior: el.scrollLeft === 0 && idx > 0 ? 'auto' : 'smooth' })
  }, [idx])

  const onScroll = () => {
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      const el = pager.current
      if (!el) return
      const i = Math.round(el.scrollLeft / el.clientWidth)
      if (ids[i] && ids[i] !== current) {
        fromScroll.current = true
        setSection(ids[i])
      }
    })
  }

  return (
    <div className={`home sec-${current}`}>
      <div className="pager" ref={pager} onScroll={onScroll}>
        {sections.map((x, i) => (
          <section key={x.id} className="pane" aria-hidden={i !== idx}>
            <div className="pane-inner">{render(x, d)}</div>
          </section>
        ))}
      </div>
    </div>
  )
}
