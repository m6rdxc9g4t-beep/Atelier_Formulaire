// Formulaires : création, constructeur (questions + réglages), ouverture / fermeture, partage, suppression.
// Toute écriture : une transaction qui met à jour le formulaire et émet l'événement atelier-node/1 correspondant.

import { randomBytes } from 'node:crypto'

import type { Db } from '../db/database.js'
import { isQuestion, normalizeQuestions, publishProblems, QuestionError, type Question } from '../domain/questions.js'
import { ApiError, conflict, invalid, notFound } from '../http/errors.js'
import { emitEvents } from './events.js'

export type FormStatus = 'draft' | 'open' | 'closed'
export type FormAccess = 'suite' | 'public'

export interface FormSettings {
  /** Message affiché après l'envoi. */
  confirmation?: string
  /** Une seule réponse par personne connectée (accès « suite » uniquement). */
  onePerPerson?: boolean
  /** Fermeture automatique (ISO 8601). */
  closesAt?: string | null
}

interface FormRow {
  id: number
  title: string
  description: string
  status: FormStatus
  access: FormAccess
  public_token: string | null
  questions: string
  settings: string
  version: number
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  response_count?: number
  last_response_at?: string | null
}

export interface Form {
  id: number
  title: string
  description: string
  status: FormStatus
  access: FormAccess
  publicToken: string | null
  questions: Question[]
  settings: FormSettings
  /** Ouvert et pas encore arrivé à sa date de fermeture. */
  accepting: boolean
  version: number
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  responseCount: number
  lastResponseAt: string | null
}

export const MAX_TITLE = 200
export const MAX_DESCRIPTION = 4000

const SELECT = `
  SELECT f.*,
         (SELECT COUNT(*) FROM responses r WHERE r.form_id = f.id) AS response_count,
         (SELECT MAX(created_at) FROM responses r WHERE r.form_id = f.id) AS last_response_at
  FROM forms f`

export function isAccepting(status: FormStatus, settings: FormSettings, now = new Date()): boolean {
  return status === 'open' && !(settings.closesAt && new Date(settings.closesAt).getTime() <= now.getTime())
}

function toForm(r: FormRow, now = new Date()): Form {
  const settings = JSON.parse(r.settings) as FormSettings
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    access: r.access,
    publicToken: r.access === 'public' ? r.public_token : null,
    questions: JSON.parse(r.questions) as Question[],
    settings,
    accepting: isAccepting(r.status, settings, now),
    version: r.version,
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    responseCount: r.response_count ?? 0,
    lastResponseAt: r.last_response_at ?? null,
  }
}

export function listForms(db: Db, options: { deleted?: boolean } = {}): Form[] {
  const where = options.deleted ? 'f.deleted_at IS NOT NULL' : 'f.deleted_at IS NULL'
  return (db.prepare(`${SELECT} WHERE ${where} ORDER BY f.updated_at DESC, f.id DESC`).all() as FormRow[]).map((r) => toForm(r))
}

export function getForm(db: Db, id: number, options: { includeDeleted?: boolean } = {}): Form {
  const row = db.prepare(`${SELECT} WHERE f.id = ?`).get(id) as FormRow | undefined
  if (!row || (row.deleted_at && !options.includeDeleted)) throw notFound('Formulaire')
  return toForm(row)
}

export function findByToken(db: Db, token: string): Form | null {
  const row = db.prepare(`${SELECT} WHERE f.public_token = ? AND f.access = 'public' AND f.deleted_at IS NULL`).get(token) as FormRow | undefined
  return row ? toForm(row) : null
}

function cleanTitle(title: unknown): string {
  const value = String(title ?? '').replace(/\s+/g, ' ').trim()
  if (!value) throw invalid('Donne un titre au formulaire.')
  if (value.length > MAX_TITLE) throw invalid(`Le titre dépasse ${MAX_TITLE} caractères.`)
  return value
}

const cleanDescription = (value: unknown) => String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, MAX_DESCRIPTION)

function cleanSettings(input: unknown): FormSettings {
  const s = (input ?? {}) as Record<string, unknown>
  const out: FormSettings = {}
  const confirmation = String(s.confirmation ?? '').trim().slice(0, 1000)
  if (confirmation) out.confirmation = confirmation
  if (s.onePerPerson === true) out.onePerPerson = true
  if (s.closesAt) {
    const d = new Date(String(s.closesAt))
    if (Number.isNaN(d.getTime())) throw invalid('Date de fermeture invalide.')
    out.closesAt = d.toISOString()
  }
  return out
}

