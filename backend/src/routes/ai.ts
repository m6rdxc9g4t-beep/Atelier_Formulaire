// Routes de la création assistée (personnes connectées au portail, mêmes gardes Host / Origin que le reste de /api).
// Minces : elles valident, appellent services/ai.ts et renvoient sa réponse. Aucune n'écrit en base.

import type { FastifyInstance } from 'fastify'

import { checkDraftRequest, draftForm } from '../services/ai.js'

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/ai/status', async () => app.ai.status())

  app.post(
    '/api/ai/form-draft',
    {
      schema: {
        // Types contrôlés par checkDraftRequest (messages en français).
        body: { type: 'object', properties: { description: {}, questionCount: {} }, additionalProperties: false },
      },
    },
    async (request, reply) => {
      const input = checkDraftRequest(request.body as { description?: unknown; questionCount?: unknown })
      // La personne a fermé la page ou annulé : on arrête aussi la génération côté Ollama.
      const controller = new AbortController()
      const abort = () => controller.abort()
      reply.raw.on('close', abort)
      try {
        return await draftForm(app.ai, input, { signal: controller.signal })
      } finally {
        reply.raw.off('close', abort)
      }
    },
  )
}
