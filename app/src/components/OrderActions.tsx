import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { Confirm, Dialog } from './Dialog'
import type { CardData, WorkCard } from '../lib/orderCards'
import { uploadPhotos } from '../lib/photo'
import { uz } from '../uz'

// Кнопки под карточкой заказа: у каждой колонки и роли свои. После нажатия — onDone() (перезагрузка доски, карточка сразу переезжает).
const f = uz.flow
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' })

interface Person {
  id: string
  full_name: string
  telegram_id?: number | null
}

// ---------- Rahbar (канбан «Savdo») ----------
// compact — в канбане: только главная кнопка колонки; в карточке заказа — все
export function RahbarActions({ c, onDone, compact = false }: { c: CardData; onDone: () => void; compact?: boolean }) {
  // стекло — в блоке «Shisha» карточки заказа (там же размеры), здесь только движение заказа по колонкам
  const [dlg, setDlg] = useState<null | 'shop' | 'team' | 'install' | 'ready' | 'done'>(null)
  const [err, setErr] = useState<string | null>(null)
  const close = () => setDlg(null)
  const finish = () => {
    setDlg(null)
    onDone()
  }
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    setErr(null)
    const { error } = await supabase.rpc(fn, args)
    if (error) return setErr(error.message)
    finish()
  }
  if (c.imported || ['closed', 'cancelled', 'unknown'].includes(c.status)) return null
  return (
    <>
      {c.status === 'new' && <button type="button" onClick={() => setDlg('shop')}>{f.toShop}</button>}
      {c.status === 'in_production' && (
        <>
          {c.shop && c.shop.result !== 'enough' ? (
            // цех ответил «Material yetmaydi» — когда материал появится, заказ снова в цех
            <button type="button" onClick={() => setDlg('shop')}>{f.resend}</button>
          ) : (
            <button type="button" onClick={() => setDlg('ready')}>{f.ready}</button>
          )}
          {!compact && <button type="button" className="ghost" onClick={() => setDlg('team')}>{f.changeTeam}</button>}
        </>
      )}
      {c.status === 'ready' && <button type="button" onClick={() => setDlg('install')}>{f.install}</button>}
      {c.status === 'installing' && (
        <>
          <button type="button" onClick={() => setDlg('done')}>{f.installed}</button>
          {!compact && <button type="button" className="ghost" onClick={() => setDlg('install')}>{f.install}</button>}
        </>
      )}
      {err && <p className="warn small" style={{ flexBasis: '100%', margin: 0 }}>{err}</p>}

      {(dlg === 'shop' || dlg === 'team') && <ShopSendDialog c={c} kind={dlg} onClose={close} onDone={finish} />}
      {dlg === 'install' && <SendDialog kind="montaj" c={c} onClose={close} onDone={finish} />}
      {dlg === 'ready' && <Confirm title={`№${c.order_no}`} text={f.readyAsk} no={f.no} yes={f.ready} onNo={close} onYes={() => rpc('shop_ready', { p_order: c.id })} />}
      {dlg === 'done' && <GlassAskDialog c={c} onClose={close} onDone={finish} />}
    </>
  )
}

// ---------- цех ----------
export function ShopActions({ c, onDone }: { c: WorkCard; onDone: () => void }) {
  const [dlg, setDlg] = useState<null | 'reason' | 'ready'>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const answer = async (result: 'enough' | 'not_enough', text?: string) => {
    setBusy(true)
    setErr(null)
    const { data, error } = await supabase.rpc('shop_answer_web', { p_order: c.id, p_result: result, p_note: text ?? null })
    setBusy(false)
    if (error) return setErr(error.message)
    if (!data?.ok) return setErr(data?.error ?? uz.shop.taken)
    setDlg(null)
    onDone()
  }
  const ready = async () => {
    setBusy(true)
    setErr(null)
    const { error } = await supabase.rpc('shop_ready', { p_order: c.id })
    setBusy(false)
    if (error) return setErr(error.message)
    setDlg(null)
    onDone()
  }
  if (c.status !== 'in_production') return null
  return (
    <>
      {!c.shop && (
        <>
          <button type="button" disabled={busy} onClick={() => answer('enough')}>{f.accept}</button>
          <button type="button" className="ghost" disabled={busy} onClick={() => { setNote(''); setDlg('reason') }}>{f.noMaterial}</button>
        </>
      )}
      {c.accepted && <button type="button" disabled={busy} onClick={() => setDlg('ready')}>{f.ready}</button>}
      {err && <p className="warn small" style={{ flexBasis: '100%', margin: 0 }}>{err}</p>}
      {dlg === 'reason' && (
        <Dialog title={`№${c.order_no} · ${f.noMaterial}`} onClose={() => setDlg(null)}>
          <div className="form">
            <label>
              {f.whatMissing}
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
            </label>
            <div className="dialog-actions">
              <button type="button" className="ghost" onClick={() => setDlg(null)}>{f.cancel}</button>
              <button type="button" disabled={busy || !note.trim()} onClick={() => answer('not_enough', note.trim())}>{f.send}</button>
            </div>
          </div>
        </Dialog>
      )}
      {dlg === 'ready' && <Confirm title={`№${c.order_no}`} text={f.readyAsk} no={f.no} yes={f.ready} onNo={() => setDlg(null)} onYes={ready} />}
    </>
  )
}

