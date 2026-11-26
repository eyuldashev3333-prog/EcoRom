import { useState, type ReactNode } from 'react'
import { itemColor, type CatalogState } from '../lib/catalog'
import { SIDES, DOBOR, mirrorOptions, selList, type ItemOptions, type Sel, type Side, type SideOpts } from '../lib/quote'
import { formatSum } from '../lib/pricing'
import { uz } from '../uz'
import { Dlg, Pen, SidePic, Trash } from './parts'

const t = uz.ws

// цвета заголовков секций — как в «настройках окна» WinStudio (сняты с экрана)
export const SEC = {
  qty: '#85aae4', note: '#85aae4', own: '#ffdd00', scheme: '#dc72b2', system: '#f8af1e', glass: '#55aaff', ebb: '#af92fe', sill: '#81d657',
  hardware: '#d65781', misc: '#b1c873', works: '#dc7d7d', net: '#e2ac5f', lamIn: '#78a51d', lamOut: '#1ea584', color: '#a1845b', side: '#85aae4',
} as const

const Sec = ({ title, color, dark }: { title: string; color: string; dark?: boolean }) => (
  <div className="ws-sec" style={{ background: color, color: dark ? '#333' : '#fff' }}>
    {title}
  </div>
)

function Radios({ kind, value, onChange, catalog, swatch }: { kind: string; value?: string; onChange: (id?: string) => void; catalog: CatalogState; swatch?: boolean }) {
  const list = catalog.byKind(kind)
  const [name] = useState(() => `r${kind}${Math.random().toString(36).slice(2)}`)
  return (
    <div role="radiogroup">
      <label className="ws-opt">
        <input type="radio" name={name} checked={!value} onChange={() => onChange(undefined)} />
        {t.none}
      </label>
      {list.map((i) => (
        <label key={i.id} className="ws-opt">
          {swatch && <span className="sw" style={{ background: itemColor(i) }} aria-hidden="true" />}
          <input type="radio" name={name} checked={value === i.id} onChange={() => onChange(i.id)} />
          {i.name}
        </label>
      ))}
    </div>
  )
}

