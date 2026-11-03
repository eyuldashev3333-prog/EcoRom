import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { formatSum } from '../lib/pricing'
import { uz } from '../uz'

const t = uz.rules

interface Rule {
  id: string
  employee_id: string | null
  role: string | null
  stage_code: string | null
  basis: string
  series: string | null
  amount: number
  valid_from: string
  valid_to: string | null
  note: string | null
  employees: { full_name: string } | null
}
interface Stage {
  code: string
  name: string
}
interface Person {
  id: string
  full_name: string
}

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' })
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10)
const fmtD = (d: string) => d.split('-').reverse().join('.')
const stageBased = (b: string) => b === 'per_m2' || b === 'per_window'

// правила оплаты: кому, за что, сколько, с какой даты. Старые месяцы от смены ставки не меняются (действует правило на дату работы).
export default function PayRules() {
  const [rules, setRules] = useState<Rule[] | null>(null)
  const [stages, setStages] = useState<Stage[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [f, setF] = useState({ who: '', basis: 'salary', stage: '', series: '', amount: '', from: today(), note: '' })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('pay_rules').select('*, employees(full_name)').order('valid_from', { ascending: false })
    setRules(((data as unknown as Rule[]) ?? []).map((r) => ({ ...r, amount: Number(r.amount) })))
  }, [])
  useEffect(() => {
    load()
    supabase.from('stages').select('code, name').eq('is_active', true).order('sort').then(({ data }) => setStages((data as Stage[]) ?? []))
    supabase.from('employees').select('id, full_name').eq('is_active', true).order('full_name').then(({ data }) => setPeople((data as Person[]) ?? []))
  }, [load])

  const whoText = (r: Rule) => (r.employees?.full_name ?? (r.role ? t.roleAll[r.role] : '—'))
  const ruleText = (r: Rule) =>
    [
      t.basisNames[r.basis],
      stageBased(r.basis) && (r.stage_code ? stages.find((s) => s.code === r.stage_code)?.name ?? r.stage_code : t.anyStage),
      stageBased(r.basis) && r.series && t.seriesNames[r.series],
    ]
      .filter(Boolean)
      .join(' · ')

  const add = async () => {
    setMsg(null)
    const isRole = f.who.startsWith('role:')
    const amount = Number(f.amount.replace(',', '.').replace(/[^\d.]/g, ''))
    const { error } = await supabase.from('pay_rules').insert({
      employee_id: isRole || !f.who ? null : f.who,
      role: isRole ? f.who.slice(5) : null,
      basis: f.basis,
      stage_code: stageBased(f.basis) && f.stage ? f.stage : null,
      series: stageBased(f.basis) && f.series ? f.series : null,
      amount,
      valid_from: f.from,
      note: f.note.trim() || null,
    })
    if (error) return setMsg({ ok: false, text: error.message })
    setMsg({ ok: true, text: t.saved })
    setF({ ...f, amount: '', note: '' })
    load()
  }
  const end = async (r: Rule) => {
    const to = r.valid_from > today() ? r.valid_from : today()
    const { error } = await supabase.from('pay_rules').update({ valid_to: to }).eq('id', r.id)
    setMsg(error ? { ok: false, text: error.message } : null)
    load()
  }
  const change = async (r: Rule) => {
    const amount = window.prompt(`${whoText(r)} · ${ruleText(r)}\n${t.newAmount} (${t.units[r.basis]}):`, String(r.amount))
    if (amount === null) return
    const from = window.prompt(t.newFrom, today())
    if (!from) return
    const n = Number(amount.replace(',', '.').replace(/[^\d.]/g, ''))
    const stop = addDays(from, -1)
    if (stop < r.valid_from) return setMsg({ ok: false, text: `${t.from}: ${fmtD(r.valid_from)}+` })
    const up = await supabase.from('pay_rules').update({ valid_to: stop }).eq('id', r.id)
    if (up.error) return setMsg({ ok: false, text: up.error.message })
    const { error } = await supabase.from('pay_rules').insert({ employee_id: r.employee_id, role: r.role, stage_code: r.stage_code, basis: r.basis, series: r.series, amount: n, valid_from: from, note: r.note })
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: t.saved })
    load()
  }
  const del = async (r: Rule) => {
    if (!window.confirm(t.delConfirm)) return
    const { error } = await supabase.from('pay_rules').delete().eq('id', r.id)
    setMsg(error ? { ok: false, text: error.message } : null)
    load()
  }

  const now = today()
  const isActive = (r: Rule) => r.valid_from <= now && (!r.valid_to || r.valid_to >= now)
  const active = (rules ?? []).filter(isActive)
  const rest = (rules ?? []).filter((r) => !isActive(r))
  const row = (r: Rule) => (
    <div key={r.id} className="glass-row">
      <div className="inline wrap">
        <b>{whoText(r)}</b>
        <span>{ruleText(r)}</span>
        <span className="spacer" />
        <b>
          {r.basis === 'percent_sales' ? `${r.amount}%` : formatSum(r.amount)} <small className="muted">{r.basis === 'percent_sales' ? '' : t.units[r.basis]}</small>
        </b>
      </div>
      <small className="muted">
        {fmtD(r.valid_from)} — {r.valid_to ? fmtD(r.valid_to) : '…'}
        {r.note ? ` · ${r.note}` : ''}
      </small>
      <div className="inline wrap">
        {(!r.valid_to || r.valid_to >= now) && !['bonus', 'penalty'].includes(r.basis) && (
          <button className="ghost small-btn" onClick={() => change(r)}>
            {t.change}
          </button>
        )}
        {(!r.valid_to || r.valid_to > now) && r.valid_from <= now && (
          <button className="ghost small-btn" onClick={() => end(r)}>
            {t.end}
          </button>
        )}
        {r.valid_from > now && (
          <button className="ghost small-btn" onClick={() => del(r)}>
            {t.del}
          </button>
        )}
      </div>
    </div>
  )

  return (
    <>
      <p>
        <Link to="/payroll">←</Link>
      </p>
      <h1>{t.title}</h1>
      <p className="muted small">{t.hint}</p>
      {msg && <div className={msg.ok ? 'card note ok' : 'card note bad'}>{msg.text}</div>}

      <div className="card form">
        <h2>{t.add}</h2>
        <div className="grid3">
          <label>
            {t.who}
            <select value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })}>
              <option value="">—</option>
              {Object.entries(t.roleAll).map(([k, v]) => (
                <option key={k} value={`role:${k}`}>
                  {v}
                </option>
              ))}
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.basis}
            <select value={f.basis} onChange={(e) => setF({ ...f, basis: e.target.value })}>
              {Object.entries(t.basisNames).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.amount} ({t.units[f.basis]})
            <input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </label>
        </div>
        {stageBased(f.basis) && (
          <div className="grid2">
            <label>
              {t.stage}
              <select value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}>
                <option value="">{t.anyStage}</option>
                {stages.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.series}
              <select value={f.series} onChange={(e) => setF({ ...f, series: e.target.value })}>
                <option value="">{t.anySeries}</option>
                {Object.entries(t.seriesNames).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <div className="grid2">
          <label>
            {t.from}
            <input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
          </label>
          <label>
            {t.note}
            <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </label>
        </div>
        <button onClick={add} disabled={!f.who || !f.amount}>
          {t.add}
        </button>
      </div>

      {rules === null && <p className="muted">{uz.loading}</p>}
      <div className="card form">
        <h2>{t.active}</h2>
        {active.length === 0 && <p className="muted">{t.empty}</p>}
        {active.map(row)}
      </div>
      {rest.length > 0 && (
        <div className="card form">
          <h2>{t.ended}</h2>
          {rest.map(row)}
        </div>
      )}
    </>
  )
}