// ---------- монтажник ----------
export function InstallActions({ c, onDone }: { c: WorkCard; onDone: () => void }) {
  const [dlg, setDlg] = useState<null | 'done' | 'glass'>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const accept = async () => {
    if (!c.job) return
    setBusy(true)
    setErr(null)
    const { data, error } = await supabase.rpc('install_accept', { p_job: c.job.id })
    setBusy(false)
    if (error) return setErr(error.message)
    if (!data?.ok) setErr(data?.error ?? null)
    onDone()
  }
  const glass = async () => {
    setBusy(true)
    setErr(null)
    const { error } = await supabase.rpc('order_glass', { p_order: c.id, p_status: 'installed' })
    setBusy(false)
    if (error) return setErr(error.message)
    setDlg(null)
    onDone()
  }
  const open = ['ready', 'installing'].includes(c.status)
  return (
    <>
      {open && !c.jobAccepted && <button type="button" disabled={busy} onClick={accept}>{f.accept}</button>}
      {open && <button type="button" className={c.jobAccepted ? '' : 'ghost'} disabled={busy} onClick={() => setDlg('done')}>{f.installed}</button>}
      {c.status === 'installed' && c.glass !== 'installed' && c.glassOrdered && <button type="button" disabled={busy} onClick={() => setDlg('glass')}>{f.glassInstalled}</button>}
      {err && <p className="warn small" style={{ flexBasis: '100%', margin: 0 }}>{err}</p>}
      {dlg === 'done' && <GlassAskDialog c={c} onClose={() => setDlg(null)} onDone={() => { setDlg(null); onDone() }} />}
      {dlg === 'glass' && <Confirm title={`№${c.order_no}`} text={`${f.glassInstalled}?`} no={f.no} yes={f.yes} onNo={() => setDlg(null)} onYes={glass} />}
    </>
  )
}

