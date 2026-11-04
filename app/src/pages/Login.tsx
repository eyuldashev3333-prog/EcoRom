import { useState, type FormEvent } from 'react'
import { telegramInitData, useAuth } from '../auth'
import { LogoMark, Wordmark } from '../ui/Logo'
import { uz } from '../uz'

const BASE = `${import.meta.env.BASE_URL}zavod/`

// вход: слева (на телефоне — сверху) кадр завода, справа строгая форма
export default function Login() {
  const { signIn } = useAuth()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(await signIn(login, password))
    setBusy(false)
  }

  return (
    <div className="login-wrap">
      <div className="login-art">
        <picture>
          <source media="(orientation: portrait)" srcSet={`${BASE}p/zavod.webp`} />
          <img src={`${BASE}l/zavod.webp`} alt="" />
        </picture>
        <span className="login-cap">Sifat va ishonch</span>
      </div>
      <div className="login-side">
        <form className="login" onSubmit={submit}>
          <div className="login-brand">
            <span className="brand">
              <LogoMark size={20} />
              <Wordmark />
            </span>
            <h1>{uz.signIn}</h1>
            <p>{uz.loginSub}</p>
          </div>
          <label>
            {uz.login}
            <input value={login} onChange={(e) => setLogin(e.target.value)} autoCapitalize="none" autoComplete="username" required />
          </label>
          <label>
            {uz.password}
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          {telegramInitData() && <p className="muted small" style={{ margin: 0 }}>{uz.tgHint}</p>}
          {error && <p className="error">{error}</p>}
          <button disabled={busy}>{uz.signIn}</button>
        </form>
      </div>
    </div>
  )
}
