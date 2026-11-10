// Управление сотрудниками: только Rahbar. Создать логин, сменить пароль, отключить/включить.
// Ушедший сотрудник не удаляется: профиль и история остаются, вход блокируется.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const LOGIN_RE = /^[a-z0-9._-]{3,32}$/
const ROLES = ['rahbar', 'ishlab', 'montajchi']
const BAN_FOREVER = '876000h'
const COMMON = ['12345678', '123456789', '1234567890', '11111111', '00000000', 'password', 'qwertyui', 'parol123', 'ecorom123']
// пароль: от 8 символов, не из списка очевидных, не равен логину
const passwordProblem = (pw: string, login: string): string | null => {
  if (pw.length < 8) return 'Parol kamida 8 belgi'
  if (COMMON.includes(pw.toLowerCase()) || /^(.)\1+$/.test(pw)) return 'Parol juda oddiy'
  if (login && pw.toLowerCase().includes(login.toLowerCase())) return "Parol loginni o'z ichiga olmasin"
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: isRahbar } = await caller.rpc('is_rahbar')
  if (isRahbar !== true) return json({ error: "Faqat rahbar uchun" }, 403)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const body = await req.json().catch(() => ({}))

  const authUserOf = async (employeeId: string) => {
    const { data } = await admin.from('employees').select('auth_user_id').eq('id', employeeId).maybeSingle()
    return data?.auth_user_id as string | undefined
  }

  switch (body.action) {
    case 'create': {
      const login = String(body.login ?? '').trim().toLowerCase()
      const fullName = String(body.full_name ?? '').trim()
      const password = String(body.password ?? '')
      if (!LOGIN_RE.test(login)) return json({ error: "Login: 3–32 belgi, faqat lotin harflari, raqam, . _ -" }, 400)
      if (!fullName) return json({ error: 'Ism kiritilmagan' }, 400)
      if (!ROLES.includes(body.role)) return json({ error: "Lavozim noto'g'ri" }, 400)
      const weak = passwordProblem(password, login)
      if (weak) return json({ error: weak }, 400)

      const { data: created, error } = await admin.auth.admin.createUser({
        email: `${login}@ecorom.app`,
        password,
        email_confirm: true,
      })
      if (error) return json({ error: error.message.includes('already') ? 'Bu login band' : error.message }, 400)

      const { data: emp, error: insErr } = await admin
        .from('employees')
        .insert({ full_name: fullName, role: body.role, phone: body.phone || null, login, auth_user_id: created.user.id })
        .select('id')
        .single()
      if (insErr) {
        await admin.auth.admin.deleteUser(created.user.id) // откат, чтобы не осталось «висящего» аккаунта
        return json({ error: insErr.message }, 400)
      }
      return json({ ok: true, id: emp.id })
    }

    case 'set_password': {
      const password = String(body.password ?? '')
      const { data: tgt } = await admin.from('employees').select('login').eq('id', body.employee_id).maybeSingle()
      const weak = passwordProblem(password, tgt?.login ?? '')
      if (weak) return json({ error: weak }, 400)
      const uid = await authUserOf(body.employee_id)
      if (!uid) return json({ error: 'Xodim topilmadi' }, 404)
      const { error } = await admin.auth.admin.updateUserById(uid, { password })
      return error ? json({ error: error.message }, 400) : json({ ok: true })
    }

    case 'deactivate':
    case 'activate': {
      const active = body.action === 'activate'
      if (!active) {
        const { data: myId } = await caller.rpc('my_id')
        if (myId && myId === body.employee_id) return json({ error: "O'zingizni o'chirib bo'lmaydi" }, 400)
        const { data: target } = await admin.from('employees').select('role, is_active').eq('id', body.employee_id).maybeSingle()
        if (target?.role === 'rahbar' && target.is_active) {
          const { count } = await admin.from('employees').select('id', { count: 'exact', head: true }).eq('role', 'rahbar').eq('is_active', true).neq('id', body.employee_id)
          if (!count) return json({ error: "Oxirgi faol rahbarni o'chirib bo'lmaydi" }, 400)
        }
      }
      const uid = await authUserOf(body.employee_id)
      if (!uid) return json({ error: 'Xodim topilmadi' }, 404)
      const { error } = await admin.auth.admin.updateUserById(uid, { ban_duration: active ? 'none' : BAN_FOREVER })
      if (error) return json({ error: error.message }, 400)
      await admin
        .from('employees')
        .update({ is_active: active, left_at: active ? null : new Date().toISOString().slice(0, 10) })
        .eq('id', body.employee_id)
      return json({ ok: true })
    }

    default:
      return json({ error: 'unknown action' }, 400)
  }
})
