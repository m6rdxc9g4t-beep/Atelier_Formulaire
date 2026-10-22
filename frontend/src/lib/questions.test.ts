import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { changeType, clientErrors, newQuestion, type Question } from './questions.ts'
import { parseRoute } from './router.ts'

describe('questions (interface)', () => {
  it('garde ce qui reste valable en changeant de type', () => {
    const q: Question = { id: 'a', type: 'single', label: 'Taille', help: 'Aide', required: true, options: ['S', 'M'] }
    assert.deepEqual(changeType(q, 'multiple'), { id: 'a', type: 'multiple', label: 'Taille', help: 'Aide', required: true, options: ['S', 'M'] })
    assert.deepEqual(changeType(q, 'scale'), { id: 'a', type: 'scale', label: 'Taille', help: 'Aide', required: true, min: 1, max: 5 })
    assert.deepEqual(changeType(q, 'section'), { id: 'a', type: 'section', label: 'Taille', help: 'Aide' })
    assert.deepEqual(newQuestion('dropdown').options, ['Choix 1'])
  })

  it('signale à la saisie les réponses manquantes ou mal formées', () => {
    const qs: Question[] = [
      { id: 'n', type: 'short_text', label: 'Nom', required: true },
      { id: 'm', type: 'email', label: 'Mail' },
      { id: 'x', type: 'number', label: 'Nb', max: 3 },
      { id: 's', type: 'section', label: 'S' },
    ]
    assert.deepEqual(clientErrors(qs, { n: '  ', m: 'a@b', x: '4' }), { n: 'Réponse obligatoire.', m: 'Adresse e-mail invalide.', x: 'Au plus 3.' })
    assert.deepEqual(clientErrors(qs, { n: 'Ana', x: '2,5' }), {})
  })
})

describe('adresses', () => {
  it('reconnaît les pages', () => {
    assert.deepEqual(parseRoute('/'), { name: 'home' })
    assert.deepEqual(parseRoute('/f/12/reponses'), { name: 'form', id: 12, tab: 'reponses' })
    assert.deepEqual(parseRoute('/f/12'), { name: 'form', id: 12, tab: 'questions' })
    assert.deepEqual(parseRoute('/f/12/repondre'), { name: 'fill', id: 12 })
    assert.deepEqual(parseRoute('/r/AbC_123-xyzXYZ0987654321'), { name: 'public', token: 'AbC_123-xyzXYZ0987654321' })
    assert.deepEqual(parseRoute('/r/../x'), { name: 'notFound' })
  })
})
