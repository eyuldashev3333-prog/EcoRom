// Вход через Telegram Mini App.
// action 'login': по подписанным данным Telegram (initData) находим сотрудника и выдаём одноразовый токен входа.
// action 'link':  вошедший по паролю внутри Telegram привязывает свой Telegram к профилю (один раз).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const enc = new TextEncoder()
const hmac = async (key: ArrayBuffer | Uint8Array, data: string) => {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)))
}
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

// проверка подписи по правилам Telegram WebApp; возвращает telegram user или null
async function verifyInitData(initData: string, botToken: string): Promise<{ id: number; first_name?: string } | null> {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return null
  params.delete('hash')
  const dataCheck = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')
  const secret = await hmac(enc.encode('WebAppData'), botToken)
  if (hex(await hmac(secret, dataCheck)) !== hash) return null
  const authDate = Number(params.get('auth_date') ?? 0)
  if (!authDate || Date.now() / 1000 - authDate > 24 * 3600) return null
  try {
    return JSON.parse(params.get('user') ?? 'null')
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const body = await req.json().catch(() => ({}))

  const tgUser = await verifyInitData(String(body.initData ?? ''), Deno.env.get('TELEGRAM_BOT_TOKEN')!)
  if (!tgUser) return json({ error: "Telegram ma'lumotlari tasdiqlanmadi" }, 401)

  if (body.action === 'link') {
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: me } = await caller.rpc('my_id')
    if (!me) return json({ error: 'Avval login va parol bilan kiring' }, 401)
    // этот Telegram мог быть привязан к другому (уволенному) профилю — снимаем
    await admin.from('employees').update({ telegram_id: null }).eq('telegram_id', tgUser.id).neq('id', me)
    const { error } = await admin.from('employees').update({ telegram_id: tgUser.id }).eq('id', me)
    return error ? json({ error: error.message }, 400) : json({ ok: true })
  }

  // login
  const { data: emp } = await admin
    .from('employees')
    .select('id, auth_user_id, is_active')
    .eq('telegram_id', tgUser.id)
    .maybeSingle()
  if (!emp || !emp.is_active || !emp.auth_user_id) return json({ error: 'not_linked' }, 404)
  const { data: user } = await admin.auth.admin.getUserById(emp.auth_user_id)
  if (!user?.user?.email) return json({ error: 'not_linked' }, 404)
  const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: user.user.email })
  if (error) return json({ error: error.message }, 400)
  return json({ token_hash: link.properties.hashed_token })
})
