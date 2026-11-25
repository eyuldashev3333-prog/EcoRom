// PostgREST отдаёт не больше max_rows (1000) строк и молча обрезает остальное. Любая выборка, по которой считают
// или показывают «всё», читается страницами, пока строки не кончатся — без тихой потери данных.
export const PAGE = 1000

interface Page<T> {
  data: T[] | null
  error: { message: string } | null
}

/** приводит построитель запроса supabase (.range(a, b)) к виду, который понимает fetchAll */
export const asPage = <T,>(q: unknown) => q as PromiseLike<Page<T>>

/** build(from, to) должен вернуть запрос с .range(from, to) и устойчивой сортировкой (с уникальным ключом в конце) */
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<Page<T>>, page = PAGE): Promise<{ data: T[]; error: string | null }> {
  const out: T[] = []
  for (let from = 0; ; from += page) {
    const r = await build(from, from + page - 1)
    if (r.error) return { data: out, error: r.error.message }
    const got = r.data ?? []
    out.push(...got)
    if (got.length < page) return { data: out, error: null }
  }
}
