import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Maximize2, Minimize2, Sparkles, X } from 'lucide-react'
import { supabase } from '../supabase'
import { ANCHOR, stationOf, type Station, type WOrder, type ZavodState as State } from '../lib/zavod'
import { useZavod3D } from '../shell/ZavodView'
import ZavodKpis from '../shell/ZavodKpis'
import { uz } from '../uz'

const t = uz.workshop
const BASE = `${import.meta.env.BASE_URL}zavod/`

// образец для показа, пока в цехе нет живых заказов (не из базы)
const mk = (n: number, client: string, station: string, percent: number, extra: Partial<WOrder> = {}): WOrder => ({
  order_id: `demo-${n}`, order_no: n, client, deadline: null, status: 'in_production', windows: 3, items: 3, station, accepted: true, percent, late: false, material: false, stuck: false, ...extra,
})
const DEMO: State = {
  orders: [
    mk(2501, 'Karimov A.', 'new', 0, { status: 'new', accepted: false }),
    mk(2502, 'Rahimov B.', 'work', 0),
    mk(2503, 'Sodiqov T.', 'work', 0, { late: true, deadline: '2026-10-30' }),
    mk(2504, 'Yusupov M.', 'work', 0, { material: true, windows: 5, accepted: false }),
    mk(2505, 'Aliyev S.', 'work', 0),
    mk(2506, 'Hasanov D.', 'work', 0, { stuck: true }),
    mk(2508, 'Nazarov O.', 'ready', 50, { status: 'ready' }),
    mk(2509, 'Qosimov R.', 'install', 75, { status: 'installing' }),
  ],
}

type Tone = 'late' | 'material' | 'stuck' | 'ready' | 'new' | 'normal'
const tone = (o: WOrder): Tone => (o.late ? 'late' : o.material ? 'material' : o.stuck ? 'stuck' : o.station === 'ready' || o.station === 'install' ? 'ready' : o.station === 'new' ? 'new' : 'normal')
const PER_STATION = 4

interface Pins {
  res: [number, number]
  pins: Record<string, Partial<Record<string, [number, number]>>>
}

