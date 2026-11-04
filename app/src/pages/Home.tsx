import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, LogOut, Plus } from 'lucide-react'
import { useAuth } from '../auth'
import { supabase } from '../supabase'
import { progressPct } from '../components/StageGrid'
import { attentionCount, type Leaks } from '../lib/leaks'
import { bottleneck, stationOf, type ZavodState } from '../lib/zavod'
import { setSection, useSection } from '../shell/pager'
import { sectionsFor, type SectionDef } from '../shell/sections'
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
  attention: number | null
  recent: { id: string; order_no: number; status: string; contract_price: number; created_at: string; clients: { full_name: string } | null }[]
  zavod: ZavodState | null
}
function useRahbarData(enabled: boolean): RahbarData {
  const [d, setD] = useState<RahbarData>({ cash: null, since: '', orders: null, debt: null, supDebt: null, openService: null, attention: null, recent: [], zavod: null })
  useEffect(() => {
    if (!enabled) return
    const up = (p: Partial<RahbarData>) => setD((x) => ({ ...x, ...p }))
    supabase.rpc('leaks_report').then(({ data }) => data && up({ attention: attentionCount(data as Leaks) }))
    supabase.rpc('workshop_state').then(({ data }) => data && up({ zavod: data as ZavodState }))
    supabase.from('service_tickets').select('id', { count: 'exact', head: true }).neq('status', 'closed').then(({ count }) => up({ openService: count ?? 0 }))
    supabase.from('v_supplier_debt').select('debt').then(({ data }) => up({ supDebt: ((data as { debt: string }[]) ?? []).reduce((a, x) => a + Math.max(0, Number(x.debt)), 0) }))
    // долг клиентов: только по активным заказам (без отменённых)
    Promise.all([supabase.from('v_order_paid').select('order_id, debt'), supabase.from('orders').select('id').neq('status', 'cancelled')]).then(([dd, o]) => {
      const active = new Set(((o.data as { id: string }[]) ?? []).map((x) => x.id))
      up({ debt: ((dd.data as { order_id: string; debt: string }[]) ?? []).filter((x) => active.has(x.order_id)).reduce((a, x) => a + Math.max(0, Number(x.debt)), 0) })
    })
    supabase.from('v_cash_balance').select('cash, since').maybeSingle().then(({ data }) => {
      const c = data as { cash: string; since: string } | null
      up({ cash: Number(c?.cash ?? 0), since: c?.since ?? '' })
    })
    supabase.from('orders').select('id', { count: 'exact', head: true }).then(({ count }) => up({ orders: count ?? 0 }))
    supabase
      .from('orders')
      .select('id, order_no, status, contract_price, created_at, clients(full_name)')
      .order('order_no', { ascending: false })
      .limit(8)
      .then(({ data }) => up({ recent: (data as unknown as RahbarData['recent']) ?? [] }))
  }, [enabled])
  return d
}

// ============ строгие составные части ============
const sum = (n: number | null) => (n === null ? <span className="skel" /> : <>{fmt(n)}<small> so‘m</small></>)

