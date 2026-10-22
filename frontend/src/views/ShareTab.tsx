// Partage et réglages : qui peut répondre, liens à envoyer, message de confirmation, fermeture, duplication, suppression.

import { Copy, CopyPlus, ExternalLink, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { useUi } from '../components/ui.tsx'
import { useApp } from '../components/AppContext.tsx'
import { api, type FormAccess } from '../lib/api.ts'
import { invalidate } from '../lib/data.ts'
import { formatDate } from '../lib/format.ts'
import { navigate } from '../lib/router.ts'
import type { FormEditor } from '../lib/useFormEditor.ts'

/** Valeur d'un champ datetime-local (heure locale) ↔ ISO. */
const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function CopyField({ value, label }: { value: string; label: string }) {
  const { toast } = useUi()
  return (
    <div className="copy-field">
      <input className="field" readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="btn" onClick={() => void navigator.clipboard?.writeText(value).then(() => toast('Lien copié.'))}>
        <Copy aria-hidden /> Copier
      </button>
      <a className="btn btn--icon" href={value} target="_blank" rel="noreferrer" aria-label="Ouvrir dans un nouvel onglet" title="Ouvrir">
        <ExternalLink />
      </a>
    </div>
  )
}

export function ShareTab({ editor }: { editor: FormEditor }) {
  const { form, draft, update } = editor
  const { toast, confirm } = useUi()
  const { publicUrl } = useApp()
  const [busy, setBusy] = useState(false)
  const origin = publicUrl ?? location.origin
  const suiteLink = `${origin}/f/${form.id}/repondre`
  const publicLink = form.publicToken ? `${origin}/r/${form.publicToken}` : null

  const setAccess = async (access: FormAccess, regenerate = false) => {
    setBusy(true)
    try {
      await editor.save()
      editor.replace(await api.setAccess(form.id, access, regenerate))
      invalidate('forms')
      if (regenerate) toast('Nouveau lien créé : l’ancien ne marche plus.')
    } catch (err) {
      toast((err as Error).message, { tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  const regenerate = async () => {
    const ok = await confirm({
      title: 'Créer un nouveau lien public ?',
      text: 'L’ancien lien cessera de fonctionner : les personnes qui l’ont reçu ne pourront plus répondre.',
      confirmLabel: 'Créer un nouveau lien',
      danger: true,
    })
    if (ok) await setAccess('public', true)
  }

  const duplicate = async () => {
    try {
      const copy = await api.duplicate(form.id)
      invalidate('forms')
      toast('Copie créée, en préparation.')
      navigate(`/f/${copy.id}`)
    } catch (err) {
      toast((err as Error).message, { tone: 'danger' })
    }
  }

  const remove = async () => {
    const ok = await confirm({
      title: `Supprimer « ${form.title} » ?`,
      text: `Le formulaire et ses ${form.responseCount} réponse(s) restent 30 jours dans « Formulaires supprimés », puis sont effacés. Il n’accepte plus de réponses.`,
      confirmLabel: 'Supprimer le formulaire',
      danger: true,
    })
    if (!ok) return
    try {
      await api.deleteForm(form.id)
      invalidate('forms')
      navigate('/')
      toast(`« ${form.title} » est supprimé.`, {
        action: { label: 'Annuler', run: () => void api.restoreForm(form.id).then(() => (invalidate('forms'), navigate(`/f/${form.id}/partage`))) },
      })
    } catch (err) {
      toast((err as Error).message, { tone: 'danger' })
    }
  }

  const settings = draft.settings
  const setSettings = (patch: Partial<typeof settings>) => update((d) => ({ settings: { ...d.settings, ...patch } }))

  return (
    <div className="column settings">
      <section className="card" aria-labelledby="who-title">
        <h2 id="who-title">Qui peut répondre</h2>
        <p className="hint">
          {form.accepting
            ? 'Le formulaire est ouvert : il accepte les réponses.'
            : form.status === 'draft'
              ? 'Le formulaire est en préparation : personne ne peut encore répondre. Ouvre-le avec le bouton en haut.'
              : 'Le formulaire est fermé : les liens affichent qu’il n’accepte plus de réponses.'}
        </p>
        <div className="radio-cards" role="radiogroup" aria-label="Accès">
          <label className="radio-card">
            <input type="radio" name="access" checked={form.access === 'suite'} disabled={busy} onChange={() => void setAccess('suite')} />
            <span>
              <strong>Personnes connectées à la suite</strong>
              <span>Il faut se connecter au portail Atelier. Chaque réponse porte le nom de la personne.</span>
            </span>
          </label>
          <label className="radio-card">
            <input type="radio" name="access" checked={form.access === 'public'} disabled={busy} onChange={() => void setAccess('public')} />
            <span>
              <strong>Toute personne qui a le lien</strong>
              <span>Sans connexion : pour des personnes extérieures. Les réponses sont anonymes ; demande un nom ou un e-mail dans les questions si besoin.</span>
            </span>
          </label>
        </div>

        <div style={{ marginTop: '1.2rem' }}>
          <span className="label">{form.access === 'public' ? 'Lien public à envoyer' : 'Lien à envoyer'}</span>
          {form.access === 'public' && publicLink ? (
            <>
              <CopyField value={publicLink} label="Lien public" />
              <button type="button" className="btn btn--ghost btn--sm" style={{ marginTop: '0.5rem' }} onClick={() => void regenerate()} disabled={busy}>
                <RefreshCw aria-hidden /> Créer un nouveau lien (désactive l’actuel)
              </button>
            </>
          ) : (
            <CopyField value={suiteLink} label="Lien pour les personnes connectées" />
          )}
        </div>
      </section>

      <section className="card" aria-labelledby="settings-title">
        <h2 id="settings-title">Réglages</h2>
        <p className="hint">Enregistrés automatiquement.</p>
        <div className="form-row">
          <label className="label" htmlFor="confirmation">
            Message après l’envoi
          </label>
          <textarea
            id="confirmation"
            className="field"
            rows={2}
            maxLength={1000}
            value={settings.confirmation ?? ''}
            placeholder="Merci, ta réponse est enregistrée."
            onChange={(e) => setSettings({ confirmation: e.target.value || undefined })}
          />
        </div>
        <div className="form-row">
          <label className="switch">
            <input
              type="checkbox"
              checked={Boolean(settings.onePerPerson)}
              disabled={form.access === 'public'}
              onChange={(e) => setSettings({ onePerPerson: e.target.checked || undefined })}
            />
            Une seule réponse par personne
          </label>
          <p className="hint" style={{ margin: '0.35rem 0 0' }}>
            {form.access === 'public' ? 'Impossible à vérifier avec un lien public (réponses anonymes).' : 'Selon le nom de la personne connectée.'}
          </p>
        </div>
        <div className="form-row">
          <label className="label" htmlFor="closes-at">
            Fermer automatiquement le
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', maxWidth: 380 }}>
            <input
              id="closes-at"
              className="field"
              type="datetime-local"
              value={toLocalInput(settings.closesAt)}
              onChange={(e) => setSettings({ closesAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
            />
            {settings.closesAt && (
              <button type="button" className="btn" onClick={() => setSettings({ closesAt: null })}>
                Retirer
              </button>
            )}
          </div>
          {settings.closesAt && (
            <p className="hint" style={{ margin: '0.35rem 0 0' }}>
              {new Date(settings.closesAt).getTime() <= Date.now() ? `Date passée : le formulaire n’accepte plus de réponses depuis le ${formatDate(settings.closesAt)}.` : `Plus aucune réponse après le ${formatDate(settings.closesAt)}.`}
            </p>
          )}
        </div>
      </section>

      <section className="card" aria-labelledby="data-title">
        <h2 id="data-title">Utiliser les réponses ailleurs</h2>
        <p className="hint" style={{ marginBottom: 0 }}>
          Export CSV dans l’onglet Réponses. Atelier Nexus lit et envoie des réponses dans ses workflows (formulaire n° {form.id}) ; Atelier Viz peut lire les réponses comme un jeu de données
          (<code>/api/exports/datasets/form-{form.id}</code>).
        </p>
      </section>

      <section className="card" aria-labelledby="danger-title">
        <h2 id="danger-title">Copie et suppression</h2>
        <div className="toolbar" style={{ marginTop: '0.6rem' }}>
          <button type="button" className="btn" onClick={() => void duplicate()}>
            <CopyPlus aria-hidden /> Dupliquer (sans les réponses)
          </button>
          <button type="button" className="btn btn--danger" onClick={() => void remove()}>
            <Trash2 aria-hidden /> Supprimer le formulaire…
          </button>
        </div>
      </section>
    </div>
  )
}
