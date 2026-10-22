// Idempotence des écritures (contrat atelier-node/1, §7.4 et §7.7) :
// même clé + même requête → même réponse rejouée ; même clé + autre requête → IDEMPOTENCY_KEY_REUSED.

import { createHash } from 'node:crypto'

import type { Db } from '../db/database.js'
import { ApiError } from '../http/errors.js'

const KEEP_DAYS = 30

/** Corps canonique : clés triées à tous les niveaux (l'ordre des clés ne compte pas). */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

export function fingerprint(method: string, path: string, body: unknown): string {
  return createHash('sha256').update(`${method.toUpperCase()} ${path}\n${canonicalJson(body)}`).digest('hex')
}

export function checkKey(key: string | undefined): string | null {
  if (key === undefined) return null
  if (key.length < 1 || key.length > 200) throw new ApiError(422, 'VALIDATION', "L'en-tête Idempotency-Key doit faire de 1 à 200 caractères.")
  return key
}

export interface IdempotentResult {
  status: number
  body: unknown
  replayed: boolean
}

/**
 * Exécute `run` une seule fois par clé. `run` tourne dans la même transaction que l'enregistrement de la clé :
 * une écriture qui échoue n'enregistre rien.
 */
export function runIdempotent(
  db: Db,
  key: string | null,
  print: string,
  run: () => { status: number; body: unknown },
  now = new Date(),
): IdempotentResult {
  if (key === null) {
    const result = db.transaction(run)()
    return { ...result, replayed: false }
  }
  return db.transaction(() => {
    const existing = db.prepare('SELECT fingerprint, status, body FROM idempotency_records WHERE key = ?').get(key) as
      | { fingerprint: string; status: number; body: string }
      | undefined
    if (existing) {
      if (existing.fingerprint !== print) {
        throw new ApiError(409, 'IDEMPOTENCY_KEY_REUSED', 'Cette clé Idempotency-Key a déjà servi pour une autre requête.')
      }
      return { status: existing.status, body: JSON.parse(existing.body) as unknown, replayed: true }
    }
    const result = run()
    db.prepare('INSERT INTO idempotency_records (key, fingerprint, status, body, created_at) VALUES (?, ?, ?, ?, ?)').run(
      key, print, result.status, JSON.stringify(result.body), now.toISOString(),
    )
    return { ...result, replayed: false }
  })()
}

export function pruneIdempotency(db: Db, now = new Date()): number {
  const limit = new Date(now.getTime() - KEEP_DAYS * 864e5).toISOString()
  return db.prepare('DELETE FROM idempotency_records WHERE created_at < ?').run(limit).changes
}
