// Отправить файл (PDF/PNG заказа) самому себе в Telegram через бота — внутри Telegram скачивание не работает.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  // свой профиль строго по id (Rahbar видит всех сотрудников — без фильтра вернулось бы несколько строк)
  const { data: myId } = await caller.rpc('my_id')
  if (!myId) return json({ error: 'Kirish kerak' }, 401)
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: me } = await admin.from('employees').select('telegram_id, is_active').eq('id', myId).maybeSingle()
  if (!me?.is_active) return json({ error: 'Kirish kerak' }, 401)
  if (!me.telegram_id) return json({ error: "Telegram ulanmagan: botdagi ECOROM tugmasi orqali bir marta kiring" }, 400)

  const body = await req.json().catch(() => ({}))
  const filename = String(body.filename ?? 'ecorom.pdf').replace(/[^\w.\-#]/g, '_')
  // размер проверяем ДО декодирования base64 (иначе большой файл валил функцию по памяти) и только разрешённые типы
  const b64 = String(body.data ?? '')
  if (!b64 || b64.length > Math.ceil((MAX_BYTES * 4) / 3) + 8) return json({ error: 'Fayl hajmi noto‘g‘ri (10 MB dan oshmasin)' }, 413)
  const mime = String(body.mime ?? 'application/pdf')
  if (!ALLOWED_MIME.has(mime)) return json({ error: 'Fayl turi ruxsat etilmagan' }, 415)
  let bytes: Uint8Array
  try {
    bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  } catch {
    return json({ error: 'Fayl buzilgan' }, 400)
  }
  if (!bytes.length || bytes.length > MAX_BYTES) return json({ error: 'Fayl hajmi noto‘g‘ri' }, 400)

  const form = new FormData()
  form.append('chat_id', String(me.telegram_id))
  if (body.caption) form.append('caption', String(body.caption).slice(0, 1000))
  form.append('document', new Blob([bytes], { type: mime }), filename)
  const r = await fetch(`https://api.telegram.org/bot${Deno.env.get('TELEGRAM_BOT_TOKEN')}/sendDocument`, { method: 'POST', body: form })
  const j = await r.json()
  return j.ok ? json({ ok: true }) : json({ error: j.description }, 400)
})
