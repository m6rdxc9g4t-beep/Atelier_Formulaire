// « Créer avec l'IA » : textes et petites règles de la boîte de dialogue, séparés de l'interface pour être testés.
// Les vrais contrôles (demande, brouillon) sont faits par le serveur (backend/src/services/ai.ts).

import type { AiStatus } from './api.ts'
import { ApiError } from './api.ts'
import { TYPE_LABELS, type Question } from './questions.ts'

export const MAX_DESCRIPTION = 4000
export const MIN_QUESTIONS = 3
export const MAX_QUESTIONS = 20

/** Explication à afficher si l'IA ne peut pas servir (serveur absent, modèle non installé), sinon null. */
export function statusProblem(status: AiStatus | undefined): string | null {
  if (!status) return null
  if (!status.available) return 'Le serveur d’IA (Ollama) ne répond pas pour l’instant. Tu peux réessayer plus tard, ou créer le formulaire à la main.'
  if (!status.modelInstalled) return `Le modèle « ${status.model} » n’est pas installé sur le serveur d’IA. Il faut l’installer (ollama pull ${status.model}) avant de pouvoir générer un formulaire.`
  return null
}

/** Nombre de questions saisi : vide → aucun ; sinon un entier ramené entre 3 et 20 ; null si illisible. */
export function parseQuestionCount(input: string): number | undefined | null {
  const value = input.trim()
  if (!value) return undefined
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.min(MAX_QUESTIONS, Math.max(MIN_QUESTIONS, Math.round(n)))
}

/** Message lisible pour une erreur de génération (les codes AI_* du serveur, l'annulation, le réseau). */
export function draftErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return error instanceof Error ? error.message : String(error)
  switch (error.code) {
    case 'AI_UNAVAILABLE':
      return `L’IA n’est pas disponible : ${error.message}`
    case 'AI_MODEL_MISSING':
      return error.message
    case 'AI_TIMEOUT':
      return `L’IA a mis trop de temps. ${error.message.replace(/^L’IA n’a pas répondu en [^.]*\.\s*/, '')}`.trim()
    case 'AI_INVALID_OUTPUT':
      return 'L’IA n’a pas proposé de questions utilisables. Réessaie, ou précise ta description.'
    case 'ABORTED':
    case 'AI_CANCELLED':
      return 'Génération annulée.'
    default:
      return error.message
  }
}

/** Ligne de détail d'une question dans l'aperçu : type, obligatoire, bornes. */
export function questionDetail(q: Question): string {
  const parts: string[] = [TYPE_LABELS[q.type]]
  if (q.type === 'scale') {
    const ends = q.minLabel || q.maxLabel ? ` (${q.minLabel ?? ''} → ${q.maxLabel ?? ''})` : ''
    parts[0] = `Échelle de ${q.min ?? 1} à ${q.max ?? 5}${ends}`
  }
  if (q.type === 'number' && (q.min !== undefined || q.max !== undefined)) {
    parts.push(q.min !== undefined && q.max !== undefined ? `de ${q.min} à ${q.max}` : q.min !== undefined ? `au moins ${q.min}` : `au plus ${q.max}`)
  }
  if (q.type !== 'section') parts.push(q.required ? 'obligatoire' : 'facultative')
  return parts.join(' · ')
}
