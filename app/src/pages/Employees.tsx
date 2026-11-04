import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { callAdmin, generatePassword } from '../lib/admin'
import { uz } from '../uz'
import type { Role } from '../auth'

interface Emp {
  id: string
  full_name: string
  role: Role
  login: string | null
  phone: string | null
  is_active: boolean
  left_at: string | null
  hired_at: string | null
}
const t = uz.employees

export default function Employees() {
  const [list, setList] = useState<Emp[]>([])
  const [form, setForm] = useState({ full_name: '', login: '', role: 'ishlab' as Role, phone: '', password: generatePassword() })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('employees')
      .select('id, full_name, role, login, phone, is_active, left_at, hired_at')
      .order('is_active', { ascending: false })
      .order('full_name')
    setList((data as Emp[]) ?? [])
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const r = await callAdmin({ action: 'create', ...form })
    setBusy(false)
    if (r.error) return setMsg({ ok: false, text: r.error })
    setMsg({ ok: true, text: `${t.created}: ${form.login} / ${form.password}` })
    setForm({ full_name: '', login: '', role: 'ishlab', phone: '', password: generatePassword() })
    load()
  }

  const resetPassword = async (emp: Emp) => {
    const pw = generatePassword()
    if (!window.confirm(`${emp.full_name}: ${t.resetConfirm}`)) return
    const r = await callAdmin({ action: 'set_password', employee_id: emp.id, password: pw })
    setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: `${t.newPassword} ${emp.login}: ${pw}` })
  }

  // дата приёма нужна для зарплаты по дням: по умолчанию — день создания в системе, поэтому её можно поправить
  const setHired = async (emp: Emp, date: string) => {
    if (!date) return
    const { error } = await supabase.from('employees').update({ hired_at: date }).eq('id', emp.id)
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: `${emp.full_name}: ${t.hiredSaved}` })
    load()
  }

  const toggle = async (emp: Emp) => {
    if (emp.is_active && !window.confirm(`${emp.full_name}: ${t.deactivateConfirm}`)) return
    const r = await callAdmin({ action: emp.is_active ? 'deactivate' : 'activate', employee_id: emp.id })
    if (r.error) setMsg({ ok: false, text: r.error })
    load()
  }

  return (
    <>
      <p>
        <Link to="/">←</Link>
      </p>
      <h1>{t.title}</h1>

      {msg && <div className={msg.ok ? 'card note ok' : 'card note bad'}>{msg.text}</div>}

      <form className="card form" onSubmit={create}>
        <h2>{t.add}</h2>
        <label>
          {t.fullName}
          <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
        </label>
        <label>
          {t.role}
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            {(['ishlab', 'montajchi', 'rahbar'] as Role[]).map((r) => (
              <option key={r} value={r}>
                {uz.roles[r]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {uz.login} <small>{t.loginHint}</small>
          <input value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value.toLowerCase() })} autoCapitalize="none" required />
        </label>
        <label>
          {t.phone}
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" />
        </label>
        <label>
          {uz.password}
          <div className="inline">
            <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} />
            <button type="button" className="ghost" onClick={() => setForm({ ...form, password: generatePassword() })}>
              ↻
            </button>
          </div>
        </label>
        <button disabled={busy}>{t.add}</button>
      </form>

      <h2>{t.list}</h2>
      {list.map((emp) => (
        <div key={emp.id} className={emp.is_active ? 'card row' : 'card row off'}>
          <b>{emp.full_name}</b>
          <span className="muted">{uz.roles[emp.role]}</span>
          {emp.login && <code>{emp.login}</code>}
          {!emp.is_active && <span className="muted">{t.left} {emp.left_at}</span>}
          <label className="inline small" title={t.hiredHint}>
            <small className="muted">{t.hired}</small>
            <input type="date" defaultValue={emp.hired_at ?? ''} onBlur={(e) => e.target.value !== (emp.hired_at ?? '') && setHired(emp, e.target.value)} />
          </label>
          <span className="spacer" />
          {emp.is_active && (
            <button className="ghost" onClick={() => resetPassword(emp)}>
              {t.reset}
            </button>
          )}
          <button className="ghost" onClick={() => toggle(emp)}>
            {emp.is_active ? t.deactivate : t.activate}
          </button>
        </div>
      ))}
    </>
  )
}
