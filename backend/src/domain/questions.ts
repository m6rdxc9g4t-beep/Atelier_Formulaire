// Règles pures des formulaires : définition des questions, contrôle des réponses, synthèse.
// Le frontend applique les mêmes contrôles à la saisie (frontend/src/lib/questions.ts) ; le serveur fait foi.

export const QUESTION_TYPES = [
  'short_text',
  'long_text',
  'email',
  'number',
  'date',
  'single',
  'multiple',
  'dropdown',
  'scale',
  'yes_no',
  'section',
] as const

export type QuestionType = (typeof QUESTION_TYPES)[number]

export interface Question {
  /** Identifiant stable (les réponses y sont rattachées, même si le libellé change). */
  id: string
  type: QuestionType
  label: string
  help?: string
  required?: boolean
  placeholder?: string
  /** Choix proposés (single, multiple, dropdown). */
  options?: string[]
  /** Bornes (number : valeurs ; scale : de 0/1 à 10). */
  min?: number
  max?: number
  /** Libellés des extrémités d'une échelle (« Pas du tout », « Tout à fait »). */
  minLabel?: string
  maxLabel?: string
}

export type AnswerValue = string | number | boolean | string[]
export type Answers = Record<string, AnswerValue>

export const LIMITS = {
  questions: 100,
  label: 300,
  help: 600,
  options: 50,
  option: 200,
  shortText: 500,
  longText: 10_000,
} as const

const CHOICE_TYPES: ReadonlySet<QuestionType> = new Set(['single', 'multiple', 'dropdown'])

export const isChoice = (t: QuestionType) => CHOICE_TYPES.has(t)
export const isQuestion = (q: Question) => q.type !== 'section'

export class QuestionError extends Error {}

const text = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/** Nettoie et contrôle la liste des questions d'un formulaire (enregistrement du constructeur). */
export function normalizeQuestions(input: unknown): Question[] {
  if (!Array.isArray(input)) throw new QuestionError('La liste des questions est invalide.')
  if (input.length > LIMITS.questions) throw new QuestionError(`Un formulaire compte ${LIMITS.questions} questions au plus.`)
  const seen = new Set<string>()
  return input.map((raw, index) => {
    const q = (raw ?? {}) as Record<string, unknown>
    const n = index + 1
    const id = String(q.id ?? '').trim()
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw new QuestionError(`Question ${n} : identifiant invalide.`)
    if (seen.has(id)) throw new QuestionError(`Question ${n} : identifiant en double.`)
    seen.add(id)
    const type = String(q.type) as QuestionType
    if (!QUESTION_TYPES.includes(type)) throw new QuestionError(`Question ${n} : type inconnu (${String(q.type)}).`)
    const label = text(q.label, LIMITS.label)
    const out: Question = { id, type, label }
    const help = String(q.help ?? '').trim().slice(0, LIMITS.help)
    if (help) out.help = help
    if (type === 'section') return out
    if (q.required === true) out.required = true
    const placeholder = text(q.placeholder, 120)
    if (placeholder && ['short_text', 'long_text', 'email', 'number'].includes(type)) out.placeholder = placeholder

    if (isChoice(type)) {
      const options = (Array.isArray(q.options) ? q.options : []).map((o) => text(o, LIMITS.option)).filter(Boolean)
      const unique = [...new Set(options)]
      if (unique.length !== options.length) throw new QuestionError(`Question ${n} : deux choix identiques.`)
      if (unique.length === 0) throw new QuestionError(`Question ${n} : ajoute au moins un choix.`)
      if (unique.length > LIMITS.options) throw new QuestionError(`Question ${n} : ${LIMITS.options} choix au plus.`)
      out.options = unique
    }
    if (type === 'number') {
      const min = numberOrUndefined(q.min)
      const max = numberOrUndefined(q.max)
      if (min !== undefined && max !== undefined && min > max) throw new QuestionError(`Question ${n} : le minimum dépasse le maximum.`)
      if (min !== undefined) out.min = min
      if (max !== undefined) out.max = max
    }
    if (type === 'scale') {
      const min = numberOrUndefined(q.min) ?? 1
      const max = numberOrUndefined(q.max) ?? 5
      if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || min > 1 || max < 2 || max > 10) {
        throw new QuestionError(`Question ${n} : une échelle va de 0 ou 1 jusqu'à 2 à 10.`)
      }
      out.min = min
      out.max = max
      const minLabel = text(q.minLabel, 60)
      const maxLabel = text(q.maxLabel, 60)
      if (minLabel) out.minLabel = minLabel
      if (maxLabel) out.maxLabel = maxLabel
    }
    return out
  })
}