// подоконник/отлив как в WinStudio: галочка; у выбранного — список кусков «(n) длина мм · шт» (каждый правится и удаляется)
// и кнопка «ещё кусок». Расчёт: Σ длина×шт × цена + Σ шт × 2 заглушки (WinStudio p046l1/b.k, живая сверка 26.11.2026).
function Checks({ kind, value, onChange, catalog, withLen, widthMm }: { kind: string; value: Sel[]; onChange: (v: Sel[]) => void; catalog: CatalogState; withLen?: boolean; widthMm: number }) {
  // правка куска: индекс в общем списке value (-1 — новый кусок для id)
  const [edit, setEdit] = useState<{ index: number; sel: Sel } | null>(null)
  const list = catalog.byKind(kind)
  return (
    <div>
      {list.map((i) => {
        const pieces = value.map((s, index) => ({ s, index })).filter((p) => p.s.id === i.id)
        return (
          <div key={i.id}>
            <label className="ws-opt">
              <input type="checkbox" checked={pieces.length > 0} onChange={(e) => onChange(e.target.checked ? [...value, { id: i.id }] : value.filter((s) => s.id !== i.id))} />
              {i.name}
              {withLen && pieces.length > 0 && (
                <button type="button" className="ed" aria-label={`${t.qty} +`} onClick={(e) => { e.preventDefault(); setEdit({ index: -1, sel: { id: i.id } }) }}>
                  <Pen />
                </button>
              )}
            </label>
            {withLen && pieces.length > 0 && (
              <div className="ws-pieces">
                {pieces.map(({ s, index }, n) => (
                  <div key={index} className="ws-piece">
                    <span>({n + 1})</span>
                    <button type="button" aria-label="mm" onClick={() => setEdit({ index, sel: s })}>{s.length_mm ?? widthMm} mm</button>
                    <button type="button" aria-label={t.qty} onClick={() => setEdit({ index, sel: s })}>{s.qty ?? 1} {uz.ws.pcs}</button>
                    <button type="button" className="del" aria-label="✕" onClick={() => onChange(value.filter((_, j) => j !== index))}>
                      <Trash />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
      {edit && (
        <LenDialog
          sel={edit.sel}
          widthMm={widthMm}
          onCancel={() => setEdit(null)}
          onOk={(s) => {
            onChange(edit.index < 0 ? [...value, s] : value.map((x, j) => (j === edit.index ? s : x)))
            setEdit(null)
          }}
        />
      )}
    </div>
  )
}

function LenDialog({ sel, widthMm, onOk, onCancel }: { sel: Sel; widthMm: number; onOk: (s: Sel) => void; onCancel: () => void }) {
  const [len, setLen] = useState(String(sel.length_mm ?? widthMm))
  const [qty, setQty] = useState(String(sel.qty ?? 1))
  return (
    <Dlg no={t.no} yes={t.yes} onNo={onCancel} onYes={() => onOk({ id: sel.id, length_mm: Number(len) > 0 ? Number(len) : undefined, qty: Number(qty) > 0 ? Number(qty) : undefined })} bodyClass="plain">
      <div className="ws-text" style={{ display: 'grid', gap: 10 }}>
        <label>
          mm
          <input className="ws-input" inputMode="numeric" value={len} onChange={(e) => setLen(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label>
          {t.qty}
          <input className="ws-input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} />
        </label>
      </div>
    </Dlg>
  )
}

function SideRow({ value, onChange }: { value?: Side[]; onChange: (v: Side[]) => void }) {
  const set = new Set(value ?? [])
  return (
    <div className="ws-sidegrid">
      <div className="line">
        {SIDES.map((s) => (
          <button
            key={s}
            type="button"
            className={set.has(s) ? 'ws-pic on' : 'ws-pic'}
            aria-pressed={set.has(s)}
            aria-label={t.sides[s]}
            onClick={() => {
              set.has(s) ? set.delete(s) : set.add(s)
              onChange(SIDES.filter((x) => set.has(x)))
            }}
          >
            <SidePic side={s} on={set.has(s)} />
          </button>
        ))}
      </div>
    </div>
  )
}

export interface OptionsItem {
  qty: number
  note: string
  options: ItemOptions
}

// панель «настройки окна»: выезжает справа, секции с цветными заголовками, внизу ОК
export default function WsOptions({ item, catalog, widthMm, readOnly, askNumber, onQty, onNote, onOptions, onClose }: { item: OptionsItem; catalog: CatalogState; widthMm: number; readOnly?: boolean; askNumber: (value: number, apply: (n: number) => void) => void; onQty: (n: number) => void; onNote: (s: string) => void; onOptions: (o: ItemOptions) => void; onClose: () => void }): ReactNode {
  const o = item.options
  const set = (patch: Partial<ItemOptions>) => onOptions(mirrorOptions({ ...o, ...patch }))
  const sd: SideOpts = o.sides ?? {}
  const setSides = (patch: Partial<SideOpts>) => set({ sides: { ...sd, ...patch } })
  return (
    <aside className="ws-side" aria-label={t.settings}>
      <div className="ws-side-h">{t.settings}</div>
      <div className="ws-side-b" style={readOnly ? { pointerEvents: 'none', opacity: 0.7 } : undefined}>
        <Sec title={t.qty} color={SEC.qty} />
        <div className="ws-qtyrow">
          <button type="button" aria-label="−" onClick={() => onQty(Math.max(1, item.qty - 1))}>
            −
          </button>
          <span>{item.qty}</span>
          <button type="button" aria-label="+" onClick={() => onQty(Math.min(999, item.qty + 1))}>
            +
          </button>
        </div>

        <Sec title={t.notes} color={SEC.note} />
        <input className="ws-input" value={item.note} onChange={(e) => onNote(e.target.value)} aria-label={t.notes} />

        <Sec title={t.ownPrice} color={SEC.own} dark />
        <div className="ws-pricebox">
          <button type="button" className="v" style={{ background: 'transparent', color: '#000' }} onClick={() => askNumber(o.own_price ?? 0, (n) => set({ own_price: n > 0 ? n : undefined }))} aria-label={t.ownPrice}>
            {o.own_price ? formatSum(o.own_price) : ''}
          </button>
          {o.own_price !== undefined && (
            <button type="button" aria-label="✕" onClick={() => set({ own_price: undefined })}>
              <span style={{ display: 'inline-block', width: 26, height: 26 }}>
                <Trash />
              </span>
            </button>
          )}
        </div>

        <Sec title={t.scheme} color={SEC.scheme} />
        <div role="radiogroup">
          <label className="ws-opt">
            <input type="radio" name="ws-scheme" checked={!o.scheme} onChange={() => set({ scheme: undefined })} />
            {t.none}
          </label>
          {catalog.settings.schemes.map((s) => (
            <label key={s.id} className="ws-opt">
              <input type="radio" name="ws-scheme" checked={o.scheme === s.id} onChange={() => set({ scheme: s.id })} />
              {s.name}
            </label>
          ))}
        </div>

        <Sec title={t.system} color={SEC.system} />
        <Radios kind="system" value={o.system} catalog={catalog} onChange={(system) => set({ system })} />
        <Sec title={t.glass} color={SEC.glass} />
        <Radios kind="glass" value={o.glass} catalog={catalog} onChange={(glass) => set({ glass })} />
        <Sec title={t.ebb} color={SEC.ebb} />
        <Checks kind="ebb" value={selList(o, 'ebb')} catalog={catalog} widthMm={widthMm} withLen onChange={(ebbs) => set({ ebbs })} />
        <Sec title={t.sill} color={SEC.sill} />
        <Checks kind="sill" value={selList(o, 'sill')} catalog={catalog} widthMm={widthMm} withLen onChange={(sills) => set({ sills })} />
        <Sec title={t.hardware} color={SEC.hardware} />
        <Radios kind="hardware" value={o.hardware} catalog={catalog} onChange={(hardware) => set({ hardware })} />
        <Sec title={t.misc} color={SEC.misc} />
        <Checks kind="misc" value={(o.misc ?? []).map((id) => ({ id }))} catalog={catalog} widthMm={widthMm} onChange={(v) => set({ misc: v.map((x) => x.id) })} />
        <Sec title={t.works} color={SEC.works} />
        <Checks kind="work" value={(o.works ?? []).map((id) => ({ id }))} catalog={catalog} widthMm={widthMm} onChange={(v) => set({ works: v.map((x) => x.id) })} />
        <Sec title={t.net} color={SEC.net} />
        <Radios kind="net" value={o.net} catalog={catalog} onChange={(net) => set({ net })} />
        <Sec title={t.lamIn} color={SEC.lamIn} />
        <Radios kind="lamination" value={o.lamination_in} catalog={catalog} onChange={(lamination_in) => set({ lamination_in })} />
        <Sec title={t.lamOut} color={SEC.lamOut} />
        <Radios kind="lamination" value={o.lamination_out} catalog={catalog} onChange={(lamination_out) => set({ lamination_out })} />
        <Sec title={t.color} color={SEC.color} />
        <Radios kind="color" value={o.color} catalog={catalog} swatch onChange={(color) => set({ color })} />

        <Sec title={t.additions} color={SEC.side} />
        {(
          [
            ['support', t.support, 'b'],
            ['threshold', t.threshold, 'b'],
            ['corner', t.corner, 'l'],
          ] as const
        ).map(([k, label, side]) => (
          <label key={k} className="ws-opt" style={{ background: '#e9ebed' }}>
            <input type="checkbox" checked={!!sd[k]} onChange={(e) => setSides({ [k]: e.target.checked || undefined })} />
            <span style={{ width: 28, height: 24 }}>
              <SidePic side={side} on={!!sd[k]} />
            </span>
            {label}
          </label>
        ))}
        {(
          [
            ['connect', t.connect],
            ['connect90', t.connect90],
            ['connect135', t.connect135],
            ['nashelnik', t.nashelnik],
          ] as const
        ).map(([k, label]) => (
          <div key={k}>
            <Sec title={label} color={SEC.side} />
            <SideRow value={sd[k]} onChange={(v) => setSides({ [k]: v.length ? v : undefined })} />
          </div>
        ))}
        <Sec title={t.dobor} color={SEC.side} />
        <div className="ws-sidegrid">
          <div className="line">
            <span className="lb" />
            {SIDES.map((s) => (
              <span key={s} className="ws-pic" style={{ display: 'inline-block' }}>
                <SidePic side={s} on />
              </span>
            ))}
          </div>
          {DOBOR.map((d) => {
            const cur = new Set(sd.dobor?.[d] ?? [])
            return (
              <div key={d} className="line">
                <span className="lb">{d}</span>
                {SIDES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={cur.has(s) ? 'ws-sq on' : 'ws-sq'}
                    aria-pressed={cur.has(s)}
                    aria-label={`${d} ${t.sides[s]}`}
                    onClick={() => {
                      cur.has(s) ? cur.delete(s) : cur.add(s)
                      const next = SIDES.filter((x) => cur.has(x))
                      const dobor = { ...(sd.dobor ?? {}) }
                      if (next.length) dobor[d] = next
                      else delete dobor[d]
                      setSides({ dobor: Object.keys(dobor).length ? dobor : undefined })
                    }}
                  >
                    {cur.has(s) ? '✓' : ''}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>
      <button type="button" className="ws-side-ok" onClick={onClose}>
        {t.ok}
      </button>
    </aside>
  )
}
