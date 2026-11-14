// Язык интерфейса: узбекский (основной, uz.ts), русский и английский накладываются поверх на старте.
// Переключение сохраняется в браузере и применяется после перезагрузки: многие модули читают строки при загрузке.
import en from './lang/en'
import ru from './lang/ru'

export type Lang = 'uz' | 'ru' | 'en'
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'uz', label: 'O‘zbekcha' },
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
]

const KEY = 'ecorom_lang'
const read = (): Lang => {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'ru' || v === 'en' ? v : 'uz'
  } catch {
    return 'uz'
  }
}
export const currentLang: Lang = read()
export function saveLang(l: Lang) {
  try {
    localStorage.setItem(KEY, l)
  } catch {
    /* частный режим: останется узбекский */
  }
}

type Obj = Record<string, unknown>
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)

/** накладывает строки словаря на объект строк, меняя его на месте (ссылки `const t = uz.order` остаются верными); чужие ключи игнорируются */
export function deepAssign(target: Obj, src: Obj): void {
  for (const [k, v] of Object.entries(src)) {
    const cur = target[k]
    if (typeof v === 'string' && typeof cur === 'string') target[k] = v
    else if (isObj(v) && isObj(cur)) deepAssign(cur, v)
  }
}

export const DICTS: Record<Exclude<Lang, 'uz'>, Obj> = { ru, en }

export function applyLang(target: Obj, lang: Lang = currentLang): void {
  if (lang !== 'uz') deepAssign(target, DICTS[lang])
}
