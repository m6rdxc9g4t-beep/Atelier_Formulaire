// Nœud Atelier (contrat atelier-node/1) pour Atelier Nexus, et jeux de données au format d'Atelier Projets
// (§4.3 du contrat : GET /api/exports/datasets) pour qu'Atelier Viz lise les réponses.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { isQuestion } from '../domain/questions.js'
import { ApiError } from '../http/errors.js'
import { bodySchema, manifest, SCHEMAS } from '../services/atelier-manifest.js'
import { readEvents } from '../services/events.js'
import { getForm, listForms } from '../services/forms.js'
import { checkKey, fingerprint, runIdempotent } from '../services/idempotency.js'
import { responsesTable, submitResponse } from '../services/responses.js'
import { idParam } from './forms.js'

const formParams = { type: 'object', properties: { form_id: { type: 'string', pattern: '^[0-9]+$' } }, required: ['form_id'] }
const formIdOf = (request: FastifyRequest) => idParam((request.params as { form_id: string }).form_id)

const STATUS_LABEL = { draft: 'En préparation', open: 'Ouvert', closed: 'Fermé' } as const

export async function atelierRoutes(app: FastifyInstance): Promise<void> {
  const db = app.db

  app.get('/api/atelier/manifest', async () => manifest())

  app.get(
    '/api/atelier/events',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            since: { type: 'integer', minimum: 0 },
            limit: { type: 'integer', minimum: 1, maximum: 500 },
            types: { type: 'string', maxLength: 2000 },
          },
        },
      },
    },
    async (request) => {
      const { since, limit, types } = request.query as { since?: number; limit?: number; types?: string }
      return readEvents(db, { since, limit, types: types ? types.split(',').map((t) => t.trim()).filter(Boolean) : undefined })
    },
  )

  app.get('/api/atelier/forms', async () => {
    const forms = listForms(db)
    return {
      format: 'atelier-table/1',
      name: 'forms',
      label: 'Formulaires',
      columns: [
        { key: 'id', label: 'Id', type: 'string' },
        { key: 'titre', label: 'Titre', type: 'string' },
        { key: 'statut', label: 'Statut', type: 'string' },
        { key: 'accepte_reponses', label: 'Accepte des réponses', type: 'boolean' },
        { key: 'acces', label: 'Accès', type: 'string' },
        { key: 'questions', label: 'Questions', type: 'number' },
        { key: 'reponses', label: 'Réponses', type: 'number' },
        { key: 'derniere_reponse', label: 'Dernière réponse', type: 'datetime' },
        { key: 'maj_le', label: 'Modifié le', type: 'datetime' },
      ],
      rows: forms.map((f) => ({
        id: String(f.id),
        titre: f.title,
        statut: STATUS_LABEL[f.status],
        accepte_reponses: f.accepting,
        acces: f.access === 'public' ? 'Lien public' : 'Suite',
        questions: f.questions.filter(isQuestion).length,
        reponses: f.responseCount,
        derniere_reponse: f.lastResponseAt,
        maj_le: f.updatedAt,
      })),
      total: forms.length,
      truncated: false,
    }
  })

  app.get('/api/atelier/forms/:form_id', { schema: { params: formParams } }, async (request) => {
    const form = getForm(db, formIdOf(request))
    return {
      id: String(form.id),
      title: form.title,
      description: form.description,
      status: form.status,
      accepting: form.accepting,
      response_count: form.responseCount,
      questions: form.questions.filter(isQuestion).map((q) => ({
        id: q.id,
        type: q.type,
        label: q.label,
        required: Boolean(q.required),
        ...(q.options ? { options: q.options } : {}),
        ...(q.min !== undefined ? { min: q.min } : {}),
        ...(q.max !== undefined ? { max: q.max } : {}),
      })),
    }
  })

  app.get(
    '/api/atelier/forms/:form_id/responses',
    { schema: { params: formParams, querystring: bodySchema(SCHEMAS.responsesList, ['form_id']) } },
    async (request) => {
      const form = getForm(db, formIdOf(request))
      const { since_id, limit } = request.query as { since_id?: string; limit?: number }
      const table = responsesTable(db, form, { limit: limit ?? 1000, sinceId: since_id ? Number(since_id) : 0 })
      return { format: 'atelier-table/1', name: `form-${form.id}`, label: form.title, ...table }
    },
  )

  async function idempotent(request: FastifyRequest, reply: FastifyReply, run: () => { status: number; body: unknown }) {
    const key = checkKey(request.headers['idempotency-key'] as string | undefined)
    const path = request.url.split('?')[0] ?? request.url
    const result = runIdempotent(db, key, fingerprint(request.method, path, request.body ?? null), run)
    if (result.replayed) reply.header('Idempotency-Replayed', 'true')
    return reply.code(result.status).send(result.body)
  }

  app.post(
    '/api/atelier/forms/:form_id/responses',
    { schema: { params: formParams, body: bodySchema(SCHEMAS.responsesSubmit, ['form_id']) } },
    async (request, reply) => {
      const id = formIdOf(request)
      const respondent = request.headers['x-atelier-user'] ? request.user : 'Atelier Nexus'
      return idempotent(request, reply, () => {
        const r = submitResponse(db, id, (request.body as { answers: unknown }).answers, { respondent, source: 'nexus' })
        return { status: 201, body: { id: String(r.id), form_id: String(id), created_at: r.createdAt, answers: r.answers } }
      })
    },
  )

  // ── Jeux de données (même forme que GET /api/exports/datasets d'Atelier Projets) ──
  app.get('/api/exports/datasets', async () =>
    listForms(db)
      .filter((f) => f.responseCount > 0 || f.status !== 'draft')
      .map((f) => ({ name: `form-${f.id}`, label: f.title, description: `Réponses au formulaire « ${f.title} »`, rowCount: f.responseCount })),
  )

  app.get('/api/exports/datasets/:name', async (request) => {
    const m = /^form-(\d+)$/.exec((request.params as { name: string }).name)
    if (!m) throw new ApiError(404, 'NOT_FOUND', 'Jeu de données introuvable.')
    const form = getForm(db, Number(m[1]))
    const { columns, rows } = responsesTable(db, form)
    return { name: `form-${form.id}`, label: form.title, generatedAt: new Date().toISOString(), columns, rows }
  })
}
