import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import type { FastifyInstance } from 'fastify'

import { openDatabase, type Db } from '../src/db/database.js'
import { ApiError } from '../src/http/errors.js'
import { manifest } from '../src/services/atelier-manifest.js'
import { EVENT_TYPES, readEvents } from '../src/services/events.js'
import { createForm, deleteForm, duplicateForm, getForm, listForms, purgeDeletedForms, restoreForm, setAccess, setStatus, updateForm } from '../src/services/forms.js'
import { deleteResponse, formSummary, responsesCsv, submitResponse } from '../src/services/responses.js'
import { seedIfEmpty } from '../src/services/seed.js'
import { json, testApp } from './helpers.js'

const code = (fn: () => unknown) => {
  try {
    fn()
  } catch (error) {
    assert.ok(error instanceof ApiError, `ApiError attendue, reçu ${String(error)}`)
    return { status: error.status, code: error.code }
  }
  assert.fail('une erreur était attendue')
}

const QUESTIONS = [
  { id: 'nom', type: 'short_text', label: 'Nom', required: true },
  { id: 'avis', type: 'single', label: 'Avis', options: ['Bien', 'Moyen'] },
]

describe('formulaires', () => {
  let db: Db
  beforeEach(() => {
    db = openDatabase(':memory:')
  })

  it('crée un brouillon avec une question vide, refuse de l’ouvrir tant qu’elle n’a pas de libellé', () => {
    const form = createForm(db, { title: 'Inscription' }, 'alice')
    assert.equal(form.status, 'draft')
    assert.equal(form.questions.length, 1)
    assert.deepEqual(code(() => setStatus(db, form.id, 'open', 'alice')), { status: 422, code: 'VALIDATION' })
    const filled = updateForm(db, form.id, { questions: QUESTIONS, baseVersion: form.version }, 'alice')
    assert.equal(setStatus(db, filled.id, 'open', 'alice').accepting, true)
  })

  it('protège contre les modifications concurrentes', () => {
    const form = createForm(db, { title: 'A', questions: QUESTIONS }, 'alice')
    updateForm(db, form.id, { title: 'B', baseVersion: form.version }, 'bob')
    assert.deepEqual(code(() => updateForm(db, form.id, { title: 'C', baseVersion: form.version }, 'carole')), { status: 409, code: 'CONFLICT' })
  })

  it('n’accepte des réponses que si le formulaire est ouvert et avant sa date de fermeture', () => {
    const form = createForm(db, { title: 'A', questions: QUESTIONS }, 'alice')
    assert.deepEqual(code(() => submitResponse(db, form.id, { nom: 'x' }, { respondent: 'bob', source: 'suite' })), { status: 409, code: 'CLOSED' })
    setStatus(db, form.id, 'open', 'alice')
    submitResponse(db, form.id, { nom: 'Bob', avis: 'Bien' }, { respondent: 'bob', source: 'suite' })
    updateForm(db, form.id, { settings: { closesAt: '2026-01-01T00:00:00Z' }, baseVersion: getForm(db, form.id).version }, 'alice')
    assert.equal(getForm(db, form.id).accepting, false)
    assert.deepEqual(code(() => submitResponse(db, form.id, { nom: 'x' }, { respondent: 'c', source: 'suite' })), { status: 409, code: 'CLOSED' })
    // Rouvrir retire la date passée.
    setStatus(db, form.id, 'closed', 'alice')
    const reopened = setStatus(db, form.id, 'open', 'alice')
    assert.equal(reopened.accepting, true)
    assert.equal(reopened.settings.closesAt, undefined)
  })

  it('une réponse par personne si demandé ; erreurs détaillées par question', () => {
    const form = createForm(db, { title: 'A', questions: QUESTIONS, settings: { onePerPerson: true } }, 'alice')
    setStatus(db, form.id, 'open', 'alice')
    submitResponse(db, form.id, { nom: 'Bob' }, { respondent: 'bob', source: 'suite' })
    assert.deepEqual(code(() => submitResponse(db, form.id, { nom: 'Bob' }, { respondent: 'bob', source: 'suite' })), { status: 409, code: 'ALREADY_ANSWERED' })
    try {
      submitResponse(db, form.id, { avis: 'Nul' }, { respondent: 'carole', source: 'suite' })
      assert.fail()
    } catch (error) {
      assert.deepEqual((error as ApiError).extra, { errors: { nom: 'Réponse obligatoire.', avis: 'Choix inconnu.' } })
    }
  })

  it('verrouille le type d’une question qui a des réponses, et ne repasse pas en préparation', () => {
    const form = createForm(db, { title: 'A', questions: QUESTIONS }, 'alice')
    setStatus(db, form.id, 'open', 'alice')
    submitResponse(db, form.id, { nom: 'Bob', avis: 'Bien' }, { respondent: 'bob', source: 'suite' })
    const v = getForm(db, form.id).version
    const changed = [{ ...QUESTIONS[0] }, { ...QUESTIONS[1], type: 'multiple' }]
    assert.deepEqual(code(() => updateForm(db, form.id, { questions: changed, baseVersion: v }, 'alice')), { status: 422, code: 'VALIDATION' })
    // Changer le libellé reste possible.
    const relabeled = updateForm(db, form.id, { questions: [QUESTIONS[0], { ...QUESTIONS[1], label: 'Ton avis' }], baseVersion: v }, 'alice')
    assert.equal(relabeled.questions[1]!.label, 'Ton avis')
    assert.deepEqual(code(() => setStatus(db, form.id, 'draft', 'alice')), { status: 409, code: 'CONFLICT' })
  })

  it('partage par lien public, régénère le lien, duplique, supprime puis restaure', () => {
    const form = createForm(db, { title: 'A', questions: QUESTIONS }, 'alice')
    const pub = setAccess(db, form.id, 'public', 'alice')
    assert.match(pub.publicToken!, /^[A-Za-z0-9_-]{24}$/)
    assert.equal(setAccess(db, form.id, 'public', 'alice').publicToken, pub.publicToken, 'même lien')
    const regenerated = setAccess(db, form.id, 'public', 'alice', { regenerate: true })
    assert.notEqual(regenerated.publicToken, pub.publicToken)
    assert.equal(setAccess(db, form.id, 'suite', 'alice').publicToken, null)

    const copy = duplicateForm(db, form.id, 'bob')
    assert.equal(copy.title, 'A (copie)')
    assert.equal(copy.status, 'draft')
    assert.notEqual(copy.questions[0]!.id, form.questions[0]!.id)

    deleteForm(db, form.id, 'alice', new Date('2026-01-01T00:00:00Z'))
    assert.deepEqual(listForms(db).map((f) => f.title), ['A (copie)'])
    assert.deepEqual(listForms(db, { deleted: true }).map((f) => f.title), ['A'])
    restoreForm(db, form.id)
    deleteForm(db, form.id, 'alice', new Date('2026-01-01T00:00:00Z'))
    assert.equal(purgeDeletedForms(db, 30, new Date('2026-03-01T00:00:00Z')), 1)
  })

  it('résume, exporte en CSV (formules neutralisées) et émet chaque événement', () => {
    const form = createForm(db, { title: 'A', questions: QUESTIONS }, 'alice')
    updateForm(db, form.id, { title: 'Avis', baseVersion: form.version }, 'alice')
    setStatus(db, form.id, 'open', 'alice')
    submitResponse(db, form.id, { nom: '=HYPERLINK("http://x")', avis: 'Bien' }, { respondent: null, source: 'public' })
    const r = submitResponse(db, form.id, { nom: 'Zoé; "Z"', avis: 'Moyen' }, { respondent: 'zoe', source: 'suite' })
    assert.equal(formSummary(db, form.id).total, 2)
    const csv = responsesCsv(db, form.id)
    assert.ok(csv.startsWith('﻿Réponse;Reçue le;Répondant;Origine;Nom;Avis\r\n'))
    assert.match(csv, /;public;"'=HYPERLINK\(""http:\/\/x""\)";Bien\r\n/)
    assert.match(csv, /;zoe;suite;"Zoé; ""Z""";Moyen\r\n/)
    deleteResponse(db, form.id, r.id)
    setStatus(db, form.id, 'closed', 'alice')
    deleteForm(db, form.id, 'alice')
    const types = new Set(readEvents(db, { since: 0 }).events.map((e) => e.type))
    assert.deepEqual(types, new Set(EVENT_TYPES))
    for (const e of readEvents(db, { since: 0 }).events) assert.ok(!JSON.stringify(e.data).includes('HYPERLINK'), 'jamais le contenu des réponses')
  })

  it('crée le formulaire d’exemple une seule fois', () => {
    assert.equal(seedIfEmpty(db), true)
    assert.equal(seedIfEmpty(db), false)
    assert.equal(listForms(db)[0]!.questions.length, 6)
  })
})

