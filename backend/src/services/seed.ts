// Premier démarrage : un formulaire d'exemple, en préparation, qui montre les types de questions.
// Rien n'est créé si un formulaire existe déjà (même supprimé).

import type { Db } from '../db/database.js'
import { createForm, newQuestionId } from './forms.js'

export function seedIfEmpty(db: Db, user = 'Atelier'): boolean {
  if ((db.prepare('SELECT COUNT(*) AS n FROM forms').get() as { n: number }).n > 0) return false
  createForm(
    db,
    {
      title: 'Exemple : retour sur la réunion',
      description: 'Un formulaire d’exemple, en préparation : modifie-le, ouvre-le aux réponses, ou supprime-le.',
      questions: [
        { id: newQuestionId(), type: 'scale', label: 'Cette réunion t’a-t-elle été utile ?', required: true, min: 1, max: 5, minLabel: 'Pas du tout', maxLabel: 'Tout à fait' },
        { id: newQuestionId(), type: 'single', label: 'Sa durée était…', options: ['Trop courte', 'Juste', 'Trop longue'] },
        { id: newQuestionId(), type: 'multiple', label: 'Sujets à reprendre la prochaine fois', options: ['Planning', 'Budget', 'Recrutement', 'Outils'] },
        { id: newQuestionId(), type: 'section', label: 'Pour finir', help: 'Ces questions sont facultatives.' },
        { id: newQuestionId(), type: 'long_text', label: 'Une remarque ?', placeholder: 'Ce qui a marché, ce qui manquait…' },
        { id: newQuestionId(), type: 'yes_no', label: 'Faut-il garder ce créneau ?' },
      ],
      settings: { confirmation: 'Merci, ta réponse est enregistrée.' },
    },
    user,
  )
  return true
}
