// Réponses : envoi (contrôlé par les règles du formulaire), consultation, synthèse, exports CSV et atelier-table/1.

import type { Db } from '../db/database.js'
import { checkAnswers, columnKeys, displayAnswer, isQuestion, summarize, type Answers, type Question } from '../domain/questions.js'
import { ApiError, notFound } from '../http/errors.js'
import { emitEvents } from './events.js'
import { getForm, isAccepting, type Form } from './forms.js'

export type ResponseSource = 'suite' | 'public' | 'nexus'

export interface FormResponse {
  id: number
  formId: number
  answers: Answers
  respondent: string | null
  source: ResponseSource
  createdAt: string
}

interface ResponseRow {
  id: number
  form_id: number
  answers: string
  respondent: string | null
  source: ResponseSource
  created_at: string
}

const toResponse = (r: ResponseRow): FormResponse => ({
  id: r.id,
  formId: r.form_id,
  answers: JSON.parse(r.answers) as Answers,
  respondent: r.respondent,
  source: r.source,
  createdAt: r.created_at,
})

export function hasAnswered(db: Db, formId: number, respondent: string | null): boolean {
  if (!respondent) return false
  return Boolean(db.prepare('SELECT 1 FROM responses WHERE form_id = ? AND respondent = ? LIMIT 1').get(formId, respondent))
}

export interface SubmitOptions {
  respondent: string | null
  source: ResponseSource
  /** Nexus peut écrire dans un formulaire en préparation ou fermé (import, tests) ; le public et la suite non. */
  ignoreStatus?: boolean
}

