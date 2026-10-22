// Liste des formulaires, formulaires supprimés, aperçu, réponse (connectés) et réponse par lien public.

import { ArrowLeft, ClipboardList, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useEffect } from 'react'

import { FillForm } from '../components/FillForm.tsx'
import { FormActionsMenu } from '../components/FormActions.tsx'
import { ErrorNotice, Skeleton, useUi } from '../components/ui.tsx'
import { api, ApiError } from '../lib/api.ts'
import { invalidate, useAsync, useTopic } from '../lib/data.ts'
import { formatDate, plural, timeAgo } from '../lib/format.ts'
import { navigate, onLinkClick } from '../lib/router.ts'
import { StatusPill } from './FormPage.tsx'

export function HomeView() {
  const version = useTopic('forms')
  const forms = useAsync(() => api.forms(), [version])
  const { prompt, toast } = useUi()

  useEffect(() => {
    document.title = 'Atelier Formulaire'
  }, [])

  const create = async () => {
    const title = await prompt({
      title: 'Nouveau formulaire',
      text: 'Inscription, sondage, retour d’expérience, demande… Tu pourras changer le titre ensuite.',
      confirmLabel: 'Créer et ajouter les questions',
      placeholder: 'Titre du formulaire',
    })
    if (!title) return
    try {
      const form = await api.createForm({ title })
      invalidate('forms')
      navigate(`/f/${form.id}`)
    } catch (err) {
      toast((err as Error).message, { tone: 'danger' })
    }
  }

  if (forms.error) return <ErrorNotice error={forms.error} onRetry={forms.reload} />
  if (!forms.data) return <Skeleton />
  const list = forms.data
  const open = list.filter((f) => f.accepting).length
  const responses = list.reduce((n, f) => n + f.responseCount, 0)

  return (
    <div className="column">
      <div className="list-head">
        <div>
          <h1>Formulaires</h1>
          <p>
            {list.length === 0
              ? 'Aucun formulaire pour l’instant.'
              : `${plural(list.length, 'formulaire', 'formulaires')}, ${plural(open, 'ouvert', 'ouverts')} aux réponses, ${plural(responses, 'réponse reçue', 'réponses reçues')}.`}
          </p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => void create()}>
          <Plus aria-hidden /> Nouveau formulaire
        </button>
      </div>

      {list.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
          <ClipboardList aria-hidden width={36} height={36} style={{ color: 'var(--accent-ink)' }} />
          <p style={{ margin: '0.8rem 0 1.2rem' }}>Crée un questionnaire, ouvre-le aux réponses et partage son lien : les réponses arrivent ici, rangées.</p>
          <button type="button" className="btn btn--primary" onClick={() => void create()}>
            <Plus aria-hidden /> Créer le premier formulaire
          </button>
        </div>
      ) : (
        <ul className="form-rows">
          {list.map((f) => (
            <li key={f.id} className="form-rows__item">
              <a className="form-row-link" href={`/f/${f.id}`} onClick={(e) => onLinkClick(e, `/f/${f.id}`)}>
                <span style={{ minWidth: 0 }}>
                  <span className="form-row-link__title" style={{ display: 'block' }}>
                    {f.title}
                  </span>
                  <span className="form-row-link__sub" style={{ display: 'block' }}>
                    {plural(f.questions.filter((q) => q.type !== 'section').length, 'question', 'questions')}
                    {f.access === 'public' ? ', lien public' : ''}
                    {f.settings.closesAt && f.accepting ? `, ferme le ${formatDate(f.settings.closesAt)}` : ''}
                  </span>
                </span>
                <StatusPill form={f} />
                <span className="form-row-link__count">
                  <strong>{f.responseCount}</strong> <span className="muted">rép.</span>
                </span>
                <span className="form-row-link__date" title={f.lastResponseAt ? formatDate(f.lastResponseAt) : formatDate(f.updatedAt)}>
                  {f.lastResponseAt ? `reçue ${timeAgo(f.lastResponseAt)}` : `modifié ${timeAgo(f.updatedAt)}`}
                </span>
              </a>
              <FormActionsMenu form={f} context="list" />
            </li>
          ))}
        </ul>
      )}
      <p style={{ marginTop: '1.6rem' }}>
        <a className="btn btn--ghost btn--sm" href="/supprimes" onClick={(e) => onLinkClick(e, '/supprimes')}>
          <Trash2 aria-hidden /> Formulaires supprimés
        </a>
      </p>
    </div>
  )
}

