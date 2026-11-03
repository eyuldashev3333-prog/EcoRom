import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { uz } from '../uz'

interface Item {
  id: string
  kind: string
  name: string
  unit: 'm' | 'm2' | 'pcs'
  price: number
  params: Record<string, number | string>
  is_active: boolean
}
const KINDS = Object.keys(uz.catalog.kinds)
const SYS_KEYS = Object.keys(uz.catalog.sysParams)

export default function Catalog() {
  const [kind, setKind] = useState('system')
  const [items, setItems] = useState<Item[]>([])
  const [flash, setFlash] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('catalog_items')
      .select('id, kind, name, unit, price, params, is_active')
      .eq('kind', kind)
      .order('sort')
      .order('name')
    setItems((data as Item[]) ?? [])
  }, [kind])
  useEffect(() => {
    load()
  }, [load])

  const save = async (id: string, patch: Partial<Item>) => {
    const { error } = await supabase.from('catalog_items').update(patch).eq('id', id)
    setFlash(error ? error.message : uz.catalog.saved)
    setTimeout(() => setFlash(''), 1500)
  }
  const patchLocal = (id: string, patch: Partial<Item>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)))

  const add = async () => {
    const name = window.prompt(uz.catalog.name)
    if (!name) return
    const unit = kind === 'glass' || kind === 'net' ? 'm2' : kind === 'system' || kind === 'ebb' || kind === 'sill' ? 'm' : 'pcs'
    const params = kind === 'system' ? { frame: 0, impost: 0, sash: 0, bead: 0, gasket: 0 } : {}
    await supabase.from('catalog_items').insert({ kind, name, unit, params, sort: items.length + 1 })
    load()
  }

  return (
    <>
      <p>
        <Link to="/">←</Link>
      </p>
      <h1>{uz.catalog.title}</h1>
      <div className="tabs">
        {KINDS.map((k) => (
          <button key={k} className={k === kind ? 'tab on' : 'tab'} onClick={() => setKind(k)}>
            {uz.catalog.kinds[k]}
          </button>
        ))}
      </div>
      <div className="flash">{flash}</div>
      {items.map((it) => (
        <div key={it.id} className={it.is_active ? 'card item' : 'card item off'}>
          <input
            className="name"
            value={it.name}
            onChange={(e) => patchLocal(it.id, { name: e.target.value })}
            onBlur={(e) => save(it.id, { name: e.target.value })}
          />
          {kind === 'system' ? (
            <div className="params">
              {SYS_KEYS.map((k) => (
                <label key={k}>
                  <small>{uz.catalog.sysParams[k]}</small>
                  <input
                    inputMode="decimal"
                    value={String(it.params?.[k] ?? 0)}
                    onChange={(e) => patchLocal(it.id, { params: { ...it.params, [k]: e.target.value } })}
                    onBlur={() => save(it.id, { params: { ...it.params, ...Object.fromEntries(SYS_KEYS.map((x) => [x, Number(it.params?.[x] ?? 0)])) } })}
                  />
                </label>
              ))}
            </div>
          ) : (
            <label>
              <small>
                {uz.catalog.price} / {uz.catalog.units[it.unit]}
              </small>
              <input
                inputMode="decimal"
                value={String(it.price)}
                onChange={(e) => patchLocal(it.id, { price: e.target.value as unknown as number })}
                onBlur={(e) => save(it.id, { price: Number(e.target.value) || 0 })}
              />
            </label>
          )}
          <label className="check">
            <input type="checkbox" checked={it.is_active} onChange={(e) => { patchLocal(it.id, { is_active: e.target.checked }); save(it.id, { is_active: e.target.checked }) }} />
            {uz.catalog.active}
          </label>
        </div>
      ))}
      <button onClick={add}>+ {uz.catalog.add}</button>
    </>
  )
}
