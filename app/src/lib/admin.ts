import { supabase } from '../supabase'

// Вызов серверной функции admin-users (только Rahbar). Возвращает текст ошибки на узбекском или null.
export async function callAdmin(body: Record<string, unknown>): Promise<{ error: string | null; data?: { id?: string } }> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (!error) return { error: null, data }
  let msg = error.message
  try {
    const j = await (error as unknown as { context: Response }).context.json()
    msg = j.error ?? msg
  } catch {
    /* тело ответа не JSON */
  }
  return { error: msg }
}

const ALPHABET = 'abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRTUVWXYZ2345679'
export function generatePassword(len = 10): string {
  const bytes = crypto.getRandomValues(new Uint32Array(len))
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}
