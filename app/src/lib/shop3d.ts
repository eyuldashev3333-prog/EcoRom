// 3D-модель цеха ECOROM (по фото и видео из Desktop\1): ангар с фермами, антресоль, стена с аркой,
// линия: пилы Sezermak на рольганге → сварка (красный станок) + зачистка Nikmak SK-01 → столы-козлы → стеллаж готовых окон → выезд LABO.
// Низкополигонально (коробки/цилиндры), чтобы шло на телефоне. Возвращает точки станций для карточек заказов.
import * as THREE from 'three'

export type Station = 'new' | 'cut' | 'assemble' | 'glass_fit' | 'ready' | 'install'

const mats = new Map<string, THREE.Material>()
const mat = (color: number, opts: { emissive?: number; rough?: number; metal?: number } = {}) => {
  const key = `${color}-${opts.emissive ?? 0}-${opts.rough ?? 0.8}-${opts.metal ?? 0}`
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, emissive: opts.emissive ?? 0, roughness: opts.rough ?? 0.8, metalness: opts.metal ?? 0 }))
  return mats.get(key)!
}

function box(g: THREE.Group, w: number, h: number, d: number, color: number, x: number, y: number, z: number, opts?: { emissive?: number; rough?: number; metal?: number; ry?: number; rx?: number; rz?: number }) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts))
  m.position.set(x, y, z)
  if (opts?.ry) m.rotation.y = opts.ry
  if (opts?.rx) m.rotation.x = opts.rx
  if (opts?.rz) m.rotation.z = opts.rz
  g.add(m)
  return m
}
function cyl(g: THREE.Group, r: number, h: number, color: number, x: number, y: number, z: number, opts?: { rx?: number; rz?: number; metal?: number }) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), mat(color, { metal: opts?.metal ?? 0, rough: 0.5 }))
  m.position.set(x, y, z)
  if (opts?.rx) m.rotation.x = opts.rx
  if (opts?.rz) m.rotation.z = opts.rz
  g.add(m)
  return m
}

/** текстовая табличка (спрайт) */
export function label(text: string, opts: { bg?: string; fg?: string; w?: number; sub?: string } = {}) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = opts.sub ? 176 : 128
  const x = c.getContext('2d')!
  x.fillStyle = opts.bg ?? 'rgba(20,30,40,0.85)'
  const r = 28
  x.beginPath()
  x.roundRect(4, 4, c.width - 8, c.height - 8, r)
  x.fill()
  x.fillStyle = opts.fg ?? '#fff'
  x.font = 'bold 54px system-ui, sans-serif'
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  x.fillText(text, c.width / 2, opts.sub ? 58 : c.height / 2, c.width - 30)
  if (opts.sub) {
    x.font = '40px system-ui, sans-serif'
    x.fillText(opts.sub, c.width / 2, 128, c.width - 30)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }))
  const w = opts.w ?? 3
  s.scale.set(w, (w * c.height) / c.width, 1)
  s.renderOrder = 10
  return s
}

// окно-рама (для стеллажа и стола): 4 бруска + стекло
function frame(g: THREE.Group, w: number, h: number, color: number, x: number, y: number, z: number, ry = 0, tilt = 0) {
  const f = new THREE.Group()
  const t = 0.07
  box(f, w, t, t, color, 0, h / 2 - t / 2, 0)
  box(f, w, t, t, color, 0, -h / 2 + t / 2, 0)
  box(f, t, h, t, color, -w / 2 + t / 2, 0, 0)
  box(f, t, h, t, color, w / 2 - t / 2, 0, 0)
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - 2 * t, h - 2 * t), new THREE.MeshStandardMaterial({ color: 0x9fc6d8, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.2, side: THREE.DoubleSide }))
  f.add(glass)
  f.position.set(x, y, z)
  f.rotation.y = ry
  f.rotation.x = tilt
  g.add(f)
}

