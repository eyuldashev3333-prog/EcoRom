// Отправить файл (PDF/PNG заказа) самому себе в Telegram через бота — внутри Telegram скачивание не работает.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const MAX_BYTES = 15 * 1024 * 1024

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
  const bytes = Uint8Array.from(atob(String(body.data ?? '')), (c) => c.charCodeAt(0))
  if (!bytes.length || bytes.length > MAX_BYTES) return json({ error: 'Fayl hajmi noto‘g‘ri' }, 400)

  const form = new FormData()
  form.append('chat_id', String(me.telegram_id))
  if (body.caption) form.append('caption', String(body.caption).slice(0, 1000))
  form.append('document', new Blob([bytes], { type: String(body.mime ?? 'application/pdf') }), filename)
  const r = await fetch(`https://api.telegram.org/bot${Deno.env.get('TELEGRAM_BOT_TOKEN')}/sendDocument`, { method: 'POST', body: form })
  const j = await r.json()
  return j.ok ? json({ ok: true }) : json({ error: j.description }, 400)
})
