import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { AuthProvider } from './auth'
import App from './App'
import '@fontsource-variable/inter'
import './styles.css'

// Telegram Mini App: на весь экран, шапка и фон в цвет светлой темы (тёмная тема Telegram не ломает вид)
const tg = (window as unknown as { Telegram?: { WebApp?: { ready(): void; expand(): void; setHeaderColor?(c: string): void; setBackgroundColor?(c: string): void; disableVerticalSwipes?(): void } } }).Telegram?.WebApp
tg?.ready()
tg?.expand()
try {
  tg?.setHeaderColor?.('#f2f2f5')
  tg?.setBackgroundColor?.('#f2f2f5')
  tg?.disableVerticalSwipes?.() // иначе свайп внутри списков сворачивает Mini App
} catch {
  /* старые версии Telegram */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
)
