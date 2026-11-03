import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { uz } from './uz'

export type Role = 'rahbar' | 'ishlab' | 'montajchi'
export interface Me {
  id: string
  full_name: string
  role: Role
}
interface AuthState {
  session: Session | null
  me: Me | null
  loading: boolean
  signIn: (login: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthCtx = createContext<AuthState | null>(null)
export const useAuth = (): AuthState => {
  const v = useContext(AuthCtx)
  if (!v) throw new Error('AuthProvider missing')
  return v
}

// логин → служебный email (пользователей создаёт Rahbar)
const toEmail = (login: string) => `${login.trim().toLowerCase()}@ecorom.app`

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (!s) {
        setMe(null)
        setLoading(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    setLoading(true)
    supabase
      .from('employees')
      .select('id, full_name, role')
      .eq('auth_user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        setMe((data as Me | null) ?? null)
        setLoading(false)
      })
  }, [session])

  const signIn = async (login: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: toEmail(login), password })
    return error ? uz.wrongLogin : null
  }
  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return <AuthCtx.Provider value={{ session, me, loading, signIn, signOut }}>{children}</AuthCtx.Provider>
}