export function DeletedView() {
  const version = useTopic('forms')
  const forms = useAsync(() => api.forms(true), [version])
  const { confirm, toast } = useUi()

  if (forms.error) return <ErrorNotice error={forms.error} onRetry={forms.reload} />
  if (!forms.data) return <Skeleton />

  return (
    <div className="column">
      <a className="back-link" href="/" onClick={(e) => onLinkClick(e, '/')}>
        <ArrowLeft aria-hidden /> Tous les formulaires
      </a>
      <div className="list-head">
        <div>
          <h1>Formulaires supprimés</h1>
          <p>Ils restent 30 jours, avec leurs réponses, puis sont effacés.</p>
        </div>
      </div>
      {forms.data.length === 0 ? (
        <div className="card">Aucun formulaire supprimé.</div>
      ) : (
        <ul className="form-rows">
          {forms.data.map((f) => (
            <li key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.8rem 0.4rem' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="form-row-link__title" style={{ display: 'block' }}>
                  {f.title}
                </span>
                <span className="form-row-link__sub" style={{ display: 'block' }}>
                  Supprimé {timeAgo(f.deletedAt!)}, {plural(f.responseCount, 'réponse', 'réponses')}
                </span>
              </span>
              <button
                type="button"
                className="btn btn--sm"
                onClick={async () => {
                  await api.restoreForm(f.id)
                  invalidate('forms')
                  toast(`« ${f.title} » est restauré (fermé).`, { action: { label: 'Ouvrir', run: () => navigate(`/f/${f.id}`) } })
                }}
              >
                <RotateCcw aria-hidden /> Restaurer
              </button>
              <button
                type="button"
                className="btn btn--sm btn--danger"
                onClick={async () => {
                  const ok = await confirm({
                    title: `Effacer définitivement « ${f.title} » ?`,
                    text: `Le formulaire et ses ${f.responseCount} réponse(s) seront effacés. Impossible de revenir en arrière.`,
                    confirmLabel: 'Effacer définitivement',
                    danger: true,
                  })
                  if (!ok) return
                  await api.purgeForm(f.id)
                  invalidate('forms')
                }}
              >
                Effacer
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function PreviewView({ id }: { id: number }) {
  const form = useAsync(() => api.form(id), [id])
  if (form.error) return <ErrorNotice error={form.error} onRetry={form.reload} />
  if (!form.data) return <Skeleton />
  const f = form.data
  return (
    <FillForm
      key={f.version}
      mode="preview"
      view={{ title: f.title, description: f.description, questions: f.questions, status: f.status, accepting: f.accepting, closesAt: f.settings.closesAt ?? null, confirmation: f.settings.confirmation ?? '', alreadyAnswered: false }}
      banner={
        <div className="preview-banner">
          Aperçu : rien n’est envoyé.
          <a className="btn btn--sm" href={`/f/${id}`} onClick={(e) => onLinkClick(e, `/f/${id}`)}>
            Revenir au formulaire
          </a>
        </div>
      }
    />
  )
}

export function FillView({ id }: { id: number }) {
  const view = useAsync(() => api.fill(id), [id])
  useEffect(() => {
    if (view.data) document.title = `${view.data.title} — Atelier Formulaire`
  }, [view.data])
  if (view.error) {
    const gone = view.error instanceof ApiError && view.error.status === 404
    return <div className="fill">{gone ? <div className="card">Ce formulaire n’existe pas ou a été supprimé.</div> : <ErrorNotice error={view.error} onRetry={view.reload} />}</div>
  }
  if (!view.data) return <div className="fill"><Skeleton /></div>
  return (
    <FillForm
      mode="suite"
      view={view.data}
      onSubmit={async (answers) => {
        await api.submit(id, answers)
        invalidate('forms', 'responses')
      }}
    />
  )
}

/** Réponse par lien public : aucune autre requête que celles du formulaire (pas de session). */
export function PublicView({ token }: { token: string }) {
  const view = useAsync(() => api.publicFill(token), [token])
  useEffect(() => {
    if (view.data) document.title = view.data.title
  }, [view.data])
  const footer = <p className="fill__foot">Formulaire envoyé avec Atelier Formulaire. Ne communique jamais de mot de passe dans un formulaire.</p>
  if (view.error) {
    return (
      <div className="fill">
        <div className="card">{view.error.message}</div>
        {footer}
      </div>
    )
  }
  if (!view.data) return <div className="fill"><Skeleton /></div>
  return <FillForm mode="public" view={view.data} footer={footer} onSubmit={async (answers, website) => void (await api.publicSubmit(token, answers, website))} />
}
