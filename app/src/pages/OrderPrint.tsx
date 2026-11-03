import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import WindowSvg from '../components/WindowSvg'
import { colorHex, useCatalog } from '../lib/catalog'
import { dataUrlToBlob, download, elementToPng, insideTelegram, pagesToPdf, sendToTelegram } from '../lib/export'
import { formatSum } from '../lib/pricing'
import type { ItemOptions } from '../lib/quote'
import type { WindowDesign } from '../lib/window'
import { uz } from '../uz'

const t = uz.print
const PER_PAGE = 6

interface Item {
  id: string
  pos: number
  title: string | null
  qty: number
  design: WindowDesign
  options: ItemOptions
  materials: { panes?: { w: number; h: number; sash: boolean }[] }
  cost: number
  area_m2: number
  note: string | null
}
interface Order {
  order_no: number
  created_at: string
  address: string | null
  contact_phone: string | null
  contract_price: number
  area_m2: number
  windows_count: number
  calc_cost: number
  clients: { full_name: string; phone: string | null; address: string | null }
}
interface Company {
  name?: string
  executor?: string
  address?: string
  phone?: string
  web?: string
}

// договорная цена делится по позициям пропорционально себестоимости (сумма = договор)
function allocate(items: Item[], contract: number): number[] {
  const total = items.reduce((s, i) => s + Number(i.cost) * i.qty, 0)
  if (!total) return items.map(() => 0)
  const raw = items.map((i) => Math.round(((Number(i.cost) * i.qty) / total) * contract))
  raw[raw.length - 1] += contract - raw.reduce((a, b) => a + b, 0)
  return raw
}

