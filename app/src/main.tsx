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

// Внутри Telegram документ не прокручивается и не двигается вбок: единственный вертикальный скролл — в #root (см. styles.css, html.tg).
// Иначе свайп по листу/странице тянет всё приложение и Telegram сворачивает или закрывает его.
if (tg?.initData) {
  document.documentElement.classList.add('tg')
  const root = document.getElementById('root')!
  const scrollable = (el: Element | null): boolean => {
    for (let n = el as HTMLElement | null; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n)
      if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1) return true
      if (/(auto|scroll)/.test(s.overflowX) && n.scrollWidth > n.clientWidth + 1) return true
    }
    return false
  }
  // у края прокручиваемого блока сдвигаем на 1 px, чтобы свайп вниз/вверх не «проваливался» в жест Telegram
  document.addEventListener(
    'touchstart',
    (e) => {
      for (let n = e.target as HTMLElement | null; n && n !== document.documentElement; n = n.parentElement) {
        const s = getComputedStyle(n)
        if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1) {
          if (n.scrollTop <= 0) n.scrollTop = 1
          else if (n.scrollTop + n.clientHeight >= n.scrollHeight) n.scrollTop = n.scrollHeight - n.clientHeight - 1
          break
        }
      }
    },
    { passive: true },
  )
  // на экране, где нечего прокручивать (редактор, диалоги), перетаскивание не должно двигать приложение
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length === 1 && e.cancelable && !scrollable(e.target as Element) && !(e.target as HTMLElement).closest?.('input, textarea, select')) e.preventDefault()
    },
    { passive: false },
  )
  void root
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
