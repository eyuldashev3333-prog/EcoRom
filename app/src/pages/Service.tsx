import { useState } from 'react'
import { Link } from 'react-router-dom'
import ServiceTickets from '../components/ServiceTickets'
import { uz } from '../uz'

const t = uz.service
// новая заявка открывается в карточке заказа (блок «Servis va kafolat»)

// все сервис-заявки: открытые сверху, закрытие с причиной/плательщиком/стоимостью
export default function Service() {
  const [onlyOpen, setOnlyOpen] = useState(true)
  return (
    <>
      <p>
        <Link to="/">←</Link>
      </p>
      <div className="inline head">
        <h1>{t.title}</h1>
        <label className="check">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> {t.onlyOpen}
        </label>
      </div>
      <ServiceTickets onlyOpen={onlyOpen} />
    </>
  )
}
