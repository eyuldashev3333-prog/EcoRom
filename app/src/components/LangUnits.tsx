import { LANGS, currentLang, saveLang, type Lang } from '../lib/i18n'
import { currentUnits, saveUnits, type Units } from '../lib/units'

// Язык интерфейса и единицы измерения: сохраняются в браузере, применяются после перезагрузки страницы.
export default function LangUnits() {
  const pickLang = (l: Lang) => {
    if (l === currentLang) return
    saveLang(l)
    window.location.reload()
  }
  const pickUnits = (u: Units) => {
    if (u === currentUnits) return
    saveUnits(u)
    window.location.reload()
  }
  return (
    <section className="card form">
      <h2>Til · Язык · Language</h2>
      <div className="inline wrap" role="radiogroup" aria-label="Language">
        {LANGS.map((l) => (
          <button key={l.code} type="button" role="radio" aria-checked={currentLang === l.code} className={currentLang === l.code ? '' : 'ghost'} onClick={() => pickLang(l.code)}>
            {l.label}
          </button>
        ))}
      </div>
      <p className="muted small">Konstruktor, narxlar, chop etish · Конструктор, прайсы, печать · Designer, prices, printing</p>
      <h2>mm · m · m² / in · ft · sq.ft</h2>
      <div className="inline wrap" role="radiogroup" aria-label="Units">
        <button type="button" role="radio" aria-checked={currentUnits === 'mm'} className={currentUnits === 'mm' ? '' : 'ghost'} onClick={() => pickUnits('mm')}>
          mm, m, m²
        </button>
        <button type="button" role="radio" aria-checked={currentUnits === 'in'} className={currentUnits === 'in' ? '' : 'ghost'} onClick={() => pickUnits('in')}>
          in, ft, sq.ft
        </button>
      </div>
    </section>
  )
}
