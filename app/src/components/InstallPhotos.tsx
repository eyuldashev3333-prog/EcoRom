import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { signedUrls } from '../lib/photo'
import { uz } from '../uz'

// Фото установки (их загружает монтажник в системе; руководителям они же приходят в Telegram)
export default function InstallPhotos({ orderId }: { orderId: string }) {
  const [urls, setUrls] = useState<string[]>([])
  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('install_order_photos').select('photo_path').eq('order_id', orderId).order('taken_at')
      const paths = ((data as { photo_path: string }[]) ?? []).map((x) => x.photo_path)
      const s = await signedUrls(paths)
      setUrls(paths.flatMap((p) => (s[p] ? [s[p]] : [])))
    })()
  }, [orderId])
  if (!urls.length) return null
  return (
    <div className="card">
      <h2>{uz.flow.photoLabel}</h2>
      <div className="photo-strip">
        {urls.map((u) => (
          <a key={u} href={u} target="_blank" rel="noreferrer">
            <img src={u} alt="" loading="lazy" />
          </a>
        ))}
      </div>
    </div>
  )
}
