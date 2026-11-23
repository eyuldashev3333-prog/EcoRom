import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { useCatalog } from '../lib/catalog'
import { itemPrice, round2 } from '../lib/pricing'
import { quoteItem, workCost, type ItemOptions, type Material, type QuoteLine } from '../lib/quote'
import { designProblems, measure, type WindowDesign } from '../lib/window'
import { newDesign } from '../lib/window'

export interface WsItem {
  id?: string
  key: string
  title: string
  qty: number
  design: WindowDesign
  options: ItemOptions
  note: string
  // цены на момент сохранения: пока окно не менялось, старый заказ не пересчитывается по новым ценам каталога
  frozen?: { cost: number; area_m2: number; calc: { lines?: QuoteLine[] }; materials: { items?: Material[] } }
}
export interface WsClient {
  id?: string
  full_name: string
  phone: string
  address: string
}

const newKey = () => Math.random().toString(36).slice(2)
const roundDown1000 = (n: number) => Math.floor(n / 1000) * 1000
export const wsNewKey = newKey
export const wsNewDesign = () => newDesign(1500, 1500)

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// Загрузка заказа, расчёт каждого окна и автосохранение (как WinStudio: отдельной кнопки «сохранить» нет).
// Автосохранение работает только пока заказ «Yangi»; в цехе правки уходят только явным «Сохранить» (заказ повторно уйдёт в цех).
export const WS_DRAFT_KEY = 'ecorom.wsdraft'

