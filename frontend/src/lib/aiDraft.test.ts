import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { draftErrorMessage, parseQuestionCount, questionDetail, statusProblem } from './aiDraft.ts'
import { ApiError } from './api.ts'

describe('créer avec l’IA (interface)', () => {
  it('explique pourquoi l’IA ne peut pas servir', () => {
    assert.equal(statusProblem(undefined), null)
    assert.equal(statusProblem({ available: true, model: 'llama3.1:8b', modelInstalled: true }), null)
    assert.match(statusProblem({ available: false, model: 'llama3.1:8b', modelInstalled: false }) ?? '', /ne répond pas/)
    assert.match(statusProblem({ available: true, model: 'llama3.1:8b', modelInstalled: false }) ?? '', /« llama3\.1:8b » n’est pas installé/)
  })

  it('lit le nombre de questions approximatif', () => {
    assert.equal(parseQuestionCount(''), undefined)
    assert.equal(parseQuestionCount(' 7 '), 7)
    assert.equal(parseQuestionCount('1'), 3)
    assert.equal(parseQuestionCount('50'), 20)
    assert.equal(parseQuestionCount('8.6'), 9)
    assert.equal(parseQuestionCount('beaucoup'), null)
  })

  it('rend les erreurs de génération lisibles', () => {
    assert.equal(draftErrorMessage(new ApiError(0, 'ABORTED', 'Demande annulée.')), 'Génération annulée.')
    assert.match(draftErrorMessage(new ApiError(502, 'AI_INVALID_OUTPUT', 'x')), /pas proposé de questions utilisables/)
    assert.equal(
      draftErrorMessage(new ApiError(504, 'AI_TIMEOUT', 'L’IA n’a pas répondu en 300 secondes. Réessaie avec une description plus courte.')),
      'L’IA a mis trop de temps. Réessaie avec une description plus courte.',
    )
    assert.match(draftErrorMessage(new ApiError(503, 'AI_UNAVAILABLE', 'Ollama est injoignable.')), /^L’IA n’est pas disponible : Ollama est injoignable\.$/)
    assert.equal(draftErrorMessage(new ApiError(503, 'AI_MODEL_MISSING', 'Le modèle « m » n’est pas installé.')), 'Le modèle « m » n’est pas installé.')
    assert.equal(draftErrorMessage(new ApiError(422, 'VALIDATION', 'Décris le formulaire que tu veux créer.')), 'Décris le formulaire que tu veux créer.')
  })

  it('décrit chaque question de l’aperçu', () => {
    assert.equal(questionDetail({ id: 'a', type: 'single', label: 'Taille', required: true, options: ['S'] }), 'Choix unique · obligatoire')
    assert.equal(questionDetail({ id: 'b', type: 'scale', label: 'Note', min: 1, max: 5, minLabel: 'Bof', maxLabel: 'Top' }), 'Échelle de 1 à 5 (Bof → Top) · facultative')
    assert.equal(questionDetail({ id: 'c', type: 'number', label: 'Km', min: 10 }), 'Nombre · au moins 10 · facultative')
    assert.equal(questionDetail({ id: 'd', type: 'section', label: 'Partie 2' }), 'Titre de section')
  })
})
