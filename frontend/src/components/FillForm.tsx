// Page de réponse : la même pour l'aperçu, les personnes connectées et le lien public.
// Les contrôles de saisie sont aussi ceux affichés (désactivés) dans le constructeur.

import { CircleAlert, CircleCheck, Lock } from 'lucide-react'
import { useId, useMemo, useState, type ReactNode } from 'react'

import { ApiError, type FillView } from '../lib/api.ts'
import { formatDate } from '../lib/format.ts'
import { clientErrors, isQuestion, type AnswerValue, type Answers, type Question } from '../lib/questions.ts'

interface ControlProps {
  q: Question
  value: AnswerValue | undefined
  onChange: (value: AnswerValue | undefined) => void
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
  labelId?: string
}

/** Contrôle de saisie d'une question, selon son type. */
export function QuestionControl({ q, value, onChange, disabled, invalid, describedBy, labelId }: ControlProps) {
  const name = useId()
  const common = { disabled, 'aria-invalid': invalid || undefined, 'aria-describedby': describedBy }
  switch (q.type) {
    case 'short_text':
    case 'email':
      return (
        <input
          className="field"
          type={q.type === 'email' ? 'email' : 'text'}
          inputMode={q.type === 'email' ? 'email' : undefined}
          autoComplete={q.type === 'email' ? 'email' : 'off'}
          value={typeof value === 'string' ? value : ''}
          placeholder={q.placeholder ?? (q.type === 'email' ? 'nom@exemple.fr' : 'Ta réponse')}
          maxLength={500}
          aria-labelledby={labelId}
          onChange={(e) => onChange(e.target.value)}
          {...common}
        />
      )
    case 'long_text':
      return (
        <textarea
          className="field"
          rows={4}
          value={typeof value === 'string' ? value : ''}
          placeholder={q.placeholder ?? 'Ta réponse'}
          maxLength={10000}
          aria-labelledby={labelId}
          onChange={(e) => onChange(e.target.value)}
          {...common}
        />
      )
    case 'number':
      return (
        <input
          className="field"
          type="text"
          inputMode="decimal"
          style={{ maxWidth: 220 }}
          value={value === undefined ? '' : String(value)}
          placeholder={q.placeholder ?? (q.min !== undefined && q.max !== undefined ? `De ${q.min} à ${q.max}` : 'Nombre')}
          aria-labelledby={labelId}
          onChange={(e) => onChange(e.target.value)}
          {...common}
        />
      )
    case 'date':
      return (
        <input
          className="field"
          type="date"
          style={{ maxWidth: 220 }}
          value={typeof value === 'string' ? value : ''}
          aria-labelledby={labelId}
          onChange={(e) => onChange(e.target.value)}
          {...common}
        />
      )
    case 'single':
      return (
        <div role="radiogroup" aria-labelledby={labelId} aria-describedby={describedBy}>
          {(q.options ?? []).map((o) => (
            <label key={o} className="choice">
              <input type="radio" name={name} checked={value === o} disabled={disabled} onChange={() => onChange(o)} />
              <span>{o}</span>
            </label>
          ))}
          {!q.required && typeof value === 'string' && !disabled && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange(undefined)}>
              Effacer mon choix
            </button>
          )}
        </div>
      )
    case 'multiple': {
      const list = Array.isArray(value) ? value : []
      return (
        <div role="group" aria-labelledby={labelId} aria-describedby={describedBy}>
          {(q.options ?? []).map((o) => (
            <label key={o} className="choice">
              <input
                type="checkbox"
                checked={list.includes(o)}
                disabled={disabled}
                onChange={(e) => onChange(e.target.checked ? [...list, o] : list.filter((x) => x !== o))}
              />
              <span>{o}</span>
            </label>
          ))}
        </div>
      )
    }
    case 'dropdown':
      return (
        <select className="field" style={{ maxWidth: 360 }} value={typeof value === 'string' ? value : ''} aria-labelledby={labelId} onChange={(e) => onChange(e.target.value || undefined)} {...common}>
          <option value="">Choisir…</option>
          {(q.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )
    case 'scale': {
      const min = q.min ?? 1
      const max = q.max ?? 5
      return (
        <div>
          <div className="scale" role="radiogroup" aria-labelledby={labelId} aria-describedby={describedBy}>
            {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={value === n}
                aria-pressed={value === n}
                disabled={disabled}
                onClick={() => onChange(value === n && !q.required ? undefined : n)}
              >
                {n}
              </button>
            ))}
          </div>
          {(q.minLabel || q.maxLabel) && (
            <div className="scale__labels" aria-hidden>
              <span>
                {min} : {q.minLabel}
              </span>
              <span>
                {max} : {q.maxLabel}
              </span>
            </div>
          )}
        </div>
      )
    }
    case 'yes_no':
      return (
        <div className="yesno" role="radiogroup" aria-labelledby={labelId} aria-describedby={describedBy}>
          {[true, false].map((b) => (
            <button key={String(b)} type="button" role="radio" aria-checked={value === b} aria-pressed={value === b} disabled={disabled} onClick={() => onChange(value === b && !q.required ? undefined : b)}>
              {b ? 'Oui' : 'Non'}
            </button>
          ))}
        </div>
      )
    default:
      return null
  }
}

