import { Component, type ErrorInfo, type ReactNode } from 'react'
import { uz } from '../uz'

// Граница ошибок экрана: если один экран упал (например, у позиции битый чертёж), остальные маршруты продолжают работать,
// а пользователь видит сообщение вместо белого экрана. Сбрасывается при смене маршрута (key = pathname).
export default class RouteBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('screen crashed', error, info.componentStack)
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="card note bad" style={{ margin: 16 }}>
        <p>{uz.screenCrashed}</p>
        <button type="button" onClick={() => window.location.reload()}>
          {uz.reload}
        </button>{' '}
        <button type="button" className="ghost" onClick={() => (window.location.hash = '#/')}>
          {uz.toHome}
        </button>
      </div>
    )
  }
}
