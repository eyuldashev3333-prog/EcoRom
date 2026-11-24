import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import WindowSvg from './WindowSvg'
import SafeBox from './SafeBox'
import { daysLeft, type CardData } from '../lib/orderCards'
import { formatSum } from '../lib/pricing'
import { uz } from '../uz'

const t = uz.cards
const f = uz.flow
const dmy = (d: string | null) => (d ? d.split('-').reverse().join('.') : '')
// дата и время смены статуса (Ташкент): «24.11 16:20»
export const whenText = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Tashkent', ...o }).format(d)
  return f({ day: '2-digit', month: '2-digit' }) + ' ' + f({ hour: '2-digit', minute: '2-digit' })
}

// Одна карточка заказа — одинаковая у всех: чертёж, клиент, срок, где заказ сейчас. Кнопки своей колонки/роли — снизу (children).
// client=false — цех: без имени, телефона и адреса клиента
export default function OrderCard({ c, names, children, to, money = true, client = true, note, chips = true }: { c: CardData; names?: Map<string, string>; children?: ReactNode; to?: string; money?: boolean; client?: boolean; note?: ReactNode; chips?: boolean }) {
  const left = daysLeft(c)
  const urgency = left === null ? '' : left < 0 ? 'late' : left <= 3 ? 'soon' : ''
  const extra = Math.max(0, (c.itemsCount || (c.windows_count ? 1 : 0)) - 1)
  const afterShop = ['ready', 'installing', 'installed'].includes(c.status)
  return (
    <div className={`ocard ${urgency}`}>
      <Link to={to ?? `/orders/${c.id}`} className="ocard-main">
        <div className="ocard-pic">
          {c.designs[0] ? (
            <SafeBox fallback={<span className="ocard-nopic">{c.windows_count} {uz.home.windows}</span>}>
              <WindowSvg design={c.designs[0]} maxHeight={96} />
            </SafeBox>
          ) : (
            <span className="ocard-nopic">{c.windows_count} {uz.home.windows}</span>
          )}
          {extra > 0 && <span className="ocard-more">+{extra}</span>}
        </div>
        <div className="ocard-body">
          <div className="ocard-top">
            <b>№{c.order_no}</b>
            <span className={`status s-${c.status}`}>{uz.order.statuses[c.status]}</span>
          </div>
          {c.status_at && <div className="ocard-line muted small">{whenText(c.status_at)}</div>}
          {note && <div className="ocard-line small">{note}</div>}
          {client ? (
            <>
              <div className="ocard-name">{c.client}</div>
              {c.phone && <div className="ocard-line muted">{c.phone}</div>}
              {c.address && <div className="ocard-line muted">{c.address}</div>}
            </>
          ) : (
            <div className="ocard-name">
              {c.windows_count} {uz.home.windows} · {Math.round(c.area_m2 * 100) / 100} m²
            </div>
          )}
          <div className="ocard-line">
            {c.deadline ? (
              <span className={`ocard-deadline ${urgency}`}>
                {t.deadline}: {dmy(c.deadline)}
                {left !== null && left < 0 && ` · ${-left} ${t.daysLate}`}
                {left !== null && left >= 0 && left <= 3 && ` · ${left === 0 ? t.today : `${left} ${t.daysLeft}`}`}
              </span>
            ) : (
              <span className="muted">{t.noDeadline}</span>
            )}
          </div>
          <div className="ocard-line ocard-chips" hidden={!chips}>
            {c.status === 'in_production' &&
              (c.shop ? (
                c.shop.result === 'enough' ? (
                  <span className="ochip">{f.accepted}: {c.shop.name}</span>
                ) : (
                  <span className="ochip bad" title={c.shop.note ?? undefined}>
                    {uz.shop.state[c.shop.result]}{c.shop.note ? `: ${c.shop.note}` : ''}
                  </span>
                )
              ) : (
                <span className="ochip">{f.waiting}</span>
              ))}
            {c.job && c.status !== 'installed' && (
              <span className="ochip">
                {t.montaj}
                {c.job.plan_date ? ` ${dmy(c.job.plan_date)}` : ''}
                {c.job.accepted_by ? ` · ${names?.get(c.job.accepted_by) ?? ''}` : ` · ${t.notAccepted}`}
              </span>
            )}
            {client && afterShop && c.itemsCount > 0 && (
              <span className={`ochip ${c.glass === 'installed' ? '' : c.status === 'installed' ? 'warn' : ''}`}>
                {c.glass === 'installed' ? f.glassInstalled : c.glass === 'none' ? f.glassNone : f.glassOrdered}
              </span>
            )}
            {c.openService > 0 && <span className="ochip warn">{t.servis}: {c.openService}</span>}
          </div>
          {money && (
            <div className="ocard-money">
              <b className="num">{formatSum(c.contract_price)}</b>
              {c.debt > 0 && (
                <span className="debt-tag">
                  {uz.money.debt}: {formatSum(c.debt)}
                </span>
              )}
            </div>
          )}
        </div>
      </Link>
      {children && <div className="ocard-actions">{children}</div>}
    </div>
  )
}
