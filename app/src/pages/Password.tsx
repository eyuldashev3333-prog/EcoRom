import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { uz } from '../uz'

const t = uz.password_page

export default function Password() {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (pw.length < 6) return setMsg({ ok: false, text: t.tooShort })
    if (pw !== pw2) return setMsg({ ok: false, text: t.mismatch })
    const { error } = await supabase.auth.updateUser({ password: pw })
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: t.done })
    if (!error) {
      setPw('')
      setPw2('')
    }
  }

  return (
    <>
      <p>
        <Link to="/">←</Link>
      </p>
      <h1>{t.title}</h1>
      {msg && <div className={msg.ok ? 'card note ok' : 'card note bad'}>{msg.text}</div>}
      <form className="card form" onSubmit={submit}>
        <label>
          {t.newPw}
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required />
        </label>
        <label>
          {t.repeat}
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required />
        </label>
        <button>{uz.catalog.save}</button>
      </form>
    </>
  )
}
