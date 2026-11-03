import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import WindowEditor, { PRESETS } from '../components/WindowEditor'
import WindowSvg from '../components/WindowSvg'
import ItemOptionsForm from '../components/ItemOptionsForm'
import { colorHex, useCatalog } from '../lib/catalog'
import { formatSum, profit, suggestedPrice } from '../lib/pricing'
import { quoteItem, type ItemOptions } from '../lib/quote'
import { measure, type WindowDesign } from '../lib/window'
import { uz } from '../uz'

const t = uz.order

interface ItemDraft {
  id?: string
  key: string
  title: string
  qty: number
  design: WindowDesign
  options: ItemOptions
  note: string
}
interface ClientDraft {
  id?: string
  full_name: string
  phone: string
  address: string
}
interface ClientRow {
  id: string
  full_name: string
  phone: string | null
  address: string | null
}

const newKey = () => Math.random().toString(36).slice(2)
const roundDown1000 = (n: number) => Math.floor(n / 1000) * 1000

export default function OrderEdit() {
  const { id } = useParams()
  const nav = useNavigate()
  const catalog = useCatalog()
  const [orderNo, setOrderNo] = useState<number | null>(null)
  const [status, setStatus] = useState('new')
  const [client, setClient] = useState<ClientDraft>({ full_name: '', phone: '', address: '' })
  const [clients, setClients] = useState<ClientRow[]>([])
  const [address, setAddress] = useState('')
  const [deadline, setDeadline] = useState('')
  const [notes, setNotes] = useState('')
  const [discount, setDiscount] = useState(0)
  const [contract, setContract] = useState('')
  const [items, setItems] = useState<ItemDraft[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.from('clients').select('id, full_name, phone, address').order('full_name').limit(2000).then(({ data }) => setClients((data as ClientRow[]) ?? []))
  }, [])

  useEffect(() => {
    if (!id) return
    ;(async () => {
      const { data: o } = await supabase.from('orders').select('*, clients(id, full_name, phone, address)').eq('id', id).maybeSingle()
      if (!o) return setMsg({ ok: false, text: t.notFound })
      setOrderNo(o.order_no)
      setStatus(o.status)
      setClient({ id: o.clients.id, full_name: o.clients.full_name, phone: o.clients.phone ?? '', address: o.clients.address ?? '' })
      setAddress(o.address ?? '')
      setDeadline(o.deadline ?? '')
      setNotes(o.notes ?? '')
      setDiscount(Number(o.discount_pct))
      setContract(String(Number(o.contract_price) || ''))
      const { data: its } = await supabase.from('order_items').select('id, pos, title, qty, design, options, note').eq('order_id', id).order('pos')
      setItems(((its as { id: string; title: string | null; qty: number; design: WindowDesign; options: ItemOptions; note: string | null }[]) ?? []).map((x) => ({ id: x.id, key: newKey(), title: x.title ?? '', qty: x.qty, design: x.design, options: x.options ?? {}, note: x.note ?? '' })))
    })()
  }, [id])

  // расчёт каждой позиции
  const calc = useMemo(
    () =>
      items.map((it) => {
        const m = measure(it.design)
        return { m, q: quoteItem(m, it.options, catalog.byId, it.design.width) }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, catalog.items],
  )
  const cost = calc.reduce((s, c, i) => s + c.q.cost * items[i].qty, 0)
  const area = calc.reduce((s, c, i) => s + c.m.area_m2 * items[i].qty, 0)
  const windows = items.reduce((s, it) => s + it.qty, 0)
  const suggested = suggestedPrice(cost, catalog.markup, discount)
  const contractNum = Number(contract) || roundDown1000(suggested)
  const pr = profit(contractNum, cost)
  const missing = [...new Set(calc.flatMap((c) => c.q.missing))]

  const pickClient = (label: string) => {
    const c = clients.find((x) => `${x.full_name}${x.phone ? ` · ${x.phone}` : ''}` === label)
    if (c) {
      setClient({ id: c.id, full_name: c.full_name, phone: c.phone ?? '', address: c.address ?? '' })
      if (!address && c.address) setAddress(c.address)
    } else setClient((x) => ({ ...x, full_name: label }))
  }

  const addItem = () => {
    const it: ItemDraft = { key: newKey(), title: '', qty: 1, design: PRESETS[1].build(), options: items.length ? { ...items[items.length - 1].options } : {}, note: '' }
    setItems((xs) => [...xs, it])
    setEditing(it.key)
  }
  const patchItem = (key: string, patch: Partial<ItemDraft>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)))
  const copyItem = (it: ItemDraft) => setItems((xs) => [...xs, { ...structuredClone(it), id: undefined, key: newKey() }])
  const removeItem = (key: string) => window.confirm(t.removeConfirm) && setItems((xs) => xs.filter((x) => x.key !== key))

  const save = async () => {
    setBusy(true)
    setMsg(null)
    const payload = {
      id: id ?? null,
      client,
      address: address || client.address,
      contact_phone: client.phone,
      color: items[0]?.options.color ? catalog.byId.get(items[0].options.color)?.name : null,
      deadline,
      notes,
      windows_count: windows,
      area_m2: Math.round(area * 100) / 100,
      calc_cost: Math.round(cost * 100) / 100,
      markup: catalog.markup,
      calc_suggested: suggested,
      discount_pct: discount,
      contract_price: contractNum,
      items: items.map((it, i) => ({
        id: it.id ?? null,
        pos: i + 1,
        title: it.title,
        width_mm: it.design.width,
        height_mm: it.design.height,
        qty: it.qty,
        design: it.design,
        options: it.options,
        materials: { items: calc[i].q.materials, panes: calc[i].m.panes.map((p) => ({ w: Math.round(p.w), h: Math.round(p.h), sash: p.sash })) },
        calc: { lines: calc[i].q.lines, measure: { ...calc[i].m, panes: undefined } },
        cost: calc[i].q.cost,
        area_m2: calc[i].m.area_m2,
        note: it.note,
      })),
    }
    const { data, error } = await supabase.rpc('save_order', { p: payload })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: error.message })
    setMsg({ ok: true, text: `${t.saved} #${data.order_no}` })
    setOrderNo(data.order_no)
    if (!id) nav(`/orders/${data.id}`, { replace: true })
  }

  const edited = items.find((x) => x.key === editing)
  const editedCalc = edited ? calc[items.indexOf(edited)] : null

  return (
    <>
      <p>
        <Link to="/orders">← {t.list}</Link>
      </p>
      <h1>
        {orderNo ? `${t.order} #${orderNo}` : t.new} {orderNo && <span className={`status s-${status}`}>{t.statuses[status]}</span>}
      </h1>
      {msg && <div className={msg.ok ? 'card note ok' : 'card note bad'}>{msg.text}</div>}

      {/* клиент и заказ */}
      <div className="card form">
        <h2>{t.client}</h2>
        <div className="grid2">
          <label>
            {t.clientName}
            <input list="clients" value={client.full_name} onChange={(e) => pickClient(e.target.value)} required />
            <datalist id="clients">
              {clients.map((c) => (
                <option key={c.id} value={`${c.full_name}${c.phone ? ` · ${c.phone}` : ''}`} />
              ))}
            </datalist>
          </label>
          <label>
            {t.phone}
            <input value={client.phone} inputMode="tel" onChange={(e) => setClient({ ...client, phone: e.target.value })} />
          </label>
          <label>
            {t.address}
            <input value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
          <label>
            {t.deadline}
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </label>
        </div>
        {client.id && (
          <p className="muted small">
            {t.existingClient}{' '}
            <button type="button" className="link" onClick={() => setClient({ full_name: client.full_name, phone: '', address: '' })}>
              {t.newClient}
            </button>
          </p>
        )}
        <label>
          {t.notes}
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </label>
      </div>

      {/* позиции */}
      <h2>{t.items}</h2>
      {items.map((it, i) => (
        <div key={it.key} className={`card item-row ${editing === it.key ? 'on' : ''}`}>
          <div className="thumb">
            <WindowSvg design={it.design} frameColor={colorHex(catalog.byId.get(it.options.color ?? '')?.name)} maxHeight={120} />
          </div>
          <div className="item-info">
            <b>
              {i + 1}. {it.title || `${it.design.width} × ${it.design.height}`}
            </b>
            <span className="muted">
              {catalog.byId.get(it.options.system ?? '')?.name ?? t.noSystem} · {calc[i]?.m.area_m2} m² × {it.qty}
            </span>
            <span>
              {formatSum((calc[i]?.q.cost ?? 0) * it.qty)} <small>{t.costWord}</small>
            </span>
          </div>
          <div className="item-actions">
            <button type="button" className="ghost" onClick={() => setEditing(editing === it.key ? null : it.key)}>
              {editing === it.key ? t.close : t.edit}
            </button>
            <button type="button" className="ghost" onClick={() => copyItem(it)}>
              {t.copy}
            </button>
            <button type="button" className="ghost" onClick={() => removeItem(it.key)}>
              ✕
            </button>
          </div>
        </div>
      ))}
      <button type="button" onClick={addItem}>
        + {t.addItem}
      </button>

      {/* редактор позиции */}
      {edited && editedCalc && (
        <div className="editor-block">
          <h2>
            {t.position} {items.indexOf(edited) + 1}
          </h2>
          <div className="card form grid2">
            <label>
              {t.title}
              <input value={edited.title} placeholder={t.titlePh} onChange={(e) => patchItem(edited.key, { title: e.target.value })} />
            </label>
            <label>
              {t.qty}
              <input inputMode="numeric" value={edited.qty} onChange={(e) => patchItem(edited.key, { qty: Math.max(1, Number(e.target.value) || 1) })} />
            </label>
          </div>
          <WindowEditor value={edited.design} onChange={(design) => patchItem(edited.key, { design })} frameColor={colorHex(catalog.byId.get(edited.options.color ?? '')?.name)} />
          <div className="designer">
            <ItemOptionsForm value={edited.options} onChange={(options) => patchItem(edited.key, { options })} catalog={catalog} widthMm={edited.design.width} />
            <div className="card">
              <h2>{t.breakdown}</h2>
              <table className="kv lines">
                <tbody>
                  {editedCalc.q.lines.map((l, i) => (
                    <tr key={i} className={l.price ? '' : 'zero'}>
                      <td>{l.name}</td>
                      <td>
                        {l.qty} {uz.catalog.units[l.unit]} × {formatSum(l.price)}
                      </td>
                      <td>{formatSum(l.sum)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td>
                      <b>{t.costOne}</b>
                    </td>
                    <td />
                    <td>
                      <b>{formatSum(editedCalc.q.cost)}</b>
                    </td>
                  </tr>
                </tbody>
              </table>
              <label>
                {t.note}
                <textarea value={edited.note} rows={2} onChange={(e) => patchItem(edited.key, { note: e.target.value })} />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* итог */}
      <div className="card totals">
        <h2>{t.total}</h2>
        {missing.length > 0 && (
          <p className="warn">
            {t.missing}: {missing.join(', ')}
          </p>
        )}
        <table className="kv">
          <tbody>
            <tr><td>{t.windows}</td><td>{windows} · {Math.round(area * 100) / 100} m²</td></tr>
            <tr><td>{t.cost}</td><td>{formatSum(cost)}</td></tr>
            <tr>
              <td>{t.discount}</td>
              <td>
                <select value={discount} onChange={(e) => setDiscount(Number(e.target.value))}>
                  {[0, 1, 2, 3, 5].map((d) => (
                    <option key={d} value={d}>
                      {d}%
                    </option>
                  ))}
                </select>
              </td>
            </tr>
            <tr><td>{t.suggested} (+{Math.round(catalog.markup * 100)}%)</td><td>{formatSum(suggested)}</td></tr>
            <tr>
              <td>
                <b>{t.contract}</b>
              </td>
              <td>
                <input className="money" inputMode="numeric" placeholder={formatSum(roundDown1000(suggested))} value={contract} onChange={(e) => setContract(e.target.value.replace(/\D/g, ''))} />
              </td>
            </tr>
            <tr className={pr.marginPct < 15 ? 'bad' : ''}>
              <td>{t.profit}</td>
              <td>
                {formatSum(pr.profit)} ({pr.marginPct}%)
              </td>
            </tr>
          </tbody>
        </table>
        <button disabled={busy || items.length === 0 || !client.full_name.trim()} onClick={save}>
          {t.save}
        </button>
      </div>
    </>
  )
}
