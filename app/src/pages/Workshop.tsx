import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Maximize2, Minimize2, Sparkles, X } from 'lucide-react'
import { supabase } from '../supabase'
import { bottleneck, stationOf, type Station, type WOrder, type ZavodState as State } from '../lib/zavod'
import { useZavod3D } from '../shell/ZavodView'
import ZavodKpis from '../shell/ZavodKpis'
import { uz } from '../uz'

const t = uz.workshop
const BASE = `${import.meta.env.BASE_URL}zavod/`

// образец для показа, пока в цехе нет живых заказов (не из базы)
const mk = (n: number, client: string, station: string, percent: number, extra: Partial<WOrder> = {}): WOrder => ({
  order_id: `demo-${n}`, order_no: n, client, deadline: null, status: 'in_production', windows: 3, items: 3, station, done: { cut: 3, assemble: 0, glass_fit: 0 }, percent, late: false, material: false, stuck: false, ...extra,
})
const DEMO: State = {
  stages: [{ code: 'cut', name: 'Kesish' }, { code: 'assemble', name: "Yig'ish" }, { code: 'glass_fit', name: 'Shisha / furnitura' }],
  orders: [
    mk(2501, 'Karimov A.', 'new', 0, { status: 'new', done: { cut: 0, assemble: 0, glass_fit: 0 } }),
    mk(2502, 'Rahimov B.', 'cut', 12, { done: { cut: 1, assemble: 0, glass_fit: 0 } }),
    mk(2503, 'Sodiqov T.', 'cut', 5, { late: true, deadline: '2026-10-30', done: { cut: 0, assemble: 0, glass_fit: 0 } }),
    mk(2504, 'Yusupov M.', 'cut', 0, { material: true, windows: 5, done: { cut: 0, assemble: 0, glass_fit: 0 } }),
    mk(2505, 'Aliyev S.', 'assemble', 25, { done: { cut: 3, assemble: 1, glass_fit: 0 } }),
    mk(2506, 'Hasanov D.', 'assemble', 33, { stuck: true, done: { cut: 3, assemble: 1, glass_fit: 0 } }),
    mk(2507, 'Ergashev N.', 'glass_fit', 58, { done: { cut: 3, assemble: 3, glass_fit: 1 } }),
    mk(2508, 'Nazarov O.', 'ready', 75, { status: 'ready', done: { cut: 3, assemble: 3, glass_fit: 3 } }),
    mk(2509, 'Qosimov R.', 'install', 83, { status: 'installing', done: { cut: 3, assemble: 3, glass_fit: 3 } }),
  ],
}

type Tone = 'late' | 'material' | 'stuck' | 'ready' | 'new' | 'normal'
const tone = (o: WOrder): Tone => (o.late ? 'late' : o.material ? 'material' : o.stuck ? 'stuck' : o.station === 'ready' || o.station === 'install' ? 'ready' : o.station === 'new' ? 'new' : 'normal')
const PER_STATION = 4

interface Pins {
  res: [number, number]
  pins: Record<string, Partial<Record<Station, [number, number]>>>
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
  const scene = useZavod3D(host)
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

  const neck = data ? bottleneck(data.orders) : null
  // точка участка в пикселях сцены (учёт object-fit: cover)
  const pad = box.w < 700 ? 64 : 90
  const live = scene
    ? (st: Station) => {
        const q = scene.project(st)
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
    return (st: Station) =>
      p[st] ? { x: Math.min(box.w - pad, Math.max(pad, ox + p[st]![0] * W * s)), y: Math.max(150, oy + p[st]![1] * H * s) } : null
  }, [pins, box, pad])
  const place = live ?? still
  const perStation = box.w < 700 ? 2 : PER_STATION

  const groups = useMemo(() => {
    const m = new Map<Station, WOrder[]>()
    for (const o of data?.orders ?? []) m.set(stationOf(o), [...(m.get(stationOf(o)) ?? []), o])
    return [...m.entries()]
  }, [data])

  const stageLine = (o: WOrder) => (data?.stages ?? []).map((s) => `${s.name} ${o.done?.[s.code] ?? 0}/${o.items}`).join(' · ')

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
              const pt = place(st)
              if (!pt) return null
              return (
                <div key={st} className={`zpin-stack ${neck?.station === st ? 'neck' : ''}`} style={{ left: pt.x, top: pt.y }}>
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
                      <small>{Math.round(Number(o.percent))}%</small>
                    </motion.button>
                  ))}
                  {list.length > perStation && <div className="zpin more">+{list.length - perStation}</div>}
                </div>
              )
            })}
        </div>

        <div className="zavod-fade" />
        <ZavodKpis />
        <div className="zavod-top">
          <div className="zavod-top-left">
            <div className="glass zavod-title">
              <b>{t.title}</b>
              <small>{demo ? t.demoNote : at ? `${t.refreshed} ${at}` : uz.loading}</small>
            </div>
            {neck && (
              <div className="glass zavod-neck">
                <span className="dot-o" /> {t.neck}: <b>{t.stations[neck.station]}</b> · {neck.windows} {t.windows}
              </div>
            )}
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
                {t.stations[stationOf(sel)]} · {Math.round(Number(sel.percent))}% · {sel.windows} {t.windows}
              </div>
              <div className="progress">
                <i style={{ width: `${Math.round(Number(sel.percent))}%` }} />
              </div>
              <div className="small muted">
                {t.progress}: {stageLine(sel)}
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
