// Constructeur : en-tête du formulaire puis une carte par question. La carte choisie s'ouvre pour l'édition,
// les autres s'affichent comme les verra la personne qui répond.

import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  AtSign,
  CalendarDays,
  ChevronDownSquare,
  CircleDot,
  Copy,
  GripHorizontal,
  Hash,
  Heading,
  ListChecks,
  Plus,
  SlidersHorizontal,
  ToggleRight,
  Trash2,
  Type,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'

import { QuestionControl } from '../components/FillForm.tsx'
import { useDismiss } from '../components/ui.tsx'
import { changeType, hasOptions, newId, newQuestion, TYPE_LABELS, TYPE_ORDER, type Question, type QuestionType } from '../lib/questions.ts'
import type { FormEditor } from '../lib/useFormEditor.ts'

export const TYPE_ICONS: Record<QuestionType, ReactNode> = {
  short_text: <Type aria-hidden />,
  long_text: <AlignLeft aria-hidden />,
  email: <AtSign aria-hidden />,
  number: <Hash aria-hidden />,
  date: <CalendarDays aria-hidden />,
  single: <CircleDot aria-hidden />,
  multiple: <ListChecks aria-hidden />,
  dropdown: <ChevronDownSquare aria-hidden />,
  scale: <SlidersHorizontal aria-hidden />,
  yes_no: <ToggleRight aria-hidden />,
  section: <Heading aria-hidden />,
}

export function Builder({ editor }: { editor: FormEditor }) {
  const { draft, update, form } = editor
  const [selected, setSelected] = useState<string | null>(null)
  const focusNext = useRef<string | null>(null)

  /** Questions déjà enregistrées sur un formulaire qui a des réponses : leur type est figé. */
  const lockedTypes = new Set(form.responseCount > 0 ? form.questions.map((q) => q.id) : [])

  const setQuestions = useCallback((fn: (qs: Question[]) => Question[]) => update((d) => ({ questions: fn(d.questions) })), [update])

  const insert = (type: QuestionType) => {
    const q = newQuestion(type)
    setQuestions((qs) => {
      const at = selected ? qs.findIndex((x) => x.id === selected) + 1 : qs.length
      return [...qs.slice(0, at), q, ...qs.slice(at)]
    })
    setSelected(q.id)
    focusNext.current = q.id
  }

  useEffect(() => {
    if (!focusNext.current) return
    const el = document.querySelector<HTMLInputElement>(`[data-question="${focusNext.current}"] .inline-label`)
    if (el) {
      el.focus()
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      focusNext.current = null
    }
  })

  const move = (id: string, to: number) =>
    setQuestions((qs) => {
      const from = qs.findIndex((q) => q.id === id)
      if (from < 0 || to < 0 || to >= qs.length) return qs
      const next = [...qs]
      const [q] = next.splice(from, 1)
      next.splice(to, 0, q!)
      return next
    })

  // Glisser-déposer par la poignée.
  const [dragging, setDragging] = useState<string | null>(null)
  const [drop, setDrop] = useState<{ id: string; where: 'before' | 'after' } | null>(null)
  const onDragOver = (e: DragEvent<HTMLElement>, id: string) => {
    if (!dragging || dragging === id) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const where = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    if (drop?.id !== id || drop.where !== where) setDrop({ id, where })
  }
  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    if (dragging && drop) {
      setQuestions((qs) => {
        const without = qs.filter((q) => q.id !== dragging)
        const moved = qs.find((q) => q.id === dragging)!
        const at = without.findIndex((q) => q.id === drop.id) + (drop.where === 'after' ? 1 : 0)
        return [...without.slice(0, at), moved, ...without.slice(at)]
      })
    }
    setDragging(null)
    setDrop(null)
  }

  return (
    <div className="builder column">
      <div className="card card--intro" onClick={() => setSelected(null)}>
        <input
          className="inline-title"
          value={draft.title}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="Titre du formulaire"
          aria-label="Titre du formulaire"
          maxLength={200}
        />
        <textarea
          className="inline-text"
          value={draft.description}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="Description : à quoi sert ce formulaire, combien de temps il prend…"
          aria-label="Description du formulaire"
          rows={Math.min(8, Math.max(2, draft.description.split('\n').length))}
          maxLength={4000}
        />
      </div>

      {draft.questions.map((q, index) => (
        <QuestionCard
          key={q.id}
          q={q}
          index={index}
          total={draft.questions.length}
          selected={selected === q.id}
          typeLocked={lockedTypes.has(q.id)}
          dragging={dragging === q.id}
          drop={drop?.id === q.id ? drop.where : null}
          onSelect={() => setSelected(q.id)}
          onChange={(next) => setQuestions((qs) => qs.map((x) => (x.id === q.id ? next : x)))}
          onDelete={() => {
            setQuestions((qs) => qs.filter((x) => x.id !== q.id))
            const neighbour = draft.questions[index + 1] ?? draft.questions[index - 1]
            setSelected(neighbour?.id ?? null)
          }}
          onDuplicate={() => {
            const copy = { ...q, id: newId(), options: q.options ? [...q.options] : undefined }
            setQuestions((qs) => [...qs.slice(0, index + 1), copy, ...qs.slice(index + 1)])
            setSelected(copy.id)
          }}
          onMove={(delta) => move(q.id, index + delta)}
          onDragStart={() => setDragging(q.id)}
          onDragEnd={() => {
            setDragging(null)
            setDrop(null)
          }}
          onDragOver={(e) => onDragOver(e, q.id)}
          onDrop={onDrop}
        />
      ))}

      <AddMenu onAdd={insert} empty={draft.questions.length === 0} />
    </div>
  )
}

