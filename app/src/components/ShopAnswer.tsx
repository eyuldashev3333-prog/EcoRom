import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { uz } from '../uz'
import type { ShopState } from './ShopCheck'

const t = uz.shop

// сотрудник цеха: ответ «Qabul qildim / Material yetmaydi / Brak». Записывается только первый ответ, остальным показывается, кто успел.
export default function ShopAnswer({ orderId, onChanged }: { orderId: string; onChanged?: () => void }) {
  const [st, setSt] = useState<ShopState | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [reason, setReason] = useState<{ result: string; text: string } | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('shop_state', { p_order: orderId })
    setSt((data as ShopState | null) ?? null)
  }, [orderId])
  useEffect(() => {
    load()
  }, [load])

  if (!st) return null

  const answer = async (result: string, note?: string) => {
    setBusy(true)
    const { data, error } = await supabase.rpc('shop_answer_web', { p_order: orderId, p_result: result, p_note: note ?? null })
    setBusy(false)
    setReason(null)
    if (error) setMsg({ ok: false, text: error.message })
    else if (!data?.ok) setMsg({ ok: false, text: data?.error ?? t.taken })
    else setMsg({ ok: true, text: t.answered })
    await load()
    onChanged?.()
  }

  const first = st.first
  return (
    <div className="card form">
      <h2>{t.title}</h2>
      {msg && <div className={msg.ok ? 'note ok' : 'note bad'}>{msg.text}</div>}
      {first ? (
        <div className={`shop-state ${first.result}`}>
          {first.result === 'enough' ? `${t.accepted}: ${first.name}` : `${t.state[first.result]} — ${first.name}`}
          {first.note ? `: ${first.note}` : ''}
        </div>
      ) : (
        <>
          <div className="shop-state">{t.waitingYou}</div>
          {reason ? (
            <div className="card note">
              <b>{t.reasonAsk}</b>
              <input value={reason.text} onChange={(e) => setReason({ ...reason, text: e.target.value })} autoFocus />
              <div className="inline wrap">
                <button type="button" disabled={busy} onClick={() => answer(reason.result, reason.text)}>
                  {t.save}
                </button>
                <button type="button" className="ghost" onClick={() => setReason(null)}>
                  {t.cancel}
                </button>
              </div>
            </div>
          ) : (
            <div className="inline wrap">
              <button type="button" disabled={busy} onClick={() => answer('enough')}>
                {t.accept}
              </button>
              <button type="button" className="ghost" disabled={busy} onClick={() => setReason({ result: 'not_enough', text: '' })}>
                {t.noMaterial}
              </button>
              <button type="button" className="ghost" disabled={busy} onClick={() => setReason({ result: 'defect', text: '' })}>
                {t.defect}
              </button>
            </div>
          )}
        </>
      )}
      <p className="muted small">
        {t.team}: {st.team_all ? t.wholeTeam : st.team.map((x) => x.name).join(', ')}
      </p>
    </div>
  )
}
