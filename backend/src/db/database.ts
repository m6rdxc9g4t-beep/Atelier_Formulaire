// Base SQLite des formulaires (better-sqlite3, synchrone) : ouverture et migrations.
// Les migrations sont numérotées et ne changent jamais une fois publiées : on en ajoute une nouvelle.

import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export type Db = Database.Database

const MIGRATIONS: readonly string[] = [
  // 1 — schéma initial
  `
  CREATE TABLE forms (
    id           INTEGER PRIMARY KEY,
    title        TEXT    NOT NULL,
    description  TEXT    NOT NULL DEFAULT '',
    -- draft : en préparation ; open : accepte les réponses ; closed : n'en accepte plus.
    status       TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
    -- suite : personnes connectées au portail ; public : toute personne qui a le lien secret.
    access       TEXT    NOT NULL DEFAULT 'suite' CHECK (access IN ('suite', 'public')),
    public_token TEXT    UNIQUE,
    questions    TEXT    NOT NULL DEFAULT '[]',
    settings     TEXT    NOT NULL DEFAULT '{}',
    version      INTEGER NOT NULL DEFAULT 1,
    created_by   TEXT    NOT NULL,
    updated_by   TEXT    NOT NULL,
    created_at   TEXT    NOT NULL,
    updated_at   TEXT    NOT NULL,
    deleted_at   TEXT
  );

  CREATE TABLE responses (
    id         INTEGER PRIMARY KEY,
    form_id    INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    answers    TEXT    NOT NULL,
    -- Personne connectée (portail), sinon null (réponse publique).
    respondent TEXT,
    source     TEXT    NOT NULL CHECK (source IN ('suite', 'public', 'nexus')),
    created_at TEXT    NOT NULL
  );
  CREATE INDEX responses_form ON responses(form_id, id);
  CREATE INDEX responses_respondent ON responses(form_id, respondent);

  -- Journal d'événements du contrat atelier-node/1 : AUTOINCREMENT garantit qu'un seq n'est jamais réutilisé.
  CREATE TABLE atelier_events (
    seq           INTEGER PRIMARY KEY AUTOINCREMENT,
    type          TEXT NOT NULL,
    at            TEXT NOT NULL,
    subject_kind  TEXT NOT NULL,
    subject_id    TEXT NOT NULL,
    subject_label TEXT NOT NULL,
    data          TEXT NOT NULL
  );
  CREATE INDEX atelier_events_at ON atelier_events(at);

  CREATE TABLE idempotency_records (
    key         TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL,
    status      INTEGER NOT NULL,
    body        TEXT NOT NULL,
    created_at  TEXT NOT NULL
  );
  `,
]

export function migrate(db: Db): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)')
  const current = (db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null }).v ?? 0
  MIGRATIONS.forEach((sql, index) => {
    const version = index + 1
    if (version <= current) return
    db.transaction(() => {
      db.exec(sql)
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, new Date().toISOString())
    })()
  })
}

/** Ouvre (ou crée) la base. `:memory:` pour les tests. */
export function openDatabase(file: string): Db {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  migrate(db)
  return db
}
