// Живой 3D-завод: GLB из Blender (blender/export_web.py) — свет и тени запечены в текстуры, поэтому
// материалы простые (MeshBasicMaterial) и сцена идёт даже на телефоне. Здесь — камера, вращение руками,
// полёт между участками и «фейковая» работа станков (пилы, сварка, подача профиля, пыль в лучах света).
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export interface ZavodMeta {
  cams: Record<string, { pos: [number, number, number]; look: [number, number, number]; lens: number }>
  anchors: Record<string, [number, number, number]>
  parts: string[]
  bounds: { L: number; W: number; H: number }
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const pulse = (t: number, period: number, phase = 0) => {
  // 0 → 1 → 0 за долю периода, остальное время 0 (рабочий ход станка)
  const x = (((t + phase) % period) + period) % period / period
  return x < 0.35 ? Math.sin((x / 0.35) * Math.PI) : 0
}

export class ZavodScene {
  readonly ready: Promise<void>
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200)
  private controls: OrbitControls
  private meta!: ZavodMeta
  private parts: { obj: THREE.Object3D; base: THREE.Vector3; kind: string; idx: number }[] = []
  private glows: THREE.Sprite[] = []
  private dust?: THREE.Points
  private fly: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; start: number; dur: number } | null = null
  private lens = 22
  private raf = 0
  private clock = new THREE.Clock()
  private visible = true
  private idleSince = performance.now()
  private moved = false
  private dragging = false
  private homePose = 'zavod'
  private frameCbs = new Set<() => void>()
  private ro: ResizeObserver
  private io: IntersectionObserver

  constructor(private host: HTMLElement, base: string, opts: { interactive?: boolean } = {}) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    const mobile = Math.min(window.innerWidth, window.innerHeight) < 700
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 1.75))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NoToneMapping
    this.renderer.domElement.style.touchAction = 'none'
    host.appendChild(this.renderer.domElement)
    this.scene.background = new THREE.Color('#d9dbde')

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enabled = opts.interactive !== false
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 2.5
    this.controls.maxDistance = 26
    this.controls.maxPolarAngle = 1.48
    this.controls.minPolarAngle = 0.15
    this.controls.rotateSpeed = 0.6
    this.controls.zoomSpeed = 0.8
    this.controls.autoRotateSpeed = 0.35
    this.controls.addEventListener('start', () => {
      this.fly = null
      this.controls.autoRotate = false
      this.moved = true
      this.dragging = true
    })
    this.controls.addEventListener('end', () => {
      this.dragging = false
      this.idleSince = performance.now()
    })

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(host)
    this.io = new IntersectionObserver(([e]) => (this.visible = e.isIntersecting))
    this.io.observe(host)
    document.addEventListener('visibilitychange', this.onVis)
    this.resize()
    this.ready = this.load(base)
    this.loop()
  }

  private onVis = () => {
    if (!document.hidden) this.clock.getDelta()
  }

  private async load(base: string) {
    const [meta, gltf] = await Promise.all([
      fetch(`${base}meta.json`).then((r) => r.json() as Promise<ZavodMeta>),
      (() => {
        const draco = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`)
        return new GLTFLoader().setDRACOLoader(draco).loadAsync(`${base}zavod.glb`)
      })(),
    ])
    this.meta = meta
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const src = m.material as THREE.MeshStandardMaterial
      const map = src.map
      if (map) {
        map.colorSpace = THREE.SRGBColorSpace
        map.anisotropy = 4
      }
      m.material = new THREE.MeshBasicMaterial({ map: map ?? null, color: map ? 0xffffff : src.color })
      src.dispose()
    })
    this.scene.add(gltf.scene)
    // стены — полупрозрачные; стена на стороне камеры почти исчезает (разрез, как у «кукольного домика»)
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh && /^walls/.test(m.name)) {
        m.material = this.cutaway(m.material as THREE.MeshBasicMaterial)
        m.renderOrder = 10
      }
    })
    // подвижные части (имена anim_*)
    gltf.scene.traverse((o) => {
      if (!o.name.startsWith('anim_')) return
      const kind = o.name.replace(/^anim_/, '').replace(/_\d.*$/, '').replace(/_/g, '')
      const idx = Number(o.name.match(/_(\d+)/)?.[1] ?? 0)
      this.parts.push({ obj: o, base: o.position.clone(), kind, idx })
      if (kind === 'weld4' || kind === 'weld2') {
        // отсвет сварки под головой
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }))
        s.scale.set(0.5, 0.5, 0.5)
        s.position.copy(o.position).add(new THREE.Vector3(0, -0.22, 0.3))
        this.scene.add(s)
        this.glows.push(s)
        s.userData.part = this.parts.length - 1
      }
    })
    this.addDust()
    this.flyTo('zavod', true)
  }

  private fadeU = { uCam: { value: new THREE.Vector3() }, uTarget: { value: new THREE.Vector3() } }
  private cutaway(src: THREE.MeshBasicMaterial) {
    const m = src.clone()
    m.transparent = true
    m.depthWrite = false
    m.side = THREE.DoubleSide
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.fadeU)
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform vec3 uCam;\nuniform vec3 uTarget;')
        .replace(
          '#include <dithering_fragment>',
          `vec2 dir = normalize(uCam.xz - uTarget.xz + vec2(1e-4));
          float side = dot(vWPos.xz - uTarget.xz, dir);           // > 0 — стена между камерой и центром взгляда
          float a = mix(0.42, 0.04, smoothstep(0.5, 3.5, side));  // дальние стены — полупрозрачные, ближние — почти нет
          gl_FragColor.a *= a;
          #include <dithering_fragment>`,
        )
    }
    src.dispose()
    return m
  }

  // пылинки в световых лучах — медленно плывут
  private addDust() {
    const { L, W, H } = this.meta.bounds
    const n = 900
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      pos[i * 3] = Math.random() * L
      pos[i * 3 + 1] = 0.3 + Math.random() * (H - 0.5)
      pos[i * 3 + 2] = -Math.random() * W
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.018, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }))
    this.scene.add(this.dust)
  }

  /** камера к ракурсу раздела */
  flyTo(pose: string, instant = false) {
    const c = this.meta?.cams[pose] ?? this.meta?.cams.zavod
    if (!c) return
    this.homePose = this.meta.cams[pose] ? pose : 'zavod'
    this.lens = c.lens
    this.updateFov()
    const tTo = new THREE.Vector3(...c.look)
    // узкая низкая лента (ракурс задуман для полного кадра) → камера отходит назад, чтобы участок помещался целиком
    const aspect = this.camera.aspect
    const back = aspect > 2.2 ? Math.min(1.9, 1 + (aspect - 2.2) * 0.35) : 1
    const to = new THREE.Vector3(...c.pos).sub(tTo).multiplyScalar(back).add(tTo)
    to.y = Math.min(to.y, (this.meta?.bounds.H ?? 5.4) - 0.6)
    // телефон в портрете: кадр высокий — камера выше и смотрит вниз на станки, а не в крышу
    if (aspect < 1) {
      to.y = (this.meta?.bounds.H ?? 5.4) - 0.9
      tTo.y = 0
    }
    this.controls.autoRotate = false
    this.idleSince = performance.now()
    if (instant) {
      this.camera.position.copy(to)
      this.controls.target.copy(tTo)
      this.fly = null
      return
    }
    this.fly = { from: this.camera.position.clone(), to, tFrom: this.controls.target.clone(), tTo, start: performance.now(), dur: 1800 }
  }

  /** экранные координаты точки участка (для карточек заказов) */
  project(station: string): { x: number; y: number; on: boolean } | null {
    const a = this.meta?.anchors[station]
    if (!a) return null
    const v = new THREE.Vector3(...a).project(this.camera)
    const w = this.host.clientWidth
    const h = this.host.clientHeight
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, on: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 }
  }

  onFrame(cb: () => void) {
    this.frameCbs.add(cb)
    return () => this.frameCbs.delete(cb)
  }

  setAutoRotate(on: boolean) {
    this.controls.autoRotate = on
  }

  private updateFov() {
    const aspect = this.camera.aspect
    const hFov = 2 * Math.atan(18 / this.lens) // сенсор 36 мм, как в Blender
    this.camera.fov = THREE.MathUtils.radToDeg(aspect >= 1 ? 2 * Math.atan(Math.tan(hFov / 2) / aspect) : hFov)
    this.camera.updateProjectionMatrix()
  }

  private resize() {
    const w = this.host.clientWidth || 1
    const h = this.host.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.camera.aspect = w / h
    this.updateFov()
  }

  private animate(t: number) {
    for (const p of this.parts) {
      const o = p.obj
      if (p.kind === 'saw' || p.kind === 'yilmaz') {
        o.position.y = p.base.y - 0.07 * pulse(t, 5.5, p.idx * 1.9 + (p.kind === 'yilmaz' ? 2.7 : 0))
      } else if (p.kind === 'weld4' || p.kind === 'weld2') {
        o.position.y = p.base.y - 0.06 * pulse(t, 7, p.idx * 0.6)
      } else if (p.kind === 'feed') {
        o.position.x = p.base.x + Math.sin(t * 0.35) * 1.2
      } else if (p.kind === 'nikmak') {
        o.position.y = p.base.y - 0.03 * pulse(t, 4.2, 1.1)
      }
    }
    for (const s of this.glows) {
      const p = this.parts[s.userData.part as number]
      const k = pulse(t, 7, p.idx * 0.6)
      ;(s.material as THREE.SpriteMaterial).opacity = k > 0.6 ? 0.55 + Math.random() * 0.35 : 0
    }
    if (this.dust) {
      this.dust.position.x = Math.sin(t * 0.05) * 0.4
      this.dust.position.y = Math.sin(t * 0.07) * 0.15
    }
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop)
    if (!this.visible || document.hidden) return
    const t = this.clock.getElapsedTime()
    if (this.fly) {
      const k = Math.min(1, (performance.now() - this.fly.start) / this.fly.dur)
      const e = ease(k)
      this.camera.position.lerpVectors(this.fly.from, this.fly.to, e)
      this.controls.target.lerpVectors(this.fly.tFrom, this.fly.tTo, e)
      if (k >= 1) this.fly = null
    } else if (this.controls.enabled && this.moved && !this.dragging && performance.now() - this.idleSince > 5000) {
      this.moved = false
      this.flyTo(this.homePose) // покрутили и отпустили → через 5 с камера возвращается на общий вид завода
    }
    // цель камеры не уходит за стены
    if (this.meta) {
      const { L, W } = this.meta.bounds
      const tg = this.controls.target
      tg.x = THREE.MathUtils.clamp(tg.x, 0.5, L - 0.5)
      tg.z = THREE.MathUtils.clamp(tg.z, -W + 0.5, -0.5)
      tg.y = THREE.MathUtils.clamp(tg.y, 0, 3)
    }
    this.controls.update()
    // камера не выходит за стены и крышу цеха
    if (this.meta) {
      const { L, W, H } = this.meta.bounds
      const p = this.camera.position
      p.x = THREE.MathUtils.clamp(p.x, 0.4, L - 0.4)
      p.z = THREE.MathUtils.clamp(p.z, -W + 0.4, -0.4)
      p.y = THREE.MathUtils.clamp(p.y, 0.6, H - 0.3)
    }
    this.fadeU.uCam.value.copy(this.camera.position)
    this.fadeU.uTarget.value.copy(this.controls.target)
    this.animate(t)
    this.renderer.render(this.scene, this.camera)
    this.frameCbs.forEach((f) => f())
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.io.disconnect()
    document.removeEventListener('visibilitychange', this.onVis)
    this.controls.dispose()
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      const mt = m.material as THREE.MeshBasicMaterial | undefined
      mt?.map?.dispose()
      mt?.dispose?.()
    })
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}

let _glow: THREE.Texture | null = null
function glowTexture() {
  if (_glow) return _glow
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  r.addColorStop(0, 'rgba(255,255,255,1)')
  r.addColorStop(0.3, 'rgba(255,200,120,0.6)')
  r.addColorStop(1, 'rgba(255,140,40,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 64, 64)
  _glow = new THREE.CanvasTexture(c)
  return _glow
}

/** можно ли показывать живое 3D (иначе — неподвижные рендеры) */
export function canRun3D(): boolean {
  try {
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }
    if (nav.connection?.saveData) return false
    if (nav.deviceMemory !== undefined && nav.deviceMemory < 3) return false
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}