function Kpis({ items }: { items: { label: string; value: ReactNode; tone?: 'red' | 'green'; sub?: string }[] }) {
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

function Panel({ title, action, children, foot }: { title: string; action?: { to: string; label: string }; children: ReactNode; foot?: ReactNode }) {
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>{title}</h2>
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
const Count = ({ n }: { n: number | null }) => (n ? <span className="count">{n}</span> : <span className="muted">0</span>)
const Pct = ({ v, late }: { v: number; late?: boolean }) => (
  <span className="pct-cell">
    <span className={`bar ${late ? 'late' : ''}`}>
      <i style={{ width: `${Math.round(v)}%` }} />
    </span>
    {Math.round(v)}%
  </span>
)

function SectionHead({ sec, actions }: { sec: SectionDef; actions?: ReactNode }) {
  return (
    <header className="sec-head">
      <div>
        <div className="sec-kicker">{s.kicker[sec.id]}</div>
        <h1>{s.title[sec.id]}</h1>
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
            <Icon size={18} strokeWidth={1.5} />
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

function ZavodPane({ sec, d }: { sec: SectionDef; d: RahbarData }) {
  const neck = d.zavod ? bottleneck(d.zavod.orders) : null
  const inShop = inShopOf(d)
  return (
    <>
      <SectionHead sec={sec} actions={<Link to="/workshop" className="btn-link">{uz.shell.open3d}</Link>} />
      <Kpis
        items={[
          { label: uz.home.cash, value: sum(d.cash), tone: d.cash !== null && d.cash < 0 ? 'red' : undefined, sub: d.since ? `${dmy(d.since)} dan` : undefined },
          { label: uz.home.clientDebt, value: sum(d.debt), tone: d.debt ? 'red' : undefined },
          { label: uz.home.supplierDebt, value: sum(d.supDebt) },
          { label: uz.home.orders, value: d.orders === null ? <span className="skel" /> : fmt(d.orders) },
        ]}
      />
      <div className="cols">
        <Panel title={s.attention}>
          <Row to="/leaks" title={uz.home.leaks} right={<Count n={d.attention} />} />
          <Row to="/service" title={uz.home.service} right={<Count n={d.openService} />} />
          <Row title={s.neck} right={neck ? `${uz.workshop.stations[neck.station]} · ${neck.windows} ${uz.home.windows}` : <span className="muted">—</span>} />
        </Panel>
        <Panel title={s.inShop} action={{ to: '/zavod', label: s.open }}>
          {inShop.length === 0 && <Empty text={d.zavod ? s.nothing : uz.loading} />}
          {inShop.slice(0, 6).map((o) => (
            <Row key={o.order_id} to={`/orders/${o.order_id}`} title={`№${o.order_no} · ${o.client}`} sub={`${uz.workshop.stations[stationOf(o)]} · ${o.windows} ${uz.home.windows}`} right={<Pct v={Number(o.percent)} late={o.late} />} />
          ))}
        </Panel>
      </div>
    </>
  )
}

function SavdoPane({ sec, d }: { sec: SectionDef; d: RahbarData }) {
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
      <Panel title={s.recent} action={{ to: '/orders', label: s.all }}>
        {d.recent.length === 0 && <Empty text={s.nothing} />}
        {d.recent.map((o) => (
          <Row
            key={o.id}
            to={`/orders/${o.id}`}
            title={`№${o.order_no} · ${o.clients?.full_name ?? '—'}`}
            sub={dmy(o.created_at.slice(0, 10))}
            right={
              <span className="r-stack">
                <b className="num">{fmt(Number(o.contract_price))}</b>
                {o.status !== 'unknown' && <span className={`status s-${o.status}`}>{uz.order.statuses[o.status]}</span>}
              </span>
            }
          />
        ))}
      </Panel>
    </>
  )
}

function IshlabPane({ sec, d }: { sec: SectionDef; d: RahbarData }) {
  const inShop = inShopOf(d)
  const neck = d.zavod ? bottleneck(d.zavod.orders) : null
  return (
    <>
      <SectionHead sec={sec} />
      <Links sec={sec} />
      <Panel title={s.inShop} action={{ to: '/zavod', label: s.open }} foot={neck ? `${s.neck}: ${uz.workshop.stations[neck.station]} · ${neck.windows} ${uz.home.windows}` : undefined}>
        {inShop.length === 0 && <Empty text={d.zavod ? s.nothing : uz.loading} />}
        {inShop.map((o) => (
          <Row
            key={o.order_id}
            to={`/orders/${o.order_id}`}
            title={`№${o.order_no} · ${o.client}`}
            sub={`${uz.workshop.stations[stationOf(o)]} · ${o.windows} ${uz.home.windows}${o.material ? ` · ${uz.workshop.legend.material}` : ''}`}
            right={<Pct v={Number(o.percent)} late={o.late} />}
          />
        ))}
      </Panel>
    </>
  )
}

function MontajPane({ sec, d }: { sec: SectionDef; d: RahbarData }) {
  const ready = (d.zavod?.orders ?? []).filter((o) => ['ready', 'install'].includes(stationOf(o)))
  return (
    <>
      <SectionHead sec={sec} />
      <Kpis items={[{ label: uz.home.service, value: d.openService ?? <span className="skel" />, tone: d.openService ? 'red' : undefined }, { label: s.readyInstall, value: ready.length }]} />
      <Links sec={sec} />
      <Panel title={s.readyInstall}>
        {ready.length === 0 && <Empty text={d.zavod ? s.nothing : uz.loading} />}
        {ready.map((o) => (
          <Row
            key={o.order_id}
            to={`/orders/${o.order_id}`}
            title={`№${o.order_no} · ${o.client}`}
            sub={`${o.windows} ${uz.home.windows}${o.deadline ? ` · ${uz.home.deadline}: ${dmy(o.deadline)}` : ''}`}
            right={<span className={`status s-${o.status}`}>{uz.order.statuses[o.status]}</span>}
          />
        ))}
      </Panel>
    </>
  )
}

function PulPane({ sec, d }: { sec: SectionDef; d: RahbarData }) {
  return (
    <>
      <SectionHead sec={sec} />
      <Kpis
        items={[
          { label: uz.home.cash, value: sum(d.cash) },
          { label: uz.home.clientDebt, value: sum(d.debt), tone: d.debt ? 'red' : undefined },
          { label: uz.home.supplierDebt, value: sum(d.supDebt) },
          { label: uz.home.leaks, value: d.attention ?? <span className="skel" />, tone: d.attention ? 'red' : undefined },
        ]}
      />
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

// ============ цех ============
interface ShopRow {
  id: string
  order_no: number
  status: string
  deadline: string | null
  client_name: string | null
  windows_count: number
  pct: number
}
function ShopPane({ sec }: { sec: SectionDef }) {
  const [rows, setRows] = useState<ShopRow[] | null>(null)
  useEffect(() => {
    ;(async () => {
      const { data: os } = await supabase
        .from('w_orders')
        .select('id, order_no, status, deadline, client_name, windows_count')
        .in('status', ['in_production', 'ready'])
        .order('deadline', { ascending: true, nullsFirst: false })
      const orders = (os as Omit<ShopRow, 'pct'>[]) ?? []
      if (!orders.length) return setRows([])
      const [its, st] = await Promise.all([
        supabase.from('w_order_items').select('id, order_id, qty').in('order_id', orders.map((o) => o.id)),
        supabase.from('stages').select('id', { count: 'exact', head: true }).eq('is_active', true),
      ])
      const items = (its.data as { id: string; order_id: string; qty: number }[]) ?? []
      const { data: ms } = await supabase.from('w_stage_marks').select('order_item_id').in('order_item_id', items.map((i) => i.id))
      const marks = (ms as { order_item_id: string }[]) ?? []
      setRows(
        orders.map((o) => {
          const mine = items.filter((i) => i.order_id === o.id)
          const ids = new Set(mine.map((i) => i.id))
          return { ...o, pct: progressPct(mine, marks.filter((m) => ids.has(m.order_item_id)), st.count ?? 0) }
        }),
      )
    })()
  }, [])
  return (
    <>
      <SectionHead sec={sec} />
      <Panel title={uz.stages.shopList}>
        {rows === null && <Empty text={uz.loading} />}
        {rows?.length === 0 && <Empty text={uz.stages.noShop} />}
        {rows?.map((o) => (
          <Row
            key={o.id}
            to={`/shop/${o.id}`}
            title={`№${o.order_no} · ${o.client_name ?? ''}`}
            sub={`${o.windows_count} ${uz.home.windows}${o.deadline ? ` · ${uz.home.deadline}: ${dmy(o.deadline)}` : ''}`}
            right={<Pct v={o.pct} />}
          />
        ))}
      </Panel>
    </>
  )
}

// ============ монтажник ============
interface JobRow {
  id: string
  order_id: string
  plan_date: string | null
  status: string
  order_no: number
  client_name: string | null
  address: string | null
  order_status: string
}
function InstallPane({ sec }: { sec: SectionDef }) {
  const [rows, setRows] = useState<JobRow[] | null>(null)
  const [svc, setSvc] = useState<{ id: string; order_no: number; client_name: string | null; address: string | null; due_date: string | null; description: string; work_done_at: string | null }[]>([])
  useEffect(() => {
    supabase.from('w_service_tickets').select('id, order_no, client_name, address, due_date, description, work_done_at').order('due_date', { nullsFirst: false }).then(({ data }) => setSvc((data as typeof svc) ?? []))
    ;(async () => {
      const { data: js } = await supabase.from('w_install_jobs').select('id, order_id, plan_date, status').in('status', ['planned', 'in_progress', 'postponed']).order('plan_date')
      const jobs = (js as Omit<JobRow, 'order_no' | 'client_name' | 'address' | 'order_status'>[]) ?? []
      if (!jobs.length) return setRows([])
      const { data: os } = await supabase.from('w_orders').select('id, order_no, client_name, address, status').in('id', jobs.map((j) => j.order_id))
      const by = new Map(((os as { id: string; order_no: number; client_name: string | null; address: string | null; status: string }[]) ?? []).map((o) => [o.id, o]))
      setRows(jobs.flatMap((j) => { const o = by.get(j.order_id); return o ? [{ ...j, order_no: o.order_no, client_name: o.client_name, address: o.address, order_status: o.status }] : [] }))
    })()
  }, [])
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' })
  const row = (j: JobRow) => (
    <Row key={j.id} to={`/install/${j.order_id}`} title={`№${j.order_no} · ${j.client_name ?? ''}`} sub={j.address ?? ''} right={<span className={j.plan_date === today ? 'today' : 'muted'}>{dmy(j.plan_date)}</span>} />
  )
  const now = (rows ?? []).filter((j) => j.plan_date !== null && j.plan_date <= today)
  const next = (rows ?? []).filter((j) => j.plan_date === null || j.plan_date > today)
  return (
    <>
      <SectionHead sec={sec} />
      <Panel title={uz.install.today}>
        {rows === null && <Empty text={uz.loading} />}
        {rows !== null && now.length === 0 && <Empty text={uz.install.noJobs} />}
        {now.map(row)}
      </Panel>
      {next.length > 0 && <Panel title={uz.install.next}>{next.map(row)}</Panel>}
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
        <Row title={uz.roles[me?.role ?? 'ishlab']} />
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
    case 'savdo': return <SavdoPane sec={sec} d={d} />
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
