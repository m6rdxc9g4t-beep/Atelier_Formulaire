import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { deleteConfirmText, renamedTitle } from './formActions.ts'

describe('actions sur un formulaire', () => {
  it('explique ce que devient le formulaire supprimé', () => {
    assert.equal(deleteConfirmText({ responseCount: 0, status: 'draft', accepting: false }), 'Il part dans les formulaires supprimés : tu peux le restaurer pendant 30 jours.')
    assert.match(deleteConfirmText({ responseCount: 1, status: 'closed', accepting: false }), /Sa réponse est gardée avec lui\.$/)
    const open = deleteConfirmText({ responseCount: 12, status: 'open', accepting: true })
    assert.match(open, /Ses 12 réponses sont gardées avec lui\./)
    assert.match(open, /il sera fermé/)
    // Ouvert mais date de fermeture passée : il n'accepte déjà plus de réponses.
    assert.doesNotMatch(deleteConfirmText({ responseCount: 0, status: 'open', accepting: false }), /il sera fermé/)
  })

  it('ne renomme que si le titre change vraiment', () => {
    assert.equal(renamedTitle('Sondage', '  Sondage 2026 '), 'Sondage 2026')
    assert.equal(renamedTitle('Sondage', 'Sondage'), null)
    assert.equal(renamedTitle('Sondage', '   '), null)
    assert.equal(renamedTitle('Sondage', null), null)
  })
})
