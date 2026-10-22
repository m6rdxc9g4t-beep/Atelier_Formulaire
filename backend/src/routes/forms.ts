// Routes de l'interface (personnes connectées au portail) : formulaires, réponses, synthèse, export CSV.
// Minces : elles valident, appellent un service et renvoient sa réponse.

import type { FastifyInstance } from 'fastify'

import { ApiError } from '../http/errors.js'
import { manifest } from '../services/atelier-manifest.js'
import {
  createForm,
  deleteForm,
  duplicateForm,
  getForm,
  listForms,
  purgeForm,
  restoreForm,
  setAccess,
  setStatus,
  updateForm,
} from '../services/forms.js'
import { deleteResponse, formSummary, listResponses, responsesCsv } from '../services/responses.js'

/** Identifiant numérique de l'URL ; sinon 404. */
export function idParam(value: unknown, what = 'Formulaire'): number {
  const n = Number(value)
  if (!Number.isSafeInteger(n) || n <= 0) throw new ApiError(404, 'NOT_FOUND', `${what} introuvable.`)
  return n
}

const idSchema = { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } as const
const formId = (params: unknown) => idParam((params as { id: string }).id)

export async function formRoutes(app: FastifyInstance): Promise<void> {
  const db = app.db

  app.get('/api/health', async () => ({ status: 'ok', app: 'atelier-formulaire' }))
  app.get('/api/me', async (request) => ({ user: request.user, version: manifest().version, publicUrl: app.config.publicUrl }))

  app.get('/api/forms', async (request) => listForms(db, { deleted: (request.query as { supprimes?: string }).supprimes === '1' }))

  app.post(
    '/api/forms',
    {
      schema: {
        body: {
          type: 'object',
          properties: { title: { type: 'string' }, description: { type: 'string' }, questions: { type: 'array' } },
          required: ['title'],
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      reply.code(201)
      return createForm(db, request.body as { title: string }, request.user)
    },
  )

  app.get('/api/forms/:id', { schema: { params: idSchema } }, async (request) => getForm(db, formId(request.params), { includeDeleted: true }))

  app.put(
    '/api/forms/:id',
    {
      schema: {
        params: idSchema,
        body: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            questions: { type: 'array' },
            settings: { type: 'object' },
            baseVersion: { type: 'integer', minimum: 1 },
          },
          required: ['baseVersion'],
          additionalProperties: false,
        },
      },
    },
    async (request) => updateForm(db, formId(request.params), request.body as Parameters<typeof updateForm>[2], request.user),
  )

  app.post(
    '/api/forms/:id/status',
    {
      schema: {
        params: idSchema,
        body: { type: 'object', properties: { status: { enum: ['draft', 'open', 'closed'] } }, required: ['status'], additionalProperties: false },
      },
    },
    async (request) => setStatus(db, formId(request.params), (request.body as { status: 'draft' | 'open' | 'closed' }).status, request.user),
  )

  app.post(
    '/api/forms/:id/access',
    {
      schema: {
        params: idSchema,
        body: {
          type: 'object',
          properties: { access: { enum: ['suite', 'public'] }, regenerate: { type: 'boolean' } },
          required: ['access'],
          additionalProperties: false,
        },
      },
    },
    async (request) => {
      const body = request.body as { access: 'suite' | 'public'; regenerate?: boolean }
      return setAccess(db, formId(request.params), body.access, request.user, { regenerate: body.regenerate })
    },
  )

  app.post('/api/forms/:id/duplicate', { schema: { params: idSchema } }, async (request, reply) => {
    reply.code(201)
    return duplicateForm(db, formId(request.params), request.user)
  })

  app.delete('/api/forms/:id', { schema: { params: idSchema } }, async (request, reply) => {
    deleteForm(db, formId(request.params), request.user)
    return reply.code(204).send()
  })

  app.post('/api/forms/:id/restore', { schema: { params: idSchema } }, async (request) => restoreForm(db, formId(request.params)))

  app.delete('/api/forms/:id/purge', { schema: { params: idSchema } }, async (request, reply) => {
    purgeForm(db, formId(request.params))
    return reply.code(204).send()
  })

  // ── Réponses ─────────────────────────────────────────────────────────────
  app.get(
    '/api/forms/:id/responses',
    {
      schema: {
        params: idSchema,
        querystring: {
          type: 'object',
          properties: { limit: { type: 'integer', minimum: 1, maximum: 500 }, offset: { type: 'integer', minimum: 0 } },
        },
      },
    },
    async (request) => listResponses(db, formId(request.params), request.query as { limit?: number; offset?: number }),
  )

  app.get('/api/forms/:id/summary', { schema: { params: idSchema } }, async (request) => formSummary(db, formId(request.params)))

  app.delete('/api/forms/:id/responses/:responseId', async (request, reply) => {
    const { id, responseId } = request.params as { id: string; responseId: string }
    deleteResponse(db, idParam(id), idParam(responseId, 'Réponse'))
    return reply.code(204).send()
  })

  app.get('/api/forms/:id/export.csv', { schema: { params: idSchema } }, async (request, reply) => {
    const id = formId(request.params)
    const form = getForm(db, id, { includeDeleted: true })
    const name = `${form.title.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'formulaire'}-reponses.csv`
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`)
      .send(responsesCsv(db, id))
  })
}
