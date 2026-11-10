import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { uz } from '../uz'

const t = uz.shop

interface Check {
  id: string
  result: string
  note: string | null
  created_at: string
  employee_id: string
  employees: { full_name: string } | null
}
interface Worker {
  id: string
  full_name: string
  telegram_id: number | null
}

const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

// заказ → цех: кнопка «Sexga yuborish» и ответы каждого «Yetadi / Yetmaydi / Brak» (из бота)
export default function ShopCheck({ orderId, status, hasItems, onChanged }: { orderId: string; status: string; hasItems: boolean; onChanged: () => void }) {
  const [sentAt, setSentAt] = useState<string | null>(null)
  const [checks, setChecks] = useState<Check[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [o, c, w] = await Promise.all([
      supabase.from('orders').select('shop_sent_at').eq('id', orderId).maybeSingle(),
      supabase.from('order_material_checks').select('id, result, note, created_at, employee_id, employees(full_name)').eq('order_id', orderId).order('created_at', { ascending: false }),
      supabase.from('employees').select('id, full_name, telegram_id').eq('role', 'ishlab').eq('is_active', true).order('full_name'),
    ])
    setSentAt(o.data?.shop_sent_at ?? null)
    setChecks((c.data as unknown as Check[]) ?? [])
    setWorkers((w.data as Worker[]) ?? [])
  }, [orderId])
  useEffect(() => {
    load()
  }, [load])

  const canSend = status === 'new' || status === 'in_production'
  if (!sentAt && !canSend) return null

  const send = async () => {
    if (sentAt && !window.confirm(t.resendConfirm)) return
    const { count: linked } = await supabase.from('employees').select('id', { count: 'exact', head: true }).eq('role', 'ishlab').eq('is_active', true).not('telegram_id', 'is', null)
    if (!linked && !window.confirm(t.noRecipientsAsk)) return
    setBusy(true)
    let { data, error } = await supabase.rpc('send_to_shop', { p_order: orderId })
    if (error?.message.startsWith('NARX_NOL') && window.confirm(t.zeroPriceAsk)) ({ data, error } = await supabase.rpc('send_to_shop', { p_order: orderId, p_force: true }))
    if (!error) {
      await load()
      onChanged()
    }
    setBusy(false)
    setMsg(error ? { ok: false, text: error.message.replace('NARX_NOL: ', '') } : data?.recipients ? { ok: true, text: t.sent } : { ok: false, text: t.noRecipients })
  }

  const current = sentAt ? checks.filter((c) => c.created_at >= sentAt) : []
  const latest = current[0]
  const answered = new Set(current.map((c) => c.employee_id))
  const silent = workers.filter((w) => !answered.has(w.id))

  return (
    <div className="card form">
      <h2>{t.title}</h2>
      {msg && <div className={msg.ok ? 'note ok' : 'note bad'}>{msg.text}</div>}
      {sentAt && (
        <>
          <div className={`shop-state ${latest?.result ?? ''}`}>
            {latest ? `${t.state[latest.result]} — ${latest.employees?.full_name}${latest.note ? `: ${latest.note}` : ''}` : t.waiting}
          </div>
          <p className="muted small">
            {t.sentAt}: {when(sentAt)}
            {silent.length > 0 && ` · ${t.silent}: ${silent.map((w) => w.full_name).join(', ')}`}
          </p>
          {checks.length > 0 && (
            <table className="kv checks">
              <tbody>
                {checks.map((c) => (
                  <tr key={c.id} className={c.created_at < sentAt ? 'old' : ''} title={c.created_at < sentAt ? t.old : undefined}>
                    <td>{when(c.created_at)}</td>
                    <td>
                      {c.employees?.full_name}
                      {c.note ? ` — ${c.note}` : ''}
                    </td>
                    <td className={c.result}>{t.answers[c.result]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {canSend && (
        <>
          <button type="button" className={sentAt ? 'ghost' : ''} onClick={send} disabled={busy || !hasItems}>
            {sentAt ? t.resend : t.send}
          </button>
          <p className="muted small">{t.sendHint}</p>
        </>
      )}
    </div>
  )
}