function questionsOrThrow(input: unknown): Question[] {
  try {
    return normalizeQuestions(input)
  } catch (error) {
    if (error instanceof QuestionError) throw invalid(error.message)
    throw error
  }
}

let counter = 0
/** Identifiant court de question (unique dans le formulaire). */
export function newQuestionId(): string {
  counter = (counter + 1) % 1296
  return `q${Date.now().toString(36).slice(-4)}${counter.toString(36).padStart(2, '0')}${randomBytes(2).toString('hex')}`
}

export interface CreateFormInput {
  title: string
  description?: string
  questions?: unknown
  settings?: unknown
}

export function createForm(db: Db, input: CreateFormInput, user: string, now = new Date()): Form {
  const title = cleanTitle(input.title)
  const questions = input.questions === undefined
    ? [{ id: newQuestionId(), type: 'short_text' as const, label: '' }]
    : questionsOrThrow(input.questions)
  const settings = cleanSettings(input.settings)
  return db.transaction(() => {
    const at = now.toISOString()
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO forms (title, description, questions, settings, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(title, cleanDescription(input.description), JSON.stringify(questions), JSON.stringify(settings), user, user, at, at)
    const id = Number(lastInsertRowid)
    emitEvents(db, [{ type: 'formulaire.form.created', subject: { kind: 'form', id: String(id), label: title }, data: { questions: questions.filter(isQuestion).length } }], now)
    return getForm(db, id)
  })()
}

export interface UpdateFormInput {
  title?: string
  description?: string
  questions?: unknown
  settings?: unknown
  baseVersion: number
}

/** Questions dont des réponses existent déjà : leur type ne peut plus changer (les réponses deviendraient illisibles). */
function answeredQuestionIds(db: Db, formId: number): Set<string> {
  const ids = new Set<string>()
  for (const { answers } of db.prepare('SELECT answers FROM responses WHERE form_id = ?').iterate(formId) as Iterable<{ answers: string }>) {
    for (const key of Object.keys(JSON.parse(answers) as object)) ids.add(key)
  }
  return ids
}

export function updateForm(db: Db, id: number, input: UpdateFormInput, user: string, now = new Date()): Form {
  return db.transaction(() => {
    const current = getForm(db, id)
    if (input.baseVersion !== current.version) {
      throw conflict(`${current.updatedBy} a modifié ce formulaire entre-temps (version ${current.version}). Recharge-le pour voir ses changements.`, {
        current,
      })
    }
    const title = input.title !== undefined ? cleanTitle(input.title) : current.title
    const description = input.description !== undefined ? cleanDescription(input.description) : current.description
    const questions = input.questions !== undefined ? questionsOrThrow(input.questions) : current.questions
    const settings = input.settings !== undefined ? cleanSettings(input.settings) : current.settings

    if (input.questions !== undefined && current.responseCount > 0) {
      const answered = answeredQuestionIds(db, id)
      const before = new Map(current.questions.map((q) => [q.id, q]))
      for (const q of questions) {
        const old = before.get(q.id)
        if (old && old.type !== q.type && answered.has(q.id)) {
          throw invalid(`« ${old.label || 'Question sans titre'} » a déjà des réponses : son type ne peut plus changer. Ajoute plutôt une nouvelle question.`)
        }
      }
    }
    if (current.status !== 'draft' && input.questions !== undefined) {
      const problems = publishProblems(questions)
      if (problems.length) throw invalid(`Formulaire ouvert ou fermé : ${problems[0]}`)
    }

    const fields = [
      title !== current.title && 'title',
      description !== current.description && 'description',
      JSON.stringify(questions) !== JSON.stringify(current.questions) && 'questions',
      JSON.stringify(settings) !== JSON.stringify(current.settings) && 'settings',
    ].filter((f): f is string => Boolean(f))
    if (fields.length === 0) return current

    db.prepare('UPDATE forms SET title = ?, description = ?, questions = ?, settings = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE id = ?').run(
      title, description, JSON.stringify(questions), JSON.stringify(settings), user, now.toISOString(), id,
    )
    emitEvents(db, [{ type: 'formulaire.form.updated', subject: { kind: 'form', id: String(id), label: title }, data: { fields, version: current.version + 1 } }], now)
    return getForm(db, id)
  })()
}

/** Ouvrir (contrôle des questions), fermer, ou remettre en préparation. */
export function setStatus(db: Db, id: number, status: FormStatus, user: string, now = new Date()): Form {
  return db.transaction(() => {
    const form = getForm(db, id)
    if (form.status === status) return form
    if (status === 'open') {
      const problems = publishProblems(form.questions)
      if (problems.length) throw new ApiError(422, 'VALIDATION', `Impossible d'ouvrir le formulaire : ${problems.join(' ')}`, { problems })
    }
    if (status === 'draft' && form.responseCount > 0) {
      throw conflict('Ce formulaire a déjà des réponses : ferme-le plutôt que de le remettre en préparation.')
    }
    // Rouvrir un formulaire dont la date de fermeture est passée : la date est retirée.
    const settings = status === 'open' && !isAccepting('open', form.settings, now) ? { ...form.settings, closesAt: null } : form.settings
    db.prepare('UPDATE forms SET status = ?, settings = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE id = ?').run(
      status, JSON.stringify(cleanSettings(settings)), user, now.toISOString(), id,
    )
    if (status !== 'draft') {
      emitEvents(
        db,
        [{
          type: status === 'open' ? 'formulaire.form.opened' : 'formulaire.form.closed',
          subject: { kind: 'form', id: String(id), label: form.title },
          data: { responses: form.responseCount, access: form.access },
        }],
        now,
      )
    }
    return getForm(db, id)
  })()
}

const newToken = () => randomBytes(18).toString('base64url')

/** Accès « suite » (connectés) ou « public » (lien secret). `regenerate` invalide l'ancien lien public. */
export function setAccess(db: Db, id: number, access: FormAccess, user: string, options: { regenerate?: boolean } = {}, now = new Date()): Form {
  return db.transaction(() => {
    const form = getForm(db, id)
    const row = db.prepare('SELECT public_token FROM forms WHERE id = ?').get(id) as { public_token: string | null }
    const token = access === 'public' && (options.regenerate || !row.public_token) ? newToken() : row.public_token
    db.prepare('UPDATE forms SET access = ?, public_token = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE id = ?').run(
      access, token, user, now.toISOString(), id,
    )
    if (form.access !== access || options.regenerate) {
      emitEvents(db, [{ type: 'formulaire.form.updated', subject: { kind: 'form', id: String(id), label: form.title }, data: { fields: ['access'], version: form.version + 1 } }], now)
    }
    return getForm(db, id)
  })()
}

export function duplicateForm(db: Db, id: number, user: string, now = new Date()): Form {
  const form = getForm(db, id)
  return createForm(db, { title: `${form.title} (copie)`.slice(0, MAX_TITLE), description: form.description, questions: form.questions.map((q) => ({ ...q, id: newQuestionId() })), settings: { ...form.settings, closesAt: null } }, user, now)
}

export function deleteForm(db: Db, id: number, user: string, now = new Date()): void {
  db.transaction(() => {
    const form = getForm(db, id)
    db.prepare("UPDATE forms SET deleted_at = ?, status = CASE status WHEN 'open' THEN 'closed' ELSE status END, updated_by = ? WHERE id = ?").run(now.toISOString(), user, id)
    emitEvents(db, [{ type: 'formulaire.form.deleted', subject: { kind: 'form', id: String(id), label: form.title }, data: { responses: form.responseCount } }], now)
  })()
}

export function restoreForm(db: Db, id: number): Form {
  const form = getForm(db, id, { includeDeleted: true })
  if (!form.deletedAt) return form
  db.prepare('UPDATE forms SET deleted_at = NULL WHERE id = ?').run(id)
  return getForm(db, id)
}

/** Supprime définitivement les formulaires supprimés depuis plus de `days` jours (réponses comprises). */
export function purgeDeletedForms(db: Db, days = 30, now = new Date()): number {
  const limit = new Date(now.getTime() - days * 864e5).toISOString()
  return db.prepare('DELETE FROM forms WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(limit).changes
}

export function purgeForm(db: Db, id: number): void {
  const form = getForm(db, id, { includeDeleted: true })
  if (!form.deletedAt) throw conflict('Supprime d’abord le formulaire (il passe par les formulaires supprimés).')
  db.prepare('DELETE FROM forms WHERE id = ?').run(id)
}