// «O'rnatildi»: фото установки (в системе — руководителям уйдёт само) + «Shisha o'rnatildimi? Ha / Yo'q».
// Если стекло ещё не заказано — «Ha» недоступно: «Shisha hali zakaz qilinmagan».
function GlassAskDialog({ c, onClose, onDone }: { c: CardData; onClose: () => void; onDone: () => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const done = async (glass: boolean) => {
    setBusy(true)
    setErr(null)
    let paths: string[] = []
    try {
      if (files.length) paths = await uploadPhotos(c.id, 'install', files)
      const { error } = await supabase.rpc('install_done', { p_order: c.id, p_glass: glass, p_photos: paths })
      if (error) {
        if (paths.length) await supabase.storage.from('install-photos').remove(paths)
        throw error
      }
      onDone()
    } catch (e) {
      setErr((e as Error).message)
    }
    setBusy(false)
  }
  return (
    <Dialog title={`№${c.order_no} — ${f.installed}`} onClose={onClose}>
      <div className="form">
        <label>
          {f.photoLabel}
          <input type="file" accept="image/*" capture="environment" multiple onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, 3))} />
        </label>
        {files.length > 0 && <p className="muted small">{files.length} {f.photoCount}</p>}
        {c.glassOrdered ? <p className="dialog-text">{f.glassAsk}</p> : <p className="warn">{f.glassNotOrdered}</p>}
        {err && <p className="warn">{err}</p>}
        <div className="dialog-actions">
          {c.glassOrdered ? (
            <>
              <button type="button" className="ghost" disabled={busy} onClick={() => done(false)}>{f.no}</button>
              <button type="button" disabled={busy} onClick={() => done(true)}>{f.yes}</button>
            </>
          ) : (
            <>
              <button type="button" className="ghost" disabled={busy} onClick={onClose}>{f.cancel}</button>
              <button type="button" disabled={busy} onClick={() => done(false)}>{f.installed}</button>
            </>
          )}
        </div>
        {busy && <p className="muted small">{uz.install.uploading}</p>}
      </div>
    </Dialog>
  )
}
// выбор людей: вся команда или галочками
function TeamPicker({ people, all, sel, onAll, onToggle, allLabel }: { people: Person[]; all: boolean; sel: Set<string>; onAll: (v: boolean) => void; onToggle: (id: string) => void; allLabel: string }) {
  return (
    <div className="team-picker">
      <div className="seg">
        <button type="button" className={all ? 'on' : ''} onClick={() => onAll(true)}>
          {allLabel} ({people.length})
        </button>
        <button type="button" className={all ? '' : 'on'} onClick={() => onAll(false)}>
          {uz.shop.pickPeople}
        </button>
      </div>
      {!all && (
        <div className="team-list">
          {people.map((w) => (
            <label key={w.id} className="check">
              <input type="checkbox" checked={sel.has(w.id)} onChange={() => onToggle(w.id)} />
              {w.full_name}
              {w.telegram_id === null && <small className="muted"> · {uz.shop.noBot}</small>}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// «Zavodga yuborish» / «Xodimlarni o'zgartirish»
function ShopSendDialog({ c, kind, onClose, onDone }: { c: CardData; kind: 'shop' | 'team'; onClose: () => void; onDone: () => void }) {
  const [workers, setWorkers] = useState<Person[] | null>(null)
  const [all, setAll] = useState(true)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    ;(async () => {
      const [{ data: w }, { data: st }] = await Promise.all([
        supabase.from('employees').select('id, full_name, telegram_id').eq('role', 'ishlab').eq('is_active', true).order('full_name'),
        kind === 'team' ? supabase.rpc('shop_state', { p_order: c.id }) : Promise.resolve({ data: null }),
      ])
      setWorkers((w as Person[]) ?? [])
      const s = st as { team_all: boolean; team: { id: string }[] } | null
      if (s && !s.team_all) {
        setAll(false)
        setSel(new Set(s.team.map((x) => x.id)))
      }
    })()
  }, [c.id, kind])
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const chosen = all ? (workers ?? []).map((w) => w.id) : (workers ?? []).filter((w) => sel.has(w.id)).map((w) => w.id)

  const submit = async () => {
    if (!chosen.length) return setErr(uz.shop.pickOne)
    setErr(null)
    if (kind === 'team') {
      setBusy(true)
      const { error } = await supabase.rpc('shop_set_workers', { p_order: c.id, p_workers: chosen })
      setBusy(false)
      return error ? setErr(error.message) : onDone()
    }
    const linked = (workers ?? []).filter((w) => chosen.includes(w.id) && w.telegram_id).length
    if (!linked && !window.confirm(uz.shop.noRecipientsAsk)) return
    setBusy(true)
    let { error } = await supabase.rpc('send_to_shop', { p_order: c.id, p_workers: chosen })
    if (error?.message.startsWith('NARX_NOL') && window.confirm(uz.shop.zeroPriceAsk)) ({ error } = await supabase.rpc('send_to_shop', { p_order: c.id, p_force: true, p_workers: chosen }))
    setBusy(false)
    if (error) return setErr(error.message.replace('NARX_NOL: ', ''))
    onDone()
  }

  return (
    <Dialog title={`№${c.order_no} · ${c.client} — ${kind === 'shop' ? (c.status === 'new' ? f.toShop : f.resend) : f.changeTeam}`} onClose={onClose}>
      <div className="form">
        <b>{f.whoWorks}</b>
        {workers === null && <p className="muted">{uz.loading}</p>}
        {workers && workers.length === 0 && <p className="warn">{f.noShopWorkers}</p>}
        {workers && workers.length > 0 && <TeamPicker people={workers} all={all} sel={sel} onAll={setAll} onToggle={toggle} allLabel={uz.shop.wholeTeam} />}
        {err && <p className="warn">{err}</p>}
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={onClose}>{f.cancel}</button>
          <button type="button" disabled={busy || !workers?.length || !chosen.length} onClick={submit}>
            {kind === 'shop' ? f.toShop : uz.shop.save}
          </button>
        </div>
      </div>
    </Dialog>
  )
}

// «O'rnatish» (дата + бригада) и «Servis» (проблема + исполнитель)
export function SendDialog({ kind, c, onClose, onDone }: { kind: 'montaj' | 'servis'; c: CardData; onClose: () => void; onDone: () => void }) {
  const t = uz.install
  const [men, setMen] = useState<Person[] | null>(null)
  const [date, setDate] = useState(kind === 'montaj' ? c.job?.plan_date ?? today() : '')
  const [note, setNote] = useState('')
  const [all, setAll] = useState(!c.job?.crew.length)
  const [sel, setSel] = useState<Set<string>>(new Set(c.job?.crew ?? []))
  const [one, setOne] = useState('') // сервис: '' = всем монтажникам
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    supabase.from('employees').select('id, full_name').eq('role', 'montajchi').eq('is_active', true).order('full_name').then(({ data }) => setMen((data as Person[]) ?? []))
  }, [])
  const toggle = (id: string) => setSel((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const list = men ?? []

  const submit = async () => {
    setBusy(true)
    setErr(null)
    let error: { message: string } | null
    if (kind === 'montaj') {
      const crew = all ? list.map((m) => m.id) : [...sel]
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
        {men && list.length === 0 && <p className="warn">{t.noCrew}</p>}
        <label>
          {kind === 'montaj' ? t.date : uz.service.due}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          {kind === 'montaj' ? t.note : t.problem}
          {kind === 'montaj' ? <input value={note} onChange={(e) => setNote(e.target.value)} /> : <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}
        </label>
        {kind === 'montaj' ? (
          list.length > 0 && <TeamPicker people={list} all={all} sel={sel} onAll={setAll} onToggle={toggle} allLabel={t.wholeCrew} />
        ) : (
          <label>
            {t.crew}
            <select value={one} onChange={(e) => setOne(e.target.value)}>
              <option value="">{t.anyone}</option>
              {list.map((m) => (
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
          <button type="button" disabled={busy || (kind === 'montaj' ? !date || (!all && sel.size === 0) || list.length === 0 : !note.trim())} onClick={submit}>
            {kind === 'montaj' ? t.sendJob : t.sendService}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
