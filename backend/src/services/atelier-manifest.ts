// Manifeste du nœud Atelier (contrat atelier-node/1, docs/SUITE.md §7 d'Atelier Projets) : ce qu'Atelier Nexus
// peut enchaîner dans un workflow. Les schémas d'entrée sont déclarés UNE fois ici : la route les utilise pour
// valider, le manifeste les publie.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { EVENT_TYPES, type FormEventType } from './events.js'

const pkg = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json'), 'utf8')) as { version: string }

type JsonSchema = Record<string, unknown>

const id = { type: 'string', pattern: '^[0-9]+$', description: 'Identifiant numérique, en chaîne.' }

export const SCHEMAS = {
  formsList: { type: 'object', properties: {}, additionalProperties: false },
  formsGet: { type: 'object', properties: { form_id: id }, required: ['form_id'], additionalProperties: false },
  responsesList: {
    type: 'object',
    properties: {
      form_id: id,
      since_id: { ...id, description: 'Réponses arrivées après celle-ci (reprise incrémentale).' },
      limit: { type: 'integer', minimum: 1, maximum: 5000, default: 1000 },
    },
    required: ['form_id'],
    additionalProperties: false,
  },
  responsesSubmit: {
    type: 'object',
    properties: {
      form_id: id,
      answers: {
        type: 'object',
        description: 'Identifiant de question → valeur (texte, nombre, booléen, ou liste de choix). Voir forms.get pour les questions.',
      },
    },
    required: ['form_id', 'answers'],
    additionalProperties: false,
  },
} satisfies Record<string, JsonSchema>

/** Corps de la route sans les propriétés placées dans le chemin (`{form_id}`). */
export function bodySchema(schema: JsonSchema, pathParams: string[]): JsonSchema {
  const properties = { ...(schema.properties as Record<string, unknown>) }
  for (const p of pathParams) delete properties[p]
  const required = ((schema.required as string[] | undefined) ?? []).filter((r) => !pathParams.includes(r))
  return { ...schema, properties, required }
}

const EVENT_LABELS: Record<FormEventType, string> = {
  'formulaire.form.created': 'Formulaire créé',
  'formulaire.form.updated': 'Formulaire modifié',
  'formulaire.form.opened': 'Formulaire ouvert aux réponses',
  'formulaire.form.closed': 'Formulaire fermé',
  'formulaire.form.deleted': 'Formulaire supprimé',
  'formulaire.response.submitted': 'Réponse reçue',
  'formulaire.response.deleted': 'Réponse supprimée',
}

const tableOutput = { format: 'atelier-table/1', schema: { type: 'object' } }

export function manifest() {
  return {
    contract: 'atelier-node/1',
    app: 'formulaire',
    name: 'Atelier Formulaire',
    version: pkg.version,
    transport: 'http',
    actions: [
      {
        id: 'forms.list',
        label: 'Lister les formulaires',
        description: 'Formulaires avec leur statut et leur nombre de réponses.',
        kind: 'read',
        http: { method: 'GET', path: '/api/atelier/forms' },
        mcp_tool: null,
        input_schema: SCHEMAS.formsList,
        output: tableOutput,
        idempotency: 'natural',
      },
      {
        id: 'forms.get',
        label: 'Lire un formulaire',
        description: 'Questions d’un formulaire (identifiants, types, choix) : ce qu’attend responses.submit.',
        kind: 'read',
        http: { method: 'GET', path: '/api/atelier/forms/{form_id}' },
        mcp_tool: null,
        input_schema: SCHEMAS.formsGet,
        output: { format: 'json', schema: { type: 'object' } },
        idempotency: 'natural',
      },
      {
        id: 'responses.list',
        label: 'Lire les réponses',
        description: 'Réponses d’un formulaire, une colonne par question ; since_id pour ne lire que les nouvelles.',
        kind: 'read',
        http: { method: 'GET', path: '/api/atelier/forms/{form_id}/responses' },
        mcp_tool: null,
        input_schema: SCHEMAS.responsesList,
        output: tableOutput,
        idempotency: 'natural',
      },
      {
        id: 'responses.submit',
        label: 'Envoyer une réponse',
        description: 'Ajoute une réponse à un formulaire, contrôlée comme une réponse saisie à la main.',
        kind: 'write',
        http: { method: 'POST', path: '/api/atelier/forms/{form_id}/responses' },
        mcp_tool: null,
        input_schema: SCHEMAS.responsesSubmit,
        output: { format: 'json', schema: { type: 'object' } },
        idempotency: 'header',
      },
    ],
    events: EVENT_TYPES.map((type) => ({ type, label: EVENT_LABELS[type], data_schema: { type: 'object' } })),
  }
}
