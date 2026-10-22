// Personne connectée et adresse publique de l'app (pour les liens de partage).

import { createContext, useContext, type ReactNode } from 'react'

import { api } from '../lib/api.ts'
import { useAsync } from '../lib/data.ts'

interface AppContextValue {
  user: string
  publicUrl: string | null
}

const AppContext = createContext<AppContextValue>({ user: '', publicUrl: null })

export const useApp = () => useContext(AppContext)

export function AppProvider({ children }: { children: ReactNode }) {
  const me = useAsync(() => api.me(), [])
  return <AppContext.Provider value={{ user: me.data?.user ?? '', publicUrl: me.data?.publicUrl ?? null }}>{children}</AppContext.Provider>
}
