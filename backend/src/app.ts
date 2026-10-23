// Construction du serveur Fastify (sans écoute) : utilisé par server.ts et par les tests (app.inject).

import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify'
import { join } from 'node:path'

import type { FormsConfig } from './config.js'
import { openDatabase, type Db } from './db/database.js'
import { ApiError } from './http/errors.js'
import { isAllowedHost, isAllowedOrigin, isWrite, requestUser } from './http/guards.js'
import { aiRoutes } from './routes/ai.js'
import { atelierRoutes } from './routes/atelier.js'
import { fillRoutes } from './routes/fill.js'
import { formRoutes } from './routes/forms.js'
import { OllamaClient, type FetchLike } from './services/ai.js'
import { pruneEvents } from './services/events.js'
import { purgeDeletedForms } from './services/forms.js'
import { pruneIdempotency } from './services/idempotency.js'
import { seedIfEmpty } from './services/seed.js'

declare module 'fastify' {
  interface FastifyInstance {
    db: Db
    config: FormsConfig
    /** Client Ollama de la création assistée. */
    ai: OllamaClient
  }
  interface FastifyRequest {
    /** Auteur de la requête (portail de la suite, sinon auteur par défaut). */
    user: string
  }
}

/** Politique de sécurité de l'interface : scripts et styles de l'app seulement ; images https autorisées. */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  // Sondes de santé des autres apps de la suite (sélecteur « Suite Atelier »).
  "connect-src 'self' https: http://127.0.0.1:* http://localhost:*",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

export interface BuildOptions {
  config: FormsConfig
  /** Base déjà ouverte (tests : `:memory:`). */
  db?: Db
  seed?: boolean
  logger?: boolean
  /** Transport vers Ollama (tests : faux serveur). */
  aiFetch?: FetchLike
}

export async function buildApp({ config, db, seed = true, logger = false, aiFetch }: BuildOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: logger ? { level: config.logLevel } : false,
    bodyLimit: 1024 * 1024,
    trustProxy: '127.0.0.1',
    ajv: { customOptions: { removeAdditional: true, coerceTypes: 'array', useDefaults: true } },
  })

  const database = db ?? openDatabase(join(config.dataDir, 'formulaire.db'))
  app.decorate('db', database)
  app.decorate('config', config)
  app.decorate('ai', new OllamaClient(config.ollama, aiFetch))
  app.decorateRequest('user', '')
  if (seed) seedIfEmpty(database)

  app.addHook('onRequest', async (request, reply) => {
    if (!isAllowedHost(request.headers.host, config.allowedHosts)) {
      return reply.code(403).send({ detail: `Hôte non autorisé : ${request.headers.host ?? '(aucun)'}.`, code: 'FORBIDDEN_HOST' })
    }
    if (isWrite(request.method) && !isAllowedOrigin(request.headers.origin, config.allowedHosts)) {
      return reply.code(403).send({ detail: 'Origine non autorisée.', code: 'FORBIDDEN_ORIGIN' })
    }
    request.user = requestUser(request.headers['x-atelier-user'], config.defaultUser)
  })

  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.status).send({ detail: error.message, code: error.code, ...(error.extra ?? {}) })
    }
    const err = error as { validation?: unknown; statusCode?: number; code?: string; message: string }
    if (err.validation) {
      return reply.code(422).send({ detail: `Requête invalide : ${err.message}`, code: 'VALIDATION' })
    }
    if (err.statusCode === 413) {
      return reply.code(413).send({ detail: 'Envoi trop volumineux.', code: 'PAYLOAD_TOO_LARGE' })
    }
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ detail: err.message, code: 'VALIDATION' })
    }
    request.log.error(error)
    return reply.code(500).send({ detail: 'Erreur interne des formulaires.', code: 'INTERNAL' })
  })

  await app.register(formRoutes)
  await app.register(fillRoutes)
  await app.register(atelierRoutes)
  await app.register(aiRoutes)

  if (config.staticDir) {
    const staticDir = config.staticDir
    await app.register(fastifyStatic, {
      root: staticDir,
      index: false,
      setHeaders(reply, path) {
        if (path.startsWith(join(staticDir, 'assets'))) reply.header('Cache-Control', 'public, max-age=31536000, immutable')
      },
    })
    // Toute adresse de l'interface (/, /f/12, /r/<lien>…) renvoie index.html : le routeur du frontend prend la suite.
    const sendIndex = (reply: FastifyReply) => reply.header('Cache-Control', 'no-cache').header('Content-Security-Policy', CSP).sendFile('index.html')
    app.get('/', (_request, reply) => sendIndex(reply))
    app.setNotFoundHandler((request, reply) => {
      if ((request.method === 'GET' || request.method === 'HEAD') && !request.url.startsWith('/api/') && !request.url.startsWith('/assets/')) {
        return sendIndex(reply)
      }
      return reply.code(404).send({ detail: 'Adresse inconnue.', code: 'NOT_FOUND' })
    })
  } else {
    app.setNotFoundHandler((_request, reply) => reply.code(404).send({ detail: 'Adresse inconnue.', code: 'NOT_FOUND' }))
  }

  const maintenance = () => {
    try {
      purgeDeletedForms(database, 30)
      pruneEvents(database)
      pruneIdempotency(database)
    } catch (error) {
      app.log.error(error)
    }
  }
  maintenance()
  const timer = setInterval(maintenance, 6 * 3600_000)
  timer.unref()
  app.addHook('onClose', async () => {
    clearInterval(timer)
    if (!db) database.close()
  })

  return app
}
