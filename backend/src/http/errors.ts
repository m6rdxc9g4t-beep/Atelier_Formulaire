// Erreurs de l'API : statut HTTP + `{ detail, code }` (forme du contrat atelier-node/1, §7.5),
// utilisée par toutes les routes du Wiki.

export type ErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'FORBIDDEN'
  | 'FORBIDDEN_HOST'
  | 'FORBIDDEN_ORIGIN'
  | 'METHOD_NOT_ALLOWED'
  | 'PAYLOAD_TOO_LARGE'
  | 'CLOSED'
  | 'RATE_LIMITED'
  | 'ALREADY_ANSWERED'
  | 'AI_UNAVAILABLE'
  | 'AI_TIMEOUT'
  | 'AI_MODEL_MISSING'
  | 'AI_INVALID_OUTPUT'
  | 'AI_CANCELLED'
  | 'INTERNAL'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    /** Données jointes à la réponse (ex. la version actuelle lors d'un conflit). */
    readonly extra?: Record<string, unknown>,
  ) {
    super(message)
  }
}

export const notFound = (what: string) => new ApiError(404, 'NOT_FOUND', `${what} introuvable.`)
export const invalid = (message: string) => new ApiError(422, 'VALIDATION', message)
export const conflict = (message: string, extra?: Record<string, unknown>) => new ApiError(409, 'CONFLICT', message, extra)