function AddMenu({ onAdd, empty }: { onAdd: (t: QuestionType) => void; empty: boolean }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, close, root)
  return (
    <div className="add-bar" ref={root} style={{ position: 'relative' }}>
      <button type="button" className={empty ? 'btn btn--primary' : 'btn'} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Plus aria-hidden /> Ajouter une question
      </button>
      <button type="button" className="btn btn--ghost" onClick={() => onAdd('section')}>
        <Heading aria-hidden /> Ajouter une section
      </button>
      {open && (
        <div role="menu" className="popover add-menu" style={{ bottom: 'calc(100% + 6px)', left: '50%', translate: '-50% 0' }}>
          {TYPE_ORDER.filter((t) => t !== 'section').map((t) => (
            <button
              key={t}
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                setOpen(false)
                onAdd(t)
              }}
            >
              {TYPE_ICONS[t]}
              <span className="menu-item__body">{TYPE_LABELS[t]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface CardProps {
  q: Question
  index: number
  total: number
  selected: boolean
  typeLocked: boolean
  dragging: boolean
  drop: 'before' | 'after' | null
  onSelect: () => void
  onChange: (q: Question) => void
  onDelete: () => void
  onDuplicate: () => void
  onMove: (delta: number) => void
  onDragStart: () => void
  onDragEnd: () => void
  onDragOver: (e: DragEvent<HTMLElement>) => void
  onDrop: (e: DragEvent<HTMLElement>) => void
}

function QuestionCard(props: CardProps) {
  const { q, selected } = props
  const set = (patch: Partial<Question>) => props.onChange({ ...q, ...patch })
  const optionRefs = useRef<(HTMLInputElement | null)[]>([])
  const focusOption = useRef<number | null>(null)

  useEffect(() => {
    if (focusOption.current !== null) {
      optionRefs.current[focusOption.current]?.focus()
      focusOption.current = null
    }
  })

  const options = q.options ?? []
  const setOption = (i: number, value: string) => set({ options: options.map((o, j) => (j === i ? value : o)) })
  const addOption = (at = options.length) => {
    let n = options.length + 1
    while (options.includes(`Choix ${n}`)) n++
    set({ options: [...options.slice(0, at), `Choix ${n}`, ...options.slice(at)] })
    focusOption.current = at
  }

  const kind = q.type === 'multiple' ? 'multiple' : q.type === 'dropdown' ? 'dropdown' : 'single'

  return (
    <section
      className="card q-card"
      data-question={q.id}
      data-selected={selected}
      data-dragging={props.dragging || undefined}
      data-drop={props.drop ?? undefined}
      aria-label={`${q.type === 'section' ? 'Section' : 'Question'} ${props.index + 1}${q.label ? ` : ${q.label}` : ''}`}
      tabIndex={selected ? -1 : 0}
      onClick={() => !selected && props.onSelect()}
      onKeyDown={(e) => {
        if (!selected && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          props.onSelect()
        }
      }}
      onDragOver={props.onDragOver}
      onDrop={props.onDrop}
    >
      <button
        type="button"
        className="q-card__handle"
        draggable
        aria-label="Glisser pour déplacer (ou utilise les flèches en bas de la carte)"
        title="Glisser pour déplacer"
        tabIndex={-1}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', q.id)
          const card = e.currentTarget.closest('section')
          if (card) e.dataTransfer.setDragImage(card, 40, 20)
          props.onDragStart()
        }}
        onDragEnd={props.onDragEnd}
      >
        <GripHorizontal />
      </button>

      {!selected ? (
        q.type === 'section' ? (
          <div className="fill-section" style={{ padding: 0 }}>
            <div className="q-card__section-mark">Section</div>
            <h2>{q.label || <span className="muted">Section sans titre</span>}</h2>
            {q.help && <p>{q.help}</p>}
          </div>
        ) : (
          <div>
            <span className="fill-q__label">
              {q.label || <span className="muted">Question sans titre</span>}
              {q.required && <span className="req">*</span>}
            </span>
            {q.help && <p className="fill-q__help">{q.help}</p>}
            <div className="fill-q__control" style={{ pointerEvents: 'none' }}>
              <QuestionControl q={q} value={undefined} onChange={() => undefined} disabled />
            </div>
          </div>
        )
      ) : (
        <div onClick={(e) => e.stopPropagation()}>
          {q.type === 'section' && <div className="q-card__section-mark">Section</div>}
          <div className="q-edit__top">
            <input
              className="inline-label"
              value={q.label}
              onChange={(e) => set({ label: e.target.value })}
              placeholder={q.type === 'section' ? 'Titre de la section' : 'Question'}
              aria-label={q.type === 'section' ? 'Titre de la section' : 'Libellé de la question'}
              maxLength={300}
            />
            {q.type !== 'section' && (
              <select
                className="field"
                value={q.type}
                disabled={props.typeLocked}
                title={props.typeLocked ? 'Cette question a déjà des réponses : son type ne peut plus changer.' : undefined}
                aria-label="Type de question"
                onChange={(e) => props.onChange(changeType(q, e.target.value as QuestionType))}
              >
                {TYPE_ORDER.filter((t) => t !== 'section').map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="q-edit__body">
            <textarea
              className="inline-text"
              value={q.help ?? ''}
              onChange={(e) => set({ help: e.target.value || undefined })}
              placeholder={q.type === 'section' ? 'Texte d’introduction de la section (facultatif)' : 'Aide ou précision (facultatif)'}
              aria-label="Aide"
              rows={1}
              maxLength={600}
            />

            {hasOptions(q.type) && (
              <div>
                {options.map((o, i) => (
                  <div className="option-row" key={i}>
                    <span className="marker" data-kind={kind} aria-hidden>
                      {kind === 'dropdown' ? `${i + 1}.` : ''}
                    </span>
                    <input
                      ref={(el) => {
                        optionRefs.current[i] = el
                      }}
                      value={o}
                      aria-label={`Choix ${i + 1}`}
                      maxLength={200}
                      onChange={(e) => setOption(i, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addOption(i + 1)
                        } else if (e.key === 'Backspace' && o === '' && options.length > 1) {
                          e.preventDefault()
                          set({ options: options.filter((_, j) => j !== i) })
                          focusOption.current = Math.max(0, i - 1)
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn--ghost btn--icon btn--sm"
                      aria-label={`Retirer « ${o} »`}
                      disabled={options.length <= 1}
                      onClick={() => set({ options: options.filter((_, j) => j !== i) })}
                    >
                      <X />
                    </button>
                  </div>
                ))}
                <button type="button" className="btn btn--ghost btn--sm" style={{ marginTop: 4 }} onClick={() => addOption()}>
                  <Plus aria-hidden /> Ajouter un choix
                </button>
                {new Set(options.map((o) => o.trim())).size !== options.length && <p className="fill-q__error">Deux choix sont identiques : corrige-les pour que le formulaire s’enregistre.</p>}
              </div>
            )}

            {(q.type === 'short_text' || q.type === 'long_text' || q.type === 'email' || q.type === 'number') && (
              <input className="field" value={q.placeholder ?? ''} onChange={(e) => set({ placeholder: e.target.value || undefined })} placeholder="Texte d’exemple dans le champ (facultatif)" aria-label="Texte d’exemple" maxLength={120} />
            )}

            {q.type === 'number' && (
              <div className="grid-2">
                <label>
                  <span className="label">Minimum</span>
                  <input className="field" type="number" value={q.min ?? ''} onChange={(e) => set({ min: e.target.value === '' ? undefined : Number(e.target.value) })} />
                </label>
                <label>
                  <span className="label">Maximum</span>
                  <input className="field" type="number" value={q.max ?? ''} onChange={(e) => set({ max: e.target.value === '' ? undefined : Number(e.target.value) })} />
                </label>
              </div>
            )}

            {q.type === 'scale' && (
              <>
                <div className="grid-2">
                  <label>
                    <span className="label">De</span>
                    <select className="field" value={q.min ?? 1} onChange={(e) => set({ min: Number(e.target.value) })}>
                      <option value={0}>0</option>
                      <option value={1}>1</option>
                    </select>
                  </label>
                  <label>
                    <span className="label">À</span>
                    <select className="field" value={q.max ?? 5} onChange={(e) => set({ max: Number(e.target.value) })}>
                      {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid-2">
                  <input className="field" value={q.minLabel ?? ''} onChange={(e) => set({ minLabel: e.target.value || undefined })} placeholder={`Libellé de ${q.min ?? 1} (ex. Pas du tout)`} aria-label="Libellé du minimum" maxLength={60} />
                  <input className="field" value={q.maxLabel ?? ''} onChange={(e) => set({ maxLabel: e.target.value || undefined })} placeholder={`Libellé de ${q.max ?? 5} (ex. Tout à fait)`} aria-label="Libellé du maximum" maxLength={60} />
                </div>
              </>
            )}
          </div>

          <div className="q-edit__foot">
            <button type="button" className="btn btn--ghost btn--icon btn--sm" title="Monter" aria-label="Monter" disabled={props.index === 0} onClick={() => props.onMove(-1)}>
              <ArrowUp />
            </button>
            <button type="button" className="btn btn--ghost btn--icon btn--sm" title="Descendre" aria-label="Descendre" disabled={props.index === props.total - 1} onClick={() => props.onMove(1)}>
              <ArrowDown />
            </button>
            <span className="sep" />
            <button type="button" className="btn btn--ghost btn--icon btn--sm" title="Dupliquer" aria-label="Dupliquer" onClick={props.onDuplicate}>
              <Copy />
            </button>
            <button type="button" className="btn btn--ghost btn--icon btn--sm" title="Supprimer" aria-label="Supprimer" onClick={props.onDelete}>
              <Trash2 />
            </button>
            {q.type !== 'section' && (
              <>
                <span className="sep" />
                <label className="switch">
                  <input type="checkbox" checked={Boolean(q.required)} onChange={(e) => set({ required: e.target.checked || undefined })} />
                  Obligatoire
                </label>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