export function submitResponse(db: Db, formId: number, input: unknown, options: SubmitOptions, now = new Date()): FormResponse {
  return db.transaction(() => {
    const form = getForm(db, formId)
    if (!options.ignoreStatus && !isAccepting(form.status, form.settings, now)) {
      throw new ApiError(409, 'CLOSED', form.status === 'draft' ? 'Ce formulaire n’est pas encore ouvert.' : 'Ce formulaire n’accepte plus de réponses.')
    }
    if (form.settings.onePerPerson && options.source === 'suite' && hasAnswered(db, formId, options.respondent)) {
      throw new ApiError(409, 'ALREADY_ANSWERED', 'Tu as déjà répondu à ce formulaire.')
    }
    const { answers, errors } = checkAnswers(form.questions, input)
    if (Object.keys(errors).length) {
      throw new ApiError(422, 'VALIDATION', 'Certaines réponses sont à corriger.', { errors })
    }
    if (Object.keys(answers).length === 0) throw new ApiError(422, 'VALIDATION', 'Réponds au moins à une question.', { errors: {} })
    const { lastInsertRowid } = db
      .prepare('INSERT INTO responses (form_id, answers, respondent, source, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(formId, JSON.stringify(answers), options.respondent, options.source, now.toISOString())
    const id = Number(lastInsertRowid)
    emitEvents(
      db,
      [{
        type: 'formulaire.response.submitted',
        subject: { kind: 'form', id: String(formId), label: form.title },
        data: { response_id: String(id), source: options.source, responses: form.responseCount + 1 },
      }],
      now,
    )
    return getResponse(db, formId, id)
  })()
}

export function getResponse(db: Db, formId: number, id: number): FormResponse {
  const r = db.prepare('SELECT * FROM responses WHERE id = ? AND form_id = ?').get(id, formId) as ResponseRow | undefined
  if (!r) throw notFound('Réponse')
  return toResponse(r)
}

export function listResponses(db: Db, formId: number, options: { limit?: number; offset?: number; sinceId?: number } = {}) {
  getForm(db, formId, { includeDeleted: true })
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 5000)
  const where = options.sinceId !== undefined ? 'AND id > ?' : ''
  const params: unknown[] = [formId]
  if (options.sinceId !== undefined) params.push(options.sinceId)
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM responses WHERE form_id = ? ${where}`).get(...params) as { n: number }).n
  // Interface : les plus récentes d'abord ; reprise depuis un id (Nexus) : dans l'ordre d'arrivée.
  const order = options.sinceId !== undefined ? 'ASC' : 'DESC'
  const items = (
    db.prepare(`SELECT * FROM responses WHERE form_id = ? ${where} ORDER BY id ${order} LIMIT ? OFFSET ?`).all(...params, limit, options.offset ?? 0) as ResponseRow[]
  ).map(toResponse)
  return { total, items }
}

export function deleteResponse(db: Db, formId: number, id: number, now = new Date()): void {
  db.transaction(() => {
    const form = getForm(db, formId)
    getResponse(db, formId, id)
    db.prepare('DELETE FROM responses WHERE id = ?').run(id)
    emitEvents(db, [{ type: 'formulaire.response.deleted', subject: { kind: 'form', id: String(formId), label: form.title }, data: { response_id: String(id) } }], now)
  })()
}

function allAnswers(db: Db, formId: number): Answers[] {
  return (db.prepare('SELECT answers FROM responses WHERE form_id = ? ORDER BY id').all(formId) as { answers: string }[]).map((r) => JSON.parse(r.answers) as Answers)
}

export function formSummary(db: Db, formId: number) {
  const form = getForm(db, formId, { includeDeleted: true })
  return { total: form.responseCount, questions: summarize(form.questions, allAnswers(db, formId)) }
}

// ── Exports ─────────────────────────────────────────────────────────────────

type ColumnType = 'string' | 'number' | 'date' | 'datetime' | 'boolean'

function columnType(q: Question): ColumnType {
  if (q.type === 'number' || q.type === 'scale') return 'number'
  if (q.type === 'date') return 'date'
  if (q.type === 'yes_no') return 'boolean'
  return 'string'
}

/** Colonnes et lignes des réponses (même forme que les jeux de données d'Atelier Projets et atelier-table/1). */
export function responsesTable(db: Db, form: Form, options: { limit?: number; sinceId?: number } = {}) {
  const questions = form.questions.filter(isQuestion)
  const keys = columnKeys(questions)
  const columns: { key: string; label: string; type: ColumnType }[] = [
    { key: 'id', label: 'Réponse', type: 'string' },
    { key: 'recu_le', label: 'Reçue le', type: 'datetime' },
    { key: 'repondant', label: 'Répondant', type: 'string' },
    { key: 'source', label: 'Origine', type: 'string' },
    ...questions.map((q) => ({ key: keys.get(q.id)!, label: q.label || 'Question sans titre', type: columnType(q) })),
  ]
  const { items, total } = listResponses(db, form.id, { limit: options.limit ?? 5000, sinceId: options.sinceId ?? 0 })
  const rows = items.map((r) => {
    const row: Record<string, unknown> = { id: String(r.id), recu_le: r.createdAt, repondant: r.respondent, source: r.source }
    for (const q of questions) {
      const v = r.answers[q.id]
      row[keys.get(q.id)!] = v === undefined ? null : Array.isArray(v) ? v.join(', ') : v
    }
    return row
  })
  return { columns, rows, total, truncated: rows.length < total }
}

const csvCell = (value: unknown): string => {
  let text = value === null || value === undefined ? '' : typeof value === 'boolean' ? (value ? 'Oui' : 'Non') : String(value)
  // Une cellule qui commence par = + - @ serait exécutée comme formule par un tableur : on la neutralise.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** CSV (séparateur « ; », UTF-8 avec BOM : s'ouvre tel quel dans Excel et Numbers en français). */
export function responsesCsv(db: Db, formId: number): string {
  const form = getForm(db, formId, { includeDeleted: true })
  const questions = form.questions.filter(isQuestion)
  const { items } = listResponses(db, formId, { limit: 5000, sinceId: 0 })
  const header = ['Réponse', 'Reçue le', 'Répondant', 'Origine', ...questions.map((q) => q.label || 'Question sans titre')]
  const lines = [header.map(csvCell).join(';')]
  for (const r of items) {
    lines.push(
      [String(r.id), r.createdAt, r.respondent ?? '', r.source, ...questions.map((q) => displayAnswer(r.answers[q.id]))].map(csvCell).join(';'),
    )
  }
  return `﻿${lines.join('\r\n')}\r\n`
}
