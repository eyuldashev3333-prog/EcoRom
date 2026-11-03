import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import BreakageList from '../components/BreakageList'
import { formatSum } from '../lib/pricing'
import { uz } from '../uz'

const t = uz.breakage

// бой стекла за месяц: потери по тому, кто платит (основа экрана утечек Фазы 4)
export default function Breakages() {
  const [all, setAll] = useState(false)
  const [rows, setRows] = useState<{ payer: string; amount: number }[]>([])
  const first = new Date()
  first.setDate(1)
  const since = all ? undefined : first.toISOString().slice(0, 10)
  const onChanged = useCallback((r: { payer: string; amount: number }[]) => setRows(r), [])
  const total = rows.reduce((s, r) => s + r.amount, 0)

  return (
    <>
      <p>
        <Link to="/">←</Link>
      </p>
      <div className="inline head">
        <h1>{t.title}</h1>
        <label className="check">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> {uz.glass.all}
        </label>
      </div>
      <div className="grid">
        <div className="card stat">
          <small>
            {t.total} ({all ? uz.glass.all : t.month})
          </small>
          <b className={total > 0 ? 'debt-tag' : ''}>{formatSum(total)} so‘m</b>
        </div>
        {Object.entries(t.payers).map(([k, v]) => (
          <div key={k} className="card stat">
            <small>{v}</small>
            <b>{formatSum(rows.filter((r) => r.payer === k).reduce((s, r) => s + r.amount, 0))} so‘m</b>
          </div>
        ))}
      </div>
      <BreakageList since={since} onChanged={onChanged} />
    </>
  )
}
