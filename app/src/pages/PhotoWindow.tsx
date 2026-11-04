import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import WindowEditor, { PRESETS, SizeInput } from '../components/WindowEditor'
import { colorHex } from '../lib/catalog'
import { download, insideTelegram, sendToTelegram } from '../lib/export'
import { isConvexQuad, premultiply, squareToQuad, warpTexture, type Pt, type Raster, type Range } from '../lib/perspective'
import { renderWindow, type Rendered, type Tint } from '../lib/windowRender'
import { resize, type WindowDesign } from '../lib/window'
import { uz } from '../uz'

const t = uz.photo
const MAX_SIDE = 1600
const COLORS = [
  { name: 'Oq', hex: '#f4f4f2' },
  { name: 'Antratsit', hex: '#3d4246' },
  { name: 'Tilla eman', hex: '#b07b3e' },
  { name: 'Eman', hex: '#a8784a' },
  { name: 'Moka', hex: '#5e4636' },
  { name: 'Shefild', hex: '#cfb185' },
  { name: 'Qizil daraxt', hex: '#6e2c1f' },
  { name: 'Kulrang', hex: '#8a8f93' },
]

interface OrderOpt {
  id: string
  order_no: number
  clients: { full_name: string } | null
  order_items: { pos: number; title: string | null; design: WindowDesign; options: { color?: string } }[]
}

const initialQuad = (cw: number, ch: number, ratio: number): Pt[] => {
  let w = cw * 0.4
  let h = w * ratio
  if (h > ch * 0.6) {
    h = ch * 0.6
    w = h / ratio
  }
  const x = (cw - w) / 2
  const y = (ch - h) / 2
  return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]
}

