// Réponses : synthèse par question (barres, moyennes, derniers textes) ou tableau complet ; export CSV.

import { Download, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { ErrorNotice, Skeleton, useUi } from '../components/ui.tsx'
import { api, type Form, type FormResponse, type QuestionSummary } from '../lib/api.ts'
import { invalidate, useAsync, useTopic } from '../lib/data.ts'
import { formatDate, plural, timeAgo } from '../lib/format.ts'
import { displayAnswer, isQuestion, type Question } from '../lib/questions.ts'

const SOURCE_LABELS = { suite: 'Suite', public: 'Lien public', nexus: 'Atelier Nexus' } as const
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0)
const fr = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })

export function ResponsesTab({ form, questions }: { form: Form; questions: Question[] }) {
  const [view, setView] = useState<'summary' | 'table'>('summary')
  const version = useTopic('responses')
  const summary = useAsync(() => api.summary(form.id), [form.id, version])
  const total = summary.data?.total ?? form.responseCount

  return (
    <div className="column">
      <div className="toolbar" style={{ justifyContent: 'space-between', marginBottom: '1.4rem' }}>
        <div className="segmented" role="group" aria-label="Affichage des réponses">
          <button type="button" aria-pressed={view === 'summary'} onClick={() => setView('summary')}>
            Synthèse
          </button>
          <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>
            Une ligne par réponse
          </button>
        </div>
        <div className="toolbar">
          <button type="button" className="btn btn--ghost" onClick={() => invalidate('responses')} title="Actualiser">
            <RefreshCw aria-hidden /> Actualiser
          </button>
          <a className="btn" href={`/api/forms/${form.id}/export.csv`} download>
            <Download aria-hidden /> Exporter en CSV
          </a>
        </div>
      </div>

      {summary.error && <ErrorNotice error={summary.error} onRetry={summary.reload} />}
      {!summary.data ? (
        <Skeleton />
      ) : total === 0 ? (
        <div className="card">
          <p style={{ margin: 0 }}>Aucune réponse pour l’instant.</p>
          <p className="muted" style={{ margin: '0.4rem 0 0', fontSize: 14 }}>
            {form.accepting ? 'Partage le lien du formulaire (onglet « Partage et réglages ») : les réponses apparaîtront ici.' : 'Ouvre le formulaire aux réponses, puis partage son lien.'}
          </p>
        </div>
      ) : view === 'summary' ? (
        <Summary total={total} items={summary.data.questions} lastAt={form.lastResponseAt} />
      ) : (
        <ResponsesTable form={form} questions={questions} total={total} version={version} />
      )}
    </div>
  )
}