// paramId — заказ из базы; без него — черновик нового заказа (мастер «новый заказ»): в базу он попадает вместе с первым окном,
// потому что сервер не принимает заказ без окон (миграция 042).
export function useWsOrder(paramId?: string) {
  const catalog = useCatalog()
  const initialId = useRef(paramId)
  const [id, setId] = useState(paramId ?? '')
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('new')
  const [orderNo, setOrderNo] = useState<number | null>(null)
  const [client, setClient] = useState<WsClient>({ full_name: '', phone: '', address: '' })
  const [address, setAddress] = useState('')
  const [deadline, setDeadline] = useState('')
  const [notes, setNotes] = useState('')
  const [discount, setDiscount] = useState(0)
  const [frozenMarkup, setFrozenMarkup] = useState<number | null>(null)
  const [savedContract, setSavedContract] = useState(0)
  const [savedSuggested, setSavedSuggested] = useState(0)
  const [items, setItems] = useState<WsItem[]>([])
  const [save, setSave] = useState<{ state: SaveState; text?: string }>({ state: 'idle' })
  const dirty = useRef(false)

  useEffect(() => {
    const first = initialId.current
    if (!first) {
      let d: { id?: string; full_name: string; phone: string; address: string; deadline?: string; notes?: string } | null = null
      try {
        d = JSON.parse(sessionStorage.getItem(WS_DRAFT_KEY) ?? 'null')
      } catch {
        d = null
      }
      if (!d) return setError('nodraft')
      setClient({ id: d.id, full_name: d.full_name, phone: d.phone, address: d.address ?? '' })
      setAddress(d.address ?? '')
      setDeadline(d.deadline ?? '')
      setNotes(d.notes ?? '')
      setLoaded(true)
      return
    }
    ;(async () => {
      const { data: o } = await supabase.from('orders').select('*, clients(id, full_name, phone, address)').eq('id', first).maybeSingle()
      if (!o) return setError('notFound')
      setOrderNo(o.order_no)
      setStatus(o.status)
      setClient({ id: o.clients.id, full_name: o.clients.full_name, phone: o.clients.phone ?? '', address: o.clients.address ?? '' })
      setAddress(o.address ?? '')
      setDeadline(o.deadline ?? '')
      setNotes(o.notes ?? '')
      setDiscount(Number(o.discount_pct))
      setSavedContract(Number(o.contract_price))
      setSavedSuggested(Number(o.calc_suggested))
      setFrozenMarkup(Number(o.markup) || null)
      const { data: its } = await supabase.from('order_items').select('id, pos, title, qty, design, options, note, cost, area_m2, calc, materials').eq('order_id', first).order('pos')
      setItems(
        ((its as { id: string; title: string | null; qty: number; design: WindowDesign; options: ItemOptions; note: string | null; cost: number; area_m2: number; calc: { lines?: QuoteLine[] }; materials: { items?: Material[] } }[]) ?? []).map((x) => ({
          id: x.id,
          key: newKey(),
          title: x.title ?? '',
          qty: x.qty,
          design: x.design,
          options: x.options ?? {},
          note: x.note ?? '',
          frozen: { cost: Number(x.cost), area_m2: Number(x.area_m2), calc: x.calc ?? {}, materials: x.materials ?? {} },
        })),
      )
      setLoaded(true)
    })()
  }, [])

  const locked = !['new', 'in_production'].includes(status)
  const autosave = status === 'new'
  const persisted = !!id

  // расчёт каждой позиции (как на странице заказа: замороженная позиция не пересчитывается по новым ценам)
  const calc = useMemo(
    () =>
      items.map((it) => {
        const m = measure(it.design)
        const live = quoteItem(m, it.options, catalog.byId, it.design.width, it.design.height)
        const q = it.frozen ? { lines: it.frozen.calc.lines ?? [], cost: it.frozen.cost, materials: it.frozen.materials.items ?? [], missing: [] as string[], unknown: [] as string[] } : live
        return { m, q, live }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, catalog.items],
  )
  const markupUsed = frozenMarkup ?? catalog.markup
  const taxK = 1 + catalog.settings.taxPct / 100
  const scheme = (it: WsItem) => catalog.settings.schemes.find((s) => s.id === it.options.scheme)
  // цена окна клиенту (со скидкой схемы) и без скидки — как строки «окно» / «цена» у WinStudio
  // наценка по колонкам (как «цена» в таблице WinStudio: стоимость колонки × (1 + маржа схемы)); без схемы — общая наценка заказа
  const margins = items.map((it) => {
    const sc = scheme(it)
    return { mat: sc ? sc.margin / 100 : markupUsed, work: sc ? sc.margin_work / 100 : markupUsed }
  })
  const prices = items.map((it, i) => {
    const q = calc[i]?.q
    const w = workCost(q?.lines ?? [])
    const sc = scheme(it)
    return {
      // цены окна без налога: налог WinStudio прибавляет только к итогу «стоимость» (проверено вживую: окно 9193.56, всего 20716.04 → 23823.45 при налоге 15%)
      withDiscount: round2(itemPrice(q?.cost ?? 0, w, markupUsed, discount, it.options, sc)),
      noDiscount: round2(itemPrice(q?.cost ?? 0, w, markupUsed, 0, it.options, sc ? { ...sc, discount: 0 } : undefined)),
      discountPct: sc ? sc.discount : discount,
    }
  })
  const cost = calc.reduce((s, c, i) => s + c.q.cost * items[i].qty, 0)
  const area = calc.reduce((s, c, i) => s + c.m.area_m2 * items[i].qty, 0)
  const windows = items.reduce((s, it) => s + it.qty, 0)
  const suggested = round2(items.reduce((s, it, i) => s + prices[i].withDiscount * it.qty, 0) * taxK)
  // договор: если он когда-то правился руками (не равен округлённой расчётной цене) — оставляем; иначе следует за расчётом
  const manualContract = savedContract > 0 && savedContract !== roundDown1000(savedSuggested)
  const contract = manualContract ? savedContract : roundDown1000(suggested)
  const problems = items.flatMap((it, i) => designProblems(it.design).map(() => i + 1))
  const unknown = [...new Set(calc.flatMap((c) => c.q.unknown))]

  const patchItem = useCallback((key: string, patch: Partial<WsItem>) => {
    dirty.current = true
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch, ...('design' in patch || 'options' in patch ? { frozen: undefined } : {}) } : x)))
  }, [])
  const addItem = useCallback((design?: WindowDesign, copyFrom?: WsItem) => {
    dirty.current = true
    const key = newKey()
    // новое окно, как в WinStudio, начинается без выбранных опций (проверено вживую: настройки предыдущего окна не копируются)
    setItems((xs) => [...xs, { key, title: '', qty: 1, design: design ?? wsNewDesign(), options: copyFrom ? structuredClone(copyFrom.options) : {}, note: '' }])
    return key
  }, [])
  const removeItem = useCallback((key: string) => {
    dirty.current = true
    setItems((xs) => xs.filter((x) => x.key !== key))
  }, [])
  const setMeta = useCallback((patch: { address?: string; deadline?: string; notes?: string }) => {
    dirty.current = true
    if (patch.address !== undefined) setAddress(patch.address)
    if (patch.deadline !== undefined) setDeadline(patch.deadline)
    if (patch.notes !== undefined) setNotes(patch.notes)
  }, [])

  const doSave = useCallback(
    async (): Promise<{ ok: boolean; text?: string }> => {
      if (locked) return { ok: false }
      if (problems.length || unknown.length) return { ok: false, text: 'problems' }
      if (!items.length) return { ok: false } // сервер не принимает заказ без окон: пустой черновик не сохраняется
      setSave({ state: 'saving' })
      const payload = {
        id: id || null,
        client,
        address: address || client.address,
        contact_phone: client.phone,
        color: items[0]?.options.color ? catalog.byId.get(items[0].options.color)?.name : null,
        deadline,
        notes,
        windows_count: windows,
        area_m2: Math.round(area * 100) / 100,
        calc_cost: Math.round(cost * 100) / 100,
        markup: markupUsed,
        calc_suggested: suggested,
        discount_pct: discount,
        contract_price: contract,
        items: items.map((it, i) => ({
          id: it.id ?? null,
          pos: i + 1,
          title: it.title,
          width_mm: it.design.width,
          height_mm: it.design.height,
          qty: it.qty,
          design: it.design,
          options: it.options,
          materials: it.frozen ? it.frozen.materials : { items: calc[i].q.materials, panes: calc[i].m.panes.map((p) => ({ w: Math.round(p.w), h: Math.round(p.h), sash: p.sash })) },
          calc: it.frozen ? it.frozen.calc : { lines: calc[i].q.lines, measure: { ...calc[i].m, panes: undefined } },
          cost: calc[i].q.cost,
          area_m2: it.frozen ? it.frozen.area_m2 : calc[i].m.area_m2,
          note: it.note,
        })),
      }
      const { data, error: err } = await supabase.rpc('save_order', { p: payload })
      if (err) {
        setSave({ state: 'error', text: err.message })
        return { ok: false, text: err.message }
      }
      dirty.current = false
      setSavedContract(contract)
      setSavedSuggested(suggested)
      setOrderNo(data.order_no)
      const oid: string = data.id
      if (!id) {
        // первое сохранение черновика: заказ и клиент созданы — запоминаем их id, чтобы дальше обновлять, а не создавать заново
        setId(oid)
        const { data: o } = await supabase.from('orders').select('client_id').eq('id', oid).maybeSingle()
        if (o?.client_id) setClient((c) => ({ ...c, id: o.client_id as string }))
        try {
          sessionStorage.removeItem(WS_DRAFT_KEY)
        } catch {
          /* не страшно */
        }
      }
      // новые окна получили id в базе: подтягиваем их, чтобы следующее сохранение обновляло, а не дублировало позиции
      const { data: rows } = await supabase.from('order_items').select('id, pos').eq('order_id', oid).order('pos')
      if (rows) setItems((xs) => xs.map((x, i) => (x.id ? x : { ...x, id: (rows as { id: string; pos: number }[]).find((r) => r.pos === i + 1)?.id })))
      setSave({ state: 'saved' })
      return { ok: true }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, client, address, deadline, notes, items, calc, contract, suggested, discount, markupUsed, locked, problems.length, unknown.length],
  )
  const saveRef = useRef(doSave)
  saveRef.current = doSave
  // перед уходом с экрана дописать несохранённые правки
  const flush = useCallback(async () => (dirty.current && autosave ? saveRef.current() : { ok: true as boolean }), [autosave])

  // автосохранение через секунду после последней правки (только «Yangi»)
  useEffect(() => {
    if (!loaded || !autosave || !dirty.current || !items.length) return
    const h = setTimeout(() => void saveRef.current(), 1000)
    return () => clearTimeout(h)
  }, [loaded, autosave, items, address, deadline, notes])

  return { taxPct: catalog.settings.taxPct, id, persisted, catalog, loaded, error, status, locked, autosave, orderNo, client, address, deadline, notes, items, calc, prices, margins, cost, area, windows, suggested, contract, problems, unknown, save, patchItem, addItem, removeItem, setMeta, doSave, flush, markupUsed }
}
