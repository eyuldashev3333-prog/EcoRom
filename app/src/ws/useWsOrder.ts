import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { itemColor, useCatalog } from '../lib/catalog'
import { shopLegend } from '../lib/legend'
import { itemPrice, round2 } from '../lib/pricing'
import { suggestedTotal } from '../lib/orderPrice'
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
// сетевая ошибка (fetch) в supabase-js приходит как error, но на всякий случай ловим и исключение
const callSave = async (payload: unknown) => {
  try {
    return await supabase.rpc('save_order', { p: payload })
  } catch (e) {
    return { data: null, error: { message: String(e) } } as { data: null; error: { message: string } }
  }
}
const roundDown1000 = (n: number) => Math.floor(n / 1000) * 1000
export const wsNewKey = newKey
export const wsNewDesign = () => newDesign(1500, 1500)

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// Загрузка заказа, расчёт каждого окна и автосохранение (как WinStudio: отдельной кнопки «сохранить» нет).
// Автосохранение работает только пока заказ «Yangi»; в цехе правки уходят только явным «Сохранить» (заказ повторно уйдёт в цех).
export const WS_DRAFT_KEY = 'ecorom.wsdraft'
export const WS_REQ_KEY = 'ecorom.wsreq'

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
  const [warnings, setWarnings] = useState<string[]>([])
  const [conflict, setConflict] = useState(false) // заказ изменён в другой вкладке/другим человеком: автосохранение остановлено
  const dirty = useRef(false)
  const saving = useRef(false)
  const version = useRef<string | null>(null) // updated_at заказа на момент загрузки/последнего сохранения (защита от устаревшей вкладки)
  // один ключ на весь «новый заказ»: если ответ потерялся и запрос повторится, сервер вернёт тот же заказ, а не создаст второй
  const requestId = useRef<string>(
    (() => {
      try {
        const k = sessionStorage.getItem(WS_REQ_KEY)
        if (k) return k
        const n = crypto.randomUUID()
        sessionStorage.setItem(WS_REQ_KEY, n)
        return n
      } catch {
        return crypto.randomUUID()
      }
    })(),
  )

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
      version.current = o.updated_at ?? null
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
  const suggested = suggestedTotal(prices.map((p) => p.withDiscount), items.map((it) => it.qty), taxK)
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
      if (conflict) return { ok: false, text: 'conflict' }
      if (saving.current) return { ok: false, text: 'busy' } // предыдущее сохранение ещё идёт: итоговая правка уйдёт со следующим
      saving.current = true
      setSave({ state: 'saving' })
      const payload = {
        id: id || null,
        request_id: id ? undefined : requestId.current,
        version: id ? version.current : undefined,
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
          materials: { ...(it.frozen ? it.frozen.materials : { items: calc[i].q.materials, panes: calc[i].m.panes.map((p) => ({ w: Math.round(p.w), h: Math.round(p.h), sash: p.sash })) }), legend: shopLegend(it.options, catalog.byId), color: itemColor(catalog.byId.get(it.options.color ?? '')) },
          calc: it.frozen ? it.frozen.calc : { lines: calc[i].q.lines, measure: { ...calc[i].m, panes: undefined } },
          cost: calc[i].q.cost,
          area_m2: it.frozen ? it.frozen.area_m2 : calc[i].m.area_m2,
          note: it.note,
        })),
      }
      let res: Awaited<ReturnType<typeof callSave>>
      try {
        res = await callSave(payload)
      } finally {
        saving.current = false
      }
      const { data, error: err } = res
      if (err) {
        // понятное сообщение вместо «TypeError: Failed to fetch»; сеть пропала — автосохранение повторится само
        const net = /failed to fetch|networkerror|load failed|network request failed/i.test(err.message)
        const stale = /ZAKAZ_YANGILANGAN/.test(err.message)
        if (stale) setConflict(true)
        const text = stale ? 'conflict' : net ? 'network' : err.message
        setSave({ state: 'error', text })
        return { ok: false, text }
      }
      version.current = (data.version as string) ?? version.current
      setWarnings((data.warnings as string[]) ?? [])
      dirty.current = false
      setSavedContract(contract)
      setSavedSuggested(suggested)
      setOrderNo(data.order_no)
      const oid: string = data.id
      if (!id) {
        // первое сохранение черновика: заказ и клиент созданы — запоминаем их id, чтобы дальше обновлять, а не создавать заново
        setId(oid)
        if (data.client_id) setClient((c) => ({ ...c, id: data.client_id as string }))
        try {
          sessionStorage.removeItem(WS_DRAFT_KEY)
          sessionStorage.removeItem(WS_REQ_KEY)
        } catch {
          /* не страшно */
        }
      }
      // новые окна получили id в базе: подтягиваем их, чтобы следующее сохранение обновляло, а не дублировало позиции
      const rows = (data.items as { id: string; pos: number }[]) ?? []
      setItems((xs) => xs.map((x, i) => (x.id ? x : { ...x, id: rows.find((r) => r.pos === i + 1)?.id })))
      setSave({ state: 'saved' })
      return { ok: true }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, client, address, deadline, notes, items, calc, contract, suggested, discount, markupUsed, locked, problems.length, unknown.length, conflict],
  )
  const saveRef = useRef(doSave)
  saveRef.current = doSave
  // перед уходом с экрана дописать несохранённые правки
  const flush = useCallback(async () => (dirty.current && autosave ? saveRef.current() : { ok: true as boolean }), [autosave])

  // автосохранение через секунду после последней правки (только «Yangi»)
  useEffect(() => {
    if (!loaded || !autosave || !dirty.current || !items.length || conflict) return
    const h = setTimeout(() => void saveRef.current(), 1000)
    return () => clearTimeout(h)
  }, [loaded, autosave, items, address, deadline, notes, conflict])

  // ошибка сохранения (сеть) — повторяем каждые 4 с, пока не получится; правка не теряется
  useEffect(() => {
    if (save.state !== 'error' || conflict || !dirty.current) return
    const h = setTimeout(() => void saveRef.current(), 4000)
    return () => clearTimeout(h)
  }, [save, conflict])

  // правка не должна пропасть при закрытии/сворачивании вкладки: сворачивание — сохраняем сразу; закрытие — просим подтверждение
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && dirty.current && autosave && !conflict) void saveRef.current()
    }
    const onUnload = (e: BeforeUnloadEvent) => {
      if ((dirty.current || saving.current) && autosave) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [autosave, conflict])

  return { warnings, conflict, taxPct: catalog.settings.taxPct, id, persisted, catalog, loaded, error, status, locked, autosave, orderNo, client, address, deadline, notes, items, calc, prices, margins, cost, area, windows, suggested, contract, problems, unknown, save, patchItem, addItem, removeItem, setMeta, doSave, flush, markupUsed }
}