// «Oyna fotoda»: фото проёма → 4 угла → окно нужных размеров/цвета в перспективе. Фото не покидает устройство и не сохраняется.
export default function PhotoWindow() {
  const cv = useRef<HTMLCanvasElement>(null)
  const photo = useRef<HTMLCanvasElement | null>(null) // фото, уменьшенное до MAX_SIDE
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [pts, setPts] = useState<Pt[]>([])
  const [drag, setDrag] = useState<number | null>(null)
  const [design, setDesign] = useState<WindowDesign>(PRESETS[1].build())
  const [color, setColor] = useState(COLORS[0].hex)
  const [tint, setTint] = useState<Tint>('clear')
  const [opacity, setOpacity] = useState(0.28)
  const [sill, setSill] = useState(true)
  const [handles, setHandles] = useState(true)
  const [net, setNet] = useState(false)
  const [drip, setDrip] = useState(false)
  const [autoLight, setAutoLight] = useState(true)
  const [light, setLight] = useState(1) // множитель яркости окна по средней яркости фото
  const [orders, setOrders] = useState<OrderOpt[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase
      .from('orders')
      .select('id, order_no, clients(full_name), order_items(pos, title, design, options)')
      .eq('is_imported', false)
      .order('order_no', { ascending: false })
      .limit(40)
      .then(({ data }) => setOrders(((data as unknown as OrderOpt[]) ?? []).filter((o) => o.order_items.length)))
  }, [])

  // текстура окна (прозрачный фон, стекло — «дырка» с оттенком) → растр с предумноженной альфой для точного наложения
  const k = autoLight ? light : 1
  const prep = (r: Rendered): { raster: Raster; range: Range } => {
    const img = r.canvas.getContext('2d')!.getImageData(0, 0, r.canvas.width, r.canvas.height)
    if (Math.abs(k - 1) > 0.01) {
      const d = img.data
      for (let i = 0; i < d.length; i += 4) {
        d[i] = Math.min(255, d[i] * k)
        d[i + 1] = Math.min(255, d[i + 1] * k)
        d[i + 2] = Math.min(255, d[i + 2] * k)
      }
    }
    return { raster: premultiply({ width: r.canvas.width, height: r.canvas.height, data: img.data }), range: r.range }
  }
  const tex = useMemo(
    () => prep(renderWindow(design, { frameColor: color, tint, glassOpacity: opacity, sill, net, drip, px: 1100 })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [design, color, tint, opacity, sill, net, drip, k],
  )
  const convex = pts.length === 4 && isConvexQuad(pts)

  // лупа: при перетаскивании угла — увеличенный участок фото в свободном верхнем углу (палец закрывает точку)
  const drawLoupe = (ctx: CanvasRenderingContext2D) => {
    if (drag === null || !photo.current || !pts[drag]) return
    const p = pts[drag]
    const R = Math.round(Math.min(ctx.canvas.width, ctx.canvas.height) * 0.14)
    const src = R * 0.55 // радиус захвата: увеличение ≈ ×1.8
    const left = p.x > ctx.canvas.width / 2 // угол справа → лупа слева
    const cx = left ? R + 12 : ctx.canvas.width - R - 12
    const cy = R + 12
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = '#fff'
    ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R)
    ctx.drawImage(ctx.canvas, p.x - src, p.y - src, 2 * src, 2 * src, cx - R, cy - R, 2 * R, 2 * R)
    ctx.restore()
    ctx.lineWidth = 3
    ctx.strokeStyle = '#0e9a2f'
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.stroke()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = 'rgba(192,57,43,0.95)'
    ctx.beginPath()
    ctx.moveTo(cx - 12, cy)
    ctx.lineTo(cx + 12, cy)
    ctx.moveTo(cx, cy - 12)
    ctx.lineTo(cx, cy + 12)
    ctx.stroke()
  }

  const compose = (ctx: CanvasRenderingContext2D, withHandles: boolean, texture = tex, ss = drag === null ? 2 : 1) => {
    if (!photo.current) return
    ctx.drawImage(photo.current, 0, 0)
    if (convex) {
      const H = squareToQuad(pts[0], pts[1], pts[2], pts[3])
      const w = warpTexture(texture.raster, H, texture.range, ctx.canvas.width, ctx.canvas.height, ss)
      if (w) {
        const off = document.createElement('canvas')
        off.width = w.raster.width
        off.height = w.raster.height
        const octx = off.getContext('2d')!
        const img = octx.createImageData(w.raster.width, w.raster.height)
        img.data.set(w.raster.data)
        octx.putImageData(img, 0, 0)
        ctx.drawImage(off, w.x, w.y)
      }
    }
    if (!withHandles) return
    drawLoupe(ctx)
    ctx.lineWidth = 2
    ctx.strokeStyle = convex ? 'rgba(14,154,47,0.9)' : 'rgba(192,57,43,0.95)'
    ctx.setLineDash([8, 6])
    ctx.beginPath()
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
    ctx.closePath()
    ctx.stroke()
    ctx.setLineDash([])
    pts.forEach((p, i) => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 15, 0, Math.PI * 2)
      ctx.fillStyle = drag === i ? '#0e9a2f' : 'rgba(255,255,255,0.92)'
      ctx.fill()
      ctx.strokeStyle = '#0e9a2f'
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.fillStyle = drag === i ? '#fff' : '#0e5a1f'
      ctx.font = 'bold 16px system-ui'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(i + 1), p.x, p.y + 1)
    })
  }

  // перерисовка при любом изменении
  useEffect(() => {
    const c = cv.current
    if (!c || !size) return
    const raf = requestAnimationFrame(() => compose(c.getContext('2d')!, handles))
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, pts, tex, handles, drag])

  const load = async (file: File) => {
    setMsg(null)
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
      const c = document.createElement('canvas')
      c.width = Math.round(bmp.width * k)
      c.height = Math.round(bmp.height * k)
      c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
      bmp.close()
      photo.current = c
      // средняя яркость фото (по сетке точек) → множитель яркости окна: тёмное фото — окно темнее, яркое — чуть светлее
      const small = document.createElement('canvas')
      small.width = 32
      small.height = 32
      const sctx = small.getContext('2d')!
      sctx.drawImage(c, 0, 0, 32, 32)
      const px = sctx.getImageData(0, 0, 32, 32).data
      let sum = 0
      for (let i = 0; i < px.length; i += 4) sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]
      const lum = sum / (px.length / 4)
      setLight(Math.max(0.7, Math.min(1.1, 0.6 + (lum / 255) * 0.8)))
      if (cv.current) {
        cv.current.width = c.width
        cv.current.height = c.height
      }
      setSize({ w: c.width, h: c.height })
      setPts(initialQuad(c.width, c.height, design.height / design.width))
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    }
  }

  // ---- перетаскивание углов ----
  // холст стилизован object-fit: contain: на ПК (ограничение высоты) картинка вписана с полями — координаты считаем по видимой области, а не по всему элементу
  const view = () => {
    const c = cv.current!
    const r = c.getBoundingClientRect()
    const k = Math.min(r.width / c.width, r.height / c.height) // пикселей экрана на пиксель холста
    return { left: r.left + (r.width - c.width * k) / 2, top: r.top + (r.height - c.height * k) / 2, k }
  }
  const toCanvas = (e: React.PointerEvent) => {
    const v = view()
    return { x: (e.clientX - v.left) / v.k, y: (e.clientY - v.top) / v.k }
  }
  const onDown = (e: React.PointerEvent) => {
    if (!size) return
    const p = toCanvas(e)
    const scale = 1 / view().k
    let best = -1
    let bd = 34 * scale // зона захвата крупная: пальцем попасть трудно
    pts.forEach((q, i) => {
      const d = Math.hypot(q.x - p.x, q.y - p.y)
      if (d < bd) {
        bd = d
        best = i
      }
    })
    if (best >= 0) {
      setDrag(best)
      cv.current!.setPointerCapture(e.pointerId)
    }
  }
  const onMove = (e: React.PointerEvent) => {
    if (drag === null || !size) return
    const p = toCanvas(e)
    const x = Math.max(0, Math.min(size.w, p.x))
    const y = Math.max(0, Math.min(size.h, p.y))
    setPts((q) => q.map((v, i) => (i === drag ? { x, y } : v)))
  }

  const blob = async (): Promise<Blob | null> => {
    if (!photo.current) return null
    const out = document.createElement('canvas')
    out.width = photo.current.width
    out.height = photo.current.height
    const hq = prep(renderWindow(design, { frameColor: color, tint, glassOpacity: opacity, sill, net, drip, px: 2000 }))
    compose(out.getContext('2d')!, false, hq, 3)
    return new Promise((res) => out.toBlob((b) => res(b), 'image/png'))
  }
  const save = async () => {
    setBusy(true)
    const b = await blob()
    setBusy(false)
    if (b) download(b, `oyna-${design.width}x${design.height}.png`)
  }
  const send = async () => {
    setBusy(true)
    const b = await blob()
    const err = b ? await sendToTelegram(b, `oyna-${design.width}x${design.height}.png`, `Oyna ${design.width}×${design.height}`) : t.noPhoto
    setBusy(false)
    setMsg(err ? { ok: false, text: err } : { ok: true, text: uz.print.sent })
  }

  const pickOrder = (v: string) => {
    const [oid, pos] = v.split('|')
    const o = orders.find((x) => x.id === oid)
    const it = o?.order_items.find((x) => String(x.pos) === pos)
    if (!it) return
    setDesign(it.design)
    const name = it.options?.color
    if (name) setColor(colorHex(name))
  }

  return (
    <>
      <h1>{t.title}</h1>
      <p className="muted small">{t.privacy}</p>
      {msg && <div className={msg.ok ? 'card note ok' : 'card note bad'}>{msg.text}</div>}

      <div className="card form">
        <label className="btn">
          {size ? t.change : t.pick}
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) load(f)
            }}
          />
        </label>
        {!size && <p className="muted small">{t.steps}</p>}
      </div>

      <div className="photo-stage">
        <canvas ref={cv} className="photo-canvas" style={{ display: size ? 'block' : 'none' }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)} />
        {size && !convex && <div className="note bad">{t.notConvex}</div>}
      </div>

      {size && (
        <>
          <div className="card form">
            <h2>{t.window}</h2>
            {orders.length > 0 && (
              <label>
                {t.fromOrder}
                <select defaultValue="" onChange={(e) => e.target.value && pickOrder(e.target.value)}>
                  <option value="">—</option>
                  {orders.flatMap((o) =>
                    o.order_items.map((it) => (
                      <option key={`${o.id}|${it.pos}`} value={`${o.id}|${it.pos}`}>
                        №{o.order_no} {o.clients?.full_name} · {it.pos}) {it.design.width}×{it.design.height}
                      </option>
                    )),
                  )}
                </select>
              </label>
            )}
            <div className="seg">
              {PRESETS.map((p) => (
                <button key={p.key} type="button" onClick={() => setDesign(p.build())}>
                  {uz.designer.presets[p.key]}
                </button>
              ))}
            </div>
            <div className="grid2">
              <SizeInput label={uz.designer.width} value={design.width} min={300} onCommit={(n) => setDesign(resize(design, n, design.height))} />
              <SizeInput label={uz.designer.height} value={design.height} min={300} onCommit={(n) => setDesign(resize(design, design.width, n))} />
            </div>
            <details>
              <summary>{t.advanced}</summary>
              <WindowEditor value={design} onChange={setDesign} frameColor={color} />
            </details>
          </div>

          <div className="card form">
            <h2>{t.look}</h2>
            <div className="seg">
              {COLORS.map((c) => (
                <button key={c.hex} type="button" className={color === c.hex ? 'on' : ''} onClick={() => setColor(c.hex)}>
                  <i className="swatch" style={{ background: c.hex }} /> {c.name}
                </button>
              ))}
            </div>
            <div className="seg">
              {(['clear', 'blue', 'bronze', 'grey'] as Tint[]).map((k) => (
                <button key={k} type="button" className={tint === k ? 'on' : ''} onClick={() => setTint(k)}>
                  {t.tints[k]}
                </button>
              ))}
            </div>
            <label>
              {t.opacity}: {Math.round(opacity * 100)}%
              <input type="range" min={0.1} max={1} step={0.02} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
              <small className="muted">{t.opacityHint}</small>
            </label>
            <label className="check">
              <input type="checkbox" checked={sill} onChange={(e) => setSill(e.target.checked)} /> {t.sill}
            </label>
            <label className="check">
              <input type="checkbox" checked={drip} onChange={(e) => setDrip(e.target.checked)} /> {t.drip}
            </label>
            <label className="check">
              <input type="checkbox" checked={net} onChange={(e) => setNet(e.target.checked)} /> {t.net}
            </label>
            <label className="check">
              <input type="checkbox" checked={autoLight} onChange={(e) => setAutoLight(e.target.checked)} /> {t.autoLight} ({Math.round(light * 100)}%)
            </label>
            <label className="check">
              <input type="checkbox" checked={handles} onChange={(e) => setHandles(e.target.checked)} /> {t.showHandles}
            </label>
          </div>

          <div className="card form">
            <div className="inline wrap">
              <button onClick={save} disabled={busy || !convex}>
                {t.save}
              </button>
              <button className="ghost" onClick={send} disabled={busy || !convex}>
                {t.send}
              </button>
            </div>
            {!insideTelegram() && <small className="muted">{t.tgHint}</small>}
          </div>
        </>
      )}
    </>
  )
}
