import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { supabase } from '../supabase'
import { buildShop, label, type Station } from '../lib/shop3d'
import { uz } from '../uz'

const t = uz.workshop

interface WOrder {
  order_id: string
  order_no: number
  client: string
  deadline: string | null
  status: string
  windows: number
  items: number
  station: Station | string
  done: Record<string, number>
  percent: number
  late: boolean
  material: boolean
  stuck: boolean
}
interface State {
  orders: WOrder[]
  stages: { code: string; name: string }[]
}

const COLORS = { late: '#c0392b', material: '#d68910', stuck: '#7d3c98', ready: '#1e8449', new: '#5d6d7e', normal: '#1f5fbf' }
const kind = (o: WOrder): keyof typeof COLORS => (o.late ? 'late' : o.material ? 'material' : o.stuck ? 'stuck' : o.station === 'ready' || o.station === 'install' ? 'ready' : o.station === 'new' ? 'new' : 'normal')
const STATIONS: Station[] = ['new', 'cut', 'assemble', 'glass_fit', 'ready', 'install']
const PER_STATION = 9

// «Virtual sex»: 3D-цех, над каждым участком — карточки заказов, которые сейчас там (живые данные, обновление каждые 30 с)
export default function Workshop() {
  const host = useRef<HTMLDivElement>(null)
  const tokens = useRef<THREE.Group | null>(null)
  const anchors = useRef<Record<Station, THREE.Vector3> | null>(null)
  const [data, setData] = useState<State | null>(null)
  const [sel, setSel] = useState<WOrder | null>(null)
  const [err, setErr] = useState('')
  const [at, setAt] = useState('')

  // сцена — один раз
  useEffect(() => {
    const el = host.current!
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true })
    } catch {
      setErr(t.noWebgl)
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(el.clientWidth, el.clientHeight)
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, el.clientWidth / el.clientHeight, 0.1, 200)
    // на узком экране (телефон) — дальше и шире, чтобы был виден весь цех
    const portrait = el.clientWidth < el.clientHeight
    camera.fov = portrait ? 62 : 50
    camera.position.set(2, portrait ? 21 : 17, portrait ? 29 : 24)
    camera.updateProjectionMatrix()
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(1, 0, -1)
    controls.maxPolarAngle = 1.35
    controls.minDistance = 6
    controls.maxDistance = 48
    controls.enableDamping = true
    anchors.current = buildShop(scene)
    // таблички участков
    for (const s of STATIONS) {
      const a = anchors.current[s]
      const l = label(t.stations[s], { bg: 'rgba(255,255,255,0.92)', fg: '#1b2631', w: 3.4 })
      l.position.set(a.x, 1.9, a.z + 1.4)
      scene.add(l)
    }
    tokens.current = new THREE.Group()
    scene.add(tokens.current)

    const ray = new THREE.Raycaster()
    const ptr = new THREE.Vector2()
    let down = { x: 0, y: 0 }
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY })
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return // это было вращение, не клик
      const r = renderer.domElement.getBoundingClientRect()
      ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ptr, camera)
      const hit = ray.intersectObjects(tokens.current!.children, false)[0]
      setSel((hit?.object.userData.order as WOrder) ?? null)
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)
    const ro = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight)
      camera.aspect = el.clientWidth / el.clientHeight
      camera.updateProjectionMatrix()
    })
    ro.observe(el)
    let raf = 0
    const loop = () => {
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      renderer.dispose()
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mt = (m as unknown as { material?: THREE.Material & { map?: THREE.Texture } }).material
        mt?.map?.dispose()
      })
      el.removeChild(renderer.domElement)
    }
  }, [])

  // данные — сразу и каждые 30 с
  useEffect(() => {
    const load = () =>
      supabase.rpc('workshop_state').then(({ data, error }) => {
        if (error) return setErr(error.message)
        setData(data as State)
        setAt(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }))
      })
    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [])

  // карточки заказов над участками
  useEffect(() => {
    const g = tokens.current
    const a = anchors.current
    if (!g || !a || !data) return
    for (const c of [...g.children]) {
      g.remove(c)
      const s = c as THREE.Sprite
      s.material.map?.dispose()
      s.material.dispose()
    }
    for (const st of STATIONS) {
      const list = data.orders.filter((o) => (STATIONS.includes(o.station as Station) ? o.station : 'glass_fit') === st)
      list.slice(0, PER_STATION).forEach((o, i) => {
        const s = label(`№${o.order_no} ${o.client.slice(0, 12)}`, { bg: COLORS[kind(o)], sub: `${Math.round(Number(o.percent))}% · ${o.windows} ${t.windows}`, w: 3.3 })
        const col = i % 3
        const row = Math.floor(i / 3)
        s.position.set(a[st].x + (col - 1) * 3.8, 3.2 + row * 1.55, a[st].z)
        s.userData.order = o
        g.add(s)
      })
      if (list.length > PER_STATION) {
        const s = label(`+${list.length - PER_STATION}`, { bg: '#34495e', w: 1.2 })
        s.position.set(a[st].x, 3.2 + Math.ceil(PER_STATION / 3) * 1.55, a[st].z)
        g.add(s)
      }
    }
  }, [data])

  const stageLine = (o: WOrder) => (data?.stages ?? []).map((s) => `${s.name} ${o.done?.[s.code] ?? 0}/${o.items}`).join(' · ')

  return (
    <>
      <p>
        <Link to="/">←</Link>
      </p>
      <div className="inline head">
        <h1>{t.title}</h1>
        {at && (
          <small className="muted">
            {t.refreshed} {at}
          </small>
        )}
      </div>
      <p className="muted small">{t.hint}</p>
      {err && <div className="card note bad">{err}</div>}
      <div className="shop3d" ref={host}>
        {sel && (
          <div className="shop3d-card card">
            <b>
              №{sel.order_no} · {sel.client}
            </b>
            <div className="small">
              {t.stations[sel.station] ?? sel.station} · {Math.round(Number(sel.percent))}% · {sel.windows} {t.windows}
            </div>
            <div className="small muted">
              {t.progress}: {stageLine(sel)}
            </div>
            {sel.deadline && (
              <div className={`small ${sel.late ? 'debt-tag' : ''}`}>
                {t.deadline}: {sel.deadline.split('-').reverse().join('.')}
              </div>
            )}
            <div className="inline wrap">
              <Link className="btn-link" to={`/orders/${sel.order_id}`}>
                {t.open}
              </Link>
              <button className="ghost small-btn" onClick={() => setSel(null)}>
                {t.close}
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="inline wrap legend">
        {Object.entries(COLORS).map(([k, c]) => (
          <span key={k} className="small">
            <i style={{ background: c }} /> {t.legend[k]}
          </span>
        ))}
      </div>
      {data && data.orders.length === 0 && <p className="muted">{t.empty}</p>}
    </>
  )
}
