import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { AuthProvider } from './auth'
import App from './App'
import '@fontsource-variable/inter'
import './styles.css'

// Telegram Mini App: на весь экран, шапка и фон в цвет светлой темы (тёмная тема Telegram не ломает вид)
const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string; ready(): void; expand(): void; isVersionAtLeast?(v: string): boolean; requestFullscreen?(): void; setHeaderColor?(c: string): void; setBackgroundColor?(c: string): void; disableVerticalSwipes?(): void } } }).Telegram?.WebApp
tg?.ready()
tg?.expand()
try {
  tg?.setHeaderColor?.('#ffffff')
  tg?.setBackgroundColor?.('#f7f7f8')
  tg?.disableVerticalSwipes?.() // иначе свайп внутри списков сворачивает Mini App
  // настоящий полный экран (Bot API 8.0+): без пустой полосы шапки Telegram; отступы под «чёлку» и кнопки Telegram дают --tg-* переменные (см. tokens.css)
  if (tg?.initData && tg.isVersionAtLeast?.('8.0')) tg.requestFullscreen?.()
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
