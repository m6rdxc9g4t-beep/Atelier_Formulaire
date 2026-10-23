// Création assistée de formulaires : client Ollama (local, même hôte par défaut) et brouillon de formulaire.
// Seul point de contact avec Ollama. Rien n'est écrit en base : le brouillon est renvoyé à l'interface, et la création
// reste faite par `createForm` (POST /api/forms) quand l'utilisateur valide.

import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'

import type { OllamaConfig } from '../config.js'
import { draftJsonSchema, draftMessages, DRAFT_LIMITS, parseModelJson, repairDraft, type ChatMessage, type FormDraft } from '../domain/form-draft.js'
import { ApiError, invalid } from '../http/errors.js'
import { newQuestionId } from './forms.js'

/** Sous-ensemble de `fetch` utilisé ici : injectable dans les tests (faux Ollama). */
export type FetchLike = (url: string, init: { method: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<Response>

/** Taille maximale lue d'une réponse d'Ollama. */
const MAX_BODY = 4 * 1024 * 1024

/**
 * Transport par défaut, sur node:http(s). Le `fetch` de Node coupe une réponse dont les en-têtes tardent plus de
 * 300 s (`headersTimeout` d'undici) : avec `stream: false`, Ollama n'envoie rien avant la fin de la génération,
 * ce qui rendrait `OLLAMA_TIMEOUT_MS` inopérant au-delà. Ici, seul le signal fixe la limite.
 */
export const nodeFetch: FetchLike = (url, init) =>
  new Promise<Response>((resolve, reject) => {
    const target = new URL(url)
    const send = target.protocol === 'https:' ? httpsRequest : httpRequest
    const req = send(target, { method: init.method, headers: init.headers, signal: init.signal }, (res) => {
      const chunks: Buffer[] = []
      let size = 0
      res.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > MAX_BODY) {
          req.destroy(new Error('Réponse d’Ollama trop volumineuse.'))
          return
        }
        chunks.push(chunk)
      })
      res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode ?? 502 })))
      res.on('error', reject)
    })
    req.on('error', (error) => reject(init.signal?.aborted ? (init.signal.reason as Error) : error))
    req.end(init.body)
  })

export interface AiStatus {
  /** Le serveur Ollama répond. */
  available: boolean
  model: string
  /** Le modèle configuré est installé sur ce serveur. */
  modelInstalled: boolean
}

/** Le nom d'un modèle installé correspond-il au modèle configuré ? (`llama3.1` = `llama3.1:latest`). */
export function sameModel(installed: string, wanted: string): boolean {
  const norm = (name: string) => (name.includes(':') ? name : `${name}:latest`).toLowerCase()
  return norm(installed) === norm(wanted)
}

const modelMissing = (model: string) =>
  new ApiError(503, 'AI_MODEL_MISSING', `Le modèle « ${model} » n’est pas installé sur le serveur Ollama. Installe-le sur le serveur (ollama pull ${model}) ou choisis un autre modèle (OLLAMA_MODEL).`, { model })

export class OllamaClient {
  constructor(
    readonly config: OllamaConfig,
    private readonly fetchImpl: FetchLike = nodeFetch,
  ) {}

  /** État du serveur et du modèle (délai court). Ne lève jamais d'exception. */
  async status(timeoutMs = 3000): Promise<AiStatus> {
    const model = this.config.model
    try {
      const response = await this.fetchImpl(`${this.config.url}/api/tags`, { method: 'GET', signal: AbortSignal.timeout(timeoutMs) })
      if (!response.ok) return { available: false, model, modelInstalled: false }
      const body = (await response.json().catch(() => ({}))) as { models?: { name?: unknown; model?: unknown }[] }
      const installed = (Array.isArray(body.models) ? body.models : []).some((m) =>
        [m?.name, m?.model].some((name) => typeof name === 'string' && sameModel(name, model)),
      )
      return { available: true, model, modelInstalled: installed }
    } catch {
      return { available: false, model, modelInstalled: false }
    }
  }