export function buildShop(scene: THREE.Scene): Record<Station, THREE.Vector3> {
  const g = new THREE.Group()
  scene.add(g)
  scene.background = new THREE.Color(0xdfe5ea)

  // свет: дневной из ворот + лампы под фермами
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f94, 1.6))
  const sun = new THREE.DirectionalLight(0xffffff, 1.4)
  sun.position.set(8, 14, 10)
  scene.add(sun)

  // пол (бетон) и стены
  box(g, 34, 0.1, 24, 0xb8bbbe, 0, -0.05, 1)
  box(g, 34, 7, 0.2, 0xf4f4f2, 0, 3.5, -11) // задняя белая стена
  box(g, 0.2, 7, 24, 0x8d9196, -17, 3.5, 1) // левая серая
  box(g, 0.2, 7, 24, 0xf1f1ef, 17, 3.5, 1) // правая белая
  // фермы крыши (тёмный металл) — полупрозрачные, чтобы при взгляде сверху не закрывали станки
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, metalness: 0.6, roughness: 0.6, transparent: true, opacity: 0.16, depthWrite: false })
  const roofBox = (w: number, h: number, d: number, x: number, y: number, z: number, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), roofMat)
    m.position.set(x, y, z)
    m.rotation.z = rz
    g.add(m)
  }
  for (let z = -10; z <= 12; z += 3.2) {
    roofBox(34, 0.12, 0.12, 0, 7.4, z)
    for (let x = -16; x <= 16; x += 4) roofBox(0.08, 1.2, 0.08, x, 6.9, z, x < 0 ? 0.6 : -0.6)
  }
  for (let x = -12; x <= 12; x += 8) box(g, 1.6, 0.08, 0.25, 0xffffff, x, 7.25, 0, { emissive: 0xffffff })

  // антресоль слева сзади: площадка, коричневые стойки, кованое ограждение, винтовая лестница
  box(g, 9, 0.2, 3, 0x6b4a32, -12, 3.3, -9.4)
  for (let x = -16; x <= -8; x += 2.6) box(g, 0.15, 3.3, 0.15, 0x6b4a32, x, 1.65, -8)
  for (let x = -16.2; x <= -7.6; x += 0.4) box(g, 0.03, 0.9, 0.03, 0x3b2a20, x, 3.85, -7.95)
  box(g, 8.8, 0.06, 0.06, 0x3b2a20, -12, 4.3, -7.95)
  cyl(g, 0.08, 3.4, 0x555a60, -7, 1.7, -9.4, { metal: 0.7 })
  for (let i = 0; i < 10; i++) {
    const a = i * 0.65
    box(g, 0.9, 0.06, 0.3, 0x555a60, -7 + Math.cos(a) * 0.45, 0.35 * i + 0.2, -9.4 + Math.sin(a) * 0.45, { ry: -a, metal: 0.6 })
  }

  // арка на серой части задней стены (у готовых окон)
  box(g, 8, 6.9, 0.05, 0x9da2a7, 11.5, 3.45, -10.85)
  const arch = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.07, 8, 32, Math.PI), mat(0x4b5055))
  arch.position.set(11.5, 3.2, -10.8)
  g.add(arch)
  box(g, 0.14, 3.2, 0.05, 0x4b5055, 9.8, 1.6, -10.8)
  box(g, 0.14, 3.2, 0.05, 0x4b5055, 13.2, 1.6, -10.8)

  // ===== 1. КЕСИШ: две пилы Sezermak (синие, бежевый кожух) на зелёном рольганге =====
  box(g, 10, 0.1, 0.4, 0x1f9e7a, -7, 0.95, -6)
  for (let x = -11.5; x <= -2.5; x += 1.5) box(g, 0.08, 0.95, 0.08, 0x1f9e7a, x, 0.47, -6)
  for (const x of [-9, -5]) {
    box(g, 1.2, 1.0, 1.0, 0x3c63a8, x, 0.5, -6) // синий корпус
    box(g, 1.1, 0.5, 0.9, 0xe7dfc8, x, 1.25, -6) // бежевый кожух
    cyl(g, 0.38, 0.05, 0x2a2d30, x, 1.25, -5.5, { rx: Math.PI / 2, metal: 0.8 }) // диск
  }
  // зелёная алюминиевая пила справа
  box(g, 0.9, 1.0, 0.8, 0x2aa198, -3, 0.5, -6)
  cyl(g, 0.3, 0.05, 0x2a2d30, -3, 1.2, -5.6, { rx: Math.PI / 2, metal: 0.8 })

  // ===== 2. ЙИГИШ: сварочный станок (красный), зачистка Nikmak SK-01 (серый), компрессор =====
  box(g, 2.8, 1.0, 1.1, 0xc8262c, 0.5, 0.5, -6) // красная станина
  box(g, 2.6, 0.12, 1.0, 0x3a3d40, 0.5, 1.06, -6) // тёмный стол
  for (const x of [-0.3, 1.3]) box(g, 0.7, 1.1, 0.5, 0xc8262c, x, 1.65, -6.3)
  box(g, 1.1, 1.2, 0.9, 0xd9dcdf, 3.3, 0.6, -6)
  for (const x of [3.05, 3.55]) cyl(g, 0.14, 0.6, 0xb7bdc2, x, 1.5, -6, { metal: 0.9 })
  cyl(g, 0.3, 1.2, 0x1d1f22, 2.2, 0.38, -4.6, { rz: Math.PI / 2 })
  box(g, 0.4, 0.3, 0.3, 0x5b5f63, 2.2, 0.85, -4.6)

  // ===== 3. ШИША / ФУРНИТУРА: зелёные столы-козлы с рамой окна =====
  for (const x of [6, 9]) {
    for (const dz of [-0.9, 0.9]) {
      box(g, 0.08, 0.95, 0.08, 0x2e8b57, x - 1, 0.47, dz)
      box(g, 0.08, 0.95, 0.08, 0x2e8b57, x + 1, 0.47, dz)
    }
    box(g, 2.2, 0.08, 0.1, 0x8b6b45, x, 0.95, -0.9)
    box(g, 2.2, 0.08, 0.1, 0x8b6b45, x, 0.95, 0.9)
    frame(g, 1.8, 1.4, 0x222222, x, 1.05, 0, 0, -Math.PI / 2)
  }
  // коробки фурнитуры
  for (let i = 0; i < 4; i++) box(g, 0.45, 0.3, 0.35, 0xb99a6b, 7.5 + i * 0.5, 0.15, 2.2)

  // ===== 4. ТАЙЁР: готовые окна в плёнке у стены с аркой =====
  const colors = [0xffffff, 0xd9b34a, 0x7b5434, 0xffffff, 0xd9b34a, 0xcfcfcf]
  colors.forEach((c, i) => frame(g, 1.1, 2.1, c, 9.6 + i * 0.7, 1.05, -10.3 + (i % 2) * 0.15, 0, -0.08))

  // ===== склад профиля слева: стеллаж с хлыстами + паллеты Knauf =====
  for (let y = 0.6; y <= 2.2; y += 0.8) {
    box(g, 0.12, 0.12, 6, 0x555a60, -15.6, y, 0)
    box(g, 0.12, 0.12, 6, 0x555a60, -14.4, y, 0)
  }
  for (let i = 0; i < 9; i++) box(g, 1.3, 0.06, 6, i % 3 === 0 ? 0xffffff : i % 3 === 1 ? 0xe2b33c : 0x9aa0a6, -15, 0.7 + i * 0.18, 0)
  for (const [x, z] of [[-14, 6], [-14, 8], [-12.2, 6]]) {
    box(g, 1.6, 1.0, 1.2, 0xf7f7f7, x, 0.5, z)
    box(g, 1.62, 0.25, 1.22, 0x2b8fd6, x, 0.45, z)
  }

  // ===== офис приёма заказов (впереди слева) =====
  box(g, 2.2, 0.8, 1.0, 0x8b5a2b, -10, 0.4, 7)
  box(g, 0.8, 0.5, 0.05, 0x111111, -10, 1.05, 6.8, { emissive: 0x223344 })

  // ===== 5. МОНТАЖ: ворота справа + малый грузовик LABO =====
  box(g, 0.05, 4, 4.5, 0xfff6d5, 16.85, 2, 5, { emissive: 0xfff2c0 })
  box(g, 1.2, 1.2, 1.4, 0xf1f1f1, 12.2, 0.75, 5) // кабина
  box(g, 2.4, 1.3, 1.5, 0xe9e9e9, 13.9, 0.85, 5) // кузов
  for (const [x, z] of [[12.2, 4.25], [12.2, 5.75], [14.5, 4.25], [14.5, 5.75]]) cyl(g, 0.3, 0.2, 0x1b1b1b, x, 0.3, z, { rx: Math.PI / 2 })
  frame(g, 1.2, 1.1, 0xffffff, 13.9, 2.1, 5, Math.PI / 2)

  return {
    new: new THREE.Vector3(-10, 0, 7),
    cut: new THREE.Vector3(-7, 0, -6),
    assemble: new THREE.Vector3(1.5, 0, -6),
    glass_fit: new THREE.Vector3(7.5, 0, 0),
    ready: new THREE.Vector3(11.5, 0, -9.5),
    install: new THREE.Vector3(13.2, 0, 5),
  }
}
