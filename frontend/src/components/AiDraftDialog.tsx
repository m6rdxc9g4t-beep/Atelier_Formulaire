// « Créer avec l'IA » : la personne décrit son formulaire, l'IA locale (Ollama) propose un brouillon, affiché en aperçu
// avec les corrections éventuelles. Rien n'est créé avant « Créer ce formulaire », qui passe par la création habituelle
// (POST /api/forms) puis ouvre le constructeur pour les retouches.

import { AlertTriangle, LoaderCircle, RefreshCw, Sparkles, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import { draftErrorMessage, MAX_DESCRIPTION, MAX_QUESTIONS, MIN_QUESTIONS, parseQuestionCount, questionDetail, statusProblem } from '../lib/aiDraft.ts'
import { api, type FormDraftResult } from '../lib/api.ts'
import { invalidate, useAsync } from '../lib/data.ts'
import { plural } from '../lib/format.ts'
import { navigate } from '../lib/router.ts'

type Phase = 'describe' | 'loading' | 'result'

const EXAMPLES = ['Un sondage de satisfaction après un atelier cuisine', 'Inscription à la sortie vélo, avec la taille de t-shirt']

export function AiDraftDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const ids = useId()
  const status = useAsync(() => api.aiStatus(), [])
  const [phase, setPhase] = useState<Phase>('describe')
  const [description, setDescription] = useState('')
  const [count, setCount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<FormDraftResult | null>(null)
  const [creating, setCreating] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => {
    ref.current?.showModal()
    // Fermeture de la fenêtre (ou de la page) pendant une génération : on l'arrête.
    return () => controller.current?.abort()
  }, [])

  useEffect(() => {
    if (phase !== 'loading') return
    const started = Date.now()
    setElapsed(0)
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [phase])

  const problem = statusProblem(status.data)
  const questionCount = parseQuestionCount(count)
  const canGenerate = description.trim().length > 0 && description.length <= MAX_DESCRIPTION && questionCount !== null && !problem

  const close = () => {
    controller.current?.abort()
    ref.current?.close()
    onClose()
  }

  const generate = async () => {
    if (!canGenerate) return
    const abort = new AbortController()
    controller.current = abort
    setError(null)
    setPhase('loading')
    try {
      const next = await api.formDraft({ description: description.trim(), ...(questionCount ? { questionCount } : {}) }, abort.signal)
      if (abort.signal.aborted) return
      setResult(next)
      setPhase('result')
    } catch (err) {
      if (abort.signal.aborted) {
        setPhase(result ? 'result' : 'describe')
        return
      }
      setError(draftErrorMessage(err))
      setPhase(result ? 'result' : 'describe')
      // Le serveur ou le modèle a peut-être changé d'état : on revérifie.
      status.reload()
    } finally {
      if (controller.current === abort) controller.current = null
    }
  }

  const cancel = () => {
    controller.current?.abort()
    controller.current = null
    setError('Génération annulée.')
    setPhase(result ? 'result' : 'describe')
  }

  const create = async () => {
    if (!result) return
    setCreating(true)
    setError(null)
    try {
      const form = await api.createForm(result.draft)
      invalidate('forms')
      ref.current?.close()
      onClose()
      navigate(`/f/${form.id}`)
    } catch (err) {
      setError((err as Error).message)
      setCreating(false)
    }
  }

  const loading = phase === 'loading'
  const draft = result?.draft
  let number = 0

  return (
    <dialog
      ref={ref}
      className="dialog ai-dialog"
      aria-labelledby={`${ids}-title`}
      aria-busy={loading}
      onCancel={(e) => {
        e.preventDefault()
        if (loading) cancel()
        else close()
      }}
    >
      <div className="ai-dialog__head">
        <h2 id={`${ids}-title`} className="dialog__title ai-dialog__title">
          <Sparkles aria-hidden /> Créer avec l’IA
        </h2>
        <button type="button" className="btn btn--ghost btn--icon btn--sm" aria-label="Fermer" onClick={close}>
          <X />
        </button>
      </div>

      <div className="dialog__body ai-dialog__body">
        {problem && (
          <div className="notice notice--warning">
            <AlertTriangle aria-hidden />
            <div style={{ flex: 1 }}>{problem}</div>
            <button type="button" className="btn btn--sm" onClick={status.reload} disabled={status.loading}>
              Revérifier
            </button>
          </div>
        )}

        {phase !== 'result' && (
          <form
            id={`${ids}-form`}
            onSubmit={(e) => {
              e.preventDefault()
              void generate()
            }}
          >
            <p className="dialog__text">
              L’IA locale propose un titre et des questions ; tu vois l’aperçu avant de créer quoi que ce soit, puis tu retouches le formulaire comme d’habitude.
            </p>
            <div className="form-row">
              <label className="label" htmlFor={`${ids}-description`}>
                Décris ton formulaire
              </label>
              <textarea
                id={`${ids}-description`}
                className="field"
                rows={5}
                autoFocus
                maxLength={MAX_DESCRIPTION}
                value={description}
                disabled={loading}
                placeholder={`Ex. : ${EXAMPLES[0]}`}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    void generate()
                  }
                }}
                aria-describedby={`${ids}-hint`}
              />
              <p id={`${ids}-hint`} className="ai-dialog__hint">
                Pour qui, dans quel but, quelles informations tu veux recueillir. Ex. : « {EXAMPLES[1]} ».
                {description.length > MAX_DESCRIPTION * 0.8 && ` ${description.length} / ${MAX_DESCRIPTION} caractères.`}
              </p>
            </div>
            <div className="form-row">
              <label className="label" htmlFor={`${ids}-count`}>
                Nombre de questions, environ <span className="muted">(facultatif)</span>
              </label>
              <input
                id={`${ids}-count`}
                className="field ai-dialog__count"
                type="number"
                inputMode="numeric"
                min={MIN_QUESTIONS}
                max={MAX_QUESTIONS}
                value={count}
                disabled={loading}
                placeholder="Auto"
                onChange={(e) => setCount(e.target.value)}
              />
            </div>
          </form>
        )}

        {loading && (
          <div className="ai-progress" role="status" aria-live="polite">
            <LoaderCircle aria-hidden className="spin" />
            <div>
              <strong>L’IA prépare tes questions… cela peut prendre quelques minutes.</strong>
              <span className="ai-progress__time">{formatElapsed(elapsed)}</span>
            </div>
          </div>
        )}

        {error && (
          <div className="notice notice--danger ai-dialog__error" role="alert">
            <AlertTriangle aria-hidden />
            <div>{error}</div>
          </div>
        )}

        {phase === 'result' && draft && result && (
          <section className="ai-preview" aria-label="Aperçu du brouillon">
            <p className="ai-preview__eyebrow">
              Aperçu · {plural(draft.questions.filter((q) => q.type !== 'section').length, 'question', 'questions')} · <span className="ai-preview__model">{result.model}</span>
            </p>
            <h3 className="ai-preview__title">{draft.title}</h3>
            {draft.description && <p className="ai-preview__desc">{draft.description}</p>}
            {result.warnings.length > 0 && (
              <div className="notice notice--warning ai-preview__warnings">
                <AlertTriangle aria-hidden />
                <div>
                  <strong>{result.warnings.length > 1 ? 'Corrections apportées à la proposition' : 'Correction apportée à la proposition'}</strong>
                  <ul>
                    {result.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <ol className="ai-preview__list">
              {draft.questions.map((q) =>
                q.type === 'section' ? (
                  <li key={q.id} className="ai-preview__section">
                    {q.label}
                  </li>
                ) : (
                  <li key={q.id} className="ai-preview__q">
                    <span className="ai-preview__num" aria-hidden>
                      {++number}
                    </span>
                    <div className="ai-preview__body">
                      <span className="ai-preview__label">
                        {q.label}
                        {q.required && (
                          <span className="req" aria-label="obligatoire">
                            {' '}
                            *
                          </span>
                        )}
                      </span>
                      <span className="ai-preview__meta">{questionDetail(q)}</span>
                      {q.help && <span className="ai-preview__help">{q.help}</span>}
                      {q.options && q.options.length > 0 && (
                        <ul className="ai-preview__options" aria-label="Choix proposés">
                          {q.options.map((o) => (
                            <li key={o}>{o}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                ),
              )}
            </ol>
          </section>
        )}
      </div>

      <div className="dialog__actions ai-dialog__actions">
        {loading ? (
          <button type="button" className="btn" onClick={cancel}>
            Annuler
          </button>
        ) : phase === 'result' ? (
          <>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={creating}
              onClick={() => {
                setError(null)
                setPhase('describe')
              }}
            >
              Modifier la description
            </button>
            <button type="button" className="btn" disabled={creating || !!problem} onClick={() => void generate()}>
              <RefreshCw aria-hidden /> Régénérer
            </button>
            <button type="button" className="btn btn--primary" disabled={creating} onClick={() => void create()}>
              {creating ? 'Création…' : 'Créer ce formulaire'}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn" onClick={close}>
              Annuler
            </button>
            {result && (
              <button type="button" className="btn" onClick={() => setPhase('result')}>
                Revoir l’aperçu
              </button>
            )}
            <button type="submit" form={`${ids}-form`} className="btn btn--primary" disabled={!canGenerate}>
              <Sparkles aria-hidden /> Générer
            </button>
          </>
        )}
      </div>
    </dialog>
  )
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds} s`
  return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s`
}
