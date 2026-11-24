import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import OrderCard from './OrderCard'
import { Dialog } from './Dialog'
import { useOrderCards, type CardData } from '../lib/orderCards'
import { uz } from '../uz'

const t = uz.install
const sv = uz.service
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' })
const CAN_INSTALL = ['in_production', 'ready', 'installing']
const CAN_SERVICE = ['installed', 'closed', 'unknown']

interface Man {
  id: string
  full_name: string
}

// Montaj va servis: слева «Mijozlar ro'yxati» (все клиенты-заказы), справа «Montajda». Под карточкой кнопки «Montaj» / «Servis».
export default function MontajBoard() {
  const { cards, names, reload } = useOrderCards()
  const [men, setMen] = useState<Man[]>([])
  const [q, setQ] = useState('')
  const [dlg, setDlg] = useState<{ kind: 'montaj' | 'servis'; c: CardData } | null>(null)

  useEffect(() => {
    supabase.from('employees').select('id, full_name').eq('role', 'montajchi').eq('is_active', true).order('full_name').then(({ data }) => setMen((data as Man[]) ?? []))
  }, [])

  const s = q.trim().toLowerCase()
  const { list, inWork } = useMemo(() => {
    const live = (cards ?? []).filter((c) => c.status !== 'cancelled')
    const isWork = (c: CardData) => (c.job && c.job.status !== 'done') || c.status === 'installing' || c.openService > 0
    const match = (c: CardData) => !s || String(c.order_no).includes(s) || c.client.toLowerCase().includes(s) || (c.phone ?? '').includes(s) || (c.address ?? '').toLowerCase().includes(s)
    return {
      inWork: live.filter((c) => isWork(c) && match(c)),
      list: live.filter((c) => !isWork(c) && match(c)).slice(0, s ? 60 : 30),
    }
  }, [cards, s])

  const actions = (c: CardData) => (
    <>
      <button type="button" className="ghost" disabled={!CAN_INSTALL.includes(c.status)} title={CAN_INSTALL.includes(c.status) ? undefined : t.notNow} onClick={() => setDlg({ kind: 'montaj', c })}>
        {t.montajBtn}
      </button>
      <button type="button" className="ghost" disabled={!CAN_SERVICE.includes(c.status)} title={CAN_SERVICE.includes(c.status) ? undefined : t.notNow} onClick={() => setDlg({ kind: 'servis', c })}>
        {t.serviceBtn}
      </button>
    </>
  )

  return (
    <>
      <input className="search" placeholder={uz.order.search} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />
      {cards === null && <p className="muted">{uz.loading}</p>}
      {cards && (
        <div className="montaj-board">
          <section className="kcol">
            <header>
              <span>{t.listCol}</span>
              <b>{list.length}</b>
            </header>
            {list.length === 0 && <div className="kempty">—</div>}
            {list.map((c) => (
              <OrderCard key={c.id} c={c} names={names}>
                {actions(c)}
              </OrderCard>
            ))}
          </section>
          <section className="kcol">
            <header>
              <span>{t.jobsCol}</span>
              <b>{inWork.length}</b>
            </header>
            {inWork.length === 0 && <div className="kempty">—</div>}
            {inWork.map((c) => (
              <OrderCard key={c.id} c={c} names={names}>
                {actions(c)}
              </OrderCard>
            ))}
          </section>
        </div>
      )}
      {dlg && (
        <SendDialog
          kind={dlg.kind}
          c={dlg.c}
          men={men}
          onClose={() => setDlg(null)}
          onDone={() => {
            setDlg(null)
            reload()
          }}
        />
      )}
    </>
  )
}

function SendDialog({ kind, c, men, onClose, onDone }: { kind: 'montaj' | 'servis'; c: CardData; men: Man[]; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState(kind === 'montaj' ? c.job?.plan_date ?? today() : '')
  const [note, setNote] = useState('')
  const [all, setAll] = useState(true)
  const [sel, setSel] = useState<Set<string>>(new Set(c.job?.crew ?? []))
  const [one, setOne] = useState('') // сервис: '' = всем монтажникам
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const toggle = (id: string) => setSel((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const submit = async () => {
    setBusy(true)
    setErr(null)
    let error: { message: string } | null
    if (kind === 'montaj') {
      const crew = all ? men.map((m) => m.id) : [...sel]
      ;({ error } = await supabase.rpc('assign_install', { p_order: c.id, p_date: date, p_members: crew, p_note: note }))
    } else {
      ;({ error } = await supabase.rpc('create_service', { p_order: c.id, p_item: null, p_description: note, p_due: date || null, p_assignee: one || null, p_photos: [] }))
    }
    setBusy(false)
    if (error) return setErr(error.message)
    onDone()
  }

  return (
    <Dialog title={`№${c.order_no} · ${c.client} — ${kind === 'montaj' ? t.sendJob : t.sendService}`} onClose={onClose}>
      <div className="form">
        {men.length === 0 && <p className="warn">{t.noCrew}</p>}
        <label>
          {kind === 'montaj' ? t.date : sv.due}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          {kind === 'montaj' ? t.note : t.problem}
          {kind === 'montaj' ? <input value={note} onChange={(e) => setNote(e.target.value)} /> : <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}
        </label>
        {kind === 'montaj' ? (
          <div className="team-picker">
            <div className="seg">
              <button type="button" className={all ? 'on' : ''} onClick={() => setAll(true)}>
                {t.wholeCrew} ({men.length})
              </button>
              <button type="button" className={all ? '' : 'on'} onClick={() => setAll(false)}>
                {uz.shop.pickPeople}
              </button>
            </div>
            {!all && (
              <div className="team-list">
                {men.map((m) => (
                  <label key={m.id} className="check">
                    <input type="checkbox" checked={sel.has(m.id)} onChange={() => toggle(m.id)} />
                    {m.full_name}
                  </label>
                ))}
              </div>
            )}
          </div>
        ) : (
          <label>
            {t.crew}
            <select value={one} onChange={(e) => setOne(e.target.value)}>
              <option value="">{t.anyone}</option>
              {men.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </label>
        )}
        {err && <p className="warn">{err}</p>}
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={onClose}>
            {uz.shop.cancel}
          </button>
          <button type="button" disabled={busy || (kind === 'montaj' ? !date || (!all && sel.size === 0) || men.length === 0 : !note.trim())} onClick={submit}>
            {kind === 'montaj' ? t.sendJob : t.sendService}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
