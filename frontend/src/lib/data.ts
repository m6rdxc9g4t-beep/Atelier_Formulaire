// Chargement des données : un petit hook asynchrone + des « versions » par sujet.
// Après une écriture, invalidate('tree', 'titles'…) fait recharger toutes les vues qui en dépendent.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

export type Topic = 'forms' | 'form' | 'responses'

const versions = new Map<Topic, number>()
const listeners = new Set<() => void>()

export function invalidate(...topics: Topic[]): void {
  for (const t of topics) versions.set(t, (versions.get(t) ?? 0) + 1)
  for (const l of listeners) l()
}

/** Toutes les données changent : après une restauration, un déplacement, une suppression… */
export const invalidateAll = () => invalidate('forms', 'form', 'responses')

export function useTopic(topic: Topic): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => versions.get(topic) ?? 0,
  )
}

export interface AsyncState<T> {
  data: T | undefined
  error: Error | null
  loading: boolean
  reload: () => void
  setData: (value: T) => void
}

/** Charge `loader` à chaque changement de `deps`. Garde la donnée précédente pendant le rechargement (pas de clignotement). */
export function useAsync<T>(loader: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loaderRef
      .current()
      .then((value) => {
        if (cancelled) return
        setData(value)
        setError(null)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, reload, setData }
}
