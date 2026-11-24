import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { whenText } from './OrderCard'
import { uz } from '../uz'

interface Row {
  id: string
  status: string
  at: string
  employees: { full_name: string } | null
}

// История статусов заказа для руководителя: какой статус, когда и кто поставил
export default function StatusHistory({ orderId }: { orderId: string }) {
  const [rows, setRows] = useState<Row[]>([])
  useEffect(() => {
    supabase.from('order_status_log').select('id, status, at, employees(full_name)').eq('order_id', orderId).order('at').then(({ data }) => setRows((data as unknown as Row[]) ?? []))
  }, [orderId])
  if (!rows.length) return null
  return (
    <div className="card">
      <h2>{uz.mywork.history}</h2>
      <table className="kv">
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <span className={`status s-${r.status}`}>{uz.order.statuses[r.status] ?? r.status}</span>
              </td>
              <td className="muted small">{r.employees?.full_name ?? ''}</td>
              <td>{whenText(r.at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
