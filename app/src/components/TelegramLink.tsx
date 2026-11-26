import { useCallback, useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { supabase } from '../supabase'
import { uz } from '../uz'

// строка на главной: кто вошёл (логин, имя, роль) и привязан ли Telegram; кнопка «Telegramni ulash» →
// одноразовая ссылка t.me/ecorombot?start=link_<код> (бот сам привяжет этот Telegram к аккаунту)
const BOT = 'ecorombot'
interface Status { login: string; full_name: string; role: string; linked: boolean }

export default function TelegramLink() {
  const [st, setSt] = useState<Status | null>(null)
  const [wait, setWait] = useState(false)
  const [err, setErr] = useState('')
  const timer = useRef(0)

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('tg_link_status')
    if (data) setSt(data as Status)
    return data as Status | null
  }, [])

  useEffect(() => {
    load()
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      clearInterval(timer.current)
    }
  }, [load])

  const link = async () => {
    setErr('')
    // внутри Telegram — его собственным способом; в браузере окно открываем сразу (иначе телефон заблокирует всплывающее)
    const twa = (window as unknown as { Telegram?: { WebApp?: { initData?: string; openTelegramLink?: (u: string) => void } } }).Telegram?.WebApp
    const inTg = !!(twa?.initData && twa.openTelegramLink)
    const win = inTg ? null : window.open('about:blank', '_blank')
    const { data, error } = await supabase.rpc('tg_link_code')
    if (error || !data) {
      win?.close()
      setErr(error?.message ?? 'Xatolik')
      return
    }
    const url = `https://t.me/${BOT}?start=link_${data}`
    if (inTg) twa!.openTelegramLink!(url)
    else if (win) win.location.href = url
    else window.location.href = url
    setWait(true)
    clearInterval(timer.current)
    const started = Date.now()
    const was = st?.linked
    timer.current = window.setInterval(async () => {
      const s = await load()
      // ждём, пока бот примет код (до 3 минут)
      if ((s?.linked && !was) || Date.now() - started > 180_000) {
        clearInterval(timer.current)
        setWait(false)
      }
    }, 3000)
  }

  if (!st) return null
  return (
    <div className="tg-link">
      <div className="tg-who">
        <span className="tg-k">Akkaunt:</span> <b>{st.login}</b> · {st.full_name} · {uz.roles[st.role as keyof typeof uz.roles] ?? st.role}
      </div>
      <div className="tg-state">
        {st.linked ? <span className="tg-ok">Telegram: ✅ ulangan</span> : <span className="tg-no">Telegram ulanmagan</span>}
        <button type="button" className={st.linked ? 'tg-btn tg-btn-small' : 'tg-btn'} onClick={link}>
          <Send size={15} /> {st.linked ? 'Qayta ulash' : 'Telegramni ulash'}
        </button>
      </div>
      {wait && <div className="tg-hint">Telegramda «Start» tugmasini bosing — shu yerda «ulangan» chiqadi.</div>}
      {err && <div className="tg-err">{err}</div>}
    </div>
  )
}
