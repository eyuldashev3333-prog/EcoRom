import { useMemo, useState } from 'react'
import OrderCard from './OrderCard'
import { SendDialog } from './OrderActions'
import { useOrderCards, type CardData } from '../lib/orderCards'
import { uz } from '../uz'

const t = uz.install
const CAN_INSTALL = ['ready', 'installing'] // установка — только готовому заказу
const CAN_SERVICE = ['installed', 'closed', 'unknown']

// Montaj va servis: слева «Mijozlar ro'yxati» (все клиенты-заказы), справа «O'rnatishda». Под карточкой кнопки «O'rnatish» / «Servis».
export default function MontajBoard() {
  const { cards, names, reload } = useOrderCards()
  const [q, setQ] = useState('')
  const [dlg, setDlg] = useState<{ kind: 'montaj' | 'servis'; c: CardData } | null>(null)

  const s = q.trim().toLowerCase()
  const { list, inWork } = useMemo(() => {
    const live = (cards ?? []).filter((c) => c.status !== 'cancelled')
    const isWork = (c: CardData) => (c.job && c.job.status !== 'done') || c.status === 'installing' || c.openService > 0
    const match = (c: CardData) => !s || String(c.order_no).includes(s) || c.client.toLowerCase().includes(s) || (c.phone ?? '').includes(s) || (c.address ?? '').toLowerCase().includes(s)
    return {
      inWork: live.filter((c) => isWork(c) && match(c)),
      list: live.filter((c) => !isWork(c) && match(c)).slice(0, s ? 60 : 30),
    }
  }, [cards, s])

  const actions = (c: CardData) => (
    <>
      <button type="button" className="ghost" disabled={!CAN_INSTALL.includes(c.status)} title={CAN_INSTALL.includes(c.status) ? undefined : t.notNow} onClick={() => setDlg({ kind: 'montaj', c })}>
        {t.montajBtn}
      </button>
      <button type="button" className="ghost" disabled={!CAN_SERVICE.includes(c.status)} title={CAN_SERVICE.includes(c.status) ? undefined : t.notNow} onClick={() => setDlg({ kind: 'servis', c })}>
        {t.serviceBtn}
      </button>
    </>
  )

  return (
    <>
      <input className="search" placeholder={uz.order.search} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />
      {cards === null && <p className="muted">{uz.loading}</p>}
      {cards && (
        <div className="montaj-board">
          <section className="kcol">
            <header>
              <span>{t.listCol}</span>
              <b>{list.length}</b>
            </header>
            {list.length === 0 && <div className="kempty">—</div>}
            {list.map((c) => (
              <OrderCard key={c.id} c={c} names={names}>
                {actions(c)}
              </OrderCard>
            ))}
          </section>
          <section className="kcol">
            <header>
              <span>{t.jobsCol}</span>
              <b>{inWork.length}</b>
            </header>
            {inWork.length === 0 && <div className="kempty">—</div>}
            {inWork.map((c) => (
              <OrderCard key={c.id} c={c} names={names}>
                {actions(c)}
              </OrderCard>
            ))}
          </section>
        </div>
      )}
      {dlg && (
        <SendDialog
          kind={dlg.kind}
          c={dlg.c}
          onClose={() => setDlg(null)}
          onDone={() => {
            setDlg(null)
            reload()
          }}
        />
      )}
    </>
  )
}
