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
export interface ShopState {
  sent_at: string
  team_all: boolean
  team: { id: string; name: string }[]
  first: { id: string; name: string; result: string; note: string | null; at: string } | null
  late: { name: string; result: string; at: string }[]
}

const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

// выбор: вся команда Ishlab chiqarish или отдельные люди (одного, нескольких или всех галочками)
function TeamPicker({ workers, all, sel, onAll, onToggle }: { workers: Worker[]; all: boolean; sel: Set<string>; onAll: (v: boolean) => void; onToggle: (id: string) => void }) {
  return (
    <div className="team-picker">
      <div className="seg">
        <button type="button" className={all ? 'on' : ''} onClick={() => onAll(true)}>
          {t.wholeTeam} ({workers.length})
        </button>
        <button type="button" className={all ? '' : 'on'} onClick={() => onAll(false)}>
          {t.pickPeople}
        </button>
      </div>
      {!all && (
        <div className="team-list">
          {workers.map((w) => (
            <label key={w.id} className="check">
              <input type="checkbox" checked={sel.has(w.id)} onChange={() => onToggle(w.id)} />
              {w.full_name}
              {!w.telegram_id && <small className="muted"> · {t.noBot}</small>}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// заказ → цех: выбор, кто работает над заказом, отправка и ответы цеха (кто первый ответил — тот записан)
export default function ShopCheck({ orderId, status, hasItems, onChanged, openOnMount }: { orderId: string; status: string; hasItems: boolean; onChanged: () => void; openOnMount?: boolean }) {
  const [sentAt, setSentAt] = useState<string | null>(null)
  const [checks, setChecks] = useState<Check[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [state, setState] = useState<ShopState | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [picker, setPicker] = useState<null | 'send' | 'edit'>(openOnMount ? 'send' : null)
  const [all, setAll] = useState(true)
  const [sel, setSel] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    const [o, c, w, st] = await Promise.all([
      supabase.from('orders').select('shop_sent_at').eq('id', orderId).maybeSingle(),
      supabase.from('order_material_checks').select('id, result, note, created_at, employee_id, employees(full_name)').eq('order_id', orderId).order('created_at', { ascending: false }),
      supabase.from('employees').select('id, full_name, telegram_id').eq('role', 'ishlab').eq('is_active', true).order('full_name'),
      supabase.rpc('shop_state', { p_order: orderId }),
    ])
    setSentAt(o.data?.shop_sent_at ?? null)
    setChecks((c.data as unknown as Check[]) ?? [])
    setWorkers((w.data as Worker[]) ?? [])
    setState((st.data as ShopState | null) ?? null)
  }, [orderId])
  useEffect(() => {
    load()
  }, [load])

  const canSend = status === 'new' || status === 'in_production'
  if (!sentAt && !canSend) return null

  const openPicker = (kind: 'send' | 'edit') => {
    // подставляем текущий выбор: у отправленного заказа — его команда, иначе вся команда
    if (state && !state.team_all) {
      setAll(false)
      setSel(new Set(state.team.map((x) => x.id)))
    } else {
      setAll(true)
      setSel(new Set(workers.map((x) => x.id)))
    }
    setPicker(kind)
  }
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const chosen = all ? workers.map((w) => w.id) : workers.filter((w) => sel.has(w.id)).map((w) => w.id)

  const send = async () => {
    if (!chosen.length) return setMsg({ ok: false, text: t.pickOne })
    if (sentAt && !window.confirm(t.resendConfirm)) return
    const linked = workers.filter((w) => chosen.includes(w.id) && w.telegram_id).length
    if (!linked && !window.confirm(t.noRecipientsAsk)) return
    setBusy(true)
    let { data, error } = await supabase.rpc('send_to_shop', { p_order: orderId, p_workers: chosen })
    if (error?.message.startsWith('NARX_NOL') && window.confirm(t.zeroPriceAsk)) ({ data, error } = await supabase.rpc('send_to_shop', { p_order: orderId, p_force: true, p_workers: chosen }))
    if (!error) {
      setPicker(null)
      await load()
      onChanged()
    }
    setBusy(false)
    setMsg(error ? { ok: false, text: error.message.replace('NARX_NOL: ', '') } : data?.recipients ? { ok: true, text: t.sent } : { ok: false, text: t.noRecipients })
  }
  const saveTeam = async () => {
    if (!chosen.length) return setMsg({ ok: false, text: t.pickOne })
    setBusy(true)
    const { error } = await supabase.rpc('shop_set_workers', { p_order: orderId, p_workers: chosen })
    setBusy(false)
    if (!error) {
      setPicker(null)
      await load()
    }
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: t.teamSaved })
  }

  const current = sentAt ? checks.filter((c) => c.created_at >= sentAt) : []
  const first = state?.first ?? null
  const teamText = state ? (state.team_all ? t.wholeTeam : state.team.map((x) => x.name).join(', ')) : ''

  return (
    <div className="card form">
      <h2>{t.title}</h2>
      {msg && <div className={msg.ok ? 'note ok' : 'note bad'}>{msg.text}</div>}
      {sentAt && (
        <>
          <div className={`shop-state ${first?.result ?? ''}`}>
            {first ? `${t.state[first.result]} — ${first.name}${first.note ? `: ${first.note}` : ''}` : t.waiting}
          </div>
          <p className="muted small">
            {t.sentAt}: {when(sentAt)}
            {teamText && ` · ${t.team}: ${teamText}`}
          </p>
          {current.length > 0 && (
            <table className="kv checks">
              <tbody>
                {current.map((c) => (
                  <tr key={c.id}>
                    <td>{when(c.created_at)}</td>
                    <td>
                      {c.employees?.full_name}
                      {c.note ? ` — ${c.note}` : ''}
                    </td>
                    <td className={c.result}>{t.answers[c.result]}</td>
                  </tr>
                ))}
                {(state?.late ?? []).map((l, i) => (
                  <tr key={`late${i}`} className="old" title={t.lateHint}>
                    <td>{when(l.at)}</td>
                    <td>{l.name} — {t.late}</td>
                    <td>{t.answers[l.result]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {picker && (
        <div className="card note">
          <b>{t.whoWorks}</b>
          <TeamPicker workers={workers} all={all} sel={sel} onAll={setAll} onToggle={toggle} />
          <div className="inline wrap">
            <button type="button" onClick={picker === 'send' ? send : saveTeam} disabled={busy || !hasItems}>
              {picker === 'send' ? (sentAt ? t.resend : t.send) : t.save}
            </button>
            <button type="button" className="ghost" onClick={() => setPicker(null)}>
              {t.cancel}
            </button>
          </div>
        </div>
      )}
      {canSend && !picker && (
        <>
          <div className="inline wrap">
            <button type="button" className={sentAt ? 'ghost' : ''} onClick={() => openPicker('send')} disabled={busy || !hasItems}>
              {sentAt ? t.resend : t.send}
            </button>
            {sentAt && status === 'in_production' && (
              <button type="button" className="ghost" onClick={() => openPicker('edit')} disabled={busy}>
                {t.changeTeam}
              </button>
            )}
          </div>
          <p className="muted small">{t.sendHint}</p>
        </>
      )}
    </div>
  )
}