  /**
   * Conversation non diffusée (`stream: false`) avec sortie structurée (`format` = schéma JSON, Ollama ≥ 0.5).
   * Renvoie le texte du message de l'assistant. Erreurs : AI_UNAVAILABLE, AI_TIMEOUT, AI_MODEL_MISSING, AI_CANCELLED.
   */
  async chat(messages: ChatMessage[], schema: Record<string, unknown>, options: { signal?: AbortSignal } = {}): Promise<{ content: string; model: string }> {
    const { url, model, timeoutMs } = this.config
    const timeout = AbortSignal.timeout(timeoutMs)
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
    let text: string
    let status: number
    try {
      const response = await this.fetchImpl(`${url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, stream: false, format: schema, options: { temperature: 0.2 } }),
        signal,
      })
      status = response.status
      text = await response.text()
    } catch {
      if (timeout.aborted) {
        throw new ApiError(504, 'AI_TIMEOUT', `L’IA n’a pas répondu en ${Math.round(timeoutMs / 1000)} secondes. Réessaie avec une description plus courte ou moins de questions, ou augmente OLLAMA_TIMEOUT_MS.`)
      }
      if (options.signal?.aborted) throw new ApiError(499, 'AI_CANCELLED', 'Génération annulée.')
      throw new ApiError(503, 'AI_UNAVAILABLE', `Le serveur d’IA (Ollama) est injoignable à ${url}. Vérifie qu’il est démarré.`)
    }
    if (status === 404) throw modelMissing(model)
    if (status < 200 || status >= 300) {
      const detail = errorText(text)
      throw new ApiError(503, 'AI_UNAVAILABLE', `Le serveur d’IA (Ollama) a renvoyé une erreur (${status})${detail ? ` : ${detail}` : ''}.`)
    }
    let body: { message?: { content?: unknown }; model?: unknown }
    try {
      body = JSON.parse(text) as typeof body
    } catch {
      throw invalidOutput()
    }
    const content = body?.message?.content
    if (typeof content !== 'string' || !content.trim()) throw invalidOutput()
    return { content, model: typeof body.model === 'string' && body.model ? body.model : model }
  }
}

function errorText(text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: unknown }
    if (typeof parsed.error === 'string') return parsed.error.slice(0, 300)
  } catch {
    // corps non JSON
  }
  return text.trim().slice(0, 300)
}

const invalidOutput = () => new ApiError(502, 'AI_INVALID_OUTPUT', 'L’IA a renvoyé une réponse inexploitable. Réessaie, ou reformule ta description.')

// ── Brouillon de formulaire ─────────────────────────────────────────────────

export interface FormDraftRequest {
  description: string
  questionCount?: number
}

export interface FormDraftResult {
  draft: FormDraft
  warnings: string[]
  model: string
}

/** Contrôle la demande (messages en français ; 422 VALIDATION comme le reste de l'API). */
export function checkDraftRequest(input: { description?: unknown; questionCount?: unknown }): FormDraftRequest {
  const description = typeof input.description === 'string' ? input.description.replace(/\r\n?/g, '\n').trim() : ''
  if (!description) throw invalid('Décris le formulaire que tu veux créer.')
  if (description.length > DRAFT_LIMITS.description) throw invalid(`La description dépasse ${DRAFT_LIMITS.description} caractères.`)
  const out: FormDraftRequest = { description }
  if (input.questionCount !== undefined && input.questionCount !== null) {
    const n = input.questionCount
    if (typeof n !== 'number' || !Number.isInteger(n) || n < DRAFT_LIMITS.minQuestions || n > DRAFT_LIMITS.maxQuestions) {
      throw invalid(`Le nombre de questions va de ${DRAFT_LIMITS.minQuestions} à ${DRAFT_LIMITS.maxQuestions}.`)
    }
    out.questionCount = n
  }
  return out
}

/** Demande un brouillon à Ollama et le ramène aux règles du domaine. N'écrit rien en base. */
export async function draftForm(client: OllamaClient, input: FormDraftRequest, options: { signal?: AbortSignal } = {}): Promise<FormDraftResult> {
  const { content, model } = await client.chat(draftMessages(input.description, input.questionCount), draftJsonSchema(), options)
  const repaired = repairDraft(parseModelJson(content), newQuestionId)
  if (!repaired) throw invalidOutput()
  return { ...repaired, model }
}
