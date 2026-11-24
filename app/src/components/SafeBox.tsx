import { Component, type ReactNode } from 'react'

// Если один чертёж не рисуется (старые/битые данные), не роняем весь экран — показываем запасной блок
export default class SafeBox extends Component<{ children: ReactNode; fallback?: ReactNode }, { bad: boolean }> {
  state = { bad: false }
  static getDerivedStateFromError() {
    return { bad: true }
  }
  componentDidCatch() {
    /* не страшно: чертёж просто не показан */
  }
  render() {
    return this.state.bad ? (this.props.fallback ?? null) : this.props.children
  }
}