/** Une question à remplir : libellé, aide, contrôle, erreur. */
function FillQuestion({ q, value, error, onChange, disabled }: { q: Question; value: AnswerValue | undefined; error?: string; onChange: (v: AnswerValue | undefined) => void; disabled?: boolean }) {
  const id = useId()
  if (q.type === 'section') {
    return (
      <div className="fill-section">
        <h2>{q.label}</h2>
        {q.help && <p>{q.help}</p>}
      </div>
    )
  }
  return (
    <div className="fill-q" data-invalid={Boolean(error)} id={`q-${q.id}`}>
      <span className="fill-q__label" id={`${id}-label`}>
        {q.label || <span className="muted">Question sans titre</span>}
        {q.required && (
          <span className="req" aria-label="obligatoire">
            *
          </span>
        )}
      </span>
      {q.help && (
        <p className="fill-q__help" id={`${id}-help`}>
          {q.help}
        </p>
      )}
      <div className="fill-q__control">
        <QuestionControl q={q} value={value} onChange={onChange} disabled={disabled} invalid={Boolean(error)} labelId={`${id}-label`} describedBy={[q.help && `${id}-help`, error && `${id}-err`].filter(Boolean).join(' ') || undefined} />
      </div>
      {error && (
        <p className="fill-q__error" id={`${id}-err`} role="alert">
          <CircleAlert aria-hidden /> {error}
        </p>
      )}
    </div>
  )
}

interface FillFormProps {
  view: FillView
  mode: 'preview' | 'suite' | 'public'
  /** Envoi : lève une ApiError (avec `errors` par question si le serveur refuse des réponses). */
  onSubmit?: (answers: Answers, website: string) => Promise<void>
  banner?: ReactNode
  footer?: ReactNode
}

