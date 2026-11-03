import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import { uz } from './uz'
import Login from './pages/Login'
import Home from './pages/Home'
import Catalog from './pages/Catalog'
import Employees from './pages/Employees'
import Password from './pages/Password'
import Designer from './pages/Designer'

export default function App() {
  const { session, me, loading, signOut } = useAuth()

  if (loading) return <div className="center muted">{uz.loading}</div>
  if (!session) return <Login />
  if (!me)
    return (
      <div className="center">
        <p>{uz.noProfile}</p>
        <button onClick={signOut}>{uz.signOut}</button>
      </div>
    )

  return (
    <div className="shell">
      <header className="top">
        <Link to="/" className="brand">
          <img src={`${import.meta.env.BASE_URL}logo.jpg`} alt="" />
          <span>{uz.app}</span>
        </Link>
        <div className="who">
          <b>{me.full_name}</b>
          <small>{uz.roles[me.role]}</small>
        </div>
        <button className="ghost" onClick={signOut}>
          {uz.signOut}
        </button>
      </header>
      <main className="page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/catalog" element={me.role === 'rahbar' ? <Catalog /> : <Navigate to="/" />} />
          <Route path="/employees" element={me.role === 'rahbar' ? <Employees /> : <Navigate to="/" />} />
          <Route path="/password" element={<Password />} />
          <Route path="/designer" element={me.role === 'rahbar' ? <Designer /> : <Navigate to="/" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  )
}
