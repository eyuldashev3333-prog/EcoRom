import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, KeyRound, LogOut, Plus, Search, Wallet } from 'lucide-react'
import { useAuth } from '../auth'
import { LogoMark, Wordmark } from '../ui/Logo'
import { uz } from '../uz'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')

// шапка: телефон — знак или «назад»; ПК — поиск по заказам, «+ Yangi buyurtma»; справа аватар с меню
export default function TopBar() {
  const { me, signOut } = useAuth()
  const loc = useLocation()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const home = loc.pathname === '/'
  const immersive = loc.pathname === '/zavod'
  const rahbar = me?.role === 'rahbar'
  const back = () => ((window.history.state?.idx ?? 0) > 0 ? nav(-1) : nav('/'))
  const search = (e: FormEvent) => {
    e.preventDefault()
    if (q.trim()) nav(`/orders?q=${encodeURIComponent(q.trim())}`)
  }

  return (
    <header className={`topbar ${immersive ? 'over' : ''}`}>
      {home || immersive ? (
        <Link to="/" className={`brand ${immersive ? '' : 'mobile-only'}`} aria-label="ECOROM">
          <LogoMark size={16} />
          <Wordmark />
        </Link>
      ) : (
        <button type="button" className="back-btn" onClick={back}>
          <ArrowLeft size={18} strokeWidth={1.8} />
          <span>{uz.back}</span>
        </button>
      )}
      {rahbar && (
        // переключатель режима, как на iPhone: 3D-завод ↔ ERP
        <button type="button" className={`mode-switch ${immersive ? 'is-3d' : 'is-erp'}`} onClick={() => nav(immersive ? '/' : '/zavod')} aria-label="3D / ERP">
          <span className="ms-thumb" />
          <span className="ms-opt">{uz.shell.mode3d}</span>
          <span className="ms-opt">{uz.shell.modeErp}</span>
        </button>
      )}
      {rahbar && !immersive && (
        <form className="top-search desktop-only" onSubmit={search}>
          <Search size={16} strokeWidth={1.7} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={uz.shell.search} />
        </form>
      )}
      <span className="spacer" />
      {rahbar && !immersive && (
        <Link to="/orders" className="icon-only mobile-only" aria-label={uz.home.orders}>
          <Search size={20} strokeWidth={1.7} />
        </Link>
      )}
      {rahbar && !immersive && (
        <Link to="/orders/new" className="btn-primary desktop-only">
          <Plus size={16} strokeWidth={2} /> {uz.shell.newOrder}
        </Link>
      )}
      {me && (
        <div className="acct">
          <button type="button" className="avatar" onClick={() => setOpen(!open)} aria-label={me.full_name}>
            {initials(me.full_name)}
          </button>
          {open && (
            <>
              <div className="menu-scrim" onClick={() => setOpen(false)} />
              <div className="menu" onClick={() => setOpen(false)}>
                <div className="menu-head">
                  <b>{me.full_name}</b>
                  <small>{uz.roles[me.role]}</small>
                </div>
                {!rahbar && (
                  <Link to="/my-pay" className="menu-item">
                    <Wallet size={16} strokeWidth={1.6} /> {uz.home.myPay}
                  </Link>
                )}
                <Link to="/password" className="menu-item">
                  <KeyRound size={16} strokeWidth={1.6} /> {uz.home.password}
                </Link>
                <button type="button" className="menu-item" onClick={signOut}>
                  <LogOut size={16} strokeWidth={1.6} /> {uz.signOut}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </header>
  )
}