function numberOrUndefined(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

/** Contrôles avant ouverture : chaque question a un libellé. */
export function publishProblems(questions: Question[]): string[] {
  const problems: string[] = []
  if (!questions.some(isQuestion)) problems.push('Ajoute au moins une question.')
  questions.forEach((q, i) => {
    if (!q.label) problems.push(q.type === 'section' ? `Élément ${i + 1} : la section n'a pas de titre.` : `Question ${i + 1} : le libellé est vide.`)
  })
  return problems
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function validDate(value: string): boolean {
  const m = DATE_RE.exec(value)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)

export interface AnswerCheck {
  answers: Answers
  /** Identifiant de question → message en français. */
  errors: Record<string, string>
}

/**
 * Contrôle les réponses d'un formulaire. Les clés inconnues sont ignorées ; les valeurs sont ramenées à leur type
 * (« 12 » → 12 pour un nombre). Une réponse vide à une question facultative est simplement omise.
 */
export function checkAnswers(questions: Question[], input: unknown): AnswerCheck {
  const raw = (input && typeof input === 'object' && !Array.isArray(input) ? input : {}) as Record<string, unknown>
  const answers: Answers = {}
  const errors: Record<string, string> = {}

  for (const q of questions) {
    if (!isQuestion(q)) continue
    let v = raw[q.id]
    if (typeof v === 'string') v = q.type === 'long_text' ? v.replace(/\r\n?/g, '\n').trim() : v.trim()
    if (isEmpty(v)) {
      if (q.required) errors[q.id] = 'Réponse obligatoire.'
      continue
    }
    switch (q.type) {
      case 'short_text':
      case 'long_text': {
        const max = q.type === 'short_text' ? LIMITS.shortText : LIMITS.longText
        if (typeof v !== 'string') errors[q.id] = 'Texte attendu.'
        else if (v.length > max) errors[q.id] = `${max} caractères au plus.`
        else answers[q.id] = v
        break
      }
      case 'email':
        if (typeof v !== 'string' || v.length > 254 || !EMAIL_RE.test(v)) errors[q.id] = 'Adresse e-mail invalide.'
        else answers[q.id] = v.toLowerCase()
        break
      case 'number': {
        const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.').replace(/\s/g, '')) : NaN
        if (!Number.isFinite(n)) errors[q.id] = 'Nombre attendu.'
        else if (q.min !== undefined && n < q.min) errors[q.id] = `Au moins ${q.min}.`
        else if (q.max !== undefined && n > q.max) errors[q.id] = `Au plus ${q.max}.`
        else answers[q.id] = n
        break
      }
      case 'date':
        if (typeof v !== 'string' || !validDate(v)) errors[q.id] = 'Date attendue (AAAA-MM-JJ).'
        else answers[q.id] = v
        break
      case 'single':
      case 'dropdown':
        if (typeof v !== 'string' || !q.options?.includes(v)) errors[q.id] = 'Choix inconnu.'
        else answers[q.id] = v
        break
      case 'multiple': {
        const list = Array.isArray(v) ? v : [v]
        if (!list.every((x) => typeof x === 'string' && q.options?.includes(x))) errors[q.id] = 'Choix inconnu.'
        // Ordre des choix du formulaire, sans doublon.
        else answers[q.id] = (q.options ?? []).filter((o) => list.includes(o))
        break
      }
      case 'scale': {
        const n = typeof v === 'number' ? v : Number(v)
        if (!Number.isInteger(n) || n < (q.min ?? 1) || n > (q.max ?? 5)) errors[q.id] = `Note de ${q.min ?? 1} à ${q.max ?? 5}.`
        else answers[q.id] = n
        break
      }
      case 'yes_no':
        if (v === true || v === 'true' || v === 'oui') answers[q.id] = true
        else if (v === false || v === 'false' || v === 'non') answers[q.id] = false
        else errors[q.id] = 'Oui ou non.'
        break
    }
  }
  return { answers, errors }
}

/** Valeur lisible d'une réponse (tableaux, CSV). */
export function displayAnswer(value: AnswerValue | undefined): string {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non'
  return String(value)
}

// ── Synthèse ────────────────────────────────────────────────────────────────

export type QuestionSummary =
  | { id: string; type: QuestionType; label: string; answered: number; kind: 'choices'; counts: { option: string; count: number }[] }
  | { id: string; type: QuestionType; label: string; answered: number; kind: 'numbers'; min: number | null; max: number | null; average: number | null; distribution?: { value: number; count: number }[] }
  | { id: string; type: QuestionType; label: string; answered: number; kind: 'texts'; latest: string[] }

export function summarize(questions: Question[], responses: Answers[]): QuestionSummary[] {
  return questions.filter(isQuestion).map((q) => {
    const values = responses.map((r) => r[q.id]).filter((v): v is AnswerValue => !isEmpty(v))
    const base = { id: q.id, type: q.type, label: q.label, answered: values.length }
    if (isChoice(q.type) || q.type === 'yes_no') {
      const options = q.type === 'yes_no' ? ['Oui', 'Non'] : (q.options ?? [])
      const counts = new Map(options.map((o) => [o, 0]))
      for (const v of values) {
        for (const item of Array.isArray(v) ? v : [displayAnswer(v)]) counts.set(item, (counts.get(item) ?? 0) + 1)
      }
      return { ...base, kind: 'choices' as const, counts: [...counts].map(([option, count]) => ({ option, count })) }
    }
    if (q.type === 'number' || q.type === 'scale') {
      const nums = values.filter((v): v is number => typeof v === 'number')
      const average = nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : null
      const summary = {
        ...base,
        kind: 'numbers' as const,
        min: nums.length ? Math.min(...nums) : null,
        max: nums.length ? Math.max(...nums) : null,
        average,
      }
      if (q.type === 'scale') {
        const distribution: { value: number; count: number }[] = []
        for (let v = q.min ?? 1; v <= (q.max ?? 5); v++) distribution.push({ value: v, count: nums.filter((n) => n === v).length })
        return { ...summary, distribution }
      }
      return summary
    }
    return { ...base, kind: 'texts' as const, latest: values.slice(-5).reverse().map((v) => displayAnswer(v)) }
  })
}

/** Clé de colonne d'export : snake_case sans accent, unique (« Votre e-mail » → « votre_e_mail »). */
export function columnKeys(questions: Question[]): Map<string, string> {
  const used = new Set(['id', 'recu_le', 'repondant', 'source'])
  const keys = new Map<string, string>()
  for (const q of questions.filter(isQuestion)) {
    let base = (q.label || q.id)
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40)
    if (!/^[a-z]/.test(base)) base = `q_${base}`.replace(/_+$/, '')
    let key = base
    for (let i = 2; used.has(key); i++) key = `${base}_${i}`
    used.add(key)
    keys.set(q.id, key)
  }
  return keys
}
