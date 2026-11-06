// Un formulaire : en-tête (statut, enregistrement, aperçu, ouverture) et ses trois onglets.

import { Eye, Lock, Play, RotateCcw } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

import { FormActionsMenu } from '../components/FormActions.tsx'
import { TopBar } from '../components/Header.tsx'
import { ErrorNotice, Skeleton, useUi } from '../components/ui.tsx'
import { api, ApiError, type Form, type FormStatus } from '../lib/api.ts'
import { invalidate, useAsync, useTopic } from '../lib/data.ts'
import { navigate, onLinkClick, type FormTab } from '../lib/router.ts'
import { useFormEditor, type SaveState } from '../lib/useFormEditor.ts'
import { Builder } from './Builder.tsx'
import { ResponsesTab } from './ResponsesTab.tsx'
import { ShareTab } from './ShareTab.tsx'

export const STATUS_LABELS: Record<FormStatus, string> = { draft: 'En préparation', open: 'Ouvert', closed: 'Fermé' }

export function StatusPill({ form }: { form: Pick<Form, 'status' | 'accepting'> }) {
  const status = form.status === 'open' && !form.accepting ? 'closed' : form.status
  return (
    <span className="status-pill" data-status={status}>
      {form.status === 'open' && !form.accepting ? 'Fermé (date passée)' : STATUS_LABELS[form.status]}
    </span>
  )
}

const SAVE_TEXT: Record<SaveState, string> = {
  saved: 'Enregistré',
  pending: 'Modifications en attente…',
  saving: 'Enregistrement…',
  error: 'Enregistrement impossible',
  conflict: 'Modifié ailleurs',
}

const PARENT = { href: '/', label: 'Formulaires', ariaLabel: 'Tous les formulaires' }

export function FormPage({ id, tab }: { id: number; tab: FormTab }) {
  const version = useTopic('form')
  const loaded = useAsync(() => api.form(id), [id, version])
  const waiting = (body: ReactNode) => (
    <>
      <TopBar title="Formulaire" parent={PARENT} />
      <div className="page">{body}</div>
    </>
  )
  if (loaded.error) return waiting(<ErrorNotice error={loaded.error} onRetry={loaded.reload} />)
  if (!loaded.data || loaded.data.id !== id) return waiting(<Skeleton />)
  if (loaded.data.deletedAt) return waiting(<ErrorNotice error={new Error('Ce formulaire a été supprimé : restaure-le depuis « Formulaires supprimés ».')} />)
  return <FormEditorPage key={id} initial={loaded.data} tab={tab} />
}

function FormEditorPage({ initial, tab }: { initial: Form; tab: FormTab }) {
  const editor = useFormEditor(initial)
  const { form, draft, state, error } = editor
  const { toast } = useUi()
  const base = `/f/${form.id}`

  useEffect(() => {
    document.title = `${draft.title || 'Formulaire'} — Atelier Formulaire`
  }, [draft.title])

  const setStatus = async (status: FormStatus) => {
    try {
      await editor.save()
      const next = await api.setStatus(form.id, status)
      editor.replace(next)
      invalidate('forms')
      toast(status === 'open' ? 'Formulaire ouvert : il accepte les réponses.' : status === 'closed' ? 'Formulaire fermé : il n’accepte plus de réponses.' : 'Formulaire remis en préparation.')
    } catch (err) {
      const problems = err instanceof ApiError ? (err.body.problems as string[] | undefined) : undefined
      toast(problems?.length ? `Impossible d’ouvrir : ${problems[0]}` : (err as Error).message, { tone: 'danger' })
    }
  }

  const tabs: { id: FormTab; label: string; href: string; count?: number }[] = [
    { id: 'questions', label: 'Questions', href: base },
    { id: 'reponses', label: 'Réponses', href: `${base}/reponses`, count: form.responseCount },
    { id: 'partage', label: 'Partage et réglages', href: `${base}/partage` },
  ]

  return (
    <div>
      <TopBar
        title={draft.title || 'Formulaire sans titre'}
        parent={PARENT}
        meta={
          <>
            <StatusPill form={form} />
            <span className="save-state" data-state={state === 'error' || state === 'conflict' ? 'error' : undefined} role="status" title={error ?? undefined}>
              {SAVE_TEXT[state]}
            </span>
          </>
        }
      >
        <a className="btn" href={`${base}/apercu`} onClick={(e) => onLinkClick(e, `${base}/apercu`)} title="Voir le formulaire comme la personne qui répond">
          <Eye aria-hidden /> Aperçu
        </a>
        {form.status === 'open' && form.accepting ? (
          <button type="button" className="btn" onClick={() => setStatus('closed')}>
            <Lock aria-hidden /> Fermer
          </button>
        ) : (
          <button type="button" className="btn btn--primary" onClick={() => setStatus('open')}>
            {form.status === 'draft' ? <Play aria-hidden /> : <RotateCcw aria-hidden />} {form.status === 'draft' ? 'Ouvrir aux réponses' : 'Rouvrir'}
          </button>
        )}
        <FormActionsMenu
          form={{ ...form, title: draft.title || form.title }}
          context="page"
          beforeDelete={editor.save}
          onDeleted={() => navigate('/', { replace: true })}
        />
      </TopBar>

      <nav className="tabs" aria-label="Sections du formulaire">
        {tabs.map((t) => (
          <a key={t.id} href={t.href} aria-current={tab === t.id ? 'page' : undefined} onClick={(e) => onLinkClick(e, t.href)}>
            {t.label}
            {t.count !== undefined && t.count > 0 && <span className="count">{t.count}</span>}
          </a>
        ))}
      </nav>

      {(state === 'conflict' || state === 'error') && (
        <div className="page page--flush">
          <div className="notice notice--danger column" role="alert">
            <div style={{ flex: 1 }}>{error}</div>
            {state === 'conflict' ? (
              <button type="button" className="btn btn--sm" onClick={() => void editor.reload()}>
                Recharger (perd mes dernières modifications)
              </button>
            ) : (
              <button type="button" className="btn btn--sm" onClick={() => void editor.save()}>
                Réessayer
              </button>
            )}
          </div>
        </div>
      )}

      <div className="page">
        {tab === 'questions' && <Builder editor={editor} />}
        {tab === 'reponses' && <ResponsesTab form={form} questions={draft.questions} />}
        {tab === 'partage' && <ShareTab editor={editor} />}
      </div>
    </div>
  )
}
