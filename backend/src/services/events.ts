// Journal d'événements du contrat atelier-node/1 (docs/SUITE.md §7.3 et §7.7 d'Atelier Projets).
// Les événements sont émis par les services, dans la transaction de l'écriture : jamais par les routes.

import type { Db } from '../db/database.js'

export const EVENT_TYPES = [
  'formulaire.form.created',
  'formulaire.form.updated',
  'formulaire.form.opened',
  'formulaire.form.closed',
  'formulaire.form.deleted',
  'formulaire.response.submitted',
  'formulaire.response.deleted',
] as const

export type FormEventType = (typeof EVENT_TYPES)[number]

export interface FormEvent {
  type: FormEventType
  subject: { kind: 'form'; id: string; label: string }
  /** Identifiants (toujours en chaînes), statuts, nombres : jamais le contenu des réponses. */
  data: Record<string, unknown>
}

/** Au moins les 1 000 derniers événements OU les 30 derniers jours. */
const KEEP_COUNT = 1000
const KEEP_DAYS = 30

export function emitEvents(db: Db, events: readonly FormEvent[], now = new Date()): void {
  if (events.length === 0) return
  const insert = db.prepare(
    'INSERT INTO atelier_events (type, at, subject_kind, subject_id, subject_label, data) VALUES (?, ?, ?, ?, ?, ?)',
  )
  const at = now.toISOString()
  for (const e of events) {
    insert.run(e.type, at, e.subject.kind, e.subject.id, e.subject.label, JSON.stringify(e.data))
  }
}

export function pruneEvents(db: Db, now = new Date()): number {
  const last = lastSeq(db)
  const limit = new Date(now.getTime() - KEEP_DAYS * 864e5).toISOString()
  return db.prepare('DELETE FROM atelier_events WHERE seq <= ? AND at < ?').run(last - KEEP_COUNT, limit).changes
}

/** Dernier seq attribué, même si le journal a été vidé (sqlite_sequence survit aux suppressions). */
export function lastSeq(db: Db): number {
  const row = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'atelier_events'").get() as { seq: number } | undefined
  return row?.seq ?? 0
}

interface EventRow {
  seq: number
  type: string
  at: string
  subject_kind: string
  subject_id: string
  subject_label: string
  data: string
}

export interface EventsQuery {
  since?: number
  limit?: number
  types?: string[]
}

export function readEvents(db: Db, query: EventsQuery) {
  const limit = Math.min(Math.max(query.limit ?? 100, 1), 500)
  const last = lastSeq(db)
  const oldestRow = db.prepare('SELECT MIN(seq) AS s FROM atelier_events').get() as { s: number | null }
  const oldest = oldestRow.s ?? last + 1

  const where: string[] = []
  const params: unknown[] = []
  if (query.since !== undefined) {
    where.push('seq > ?')
    params.push(query.since)
  }
  if (query.types?.length) {
    where.push(`type IN (${query.types.map(() => '?').join(',')})`)
    params.push(...query.types)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  // Sans `since` : les plus récents (dans l'ordre croissant) ; avec : les suivants.
  const rows = (
    query.since === undefined
      ? (db.prepare(`SELECT * FROM atelier_events ${clause} ORDER BY seq DESC LIMIT ?`).all(...params, limit) as EventRow[]).reverse()
      : (db.prepare(`SELECT * FROM atelier_events ${clause} ORDER BY seq ASC LIMIT ?`).all(...params, limit) as EventRow[])
  )

  const events = rows.map((r) => ({
    seq: r.seq,
    type: r.type,
    at: r.at,
    subject: { kind: r.subject_kind, id: r.subject_id, label: r.subject_label },
    data: JSON.parse(r.data) as Record<string, unknown>,
  }))
  const next = events.length ? events[events.length - 1]!.seq : (query.since ?? last)
  const gap = query.since !== undefined && (query.since < oldest - 1 || query.since > last)
  return { events, next, oldest, gap }
}
