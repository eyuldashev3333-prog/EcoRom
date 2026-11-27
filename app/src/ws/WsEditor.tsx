import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import WindowSvg from '../components/WindowSvg'
import { MiniWindow } from '../components/ConfigPicker'
import { itemColor } from '../lib/catalog'
import { DOBOR, SIDES, selList, type ItemOptions, type Side } from '../lib/quote'
import { equalizeChain, findNode, resizeChain, setChainSegment, setSubSize, type WindowDesign } from '../lib/window'
import { uz } from '../uz'
import './ws.css'
import { ConfigDialog, CellDialog } from './WsDialogs'
import { AskDlg, Burger, Compass, Keypad, Phone, Trash } from './parts'
import WsOptions, { SEC } from './WsOptions'
import WsTable, { type TableData } from './WsTable'
import { aggregate, columnCosts, columnQty } from './columns'
import { useWsOrder } from './useWsOrder'

const t = uz.ws
const d = uz.designer

interface PadReq {
  value: number
  min: number
  max: number
  plain?: boolean
  apply: (n: number) => void
}

interface LegendSec {
  title: string
  color: string
  items: string[]
}

// подпись выбранных опций поверх чертежа (режим «контроль»): цветная плашка секции и строки с «•»
function buildLegend(o: ItemOptions, byId: Map<string, { name: string }>, schemeName: string | undefined): LegendSec[] {
  const name = (id?: string) => (id ? byId.get(id)?.name : undefined)
  const out: LegendSec[] = []
  const add = (title: string, color: string, items: (string | undefined)[]) => {
    const list = items.filter((x): x is string => !!x)
    if (list.length) out.push({ title, color, items: list })
  }
  add(t.scheme, SEC.scheme, [schemeName])
  add(t.system, SEC.system, [name(o.system)])
  add(t.glass, SEC.glass, [name(o.glass)])
  add(t.ebb, SEC.ebb, selList(o, 'ebb').map((s) => name(s.id)))
  add(t.sill, SEC.sill, selList(o, 'sill').map((s) => name(s.id)))
  add(t.hardware, SEC.hardware, [name(o.hardware)])
  add(t.misc, SEC.misc, (o.misc ?? []).map(name))
  add(t.works, SEC.works, (o.works ?? []).map(name))
  add(t.net, SEC.net, [name(o.net)])
  add(t.lamIn, SEC.lamIn, [name(o.lamination_in)])
  add(t.lamOut, SEC.lamOut, [name(o.lamination_out)])
  add(t.color, SEC.color, [name(o.color)])
  const sd = o.sides
  if (sd) {
    add(t.additions, SEC.side, [sd.support && t.support, sd.threshold && t.threshold, sd.corner && t.corner].map((x) => x || undefined))
    const sideTxt = (s?: Side[]) => SIDES.filter((x) => s?.includes(x)).map((x) => t.sides[x]).join(' ')
    for (const [k, label] of [['connect', t.connect], ['connect90', t.connect90], ['connect135', t.connect135], ['nashelnik', t.nashelnik]] as const) {
      const s = sideTxt(sd[k])
      if (s) add(label, SEC.side, [s])
    }
    add(t.dobor, SEC.side, DOBOR.map((x) => (sd.dobor?.[x]?.length ? `${uz.ws.cols[`dobor${x}`]} ${sideTxt(sd.dobor[x])}` : undefined)))
  }
  return out
}