// «Zavod»: фотореалистичный кадр завода (Blender), над каждым участком — стеклянные карточки заказов, которые сейчас там
export default function Workshop() {
  const stage = useRef<HTMLDivElement>(null)
  const [data, setData] = useState<State | null>(null)
  const [sel, setSel] = useState<WOrder | null>(null)
  const [err, setErr] = useState('')
  const [at, setAt] = useState('')
  const [demo, setDemo] = useState(false)
  const [tv, setTv] = useState(false)
  const [portrait, setPortrait] = useState(() => window.matchMedia('(orientation: portrait)').matches)
  const [pins, setPins] = useState<Pins | null>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  // живое 3D: карточки следуют за участками при вращении камеры (обновление ~15 раз/с)
  const host = useRef<HTMLDivElement>(null)
  const { scene, progress } = useZavod3D(host)
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!scene) return
    let last = 0
    const off = scene.onFrame(() => {
      const n = performance.now()
      if (n - last > 66) {
        last = n
        setTick((x) => x + 1)
      }
    })
    return () => {
      off()
    }
  }, [scene])

  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)')
    const on = () => setPortrait(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const dir = portrait ? 'p' : 'l'
  useEffect(() => {
    fetch(`${BASE}${dir}/pins.json`).then((r) => (r.ok ? r.json() : null)).then(setPins).catch(() => setPins(null))
  }, [dir])

  // размер сцены → пересчёт позиций карточек (картинка «cover»)
  useLayoutEffect(() => {
    const el = stage.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // режим ТВ: полный экран; Esc — выход
  useEffect(() => {
    const el = stage.current
    if (tv && el && !document.fullscreenElement) el.requestFullscreen?.().catch(() => undefined)
    if (!tv && document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined)
  }, [tv])
  useEffect(() => {
    const onFs = () => !document.fullscreenElement && setTv(false)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  // данные — сразу и каждые 30 с
  useEffect(() => {
    setSel(null)
    if (demo) {
      setData(DEMO)
      return
    }
    const load = () =>
      supabase.rpc('workshop_state').then(({ data, error }) => {
        if (error) return setErr(error.message)
        setData(data as State)
        setAt(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }))
      })
    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [demo])

  // точка участка в пикселях сцены (учёт object-fit: cover)
  const pad = box.w < 700 ? 64 : 90
  const live = scene
    ? (st: Station) => {
        const q = scene.project(ANCHOR[st])
        return q && q.on ? { x: Math.min(box.w - pad, Math.max(pad, q.x)), y: Math.max(120, q.y) } : null
      }
    : null
  const still = useMemo(() => {
    const p = pins?.pins?.zavod
    if (!p || !pins || !box.w) return null
    const [W, H] = pins.res
    const s = Math.max(box.w / W, box.h / H)
    const ox = (box.w - W * s) / 2
    const oy = (box.h - H * s) / 2
    // карточки не уезжают за край экрана (на телефоне кадр обрезан по бокам)
    return (st: Station) => {
      const a = p[ANCHOR[st]]
      return a ? { x: Math.min(box.w - pad, Math.max(pad, ox + a[0] * W * s)), y: Math.max(150, oy + a[1] * H * s) } : null
    }
  }, [pins, box, pad])
  const place = live ?? still
  const perStation = box.w < 700 ? 2 : PER_STATION

  const groups = useMemo(() => {
    const m = new Map<Station, WOrder[]>()
    for (const o of data?.orders ?? []) m.set(stationOf(o), [...(m.get(stationOf(o)) ?? []), o])
    return [...m.entries()]
  }, [data])

  // участки рядом друг с другом → карточки не должны налезать: раздвигаем по горизонтали (слева направо, потом обратно от края)
  const spots = (() => {
    if (!place) return new Map<string, { x: number; y: number }>()
    const w = box.w < 700 ? 92 : 124
    const list = groups.flatMap(([st]) => { const q = place(st); return q ? [{ st, x: q.x, y: q.y }] : [] }).sort((a, b) => a.x - b.x)
    const near = (a: { y: number }, b: { y: number }) => Math.abs(a.y - b.y) < 190
    for (let i = 0; i < list.length; i++) for (let j = 0; j < i; j++) if (near(list[i], list[j])) list[i].x = Math.max(list[i].x, list[j].x + w)
    for (let i = list.length - 1; i >= 0; i--) {
      list[i].x = Math.min(list[i].x, box.w - w / 2 - 8)
      for (let j = i + 1; j < list.length; j++) if (near(list[i], list[j])) list[i].x = Math.min(list[i].x, list[j].x - w)
      list[i].x = Math.max(list[i].x, w / 2 + 8)
    }
    return new Map(list.map((s) => [s.st as string, { x: s.x, y: s.y }]))
  })()

  return (
    <div className="zavod-page">
      <div className="zavod-stage" ref={stage}>
        <div className={`zavod-cam ${scene ? 'live' : ''}`}>
          <picture>
            <source media="(orientation: portrait)" srcSet={`${BASE}p/zavod.webp`} />
            <img src={`${BASE}l/zavod.webp`} alt="" />
          </picture>
          <div className="zv-3d" ref={host} />
          {place &&
            groups.map(([st, list]) => {
              const pt = spots.get(st)
              if (!pt) return null
              return (
                <div key={st} className="zpin-stack" style={{ left: pt.x, top: pt.y }}>
                  <div className="zpin-label">
                    {t.stations[st]} <b>{list.reduce((n, o) => n + Number(o.windows || 0), 0)}</b>
                  </div>
                  {list.slice(0, perStation).map((o) => (
                    <motion.button
                      key={o.order_id}
                      type="button"
                      className={`zpin z-${tone(o)}`}
                      onClick={() => setSel(o)}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <i />
                      <span>№{o.order_no}</span>
                    </motion.button>
                  ))}
                  {list.length > perStation && <div className="zpin more">+{list.length - perStation}</div>}
                </div>
              )
            })}
        </div>

        {!scene && progress !== null && <div className="zavod-loading">{uz.shell.loading3d} {Math.round(progress * 100)}%</div>}
        <div className="zavod-fade" />
        <ZavodKpis />
        <div className="zavod-top">
          <div className="zavod-top-left">
            <div className="glass zavod-title">
              <b>{t.title}</b>
              <small>{demo ? t.demoNote : at ? `${t.refreshed} ${at}` : uz.loading}</small>
            </div>
          </div>
          <div className="inline">
            <button type="button" className="glass icon-btn" onClick={() => setDemo(!demo)} title={demo ? t.demoOff : t.demoOn}>
              <Sparkles size={18} />
            </button>
            <button type="button" className="glass icon-btn" onClick={() => setTv(!tv)} title={tv ? t.tvOff : t.tvOn}>
              {tv ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          </div>
        </div>

        <div className="zavod-legend glass">
          {(['normal', 'late', 'material', 'stuck', 'ready', 'new'] as Tone[]).map((k) => (
            <span key={k} className={`z-${k}`}>
              <i /> {t.legend[k]}
            </span>
          ))}
        </div>

        <AnimatePresence>
          {sel && (
            <motion.div
              className="zavod-card glass"
              initial={{ opacity: 0, y: 30, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            >
              <div className="inline head" style={{ marginBottom: 0 }}>
                <b className="zc-title">
                  №{sel.order_no} · {sel.client}
                </b>
                <button type="button" className="ghost icon-btn" onClick={() => setSel(null)} aria-label={t.close}>
                  <X size={18} />
                </button>
              </div>
              <div className="small">
                {t.stations[stationOf(sel)]} · {sel.windows} {t.windows}
                {stationOf(sel) === 'work' && ` · ${sel.accepted ? uz.flow.accepted : uz.flow.waiting}`}
              </div>
              {sel.deadline && (
                <div className={`small ${sel.late ? 'debt-tag' : ''}`}>
                  {t.deadline}: {sel.deadline.split('-').reverse().join('.')}
                </div>
              )}
              {!sel.order_id.startsWith('demo-') && (
                <Link className="btn-link" to={`/orders/${sel.order_id}`}>
                  {t.open}
                </Link>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        {err && <div className="zavod-card glass note bad">{err}</div>}
      </div>
    </div>
  )
}
