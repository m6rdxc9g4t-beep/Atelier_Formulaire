// Questions côté interface : types et libellés, création, contrôle léger à la saisie.
// Le serveur refait tous les contrôles (backend/src/domain/questions.ts) et fait foi.

export type QuestionType =
  | 'short_text'
  | 'long_text'
  | 'email'
  | 'number'
  | 'date'
  | 'single'
  | 'multiple'
  | 'dropdown'
  | 'scale'
  | 'yes_no'
  | 'section'

export interface Question {
  id: string
  type: QuestionType
  label: string
  help?: string
  required?: boolean
  placeholder?: string
  options?: string[]
  min?: number
  max?: number
  minLabel?: string
  maxLabel?: string
}

export type AnswerValue = string | number | boolean | string[]
export type Answers = Record<string, AnswerValue>

export const TYPE_LABELS: Record<QuestionType, string> = {
  short_text: 'Réponse courte',
  long_text: 'Paragraphe',
  email: 'Adresse e-mail',
  number: 'Nombre',
  date: 'Date',
  single: 'Choix unique',
  multiple: 'Cases à cocher',
  dropdown: 'Liste déroulante',
  scale: 'Échelle',
  yes_no: 'Oui / non',
  section: 'Titre de section',
}

/** Ordre du menu « Ajouter ». */
export const TYPE_ORDER: QuestionType[] = ['short_text', 'long_text', 'single', 'multiple', 'dropdown', 'scale', 'yes_no', 'number', 'date', 'email', 'section']

export const hasOptions = (t: QuestionType) => t === 'single' || t === 'multiple' || t === 'dropdown'
export const isQuestion = (q: Question) => q.type !== 'section'

let counter = 0
export function newId(): string {
  counter = (counter + 1) % 1296
  const random = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0')
  return `q${Date.now().toString(36).slice(-4)}${counter.toString(36).padStart(2, '0')}${random}`
}

export function newQuestion(type: QuestionType): Question {
  const q: Question = { id: newId(), type, label: '' }
  if (hasOptions(type)) q.options = ['Choix 1']
  if (type === 'scale') {
    q.min = 1
    q.max = 5
  }
  return q
}

/** Change le type d'une question en gardant ce qui reste valable (libellé, aide, choix…). */
export function changeType(q: Question, type: QuestionType): Question {
  const next: Question = { id: q.id, type, label: q.label }
  if (q.help) next.help = q.help
  if (type !== 'section' && q.required) next.required = true
  if (hasOptions(type)) next.options = q.options?.length ? q.options : ['Choix 1']
  if (type === 'scale') {
    next.min = q.type === 'scale' ? (q.min ?? 1) : 1
    next.max = q.type === 'scale' ? (q.max ?? 5) : 5
    if (q.minLabel) next.minLabel = q.minLabel
    if (q.maxLabel) next.maxLabel = q.maxLabel
  }
  if (type === 'number' && q.type === 'number') {
    if (q.min !== undefined) next.min = q.min
    if (q.max !== undefined) next.max = q.max
  }
  if (q.placeholder && ['short_text', 'long_text', 'email', 'number'].includes(type)) next.placeholder = q.placeholder
  return next
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)

/** Contrôle à la saisie (le serveur a le dernier mot). */
export function clientErrors(questions: Question[], answers: Answers): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const q of questions) {
    if (!isQuestion(q)) continue
    const v = answers[q.id]
    const empty = isEmpty(typeof v === 'string' ? v.trim() : v)
    if (empty) {
      if (q.required) errors[q.id] = 'Réponse obligatoire.'
      continue
    }
    if (q.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim())) errors[q.id] = 'Adresse e-mail invalide.'
    if (q.type === 'number') {
      const n = Number(String(v).replace(',', '.').replace(/\s/g, ''))
      if (!Number.isFinite(n)) errors[q.id] = 'Nombre attendu.'
      else if (q.min !== undefined && n < q.min) errors[q.id] = `Au moins ${q.min}.`
      else if (q.max !== undefined && n > q.max) errors[q.id] = `Au plus ${q.max}.`
    }
  }
  return errors
}

export function displayAnswer(value: AnswerValue | undefined): string {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non'
  return String(value)
}
