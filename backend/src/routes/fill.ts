// Remplir un formulaire.
// - Suite : /api/fill/:id, derrière la connexion du portail ; le répondant est la personne connectée.
// - Public : /api/public/forms/:token, sans connexion (Caddy laisse passer ces adresses), pour un formulaire
//   que son auteur a ouvert « à toute personne qui a le lien ». Limite d'envois par adresse IP + champ piège.

import type { FastifyInstance, FastifyRequest } from 'fastify'

import { ApiError } from '../http/errors.js'
import { findByToken, getForm, type Form } from '../services/forms.js'
import { hasAnswered, submitResponse } from '../services/responses.js'
import { idParam } from './forms.js'

/** Ce qu'une personne qui répond voit du formulaire : ni identifiant interne, ni lien secret, ni réglages internes. */
function fillView(form: Form, alreadyAnswered: boolean) {
  return {
    title: form.title,
    description: form.description,
    questions: form.questions,
    status: form.status,
    accepting: form.accepting,
    closesAt: form.settings.closesAt ?? null,
    confirmation: form.settings.confirmation ?? '',
    alreadyAnswered,
  }
}

const answersBody = {
  type: 'object',
  properties: {
    answers: { type: 'object' },
    // Champ piège : invisible pour une personne, souvent rempli par un robot.
    website: { type: 'string', maxLength: 500 },
  },
  required: ['answers'],
  additionalProperties: false,
} as const

/** Limite d'envois publics : `max` par adresse IP et par fenêtre de 10 minutes (mémoire du processus). */
export function rateLimiter(max: number, windowMs = 10 * 60_000) {
  const hits = new Map<string, number[]>()
  return (key: string, now = Date.now()): boolean => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
    if (recent.length >= max) {
      hits.set(key, recent)
      return false
    }
    recent.push(now)
    hits.set(key, recent)
    if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k)
    return true
  }
}

export async function fillRoutes(app: FastifyInstance): Promise<void> {
  const db = app.db
  const allow = rateLimiter(app.config.publicRateLimit)

  // ── Suite (connectés) ──
  app.get('/api/fill/:id', async (request) => {
    const form = getForm(db, idParam((request.params as { id: string }).id))
    return fillView(form, Boolean(form.settings.onePerPerson) && hasAnswered(db, form.id, request.user))
  })

  app.post('/api/fill/:id', { schema: { body: answersBody } }, async (request, reply) => {
    const id = idParam((request.params as { id: string }).id)
    const response = submitResponse(db, id, (request.body as { answers: unknown }).answers, { respondent: request.user, source: 'suite' })
    reply.code(201)
    return { id: response.id, createdAt: response.createdAt }
  })

  // ── Public (lien secret) ──
  const publicForm = (request: FastifyRequest): Form => {
    const { token } = request.params as { token: string }
    const form = /^[A-Za-z0-9_-]{16,64}$/.test(token) ? findByToken(db, token) : null
    if (!form) throw new ApiError(404, 'NOT_FOUND', 'Ce lien ne mène à aucun formulaire : il a peut-être été changé par son auteur.')
    return form
  }

  app.get('/api/public/forms/:token', async (request, reply) => {
    reply.header('Cache-Control', 'no-store')
    return fillView(publicForm(request), false)
  })

  app.post('/api/public/forms/:token', { schema: { body: answersBody } }, async (request, reply) => {
    const form = publicForm(request)
    const body = request.body as { answers: unknown; website?: string }
    if (!allow(request.ip)) {
      throw new ApiError(429, 'RATE_LIMITED', 'Trop d’envois depuis ta connexion. Réessaie dans quelques minutes.')
    }
    // Robot probable : on répond comme si de rien n'était, sans rien enregistrer.
    if (body.website) return reply.code(201).send({ createdAt: new Date().toISOString() })
    const response = submitResponse(db, form.id, body.answers, { respondent: null, source: 'public' })
    return reply.code(201).send({ createdAt: response.createdAt })
  })
}
