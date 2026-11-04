// Текущий раздел пейджера главной — общий для фона (камера 3D летит к участку) и навигации.
import { useSyncExternalStore } from 'react'

const KEY = 'ecorom.section'
let current = (() => {
  try {
    return sessionStorage.getItem(KEY) ?? 'zavod'
  } catch {
    return 'zavod'
  }
})()
const subs = new Set<() => void>()

export function setSection(id: string) {
  if (id === current) return
  current = id
  try {
    sessionStorage.setItem(KEY, id)
  } catch {
    /* приватный режим — не страшно */
  }
  subs.forEach((f) => f())
}
export const getSection = () => current
export function useSection() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => current,
  )
}