export default function WsEditor() {
  const { id: paramId } = useParams()
  const nav = useNavigate()
  const w = useWsOrder(paramId)
  const id = w.id
  // первое окно создало заказ в базе — в адресе появляется id (без перезагрузки экрана: правки, сделанные за время сохранения, не теряются)
  useEffect(() => {
    if (w.id && !paramId) window.history.replaceState(window.history.state, '', `#/ws/edit/${w.id}`)
  }, [w.id, paramId])
  const { catalog, items } = w
  const [active, setActive] = useState<string | null>(null)
  const [control, setControl] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [picking, setPicking] = useState(false)
  const [cellFor, setCellFor] = useState<string | null>(null)
  const [pad, setPad] = useState<PadReq | null>(null)
  const [eq, setEq] = useState<'w' | 'h' | null>(null) // ось, по которой спрашиваем «выровнять?»
  const [askDel, setAskDel] = useState(false)
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null)

  // первое окно выбираем само
  useEffect(() => {
    if (w.loaded && !active && items.length) setActive(items[0].key)
    if (active && !items.some((x) => x.key === active)) setActive(items[0]?.key ?? null)
  }, [w.loaded, items, active])
  useEffect(() => {
    if (!toast) return
    const h = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(h)
  }, [toast])
  useEffect(() => {
    if (w.save.state === 'error' && !w.conflict && w.save.text !== 'network') setToast({ text: `${t.saveError}: ${w.save.text ?? ''}`, bad: true })
  }, [w.save])
  // меню закрывается клавишей Esc (на ПК)
  useEffect(() => {
    if (!showMenu) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && setShowMenu(false)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [showMenu])

  const idx = items.findIndex((x) => x.key === active)
  const it = idx >= 0 ? items[idx] : null
  const cur = idx >= 0 ? w.calc[idx] : null
  const ro = w.locked
  const design = it?.design

  const legend = useMemo(
    () => (it && control ? buildLegend(it.options, catalog.byId, catalog.settings.schemes.find((s) => s.id === it.options.scheme)?.name) : []),
    [it, control, catalog.byId, catalog.settings.schemes],
  )

  // данные нижней таблицы: выбранное окно + итоги по всему заказу (как у WinStudio)
  const perItem = items.map((x, i) => ({
    qty: columnQty(w.calc[i].m, x.options, x.design.width, x.design.height),
    // значения колонок строки «цена» — с наценкой (мат. / работы), до скидки
    cost: Object.fromEntries(Object.entries(columnCosts(w.calc[i].q.lines)).map(([k, v]) => [k, v * (1 + (k === 'works' ? w.margins[i].work : w.margins[i].mat))])),
    count: x.qty,
    noDiscount: w.prices[i].noDiscount,
    withDiscount: w.prices[i].withDiscount,
    own: !!x.options.own_price,
  }))
  const tableData: TableData | null =
    it && cur
      ? {
          one: { qty: perItem[idx].qty, cost: perItem[idx].cost, price: w.prices[idx], ownPrice: !!it.options.own_price },
          all: aggregate(perItem),
          taxPct: w.taxPct,
        }
      : null
  if (w.error === 'nodraft') return <Navigate to="/ws/new" replace />
  if (w.error) return <Phone><div className="ws-center"><p>{uz.order.notFound}</p></div></Phone>
  if (!w.loaded || catalog.loading) return <Phone><div className="ws-center"><p>{uz.loading}</p></div></Phone>

  const setDesign = (nd: WindowDesign) => it && !ro && w.patchItem(it.key, { design: nd })
  const changeSize = (nw: number, nh: number) => {
    if (!design) return
    // как WinStudio (живая сверка 27.11.2026): разницу забирает последний отрезок цепочки, вопроса «выровнять?» нет —
    // он только по кружку в конце цепочки размеров
    setDesign(resizeChain(design, nw, nh))
  }
  const askNumber = (value: number, apply: (n: number) => void) => setPad({ value, min: 0, max: 1e12, plain: true, apply })
  const go = async (path: string) => {
    await w.flush()
    nav(path)
  }
  const needSaved = !w.persisted // карточка, печать и PDF существуют только у сохранённого заказа
  const canSendShop = w.persisted && (w.status === 'new' || w.status === 'in_production')
  // «Zavodga yuborish»: сохраняем и открываем карточку заказа сразу с выбором, кто работает (вся команда или люди)
  const sendShop = async () => {
    if (!id) return
    const fl = await w.flush()
    if (!fl.ok) return setToast({ text: t.saveError, bad: true })
    nav(`/orders/${id}?send=1`)
  }

  return (
    <Phone>
      <div className="ws-titlebar">{t.brand}</div>
      {ro && <div className="ws-banner">{t.locked}</div>}
      {w.save.state === 'error' && w.conflict && (
        <div className="ws-banner bad">
          {t.saveConflict} <button type="button" className="ws-linkbtn" onClick={() => window.location.reload()}>{t.reload}</button>
        </div>
      )}
      {w.save.state === 'error' && !w.conflict && <div className="ws-banner bad">{w.save.text === 'network' ? t.saveNetwork : `${t.saveError}: ${w.save.text ?? ''}`}</div>}
      {w.warnings.includes('below_cost') && <div className="ws-banner">{t.warnBelowCost}</div>}
      {w.warnings.includes('price_zero') && <div className="ws-banner">{t.warnPriceZero}</div>}
      <div className="ws-edit">
        <div className="ws-canvas">
          <button type="button" className="ws-burger" aria-label={t.menu} onClick={() => setShowMenu(true)}>
            <Burger />
          </button>
          <div className="ws-who">
            {w.client.full_name} : {w.address}
          </div>
          <label className="ws-ctrl">
            {t.control}
            <input type="checkbox" checked={control} onChange={(e) => setControl(e.target.checked)} />
          </label>
          {control && legend.length > 0 && (
            <div className="ws-legend" aria-hidden="true">
              {legend.map((s) => (
                <div key={s.title}>
                  <span className="h" style={{ background: s.color, color: s.color === SEC.own ? '#333' : '#fff' }}>
                    {s.title}
                  </span>
                  {s.items.map((x) => (
                    <span key={x} className="i">
                      {x}•
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}
          {it && design && (
            <div className="ws-svgbox">
              <WindowSvg
                design={design}
                frameColor={itemColor(catalog.byId.get(it.options.color ?? ''))}
                onSelect={(leafId) => !ro && setCellFor(leafId)}
                onSizeClick={(axis, current) => !ro && setPad({ value: current, min: 300, max: 6000, apply: (n) => changeSize(axis === 'w' ? n : design.width, axis === 'h' ? n : design.height) })}
                onChainClick={(axis, i, current) => !ro && setPad({ value: Math.round(current), min: 1, max: 6000, apply: (n) => setDesign(setChainSegment(design, axis, i, n)) })}
                onChainEqualize={(axis) => !ro && setEq(axis)}
                onSubClick={(leafId, i, current) => !ro && setPad({ value: current, min: 100, max: 6000, apply: (n) => setDesign(setSubSize(design, leafId, i, n)) })}
              />
            </div>
          )}
          {control && it && (
            <div className="ws-qtyline">
              <b>
                {it.qty} {d.pcs}
              </b>
              {it.note}
            </div>
          )}
          {it && !ro && (
            <button type="button" className="ws-trash" aria-label={t.deleteWindow} onClick={() => setAskDel(true)}>
              <Trash />
            </button>
          )}
        </div>

        <WsTable
          currency={catalog.settings.currency !== catalog.settings.resultCurrency && catalog.settings.rate === 1 ? catalog.settings.currency : catalog.settings.resultCurrency}
          data={tableData}
        />
        <div className="ws-ribbon">
          <button type="button" className="ws-plus" aria-label={d.addWindow} disabled={ro} onClick={() => setPicking(true)}>
            +
          </button>
          <div className="ws-tabs" role="tablist">
            {items.map((x, i) => (
              <button key={x.key} type="button" role="tab" aria-selected={x.key === active} className={x.key === active ? 'ws-tab' : 'ws-tab off'} onClick={() => setActive(x.key)}>
                <span className="in">
                  <MiniWindow design={x.design} />
                </span>
                <span className="n">{i + 1}</span>
                {x.qty > 1 && <span className="q">{x.qty}{d.pcs}</span>}
              </button>
            ))}
          </div>
          <button type="button" className="ws-compass" aria-label={t.settings} disabled={!it} onClick={() => setShowSettings(true)}>
            <Compass />
          </button>
        </div>

        {showSettings && it && (
          <WsOptions
            item={{ qty: it.qty, note: it.note, options: it.options }}
            catalog={catalog}
            widthMm={it.design.width}
            readOnly={ro}
            askNumber={askNumber}
            onQty={(n) => w.patchItem(it.key, { qty: n })}
            onNote={(s) => w.patchItem(it.key, { note: s })}
            onOptions={(o) => w.patchItem(it.key, { options: o })}
            onClose={() => setShowSettings(false)}
          />
        )}
      </div>

      {showMenu && (
        <div className="ws-menu" role="dialog" aria-label={t.menu}>
          <div className="t">
            <span>{t.menu}</span>
            <button type="button" className="x" aria-label={t.close} onClick={() => setShowMenu(false)}>
              ✕
            </button>
          </div>
          <div className="ws-menu-list">
          {canSendShop && (
            <button type="button" className="m9" onClick={sendShop}>
              {w.status === 'in_production' ? t.resendShop : t.sendShop}
            </button>
          )}
          <button type="button" className="m8" onClick={() => go('/orders')}>
            {t.back}
          </button>
          <button type="button" className="m1" disabled={needSaved} onClick={() => go(`/orders/${id}/print?mode=drawings`)}>
            {t.pdfDrawings}
          </button>
          <button type="button" className="m2" disabled={needSaved} onClick={() => go(`/orders/${id}/print?mode=details`)}>
            {t.pdfDetails}
          </button>
          <button type="button" className="m3" disabled={needSaved} onClick={() => go(`/orders/${id}/print?mode=offer`)}>
            {t.pdfOffer}
          </button>
          <button type="button" className="m4" disabled={needSaved} onClick={() => go(`/orders/${id}/print?mode=offer&req=1`)}>
            {t.requisites}
          </button>
          <button type="button" className="m5" disabled={needSaved} onClick={() => go(`/orders/${id}`)}>
            {t.orderCard}
          </button>
          {!w.autosave && !w.locked && (
            <button
              type="button"
              className="m7"
              onClick={async () => {
                if (!window.confirm(uz.order.resendConfirm)) return
                const r = await w.doSave()
                setToast({ text: r.ok ? t.saved : `${t.saveError}${r.text ? `: ${r.text}` : ''}`, bad: !r.ok })
                if (r.ok) setShowMenu(false)
              }}
            >
              {t.saveNow}
            </button>
          )}
          <button type="button" className="m6" onClick={() => setShowMenu(false)}>
            {t.closeMenu}
          </button>
          </div>
        </div>
      )}

      {picking && (
        <ConfigDialog
          onClose={() => setPicking(false)}
          onPick={(nd) => {
            const key = w.addItem(nd)
            setActive(key)
            setPicking(false)
          }}
        />
      )}
      {cellFor && design && findNode(design.root, cellFor) && (
        <CellDialog
          design={design}
          leafId={cellFor}
          onClose={() => setCellFor(null)}
          onApply={(nd) => {
            setDesign(nd)
            setCellFor(null)
          }}
        />
      )}
      {pad && (
        <Keypad
          plain={pad.plain}
          value={pad.value}
          min={pad.min}
          max={pad.max}
          onCancel={() => setPad(null)}
          onOk={(n) => {
            pad.apply(n)
            setPad(null)
          }}
        />
      )}
      {eq && design && (
        <AskDlg
          text={t.equalizeQ}
          no={t.no}
          yes={t.yes}
          onNo={() => setEq(null)}
          onYes={() => {
            setDesign(equalizeChain(design, eq))
            setEq(null)
          }}
        />
      )}
      {askDel && it && (
        <AskDlg
          text={t.deleteWindow}
          no={t.no}
          yes={t.yes}
          onNo={() => setAskDel(false)}
          onYes={() => {
            w.removeItem(it.key)
            setAskDel(false)
            setShowSettings(false)
          }}
        />
      )}
      {toast && <div className={toast.bad ? 'ws-toast bad' : 'ws-toast'}>{toast.text}</div>}
    </Phone>
  )
}