export default function OrderPrint() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const mode = params.get('mode') === 'shop' ? 'shop' : 'client'
  const catalog = useCatalog()
  const [order, setOrder] = useState<Order | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [company, setCompany] = useState<Company>({})
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const pagesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ;(async () => {
      const [{ data: o }, { data: its }, { data: c }] = await Promise.all([
        supabase.from('orders').select('order_no, created_at, address, contact_phone, contract_price, area_m2, windows_count, calc_cost, clients(full_name, phone, address)').eq('id', id).maybeSingle(),
        supabase.from('order_items').select('id, pos, title, qty, design, options, materials, cost, area_m2, note').eq('order_id', id).order('pos'),
        supabase.from('app_settings').select('value').eq('key', 'company').maybeSingle(),
      ])
      setOrder(o as unknown as Order)
      setItems((its as Item[]) ?? [])
      setCompany((c?.value as Company) ?? {})
    })()
  }, [id])

  if (!order) return <p className="muted">{uz.loading}</p>

  const prices = allocate(items, Number(order.contract_price))
  const pages: Item[][] = []
  for (let i = 0; i < Math.max(items.length, 1); i += PER_PAGE) pages.push(items.slice(i, i + PER_PAGE))
  const name = (idv?: string) => (idv ? catalog.byId.get(idv)?.name : undefined)
  const date = new Date(order.created_at).toLocaleDateString('ru-RU')
  const fileBase = `ECOROM-${order.order_no}${mode === 'shop' ? '-sex' : ''}`

  const pageEls = () => Array.from(pagesRef.current?.querySelectorAll<HTMLElement>('.sheet') ?? [])
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    setMsg(null)
    try {
      await fn()
    } catch (e) {
      setMsg({ ok: false, text: String((e as Error).message ?? e) })
    }
    setBusy('')
  }
  const pdf = () => run('pdf', async () => download(await pagesToPdf(pageEls()), `${fileBase}.pdf`))
  const png = () =>
    run('png', async () => {
      const els = pageEls()
      for (let i = 0; i < els.length; i++) download(await dataUrlToBlob(await elementToPng(els[i])), `${fileBase}${els.length > 1 ? `-${i + 1}` : ''}.png`)
    })
  const tg = () =>
    run('tg', async () => {
      const err = await sendToTelegram(await pagesToPdf(pageEls()), `${fileBase}.pdf`, `${t.title} #${order.order_no} · ${order.clients.full_name}`)
      setMsg(err ? { ok: false, text: err } : { ok: true, text: t.sent })
    })

  return (
    <>
      <div className="no-print">
        <p>
          <Link to={`/orders/${id}`}>← {uz.order.order} #{order.order_no}</Link>
        </p>
        <div className="tabs">
          <button className={mode === 'client' ? 'tab on' : 'tab'} onClick={() => setParams({ mode: 'client' })}>
            {t.forClient}
          </button>
          <button className={mode === 'shop' ? 'tab on' : 'tab'} onClick={() => setParams({ mode: 'shop' })}>
            {t.forShop}
          </button>
        </div>
        <div className="inline wrap actions">
          <button onClick={tg} disabled={!!busy}>{busy === 'tg' ? '…' : t.toTelegram}</button>
          <button className="ghost" onClick={pdf} disabled={!!busy}>{busy === 'pdf' ? '…' : t.pdf}</button>
          <button className="ghost" onClick={png} disabled={!!busy}>{busy === 'png' ? '…' : t.png}</button>
          {!insideTelegram() && (
            <button className="ghost" onClick={() => window.print()} disabled={!!busy}>
              {t.print}
            </button>
          )}
        </div>
        {msg && <div className={msg.ok ? 'card note ok' : 'card note bad'}>{msg.text}</div>}
      </div>

      <div ref={pagesRef} className="sheets">
        {pages.map((chunk, pi) => (
          <div key={pi} className="sheet">
            <header className="sheet-head">
              <div className="req">
                <div><span>{t.executor}:</span> {company.executor}</div>
                <div><span>{t.address}:</span> {company.address}</div>
                <div><span>{t.phone}:</span> {company.phone}</div>
                <div><span>{t.web}:</span> {company.web}</div>
              </div>
              <img src={`${import.meta.env.BASE_URL}logo.jpg`} alt="ECOROM" className="sheet-logo" />
              <div className="req right">
                <div><span>{t.customer}:</span> <b>{order.clients.full_name}</b></div>
                <div><span>{t.address}:</span> {order.address ?? order.clients.address ?? ''}</div>
                <div><span>{t.phone}:</span> {order.contact_phone ?? order.clients.phone ?? ''}</div>
                <div><span>{t.orderNo}:</span> <b>№{order.order_no}</b></div>
              </div>
            </header>
            <div className="sheet-grid">
              {chunk.map((it) => {
                const idx = items.indexOf(it)
                const o = it.options ?? {}
                const optsLine = [name(o.sill?.id), name(o.ebb?.id), name(o.hardware), name(o.net), name(o.color)].filter(Boolean).join(' · ')
                return (
                  <div key={it.id} className="cell">
                    <div className="cell-top">
                      <b>{it.pos}</b>
                      <span>{[name(o.system), name(o.glass)].filter(Boolean).join(' · ')}</span>
                    </div>
                    {it.title && <div className="cell-title">{it.title}</div>}
                    <WindowSvg design={it.design} frameColor={colorHex(name(o.color))} maxHeight={175} fontScale={1.9} />
                    <div className="cell-foot">
                      {optsLine && <div className="opts">{optsLine}</div>}
                      {mode === 'shop' && it.materials?.panes && (
                        <div className="opts">
                          {t.panes}: {it.materials.panes.map((p) => `${p.w}×${p.h}`).join(', ')}
                        </div>
                      )}
                      {it.note && <div className="opts">✎ {it.note}</div>}
                      <div className="cell-sum">
                        <span>
                          {Number(it.area_m2)} m² × {it.qty} {t.pcs}
                        </span>
                        {mode === 'client' && <b>{formatSum(prices[idx])} {t.sum}</b>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            {pi === pages.length - 1 && (
              <footer className="sheet-foot">
                <table>
                  <tbody>
                    <tr><td>{t.constructions}</td><td>{order.windows_count} {t.pcs}</td></tr>
                    <tr><td>{t.totalArea}</td><td>{Number(order.area_m2)} m²</td></tr>
                    {mode === 'client' && (
                      <tr><td><b>{t.totalSum}</b></td><td><b>{formatSum(Number(order.contract_price))} {t.sum}</b></td></tr>
                    )}
                  </tbody>
                </table>
                <div className="signs">
                  <div>{t.executor} ______________</div>
                  <div>{t.customer} ______________</div>
                  <div className="muted">{date}</div>
                </div>
              </footer>
            )}
            <div className="page-no">
              {pi + 1} / {pages.length}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
