// Liste des formulaires, formulaires supprimés, aperçu, réponse (connectés) et réponse par lien public.

import { ClipboardList, Plus, RotateCcw, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'

import { AiDraftDialog } from '../components/AiDraftDialog.tsx'
import { FillForm } from '../components/FillForm.tsx'
import { FormActionsMenu } from '../components/FormActions.tsx'
import { TopBar } from '../components/Header.tsx'
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
  const [aiOpen, setAiOpen] = useState(false)

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

  const actions = (
    <>
      <button type="button" className="btn" onClick={() => setAiOpen(true)}>
        <Sparkles aria-hidden /> <span className="btn__label">Créer avec l’IA</span>
      </button>
      <button type="button" className="btn btn--primary" onClick={() => void create()}>
        <Plus aria-hidden /> Nouveau formulaire
      </button>
    </>
  )
  const list = forms.data
  const open = list?.filter((f) => f.accepting).length ?? 0
  const responses = list?.reduce((n, f) => n + f.responseCount, 0) ?? 0

  return (
    <>
      <TopBar title="Formulaires">{actions}</TopBar>
      {aiOpen && <AiDraftDialog onClose={() => setAiOpen(false)} />}
      {forms.error ? (
        <div className="page">
          <ErrorNotice error={forms.error} onRetry={forms.reload} />
        </div>
      ) : !list ? (
        <div className="page">
          <Skeleton />
        </div>
      ) : list.length === 0 ? (
        <div className="page">
          <div className="empty">
            <span className="atelier-brand__tile empty__icon" aria-hidden="true">
              <ClipboardList />
            </span>
            <p className="empty__title">Aucun formulaire pour l’instant.</p>
            <p className="empty__text">Crée un questionnaire, ouvre-le aux réponses et partage son lien : les réponses arrivent ici, rangées.</p>
            <div className="empty__actions">
              <button type="button" className="btn btn--primary" onClick={() => void create()}>
                <Plus aria-hidden /> Créer le premier formulaire
              </button>
              <button type="button" className="btn" onClick={() => setAiOpen(true)}>
                <Sparkles aria-hidden /> Créer avec l’IA
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <p className="ghead">
            {`${plural(list.length, 'formulaire', 'formulaires')}, ${plural(open, 'ouvert', 'ouverts')} aux réponses, ${plural(responses, 'réponse reçue', 'réponses reçues')}.`}
          </p>
          <ul className="form-rows">
            {list.map((f) => (
              <li key={f.id} className="form-rows__item">
                <a className="form-row-link" href={`/f/${f.id}`} onClick={(e) => onLinkClick(e, `/f/${f.id}`)}>
                  <span className="form-row-link__main">
                    <span className="form-row-link__title">{f.title}</span>
                    <span className="form-row-link__sub">
                      {plural(f.questions.filter((q) => q.type !== 'section').length, 'question', 'questions')}
                      {f.access === 'public' ? ', lien public' : ''}
                      {f.settings.closesAt && f.accepting ? `, ferme le ${formatDate(f.settings.closesAt)}` : ''}
                    </span>
                  </span>
                  <StatusPill form={f} />
                  <span className="form-row-link__count">
                    {f.responseCount} <span className="muted">rép.</span>
                  </span>
                  <span className="form-row-link__date" title={f.lastResponseAt ? formatDate(f.lastResponseAt) : formatDate(f.updatedAt)}>
                    {f.lastResponseAt ? `reçue ${timeAgo(f.lastResponseAt)}` : `modifié ${timeAgo(f.updatedAt)}`}
                  </span>
                </a>
                <FormActionsMenu form={f} context="list" />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

export function DeletedView() {
  const version = useTopic('forms')
  const forms = useAsync(() => api.forms(true), [version])
  const { confirm, toast } = useUi()

  return (
    <>
      <TopBar title="Formulaires supprimés" parent={{ href: '/', label: 'Formulaires', ariaLabel: 'Tous les formulaires' }} />
      {forms.error ? (
        <div className="page">
          <ErrorNotice error={forms.error} onRetry={forms.reload} />
        </div>
      ) : !forms.data ? (
        <div className="page">
          <Skeleton />
        </div>
      ) : (
        <>
          <p className="ghead">Ils restent 30 jours, avec leurs réponses, puis sont effacés.</p>
          {forms.data.length === 0 ? (
            <div className="page">
              <div className="empty">
                <p className="empty__text">Aucun formulaire supprimé.</p>
              </div>
            </div>
          ) : (
            <ul className="form-rows">
              {forms.data.map((f) => (
                <li key={f.id} className="form-rows__item form-rows__item--deleted">
                  <span className="form-row-link__main">
                    <span className="form-row-link__title">{f.title}</span>
                    <span className="form-row-link__sub">
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
        </>
      )}
    </>
  )
}

export function PreviewView({ id }: { id: number }) {
  const form = useAsync(() => api.form(id), [id])
  const parent = { href: '/', label: 'Formulaires', ariaLabel: 'Tous les formulaires' }
  if (form.error || !form.data) {
    return (
      <>
        <TopBar title="Aperçu" parent={parent} />
        <div className="page">{form.error ? <ErrorNotice error={form.error} onRetry={form.reload} /> : <Skeleton />}</div>
      </>
    )
  }
  const f = form.data
  return (
    <FillForm
      key={f.version}
      mode="preview"
      view={{ title: f.title, description: f.description, questions: f.questions, status: f.status, accepting: f.accepting, closesAt: f.settings.closesAt ?? null, confirmation: f.settings.confirmation ?? '', alreadyAnswered: false }}
      banner={
        <TopBar title={f.title || 'Formulaire sans titre'} parent={parent} meta={<span className="top__meta">Aperçu : rien n’est envoyé.</span>}>
          <a className="btn" href={`/f/${id}`} onClick={(e) => onLinkClick(e, `/f/${id}`)}>
            Revenir au formulaire
          </a>
        </TopBar>
      }
    />
  )
}

export function FillView({ id }: { id: number }) {
  const view = useAsync(() => api.fill(id), [id])
  useEffect(() => {
    if (view.data) document.title = `${view.data.title} — Atelier Formulaire`
  }, [view.data])
  const parent = { href: '/', label: 'Formulaires', ariaLabel: 'Tous les formulaires' }
  if (view.error) {
    const gone = view.error instanceof ApiError && view.error.status === 404
    return (
      <>
        <TopBar title="Répondre" parent={parent} />
        <div className="fill">{gone ? <div className="notice">Ce formulaire n’existe pas ou a été supprimé.</div> : <ErrorNotice error={view.error} onRetry={view.reload} />}</div>
      </>
    )
  }
  if (!view.data)
    return (
      <>
        <TopBar title="Répondre" parent={parent} />
        <div className="fill">
          <Skeleton />
        </div>
      </>
    )
  return (
    <FillForm
      mode="suite"
      view={view.data}
      banner={<TopBar title={view.data.title} parent={parent} />}
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
        <div className="notice">{view.error.message}</div>
        {footer}
      </div>
    )
  }
  if (!view.data) return <div className="fill"><Skeleton /></div>
  return <FillForm mode="public" view={view.data} footer={footer} onSubmit={async (answers, website) => void (await api.publicSubmit(token, answers, website))} />
}
