import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth'
import { uz } from '../uz'

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
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <img className="logo" src={`${import.meta.env.BASE_URL}logo.jpg`} alt="ECOROM" />
        <label>
          {uz.login}
          <input value={login} onChange={(e) => setLogin(e.target.value)} autoCapitalize="none" autoComplete="username" required />
        </label>
        <label>
          {uz.password}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="error">{error}</p>}
        <button disabled={busy}>{uz.signIn}</button>
      </form>
    </div>
  )
}
