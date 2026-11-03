import { supabase } from '../supabase'

/** сжать и загрузить фото в закрытое хранилище: <заказ>/<папка>/<имя>.jpg; вернуть пути */
export async function uploadPhotos(orderId: string, folder: string, files: File[]): Promise<string[]> {
  const out: string[] = []
  for (const f of files) {
    const blob = await compressPhoto(f)
    const path = `${orderId}/${folder}/${Date.now()}_${out.length}.jpg`
    const up = await supabase.storage.from('install-photos').upload(path, blob, { contentType: 'image/jpeg' })
    if (up.error) {
      if (out.length) await supabase.storage.from('install-photos').remove(out)
      throw up.error
    }
    out.push(path)
  }
  return out
}

/** временные ссылки на фото (час) */
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {}
  const { data } = await supabase.storage.from('install-photos').createSignedUrls(paths, 3600)
  return Object.fromEntries((data ?? []).flatMap((s) => (s.signedUrl && s.path ? [[s.path, s.signedUrl]] : [])))
}

// Фото с телефона → JPEG до 1280 px (≈150–300 КБ): бесплатное хранилище ограничено, оригиналы по 5 МБ не нужны.
export async function compressPhoto(file: File, maxSide = 1280, quality = 0.72): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * k)
  canvas.height = Math.round(bmp.height * k)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Foto o‘qilmadi'))), 'image/jpeg', quality))
}
