// Édition d'un formulaire avec enregistrement automatique (700 ms après la dernière modification).
// Un seul enregistrement à la fois ; une modification faite pendant l'envoi repart juste après.
// Si quelqu'un d'autre a enregistré entre-temps (409), l'édition s'arrête et propose de recharger.

import { useCallback, useEffect, useRef, useState } from 'react'

import { api, ApiError, type Form, type FormSettings } from './api.ts'
import type { Question } from './questions.ts'

export interface Draft {
  title: string
  description: string
  questions: Question[]
  settings: FormSettings
}

export type SaveState = 'saved' | 'pending' | 'saving' | 'error' | 'conflict'

const draftOf = (f: Form): Draft => ({ title: f.title, description: f.description, questions: f.questions, settings: f.settings })
const same = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b)

export function useFormEditor(initial: Form) {
  const [form, setForm] = useState(initial)
  const [draft, setDraft] = useState<Draft>(() => draftOf(initial))
  const [state, setState] = useState<SaveState>('saved')
  const [error, setError] = useState<string | null>(null)

  const formRef = useRef(form)
  const draftRef = useRef(draft)
  const saving = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  formRef.current = form
  draftRef.current = draft

  const save = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (saving.current) return
    const server = formRef.current
    const sent = draftRef.current
    if (same(sent, draftOf(server))) {
      setState('saved')
      return
    }
    saving.current = true
    setState('saving')
    try {
      const saved = await api.updateForm(server.id, { ...sent, baseVersion: server.version })
      formRef.current = saved
      setForm(saved)
      setError(null)
      // Une modification est arrivée pendant l'envoi : on repart.
      if (!same(draftRef.current, sent)) {
        saving.current = false
        void save()
        return
      }
      setState('saved')
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CONFLICT') {
        setState('conflict')
        setError(err.message)
      } else {
        setState('error')
        setError((err as Error).message)
      }
    } finally {
      saving.current = false
    }
  }, [])

  const update = useCallback(
    (patch: Partial<Draft> | ((d: Draft) => Partial<Draft>)) => {
      setDraft((d) => {
        const next = { ...d, ...(typeof patch === 'function' ? patch(d) : patch) }
        draftRef.current = next
        return next
      })
      setState((s) => (s === 'conflict' ? s : 'pending'))
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void save(), 700)
    },
    [save],
  )

  /** Nouvelle version venue du serveur (ouverture, partage…) : les modifications locales en attente sont gardées. */
  const replace = useCallback((next: Form) => {
    formRef.current = next
    setForm(next)
    if (!timer.current && !saving.current) {
      setDraft(draftOf(next))
      draftRef.current = draftOf(next)
    }
  }, [])

  /** Abandonne les modifications locales et repart de la version du serveur. */
  const reload = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const fresh = await api.form(formRef.current.id)
    formRef.current = fresh
    setForm(fresh)
    setDraft(draftOf(fresh))
    draftRef.current = draftOf(fresh)
    setState('saved')
    setError(null)
  }, [])

  // En quittant la page : ce qui attend part tout de suite. Fermer l'onglet avec un envoi en attente : confirmation.
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (timer.current || saving.current) e.preventDefault()
    }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      if (timer.current) void save()
    }
  }, [save])

  return { form, draft, state, error, update, save, replace, reload }
}

export type FormEditor = ReturnType<typeof useFormEditor>
