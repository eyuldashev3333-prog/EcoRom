import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import WindowSvg from './WindowSvg'
import SafeBox from './SafeBox'
import { daysLeft, type CardData } from '../lib/orderCards'
import { formatSum } from '../lib/pricing'
import { uz } from '../uz'

const t = uz.cards
const dmy = (d: string | null) => (d ? d.split('-').reverse().join('.') : '')

// Одна карточка заказа — одинаковая в «Savdo» и в «Montaj va servis»: чертёж, клиент, адрес, срок, этап, деньги, сервис/монтаж
export default function OrderCard({ c, names, children }: { c: CardData; names: Map<string, string>; children?: ReactNode }) {
  const left = daysLeft(c)
  const urgency = left === null ? '' : left < 0 ? 'late' : left <= 3 ? 'soon' : ''
  const stage = c.station ? uz.workshop.stations[c.station] : null
  const extra = Math.max(0, (c.itemsCount || (c.windows_count ? 1 : 0)) - 1)
  return (
    <div className={`ocard ${urgency}`}>
      <Link to={`/orders/${c.id}`} className="ocard-main">
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
          <div className="ocard-name">{c.client}</div>
          {c.phone && <div className="ocard-line muted">{c.phone}</div>}
          {c.address && <div className="ocard-line muted">{c.address}</div>}
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
          <div className="ocard-line ocard-chips">
            {stage && c.status === 'in_production' && (
              <span className="ochip">
                {stage} · {Math.round(c.percent)}%
              </span>
            )}
            {c.material && <span className="ochip bad">{uz.workshop.legend.material}</span>}
            {c.job && (
              <span className="ochip">
                {t.montaj}
                {c.job.plan_date ? ` ${dmy(c.job.plan_date)}` : ''}
                {c.job.accepted_by ? ` · ${names.get(c.job.accepted_by) ?? ''}` : ` · ${t.notAccepted}`}
              </span>
            )}
            {c.openService > 0 && <span className="ochip warn">{t.servis}: {c.openService}</span>}
          </div>
          <div className="ocard-money">
            <b className="num">{formatSum(c.contract_price)}</b>
            {c.debt > 0 && (
              <span className="debt-tag">
                {uz.money.debt}: {formatSum(c.debt)}
              </span>
            )}
          </div>
        </div>
      </Link>
      {children && <div className="ocard-actions">{children}</div>}
    </div>
  )
}
