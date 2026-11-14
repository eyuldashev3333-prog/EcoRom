import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import TopBar from './shell/TopBar'
import Sidebar from './shell/Sidebar'
import BottomNav from './shell/BottomNav'
import { useAuth } from './auth'
import { uz } from './uz'
import Login from './pages/Login'
import Home from './pages/Home'
import Catalog from './pages/Catalog'
import Exchange from './pages/Exchange'
import Employees from './pages/Employees'
import Password from './pages/Password'
import Designer from './pages/Designer'
import Orders from './pages/Orders'
import OrderEdit from './pages/OrderEdit'
import ShopOrder from './pages/ShopOrder'
import InstallOrder from './pages/InstallOrder'
import Breakages from './pages/Breakages'
import Expenses from './pages/Expenses'
import Leaks from './pages/Leaks'
import Settings from './pages/Settings'
import Offcuts from './pages/Offcuts'
import PhotoWindow from './pages/PhotoWindow'
import Report from './pages/Report'
import Payroll from './pages/Payroll'
import PayRules from './pages/PayRules'
import MyPay from './pages/MyPay'
import Service from './pages/Service'
import ServiceWork from './pages/ServiceWork'
import Stock from './pages/Stock'
import Purchases from './pages/Purchases'
import Suppliers from './pages/Suppliers'
// PDF-библиотеки тяжёлые — грузятся только при открытии печати
const OrderPrint = lazy(() => import('./pages/OrderPrint'))
// экран «Zavod» — отдельный чанк
const Workshop = lazy(() => import('./pages/Workshop'))
// таблицы (REGISTRATSIYA, SAVDO BOLIMI) — отдельный чанк
const Registratsiya = lazy(() => import('./pages/Registratsiya'))
const Savdo = lazy(() => import('./pages/Savdo'))

export default function App() {
  const { session, me, loading, signOut } = useAuth()

  const loc = useLocation()
  const home = loc.pathname === '/'
  const immersive = loc.pathname === '/zavod' // 3D-режим: завод на весь экран, без меню
  const nav = useNavigate()
  // Rahbar открывает систему — сначала 3D-завод (один раз за сеанс; дальше переключатель 3D/ERP)
  useEffect(() => {
    if (me?.role !== 'rahbar') return
    try {
      if (sessionStorage.getItem('ecorom.landed')) return
      sessionStorage.setItem('ecorom.landed', '1')
    } catch {
      return
    }
    if (loc.pathname === '/') nav('/zavod', { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.role])

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
    <div className={immersive ? 'app is-3d' : home ? 'app is-home' : 'app'}>
      {!immersive && <Sidebar />}
      <div className="main">
      <TopBar />
      {home ? (
        <Home />
      ) : (
      <main className={loc.pathname.startsWith('/jadval') ? 'page wide' : 'page'} key={loc.pathname}>
        <Routes>
          <Route path="/catalog" element={me.role === 'rahbar' ? <Catalog /> : <Navigate to="/" />} />
          <Route path="/exchange" element={me.role === 'rahbar' ? <Exchange /> : <Navigate to="/" />} />
          <Route path="/employees" element={me.role === 'rahbar' ? <Employees /> : <Navigate to="/" />} />
          <Route path="/password" element={<Password />} />
          <Route path="/install/:id" element={me.role === 'montajchi' ? <InstallOrder /> : <Navigate to="/" />} />
          <Route path="/breakages" element={me.role === 'rahbar' ? <Breakages /> : <Navigate to="/" />} />
          <Route
            path="/zavod"
            element={
              me.role === 'rahbar' ? (
                <Suspense fallback={<p className="muted">{uz.loading}</p>}>
                  <Workshop />
                </Suspense>
              ) : (
                <Navigate to="/" />
              )
            }
          />
          <Route path="/photo" element={me.role === 'rahbar' ? <PhotoWindow /> : <Navigate to="/" />} />
          <Route path="/offcuts" element={me.role === 'rahbar' ? <Offcuts /> : <Navigate to="/" />} />
          <Route path="/settings" element={me.role === 'rahbar' ? <Settings /> : <Navigate to="/" />} />
          <Route path="/leaks" element={me.role === 'rahbar' ? <Leaks /> : <Navigate to="/" />} />
          <Route path="/report" element={me.role === 'rahbar' ? <Report /> : <Navigate to="/" />} />
          <Route path="/payroll" element={me.role === 'rahbar' ? <Payroll /> : <Navigate to="/" />} />
          <Route path="/pay-rules" element={me.role === 'rahbar' ? <PayRules /> : <Navigate to="/" />} />
          <Route path="/my-pay" element={<MyPay />} />
          <Route path="/expenses" element={me.role === 'rahbar' ? <Expenses /> : <Navigate to="/" />} />
          <Route path="/service" element={me.role === 'rahbar' ? <Service /> : <Navigate to="/" />} />
          <Route path="/servis/:id" element={me.role === 'montajchi' ? <ServiceWork /> : <Navigate to="/" />} />
          <Route path="/stock" element={me.role === 'rahbar' ? <Stock /> : <Navigate to="/" />} />
          <Route path="/purchases" element={me.role === 'rahbar' ? <Purchases /> : <Navigate to="/" />} />
          <Route path="/suppliers" element={me.role === 'rahbar' ? <Suppliers /> : <Navigate to="/" />} />
          <Route path="/shop/:id" element={me.role === 'ishlab' ? <ShopOrder /> : <Navigate to="/" />} />
          <Route path="/designer" element={me.role === 'rahbar' ? <Designer /> : <Navigate to="/" />} />
          <Route path="/orders" element={me.role === 'rahbar' ? <Orders /> : <Navigate to="/" />} />
          <Route path="/orders/new" element={me.role === 'rahbar' ? <OrderEdit /> : <Navigate to="/" />} />
          <Route path="/orders/:id" element={me.role === 'rahbar' ? <OrderEdit /> : <Navigate to="/" />} />
          <Route
            path="/orders/:id/print"
            element={
              me.role === 'rahbar' ? (
                <Suspense fallback={<p className="muted">{uz.loading}</p>}>
                  <OrderPrint />
                </Suspense>
              ) : (
                <Navigate to="/" />
              )
            }
          />
          <Route path="/workshop" element={<Navigate to="/zavod" replace />} />
          <Route path="/jadval/registratsiya" element={me.role === 'rahbar' ? <Suspense fallback={<p className="muted">{uz.loading}</p>}><Registratsiya /></Suspense> : <Navigate to="/" />} />
          <Route path="/jadval/savdo" element={me.role === 'rahbar' ? <Suspense fallback={<p className="muted">{uz.loading}</p>}><Savdo /></Suspense> : <Navigate to="/" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
      )}
      </div>
      {!immersive && <BottomNav />}
    </div>
  )
}
