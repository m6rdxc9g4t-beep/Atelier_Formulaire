// Textes des actions sur un formulaire (renommer, supprimer), séparés de l'interface pour être testés.

import type { Form } from './api.ts'
import { plural } from './format.ts'

/** Ce qu'il advient du formulaire si on le supprime : affiché dans la fenêtre de confirmation. */
export function deleteConfirmText(form: Pick<Form, 'responseCount' | 'status' | 'accepting'>): string {
  const parts = ['Il part dans les formulaires supprimés : tu peux le restaurer pendant 30 jours.']
  if (form.responseCount === 1) parts.push('Sa réponse est gardée avec lui.')
  else if (form.responseCount > 1) parts.push(`Ses ${plural(form.responseCount, 'réponse', 'réponses')} sont gardées avec lui.`)
  if (form.status === 'open' && form.accepting) parts.push('Il est ouvert : il sera fermé et n’acceptera plus de réponses.')
  return parts.join(' ')
}

/** Nouveau titre à enregistrer, ou null s'il n'y a rien à changer (vide ou identique). */
export function renamedTitle(current: string, input: string | null): string | null {
  const next = input?.trim() ?? ''
  return next && next !== current ? next : null
}
