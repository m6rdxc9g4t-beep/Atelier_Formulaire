// Réglages du serveur, lus une seule fois dans l'environnement.
// Tout a une valeur par défaut qui marche en local (`npm run dev`).

import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
/** Racine du paquet backend (src/ en dev, dist/ une fois compilé : même parent). */
const backendRoot = resolve(here, '..')

export interface FormsConfig {
  host: string
  port: number
  /** Dossier des données : base SQLite (`formulaire.db`). */
  dataDir: string
  /** Hôtes publics acceptés en plus des adresses de bouclage (ex. `formulaire.atelier.mondomaine.fr`). */
  allowedHosts: string[]
  /** Interface compilée servie par le backend (vide : API seule). */
  staticDir: string | null
  /** Auteur affiché quand la requête ne porte pas `X-Atelier-User` (en local, sans portail). */
  defaultUser: string
  /** Adresse publique (`https://formulaire.atelier.mondomaine.fr`) : liens de partage complets. */
  publicUrl: string | null
  /** Réponses publiques acceptées par adresse IP et par période de 10 minutes. */
  publicRateLimit: number
  /** Création assistée de formulaires : serveur Ollama (même hôte par défaut), modèle et délai d'une génération. */
  ollama: OllamaConfig
  logLevel: string
}

export interface OllamaConfig {
  /** Adresse du serveur Ollama, sans « / » final (`OLLAMA_URL`). */
  url: string
  /** Modèle utilisé (`OLLAMA_MODEL`). */
  model: string
  /** Délai maximal d'une génération, en millisecondes (`OLLAMA_TIMEOUT_MS`) : sans GPU, plusieurs minutes. */
  timeoutMs: number
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): FormsConfig {
  const defaultStatic = resolve(backendRoot, '..', 'frontend', 'dist')
  const staticDir = env.FORMULAIRE_STATIC_DIR !== undefined
    ? (env.FORMULAIRE_STATIC_DIR.trim() ? resolve(env.FORMULAIRE_STATIC_DIR) : null)
    : (existsSync(resolve(defaultStatic, 'index.html')) ? defaultStatic : null)

  return {
    host: env.HOST || '127.0.0.1',
    port: positiveNumber(env.PORT, 3300),
    dataDir: resolve(env.FORMULAIRE_DATA_DIR || resolve(backendRoot, 'data')),
    allowedHosts: list(env.ALLOWED_HOSTS),
    staticDir,
    defaultUser: (env.FORMULAIRE_DEFAULT_USER || 'moi').trim(),
    publicUrl: env.FORMULAIRE_PUBLIC_URL?.trim().replace(/\/+$/, '') || null,
    publicRateLimit: positiveNumber(env.FORMULAIRE_PUBLIC_RATE_LIMIT, 20),
    ollama: {
      url: env.OLLAMA_URL?.trim().replace(/\/+$/, '') || 'http://127.0.0.1:11434',
      model: env.OLLAMA_MODEL?.trim() || 'llama3.1:8b',
      timeoutMs: positiveNumber(env.OLLAMA_TIMEOUT_MS, 300_000),
    },
    logLevel: env.LOG_LEVEL || 'info',
  }
}
