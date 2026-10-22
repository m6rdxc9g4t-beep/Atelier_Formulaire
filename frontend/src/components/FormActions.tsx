// Menu « … » d'un formulaire : modifier, renommer, dupliquer, supprimer (avec « Annuler » pendant quelques secondes).
// Utilisé dans la liste des formulaires et dans l'en-tête d'un formulaire.

import { Copy, Ellipsis, PenLine, Pencil, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

import { api, ApiError, type Form } from '../lib/api.ts'
import { invalidate } from '../lib/data.ts'
import { deleteConfirmText, renamedTitle } from '../lib/formActions.ts'
import { navigate } from '../lib/router.ts'
import { useDismiss, useUi } from './ui.tsx'

interface Props {
  form: Form
  /** Dans la liste : « Modifier » et « Renommer » en plus (dans le formulaire, le titre se modifie sur place). */
  context: 'list' | 'page'
  /** Avant la suppression (ex. : envoyer les modifications en attente). */
  beforeDelete?: () => Promise<void>
  /** Après la suppression (ex. : revenir à la liste). */
  onDeleted?: () => void
}

export function FormActionsMenu({ form, context, beforeDelete, onDeleted }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const { confirm, prompt, toast } = useUi()

  const close = useCallback((restore: boolean) => {
    setOpen(false)
    if (restore) trigger.current?.focus()
  }, [])
  useDismiss(open, close, root)

  useEffect(() => {
    if (open) requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus())
  }, [open])

  const onMenuKey = (e: KeyboardEvent) => {
    const items = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const index = items.indexOf(document.activeElement as HTMLElement)
    const moves: Record<string, number> = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: items.length - 1 }
    if (e.key in moves) {
      e.preventDefault()
      items[(moves[e.key]! + items.length) % items.length]?.focus()
    } else if (e.key === 'Tab') close(false)
  }

  const fail = (err: unknown) => toast((err as Error).message, { tone: 'danger' })

  const rename = async () => {
    close(false)
    const title = renamedTitle(form.title, await prompt({ title: 'Renommer le formulaire', confirmLabel: 'Renommer', initial: form.title, placeholder: 'Titre du formulaire' }))
    if (!title) return
    try {
      await api.updateForm(form.id, { title, baseVersion: form.version })
      invalidate('forms', 'form')
      toast(`Formulaire renommé en « ${title} ».`)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CONFLICT') {
        invalidate('forms', 'form')
        toast('Ce formulaire vient d’être modifié ailleurs : la liste est à jour, recommence.', { tone: 'danger' })
      } else fail(err)
    }
  }

  const duplicate = async () => {
    close(false)
    try {
      const copy = await api.duplicate(form.id)
      invalidate('forms')
      toast(`« ${copy.title} » est créé (en préparation).`, { action: { label: 'Ouvrir', run: () => navigate(`/f/${copy.id}`) } })
    } catch (err) {
      fail(err)
    }
  }

  const remove = async () => {
    close(false)
    const ok = await confirm({ title: `Supprimer « ${form.title} » ?`, text: deleteConfirmText(form), confirmLabel: 'Supprimer', danger: true })
    if (!ok) return
    try {
      await beforeDelete?.()
      await api.deleteForm(form.id)
      invalidate('forms', 'form')
      onDeleted?.()
      toast(`« ${form.title} » est supprimé.`, {
        action: {
          label: 'Annuler',
          run: () =>
            void api
              .restoreForm(form.id)
              .then(() => {
                invalidate('forms', 'form')
                toast(form.status === 'open' ? `« ${form.title} » est restauré (fermé).` : `« ${form.title} » est restauré.`)
              })
              .catch(fail),
        },
      })
    } catch (err) {
      fail(err)
    }
  }

  return (
    <div className="row-menu" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="btn btn--ghost btn--icon"
        aria-label={`Actions sur « ${form.title} »`}
        title="Modifier, dupliquer, supprimer…"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <Ellipsis />
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={`Actions sur « ${form.title} »`} className="popover row-menu__popover" onKeyDown={onMenuKey}>
          {context === 'list' && (
            <>
              <button type="button" role="menuitem" className="menu-item" onClick={() => navigate(`/f/${form.id}`)}>
                <Pencil aria-hidden />
                <span className="menu-item__body">Modifier les questions</span>
              </button>
              <button type="button" role="menuitem" className="menu-item" onClick={() => void rename()}>
                <PenLine aria-hidden />
                <span className="menu-item__body">Renommer</span>
              </button>
            </>
          )}
          <button type="button" role="menuitem" className="menu-item" onClick={() => void duplicate()}>
            <Copy aria-hidden />
            <span className="menu-item__body">Dupliquer</span>
          </button>
          <div className="menu-sep" />
          <button type="button" role="menuitem" className="menu-item menu-item--danger" onClick={() => void remove()}>
            <Trash2 aria-hidden />
            <span className="menu-item__body">Supprimer</span>
          </button>
        </div>
      )}
    </div>
  )
}