export function FillForm({ view, mode, onSubmit, banner, footer }: FillFormProps) {
  const [answers, setAnswers] = useState<Answers>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [website, setWebsite] = useState('')

  const questions = view.questions.filter(isQuestion)
  const answered = questions.filter((q) => {
    const v = answers[q.id]
    return !(v === undefined || v === '' || (Array.isArray(v) && v.length === 0))
  }).length
  const progress = questions.length ? Math.round((answered / questions.length) * 100) : 0
  const hasRequired = useMemo(() => questions.some((q) => q.required), [questions])

  const set = (id: string, value: AnswerValue | undefined) => {
    setAnswers((a) => {
      const next = { ...a }
      if (value === undefined) delete next[id]
      else next[id] = value
      return next
    })
    if (errors[id]) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== id)))
  }

  const focusFirstError = (errs: Record<string, string>) => {
    const first = view.questions.find((q) => errs[q.id])
    if (first) {
      const el = document.getElementById(`q-${first.id}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.querySelector<HTMLElement>('input, textarea, select, button')?.focus({ preventScroll: true })
    }
  }

  const submit = async () => {
    setFormError(null)
    const errs = clientErrors(view.questions, answers)
    if (Object.keys(errs).length) {
      setErrors(errs)
      focusFirstError(errs)
      return
    }
    if (mode === 'preview' || !onSubmit) {
      setDone(true)
      return
    }
    setSending(true)
    try {
      await onSubmit(answers, website)
      setDone(true)
      window.scrollTo({ top: 0 })
    } catch (error) {
      if (error instanceof ApiError && error.body.errors && Object.keys(error.body.errors as object).length) {
        const errs = error.body.errors as Record<string, string>
        setErrors(errs)
        focusFirstError(errs)
      } else setFormError((error as Error).message)
    } finally {
      setSending(false)
    }
  }

  const closedMessage = !view.accepting
    ? view.status === 'draft'
      ? 'Ce formulaire n’est pas encore ouvert aux réponses.'
      : `Ce formulaire n’accepte plus de réponses${view.closesAt && view.status === 'open' ? ` depuis le ${formatDate(view.closesAt)}` : ''}.`
    : view.alreadyAnswered
      ? 'Tu as déjà répondu à ce formulaire. Merci !'
      : null

  if (done) {
    return (
      <>
        {banner}
        <div className="fill">
          <div className="card fill__done" role="status">
            <CircleCheck aria-hidden />
            <h1>{mode === 'preview' ? 'Aperçu : la réponse n’a pas été envoyée' : 'Réponse envoyée'}</h1>
            <p className="muted" style={{ whiteSpace: 'pre-line' }}>
              {view.confirmation || 'Merci, ta réponse est enregistrée.'}
            </p>
            {!(view.alreadyAnswered || mode === 'suite') && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setAnswers({})
                  setDone(false)
                }}
              >
                Envoyer une autre réponse
              </button>
            )}
          </div>
          {footer}
        </div>
      </>
    )
  }

  const blocked = Boolean(closedMessage) && mode !== 'preview'

  return (
    <>
      {banner}
      <div className="progress-rail" aria-hidden>
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="fill">
        <header className="card card--intro fill__head">
          <h1>{view.title}</h1>
          {view.description && <p className="fill__desc">{view.description}</p>}
          {hasRequired && !blocked && (
            <p className="fill__legend">
              <span className="req">*</span> Réponse obligatoire
            </p>
          )}
        </header>

        {blocked ? (
          <div className="notice" style={{ marginTop: '1.2rem' }}>
            <Lock aria-hidden />
            <div>{closedMessage}</div>
          </div>
        ) : (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            {mode === 'public' && (
              <div className="honeypot" aria-hidden>
                <label>
                  Ne pas remplir
                  <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                </label>
              </div>
            )}
            <div className="fill__list">
              {view.questions.map((q) => (
                <FillQuestion key={q.id} q={q} value={answers[q.id]} error={errors[q.id]} onChange={(v) => set(q.id, v)} />
              ))}
            </div>
            {formError && (
              <div className="notice notice--danger" role="alert" style={{ marginTop: '1rem' }}>
                <CircleAlert aria-hidden />
                <div>{formError}</div>
              </div>
            )}
            <div className="fill__submit">
              <button type="submit" className="btn btn--primary" disabled={sending}>
                {sending ? 'Envoi…' : mode === 'preview' ? 'Envoyer (aperçu)' : 'Envoyer ma réponse'}
              </button>
              <span className="muted" style={{ fontSize: 13 }}>
                Questions remplies : {answered} sur {questions.length}
              </span>
            </div>
          </form>
        )}
        {footer}
      </div>
    </>
  )
}
