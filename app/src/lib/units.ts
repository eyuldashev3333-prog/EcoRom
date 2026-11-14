// Единицы отображения: мм / м / м² (по умолчанию) или дюймы / футы / кв. футы. Хранение везде в мм, метрах, м².
// Переключатель сохраняется в браузере и применяется после перезагрузки страницы (как язык).
export type Units = 'mm' | 'in'

const KEY = 'ecorom_units'
const readUnits = (): Units => {
  try {
    return localStorage.getItem(KEY) === 'in' ? 'in' : 'mm'
  } catch {
    return 'mm'
  }
}
export const currentUnits: Units = readUnits()
export function saveUnits(u: Units) {
  try {
    localStorage.setItem(KEY, u)
  } catch {
    /* частный режим: останется метрическая */
  }
}

const IN = 25.4
const FT_PER_M = 3.280839895
const SQFT_PER_M2 = 10.76391042

const trim = (n: number, dp: number) => String(Math.round(n * 10 ** dp) / 10 ** dp)

/** длина в мм → строка для показа (мм целые, дюймы до сотых) */
export const fmtLen = (mm: number, u: Units = currentUnits) => (u === 'in' ? trim(mm / IN, 2) : String(Math.round(mm)))
/** введённое пользователем число (в текущих единицах) → мм */
export const lenToMm = (v: number, u: Units = currentUnits) => (u === 'in' ? Math.round(v * IN) : Math.round(v))
export const lenUnit = (u: Units = currentUnits) => (u === 'in' ? 'in' : 'mm')
/** метры → м или футы */
export const fmtM = (m: number, u: Units = currentUnits) => (u === 'in' ? m * FT_PER_M : m)
export const mUnit = (u: Units = currentUnits) => (u === 'in' ? 'ft' : 'm')
/** м² → м² или кв. футы */
export const fmtM2 = (m2: number, u: Units = currentUnits) => (u === 'in' ? m2 * SQFT_PER_M2 : m2)
export const m2Unit = (u: Units = currentUnits) => (u === 'in' ? 'sq.ft' : 'm²')
/** подпись поля «…, mm» → в текущих единицах */
export const withLenUnit = (label: string, u: Units = currentUnits) => label.replace(/, mm$/, `, ${lenUnit(u)}`)
