import { describe, expect, it } from 'vitest'
import { fetchAll } from './fetchAll'

// имитация PostgREST: больше max_rows строк за раз не отдаёт
const source = (n: number, maxRows = 1000) => (from: number, to: number) => {
  const end = Math.min(to, from + maxRows - 1, n - 1)
  const data = from > end ? [] : Array.from({ length: end - from + 1 }, (_, i) => from + i)
  return Promise.resolve({ data, error: null })
}

describe('fetchAll', () => {
  it('читает все строки, даже если их больше max_rows', async () => {
    for (const n of [0, 1, 999, 1000, 1001, 2500, 10000]) {
      const r = await fetchAll(source(n))
      expect(r.error).toBeNull()
      expect(r.data.length).toBe(n)
      if (n > 0) expect(r.data[n - 1]).toBe(n - 1)
    }
  })
  it('работает с маленькой страницей (вложенные выборки)', async () => {
    const r = await fetchAll(source(777), 250)
    expect(r.data.length).toBe(777)
  })
  it('возвращает ошибку и то, что успел прочитать', async () => {
    let calls = 0
    const r = await fetchAll(() => {
      calls++
      return Promise.resolve(calls === 1 ? { data: Array(1000).fill(1), error: null } : { data: null, error: { message: 'boom' } })
    })
    expect(r.error).toBe('boom')
    expect(r.data.length).toBe(1000)
  })
})
