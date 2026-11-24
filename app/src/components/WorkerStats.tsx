import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { formatSum } from '../lib/pricing'
import { uz } from '../uz'

const t = uz.payroll
const num = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')

export interface Stat {
  employee_id: string
  full_name: string
  role: string
  orders: number
  windows: number
  m2: number
  services: number
  absence_days: number
  absence_hours: number
  accrued: number
}

// кто сколько работал в месяце: заказы, окна, м², сервис, пропуски, начислено (не зависит от типа оплаты — оклад тоже виден)
export default function WorkerStats({ month, version }: { month: string; version?: number }) {
  const [rows, setRows] = useState<Stat[] | null>(null)
  useEffect(() => {
    setRows(null)
    supabase.rpc('worker_stats', { p_month: `${month}-01` }).then(({ data }) =>
      setRows(((data as Stat[]) ?? []).map((x) => ({ ...x, orders: Number(x.orders), windows: Number(x.windows), m2: Number(x.m2), services: Number(x.services), absence_days: Number(x.absence_days), absence_hours: Number(x.absence_hours), accrued: Number(x.accrued) }))),
    )
  }, [month, version])
  return (
    <div className="card">
      <h2>{t.statsTitle}</h2>
      {rows === null && <p className="muted">{uz.loading}</p>}
      {rows?.length === 0 && <p className="muted">{t.statsEmpty}</p>}
      {rows && rows.length > 0 && (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t.employee}</th>
                <th className="num">{t.doneOrders}</th>
                <th className="num">{t.doneWindows}</th>
                <th className="num">m²</th>
                <th className="num">{t.servicesDone}</th>
                <th className="num">{t.absences}</th>
                <th className="num">{t.accrued}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employee_id}>
                  <td>
                    {r.full_name}
                    <br />
                    <small className="muted">{uz.roles[r.role as keyof typeof uz.roles]}</small>
                  </td>
                  <td className="num">{r.orders}</td>
                  <td className="num">{r.windows}</td>
                  <td className="num">{num(r.m2)}</td>
                  <td className="num">{r.services}</td>
                  <td className="num">
                    {r.absence_days || r.absence_hours ? `${r.absence_days ? `${r.absence_days} ${t.dayShort}` : ''}${r.absence_days && r.absence_hours ? ' + ' : ''}${r.absence_hours ? `${num(r.absence_hours)} ${t.hourShort}` : ''}` : '—'}
                  </td>
                  <td className="num">{formatSum(r.accrued)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// сотрудник видит только свои цифры (RPC сама отдаёт только его строку)
export function MyStats({ month }: { month: string }) {
  const [r, setR] = useState<Stat | null | undefined>(undefined)
  useEffect(() => {
    setR(undefined)
    supabase.rpc('worker_stats', { p_month: `${month}-01` }).then(({ data }) => setR(((data as Stat[]) ?? [])[0] ?? null))
  }, [month])
  if (!r) return null
  return (
    <div className="card">
      <h3>{t.statsMine}</h3>
      <div className="grid3">
        <div className="card stat">
          <small>{t.doneOrders}</small>
          <b>{r.orders}</b>
        </div>
        <div className="card stat">
          <small>{t.doneWindows} · m²</small>
          <b>
            {r.windows} · {num(Number(r.m2))}
          </b>
        </div>
        <div className="card stat">
          <small>{t.absences}</small>
          <b>{Number(r.absence_days) || Number(r.absence_hours) ? `${Number(r.absence_days)} ${t.dayShort} ${Number(r.absence_hours) ? `+ ${num(Number(r.absence_hours))} ${t.hourShort}` : ''}` : '—'}</b>
        </div>
      </div>
    </div>
  )
}
