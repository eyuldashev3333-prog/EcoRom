// Выбор месяца на узбекском (браузерный <input type="month"> показывает язык системы, например «Ноябрь»).
// Значение — строка 'YYYY-MM', как у обычного input, поэтому экраны почти не меняются.
const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr']

export default function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [y, m] = value.split('-').map(Number)
  const now = new Date().getFullYear()
  const years: number[] = []
  for (let i = Math.min(y, 2024); i <= Math.max(y, now + 1); i++) years.push(i)
  const set = (yy: number, mm: number) => onChange(`${yy}-${String(mm).padStart(2, '0')}`)
  return (
    <span className="monthpick">
      <select value={m} onChange={(e) => set(y, Number(e.target.value))} aria-label="Oy">
        {MONTHS.map((n, i) => (
          <option key={n} value={i + 1}>{n}</option>
        ))}
      </select>
      <select value={y} onChange={(e) => set(Number(e.target.value), m)} aria-label="Yil">
        {years.map((yy) => (
          <option key={yy} value={yy}>{yy}</option>
        ))}
      </select>
    </span>
  )
}
