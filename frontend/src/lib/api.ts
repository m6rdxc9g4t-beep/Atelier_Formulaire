// Client de l'API des formulaires (même origine : /api). Toute erreur devient une ApiError avec le message français du serveur.

import type { Answers, Question } from './questions.ts'

export type FormStatus = 'draft' | 'open' | 'closed'
export type FormAccess = 'suite' | 'public'

export interface FormSettings {
  confirmation?: string
  onePerPerson?: boolean
  closesAt?: string | null
}

export interface Form {
  id: number
  title: string
  description: string
  status: FormStatus
  access: FormAccess
  publicToken: string | null
  questions: Question[]
  settings: FormSettings
  accepting: boolean
  version: number
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  responseCount: number
  lastResponseAt: string | null
}

/** Ce que voit la personne qui répond. */
export interface FillView {
  title: string
  description: string
  questions: Question[]
  status: FormStatus
  accepting: boolean
  closesAt: string | null
  confirmation: string
  alreadyAnswered: boolean
}

export interface FormResponse {
  id: number
  formId: number
  answers: Answers
  respondent: string | null
  source: 'suite' | 'public' | 'nexus'
  createdAt: string
}

export type QuestionSummary =
  | { id: string; type: string; label: string; answered: number; kind: 'choices'; counts: { option: string; count: number }[] }
  | { id: string; type: string; label: string; answered: number; kind: 'numbers'; min: number | null; max: number | null; average: number | null; distribution?: { value: number; count: number }[] }
  | { id: string; type: string; label: string; answered: number; kind: 'texts'; latest: string[] }

/** État de l'IA locale (GET /api/ai/status). */
export interface AiStatus {
  available: boolean
  model: string
  modelInstalled: boolean
}

/** Brouillon proposé par l'IA : même forme que la création d'un formulaire. */
export interface FormDraft {
  title: string
  description: string
  questions: Question[]
}

export interface FormDraftResult {
  draft: FormDraft
  warnings: string[]
  model: string
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

async function request<T>(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  let text: string
  try {
    response = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      signal,
    })
    text = response.status === 204 ? '' : await response.text()
  } catch {
    if (signal?.aborted) throw new ApiError(0, 'ABORTED', 'Demande annulée.')
    throw new ApiError(0, 'NETWORK', 'Le serveur ne répond pas. Vérifie ta connexion, puis réessaie.')
  }
  if (response.status === 204) return undefined as T
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!response.ok) {
    const payload = (data ?? {}) as { detail?: string; code?: string }
    if (response.status === 401 || response.redirected) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Ta session a expiré : recharge la page pour te reconnecter.')
    }
    throw new ApiError(response.status, payload.code ?? 'ERROR', payload.detail ?? `Erreur ${response.status}.`, (data ?? {}) as Record<string, unknown>)
  }
  return data as T
}

export const api = {
  me: () => request<{ user: string; version: string; publicUrl: string | null }>('GET', '/api/me'),

  forms: (deleted = false) => request<Form[]>('GET', `/api/forms${deleted ? '?supprimes=1' : ''}`),
  form: (id: number) => request<Form>('GET', `/api/forms/${id}`),
  createForm: (input: { title: string; description?: string; questions?: Question[] }) => request<Form>('POST', '/api/forms', input),
  updateForm: (id: number, input: { title?: string; description?: string; questions?: Question[]; settings?: FormSettings; baseVersion: number }) =>
    request<Form>('PUT', `/api/forms/${id}`, input),
  setStatus: (id: number, status: FormStatus) => request<Form>('POST', `/api/forms/${id}/status`, { status }),
  setAccess: (id: number, access: FormAccess, regenerate = false) => request<Form>('POST', `/api/forms/${id}/access`, { access, regenerate }),
  duplicate: (id: number) => request<Form>('POST', `/api/forms/${id}/duplicate`),
  deleteForm: (id: number) => request<void>('DELETE', `/api/forms/${id}`),
  restoreForm: (id: number) => request<Form>('POST', `/api/forms/${id}/restore`),
  purgeForm: (id: number) => request<void>('DELETE', `/api/forms/${id}/purge`),

  aiStatus: () => request<AiStatus>('GET', '/api/ai/status'),
  /** Brouillon de formulaire (rien n'est créé) ; `signal` permet d'annuler une génération longue. */
  formDraft: (input: { description: string; questionCount?: number }, signal?: AbortSignal) =>
    request<FormDraftResult>('POST', '/api/ai/form-draft', input, signal),

  responses: (id: number, offset = 0, limit = 100) => request<{ total: number; items: FormResponse[] }>('GET', `/api/forms/${id}/responses?limit=${limit}&offset=${offset}`),
  summary: (id: number) => request<{ total: number; questions: QuestionSummary[] }>('GET', `/api/forms/${id}/summary`),
  deleteResponse: (id: number, responseId: number) => request<void>('DELETE', `/api/forms/${id}/responses/${responseId}`),

  fill: (id: number) => request<FillView>('GET', `/api/fill/${id}`),
  submit: (id: number, answers: Answers) => request<{ id: number; createdAt: string }>('POST', `/api/fill/${id}`, { answers }),
  publicFill: (token: string) => request<FillView>('GET', `/api/public/forms/${encodeURIComponent(token)}`),
  publicSubmit: (token: string, answers: Answers, website: string) =>
    request<{ createdAt: string }>('POST', `/api/public/forms/${encodeURIComponent(token)}`, { answers, website }),
}
