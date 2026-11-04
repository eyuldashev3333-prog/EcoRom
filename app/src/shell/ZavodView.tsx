import { useEffect, useRef, useState } from 'react'
import type { ZavodScene } from '../three/ZavodScene'

// Лента завода над разделами главной: живое 3D (свет запечён в Blender, станки работают, крутится пальцем).
// Пока 3D грузится (или устройство слабое / нет WebGL) — неподвижные рендеры того же ракурса.
export const POSES = ['zavod', 'savdo', 'ishlab', 'montaj', 'pul', 'sozlamalar'] as const
type Pose = (typeof POSES)[number]
const POSE_OF: Record<string, Pose> = { ishlarim: 'ishlab', bugun: 'montaj', profil: 'zavod' }
const BASE = `${import.meta.env.BASE_URL}zavod/`

export function poseOf(section: string): Pose {
  return (POSES as readonly string[]).includes(section) ? (section as Pose) : (POSE_OF[section] ?? 'zavod')
}

/** живое 3D в контейнере: возвращает ссылку на сцену (null — пока нет / не поддерживается) */
export function useZavod3D(host: React.RefObject<HTMLDivElement>, interactive = true) {
  const [scene, setScene] = useState<ZavodScene | null>(null)
  const [progress, setProgress] = useState<number | null>(null) // 0..1 пока качается; null — не качается / готово
  useEffect(() => {
    let alive = true
    let s: ZavodScene | null = null
    import('../three/ZavodScene').then(async (m) => {
      if (!alive || !host.current || !m.canRun3D()) return
      s = new m.ZavodScene(host.current, `${BASE}3d/`, { interactive })
      setProgress(0)
      s.onProgress((p) => alive && setProgress(p))
      try {
        await s.ready
        if (alive) {
          setScene(s)
          setProgress(null)
        }
      } catch {
        setProgress(null)
        s.dispose()
        s = null
      }
    })
    return () => {
      alive = false
      s?.dispose()
    }
  }, [host, interactive])
  return { scene, progress }
}

export default function ZavodView({ section, className = '' }: { section: string; className?: string }) {
  const pose = poseOf(section)
  const host = useRef<HTMLDivElement>(null)
  const { scene, progress } = useZavod3D(host)
  const [loaded, setLoaded] = useState<Set<Pose>>(() => new Set([pose]))
  useEffect(() => {
    setLoaded((s) => (s.has(pose) ? s : new Set(s).add(pose)))
  }, [pose])
  useEffect(() => {
    scene?.flyTo(pose)
  }, [scene, pose])
  return (
    <div className={`zview ${scene ? 'live' : ''} ${className}`}>
      {POSES.filter((p) => loaded.has(p)).map((p) => (
        <picture key={p} className={`zv-pose ${p === pose ? 'on' : ''}`} aria-hidden="true">
          <source media="(orientation: portrait)" srcSet={`${BASE}p/${p}.webp`} />
          <img src={`${BASE}l/${p}.webp`} alt="" decoding="async" />
        </picture>
      ))}
      <div className="zv-3d" ref={host} />
      {scene && <span className="zv-hint">3D</span>}
      {!scene && progress !== null && <span className="zv-hint">3D {Math.round(progress * 100)}%</span>}
    </div>
  )
}