describe('API', () => {
  let app: FastifyInstance
  let db: Db

  beforeEach(async () => {
    ;({ app, db } = await testApp({ config: { publicRateLimit: 3 } }))
  })

  it('remplit un formulaire « suite » au nom de la personne connectée', async () => {
    const form = createForm(db, { title: 'A', questions: QUESTIONS, settings: { onePerPerson: true } }, 'alice')
    setStatus(db, form.id, 'open', 'alice')
    const view = (await app.inject(json('GET', `/api/fill/${form.id}`, undefined, { 'x-atelier-user': 'bob' }))).json()
    assert.equal(view.alreadyAnswered, false)
    assert.ok(!('publicToken' in view) && !('id' in view))
    const sent = await app.inject(json('POST', `/api/fill/${form.id}`, { answers: { nom: 'Bob' } }, { 'x-atelier-user': 'bob' }))
    assert.equal(sent.statusCode, 201)
    const again = (await app.inject(json('GET', `/api/fill/${form.id}`, undefined, { 'x-atelier-user': 'bob' }))).json()
    assert.equal(again.alreadyAnswered, true)
    const invalid = await app.inject(json('POST', `/api/fill/${form.id}`, { answers: { avis: 'Nul' } }, { 'x-atelier-user': 'carole' }))
    assert.equal(invalid.statusCode, 422)
    assert.deepEqual(invalid.json().errors, { nom: 'Réponse obligatoire.', avis: 'Choix inconnu.' })
    const list = (await app.inject(json('GET', `/api/forms/${form.id}/responses`))).json()
    assert.equal(list.items[0].respondent, 'bob')
  })

  it('formulaire public : lien secret, champ piège, limite d’envois', async () => {
    const form = createForm(db, { title: 'Public', questions: QUESTIONS }, 'alice')
    const token = setAccess(db, form.id, 'public', 'alice').publicToken!
    assert.equal((await app.inject(json('GET', `/api/public/forms/${token}`))).json().accepting, false)
    setStatus(db, form.id, 'open', 'alice')
    assert.equal((await app.inject(json('GET', '/api/public/forms/inexistant-mais-long-assez'))).statusCode, 404)

    const robot = await app.inject(json('POST', `/api/public/forms/${token}`, { answers: { nom: 'Robot' }, website: 'http://spam' }))
    assert.equal(robot.statusCode, 201)
    assert.equal(getForm(db, form.id).responseCount, 0, 'rien d’enregistré pour un robot')

    for (let i = 0; i < 2; i++) assert.equal((await app.inject(json('POST', `/api/public/forms/${token}`, { answers: { nom: `P${i}` } }))).statusCode, 201)
    const limited = await app.inject(json('POST', `/api/public/forms/${token}`, { answers: { nom: 'Trop' } }))
    assert.deepEqual([limited.statusCode, limited.json().code], [429, 'RATE_LIMITED'])
    assert.equal(getForm(db, form.id).responseCount, 2)
    const responses = (await app.inject(json('GET', `/api/forms/${form.id}/responses`))).json()
    assert.deepEqual(responses.items.map((r: { source: string; respondent: string | null }) => [r.source, r.respondent]), [['public', null], ['public', null]])

    // Revenir à l'accès « suite » coupe le lien public.
    setAccess(db, form.id, 'suite', 'alice')
    assert.equal((await app.inject(json('GET', `/api/public/forms/${token}`))).statusCode, 404)
  })

  it('exporte le CSV avec un nom de fichier propre', async () => {
    const form = createForm(db, { title: 'Avis d’été', questions: QUESTIONS }, 'alice')
    const res = await app.inject(json('GET', `/api/forms/${form.id}/export.csv`))
    assert.match(res.headers['content-disposition'] as string, /avis-d-ete-reponses\.csv/)
    assert.match(res.headers['content-type'] as string, /text\/csv/)
  })

  it('nœud Atelier : manifeste, lecture, envoi idempotent, jeux de données pour Viz', async () => {
    const m = manifest()
    assert.equal(m.contract, 'atelier-node/1')
    for (const a of m.actions) {
      assert.match(a.id, /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/)
      for (const p of a.http.path.match(/\{(\w+)\}/g) ?? []) assert.ok(p.slice(1, -1) in (a.input_schema.properties as object))
    }
    const form = createForm(db, { title: 'Inscriptions', questions: QUESTIONS }, 'alice')
    setStatus(db, form.id, 'open', 'alice')

    const get = (await app.inject(json('GET', `/api/atelier/forms/${form.id}`))).json()
    assert.deepEqual(get.questions.map((q: { id: string }) => q.id), ['nom', 'avis'])

    const key = { 'idempotency-key': 'nexus:run9:step1' }
    const first = await app.inject(json('POST', `/api/atelier/forms/${form.id}/responses`, { answers: { nom: 'Nexus', avis: 'Bien' } }, key))
    assert.equal(first.statusCode, 201)
    const replay = await app.inject(json('POST', `/api/atelier/forms/${form.id}/responses`, { answers: { avis: 'Bien', nom: 'Nexus' } }, key))
    assert.equal(replay.headers['idempotency-replayed'], 'true')
    assert.equal(getForm(db, form.id).responseCount, 1)
    const reused = await app.inject(json('POST', `/api/atelier/forms/${form.id}/responses`, { answers: { nom: 'Autre' } }, key))
    assert.deepEqual([reused.statusCode, reused.json().code], [409, 'IDEMPOTENCY_KEY_REUSED'])

    const table = (await app.inject(json('GET', `/api/atelier/forms/${form.id}/responses?since_id=0`))).json()
    assert.equal(table.format, 'atelier-table/1')
    assert.deepEqual(table.columns.map((c: { key: string }) => c.key), ['id', 'recu_le', 'repondant', 'source', 'nom', 'avis'])
    assert.deepEqual([table.rows[0].nom, table.rows[0].source, table.rows[0].repondant], ['Nexus', 'nexus', 'Atelier Nexus'])
    const next = (await app.inject(json('GET', `/api/atelier/forms/${form.id}/responses?since_id=${table.rows[0].id}`))).json()
    assert.deepEqual(next.rows, [])

    const datasets = (await app.inject(json('GET', '/api/exports/datasets'))).json()
    assert.deepEqual(datasets, [{ name: `form-${form.id}`, label: 'Inscriptions', description: 'Réponses au formulaire « Inscriptions »', rowCount: 1 }])
    const dataset = (await app.inject(json('GET', `/api/exports/datasets/form-${form.id}`))).json()
    assert.equal(dataset.rows.length, 1)
    assert.equal((await app.inject(json('GET', '/api/exports/datasets/autre'))).statusCode, 404)
    const list = (await app.inject(json('GET', '/api/atelier/forms'))).json()
    assert.deepEqual([list.rows[0].titre, list.rows[0].reponses, list.rows[0].accepte_reponses], ['Inscriptions', 1, true])
  })

  it('refuse un hôte inconnu et une écriture d’une autre origine', async () => {
    assert.equal((await app.inject(json('GET', '/api/health', undefined, { host: 'evil.example' }))).statusCode, 403)
    assert.equal((await app.inject(json('POST', '/api/forms', { title: 'x' }, { origin: 'https://evil.example' }))).statusCode, 403)
  })
})
