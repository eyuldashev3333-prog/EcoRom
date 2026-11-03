// Выгрузка листов заказа: PNG/PDF (картинкой — кириллица/латиница без проблем со шрифтами) и отправка в Telegram.
import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'
import { supabase } from '../supabase'

export async function elementToPng(el: HTMLElement): Promise<string> {
  return toPng(el, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true })
}

export async function pagesToPdf(pages: HTMLElement[]): Promise<Blob> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  for (let i = 0; i < pages.length; i++) {
    const png = await elementToPng(pages[i])
    if (i > 0) pdf.addPage()
    pdf.addImage(png, 'PNG', 0, 0, 210, 297, undefined, 'FAST')
  }
  return pdf.output('blob')
}

export const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => (await fetch(dataUrl)).blob()

export function download(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

const toBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = reject
    r.readAsDataURL(blob)
  })

/** бот присылает файл в Telegram самому пользователю */
export async function sendToTelegram(blob: Blob, filename: string, caption?: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('tg-send-file', {
    body: { filename, mime: blob.type || 'application/pdf', caption, data: await toBase64(blob) },
  })
  if (!error) return data?.error ?? null
  try {
    const j = await (error as unknown as { context: Response }).context.json()
    return j.error ?? error.message
  } catch {
    return error.message
  }
}

export const insideTelegram = (): boolean =>
  !!(window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData
