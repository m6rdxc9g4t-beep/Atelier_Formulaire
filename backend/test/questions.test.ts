import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { checkAnswers, columnKeys, displayAnswer, normalizeQuestions, publishProblems, QuestionError, summarize, type Question } from '../src/domain/questions.js'

const Q: Question[] = [
  { id: 'nom', type: 'short_text', label: 'Ton nom', required: true },
  { id: 'mail', type: 'email', label: 'E-mail' },
  { id: 'age', type: 'number', label: 'Âge', min: 0, max: 120 },
  { id: 'jour', type: 'date', label: 'Date' },
  { id: 'taille', type: 'single', label: 'Taille', options: ['S', 'M', 'L'] },
  { id: 'gouts', type: 'multiple', label: 'Goûts', options: ['Café', 'Thé', 'Chocolat'] },
  { id: 'note', type: 'scale', label: 'Note', min: 1, max: 5 },
  { id: 'ok', type: 'yes_no', label: 'D’accord ?' },
  { id: 'sec', type: 'section', label: 'Section' },
]

describe('questions', () => {
  it('nettoie les définitions et refuse les incohérences', () => {
    const out = normalizeQuestions([
      { id: 'a', type: 'single', label: '  Choix   ', options: [' Un ', 'Deux', ''], required: true, min: 3 },
      { id: 'b', type: 'scale', label: 'Note' },
      { id: 'c', type: 'section', label: 'Fin', required: true },
    ])
    assert.deepEqual(out, [
      { id: 'a', type: 'single', label: 'Choix', required: true, options: ['Un', 'Deux'] },
      { id: 'b', type: 'scale', label: 'Note', min: 1, max: 5 },
      { id: 'c', type: 'section', label: 'Fin' },
    ])
    const bad = (input: unknown) => assert.throws(() => normalizeQuestions(input), QuestionError)
    bad([{ id: 'a', type: 'single', label: 'x', options: [] }])
    bad([{ id: 'a', type: 'single', label: 'x', options: ['A', 'A'] }])
    bad([{ id: 'a', type: 'short_text' }, { id: 'a', type: 'short_text' }])
    bad([{ id: 'a b', type: 'short_text' }])
    bad([{ id: 'a', type: 'inconnu' }])
    bad([{ id: 'a', type: 'number', min: 5, max: 1 }])
    bad([{ id: 'a', type: 'scale', min: 1, max: 11 }])
  })

  it('signale ce qui empêche l’ouverture', () => {
    assert.deepEqual(publishProblems([{ id: 's', type: 'section', label: 'x' }]), ['Ajoute au moins une question.'])
    assert.deepEqual(publishProblems([{ id: 'a', type: 'short_text', label: '' }]), ['Question 1 : le libellé est vide.'])
  })
})

describe('réponses', () => {
  it('accepte et convertit des réponses valides', () => {
    const { answers, errors } = checkAnswers(Q, {
      nom: '  Ana ',
      mail: 'Ana@Exemple.FR',
      age: '42',
      jour: '2026-02-28',
      taille: 'M',
      gouts: ['Thé', 'Café', 'Thé'],
      note: 4,
      ok: 'oui',
      sec: 'ignoré',
      inconnu: 'ignoré',
    })
    assert.deepEqual(errors, {})
    assert.deepEqual(answers, { nom: 'Ana', mail: 'ana@exemple.fr', age: 42, jour: '2026-02-28', taille: 'M', gouts: ['Café', 'Thé'], note: 4, ok: true })
  })

  it('explique chaque erreur', () => {
    const { errors } = checkAnswers(Q, { nom: ' ', mail: 'pas-un-mail', age: 130, jour: '2026-02-30', taille: 'XL', gouts: ['Bière'], note: 6, ok: 'peut-être' })
    assert.deepEqual(errors, {
      nom: 'Réponse obligatoire.',
      mail: 'Adresse e-mail invalide.',
      age: 'Au plus 120.',
      jour: 'Date attendue (AAAA-MM-JJ).',
      taille: 'Choix inconnu.',
      gouts: 'Choix inconnu.',
      note: 'Note de 1 à 5.',
      ok: 'Oui ou non.',
    })
    assert.equal(checkAnswers(Q, 'pas un objet').errors.nom, 'Réponse obligatoire.')
  })

  it('résume les réponses par question', () => {
    const s = summarize(Q, [
      { nom: 'A', taille: 'M', gouts: ['Café'], note: 5, ok: true, age: 20 },
      { nom: 'B', taille: 'M', gouts: ['Café', 'Thé'], note: 3, ok: false, age: 40 },
      { nom: 'C', note: 4 },
    ])
    const by = Object.fromEntries(s.map((q) => [q.id, q]))
    assert.equal(s.length, 8, 'les sections ne sont pas résumées')
    assert.deepEqual(by.taille, { id: 'taille', type: 'single', label: 'Taille', answered: 2, kind: 'choices', counts: [{ option: 'S', count: 0 }, { option: 'M', count: 2 }, { option: 'L', count: 0 }] })
    assert.deepEqual((by.gouts as { counts: unknown }).counts, [{ option: 'Café', count: 2 }, { option: 'Thé', count: 1 }, { option: 'Chocolat', count: 0 }])
    assert.deepEqual((by.ok as { counts: unknown }).counts, [{ option: 'Oui', count: 1 }, { option: 'Non', count: 1 }])
    assert.deepEqual([by.note!.answered, (by.note as { average: number }).average, (by.note as { distribution: unknown[] }).distribution.length], [3, 4, 5])
    assert.deepEqual((by.age as { min: number; max: number; average: number }).average, 30)
    assert.deepEqual((by.nom as { latest: string[] }).latest, ['C', 'B', 'A'])
  })

  it('fabrique des clés de colonnes uniques', () => {
    const keys = columnKeys([
      { id: 'a', type: 'short_text', label: 'Votre e-mail' },
      { id: 'b', type: 'short_text', label: 'Votre E-MAIL !' },
      { id: 'c', type: 'short_text', label: '123' },
      { id: 'd', type: 'short_text', label: 'Source' },
    ])
    assert.deepEqual([...keys.values()], ['votre_e_mail', 'votre_e_mail_2', 'q_123', 'source_2'])
    assert.equal(displayAnswer(['a', 'b']), 'a, b')
    assert.equal(displayAnswer(false), 'Non')
  })
})