function Summary({ total, items, lastAt }: { total: number; items: QuestionSummary[]; lastAt: string | null }) {
  return (
    <>
      <div className="stats">
        <div className="stat">
          <strong>{fr(total)}</strong>
          <span>{total > 1 ? 'réponses' : 'réponse'}</span>
        </div>
        {lastAt && (
          <div className="stat">
            <strong style={{ fontSize: '1.3rem', paddingTop: '0.5rem' }}>{timeAgo(lastAt)}</strong>
            <span>dernière réponse</span>
          </div>
        )}
      </div>
      <div className="summary">
        {items.map((q) => (
          <section key={q.id} className="card summary__q" aria-label={q.label}>
            <h3>{q.label || 'Question sans titre'}</h3>
            <p className="summary__meta">
              {plural(q.answered, 'réponse', 'réponses')}
              {q.answered < total ? ` sur ${total}` : ''}
            </p>
            {q.kind === 'choices' && (
              <ul className="bars">
                {q.counts.map((c) => (
                  <li key={c.option} className="bar">
                    <span className="bar__label" title={c.option}>
                      {c.option}
                    </span>
                    <span className="bar__track" aria-hidden>
                      <span className="bar__fill" style={{ display: 'block', width: `${pct(c.count, q.answered)}%` }} />
                    </span>
                    <span className="bar__value">
                      {c.count} · {pct(c.count, q.answered)} %
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {q.kind === 'numbers' && (
              <>
                <div className="numbers">
                  <div className="stat">
                    <strong>{q.average === null ? '—' : fr(q.average)}</strong>
                    <span>moyenne</span>
                  </div>
                  <div className="stat">
                    <strong>{q.min === null ? '—' : fr(q.min)}</strong>
                    <span>minimum</span>
                  </div>
                  <div className="stat">
                    <strong>{q.max === null ? '—' : fr(q.max)}</strong>
                    <span>maximum</span>
                  </div>
                </div>
                {q.distribution && (
                  <ul className="bars" style={{ marginTop: '1rem' }}>
                    {q.distribution.map((d) => (
                      <li key={d.value} className="bar">
                        <span className="bar__label">{d.value}</span>
                        <span className="bar__track" aria-hidden>
                          <span className="bar__fill" style={{ display: 'block', width: `${pct(d.count, q.answered)}%` }} />
                        </span>
                        <span className="bar__value">
                          {d.count} · {pct(d.count, q.answered)} %
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {q.kind === 'texts' &&
              (q.latest.length ? (
                <>
                  <ul className="texts">
                    {q.latest.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                  {q.answered > q.latest.length && (
                    <p className="summary__meta" style={{ margin: '0.6rem 0 0' }}>
                      Les {q.latest.length} plus récentes ; toutes dans « Une ligne par réponse ».
                    </p>
                  )}
                </>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  Personne n’a répondu à cette question.
                </p>
              ))}
          </section>
        ))}
      </div>
    </>
  )
}

function ResponsesTable({ form, questions, total, version }: { form: Form; questions: Question[]; total: number; version: number }) {
  const { confirm, toast } = useUi()
  const [items, setItems] = useState<FormResponse[]>([])
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(false)
  const cols = questions.filter(isQuestion)

  const load = async (offset: number) => {
    setLoading(true)
    try {
      const page = await api.responses(form.id, offset, 100)
      setItems((list) => (offset === 0 ? page.items : [...list, ...page.items]))
      setError(null)
    } catch (err) {
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.id, version])

  const remove = async (r: FormResponse) => {
    const ok = await confirm({
      title: `Supprimer la réponse n° ${r.id} ?`,
      text: `Reçue ${timeAgo(r.createdAt)}${r.respondent ? ` de ${r.respondent}` : ''}. Elle sera effacée définitivement.`,
      confirmLabel: 'Supprimer la réponse',
      danger: true,
    })
    if (!ok) return
    try {
      await api.deleteResponse(form.id, r.id)
      setItems((list) => list.filter((x) => x.id !== r.id))
      invalidate('responses', 'forms')
    } catch (err) {
      toast((err as Error).message, { tone: 'danger' })
    }
  }

  if (error && !items.length) return <ErrorNotice error={error} onRetry={() => void load(0)} />
  return (
    <>
      <div className="table-wrap" tabIndex={0} aria-label="Réponses">
        <table className="resp-table">
          <thead>
            <tr>
              <th scope="col">N°</th>
              <th scope="col">Reçue</th>
              <th scope="col">De</th>
              {cols.map((q) => (
                <th key={q.id} scope="col" title={q.label}>
                  {q.label.length > 40 ? `${q.label.slice(0, 39)}…` : q.label || 'Sans titre'}
                </th>
              ))}
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id}>
                <td className="num">{r.id}</td>
                <td className="num" title={formatDate(r.createdAt)}>
                  {new Date(r.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                </td>
                <td>{r.respondent ?? <span className="empty">{SOURCE_LABELS[r.source]}</span>}</td>
                {cols.map((q) => {
                  const v = r.answers[q.id]
                  return (
                    <td key={q.id} className={typeof v === 'number' ? 'num' : undefined}>
                      {v === undefined ? <span className="empty">—</span> : displayAnswer(v)}
                    </td>
                  )
                })}
                <td>
                  <button type="button" className="btn btn--ghost btn--icon btn--sm" aria-label={`Supprimer la réponse n° ${r.id}`} title="Supprimer cette réponse" onClick={() => void remove(r)}>
                    <Trash2 />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="toolbar" style={{ justifyContent: 'space-between', marginTop: '0.8rem' }}>
        <span className="muted" style={{ fontSize: 13 }}>
          {items.length} sur {total} réponse{total > 1 ? 's' : ''}
        </span>
        {items.length < total && (
          <button type="button" className="btn" disabled={loading} onClick={() => void load(items.length)}>
            Afficher les suivantes
          </button>
        )}
      </div>
    </>
  )
}
