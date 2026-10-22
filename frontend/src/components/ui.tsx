// Briques d'interface : messages (toasts), fenêtres de confirmation et de saisie, états vides et erreurs.

import { AlertTriangle, CircleAlert, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

// ── Messages ────────────────────────────────────────────────────────────────

interface Toast {
  id: number
  text: string
  tone: 'info' | 'danger'
  action?: { label: string; run: () => void }
}

type ToastFn = (text: string, options?: { tone?: Toast['tone']; action?: Toast['action'] }) => void

interface DialogRequest {
  kind: 'confirm' | 'prompt'
  title: string
  text?: string
  confirmLabel: string
  danger?: boolean
  initial?: string
  placeholder?: string
  resolve: (value: string | boolean | null) => void
}

interface UiContextValue {
  toast: ToastFn
  confirm: (options: { title: string; text?: string; confirmLabel: string; danger?: boolean }) => Promise<boolean>
  prompt: (options: { title: string; text?: string; confirmLabel: string; initial?: string; placeholder?: string }) => Promise<string | null>
}

const UiContext = createContext<UiContextValue | null>(null)

export function useUi(): UiContextValue {
  const value = useContext(UiContext)
  if (!value) throw new Error('UiProvider manquant')
  return value
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [dialog, setDialog] = useState<DialogRequest | null>(null)
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const toast = useCallback<ToastFn>(
    (text, options = {}) => {
      const id = nextId.current++
      setToasts((list) => [...list.slice(-3), { id, text, tone: options.tone ?? 'info', action: options.action }])
      setTimeout(() => dismiss(id), options.action ? 8000 : options.tone === 'danger' ? 7000 : 3500)
    },
    [dismiss],
  )

  const confirm = useCallback<UiContextValue['confirm']>(
    (options) => new Promise<boolean>((resolve) => setDialog({ kind: 'confirm', ...options, resolve: (v) => resolve(v === true) })),
    [],
  )
  const prompt = useCallback<UiContextValue['prompt']>(
    (options) => new Promise<string | null>((resolve) => setDialog({ kind: 'prompt', ...options, resolve: (v) => resolve(typeof v === 'string' ? v : null) })),
    [],
  )

  return (
    <UiContext.Provider value={{ toast, confirm, prompt }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast" data-tone={t.tone}>
            {t.tone === 'danger' && <CircleAlert aria-hidden width={18} height={18} />}
            <span className="toast__text">{t.text}</span>
            {t.action && (
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => {
                  t.action!.run()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" className="btn btn--ghost btn--icon btn--sm" aria-label="Fermer le message" onClick={() => dismiss(t.id)}>
              <X />
            </button>
          </div>
        ))}
      </div>
      {dialog && <RequestDialog request={dialog} onDone={() => setDialog(null)} />}
    </UiContext.Provider>
  )
}

function RequestDialog({ request, onDone }: { request: DialogRequest; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [value, setValue] = useState(request.initial ?? '')
  const settled = useRef(false)

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  const finish = (result: string | boolean | null) => {
    if (settled.current) return
    settled.current = true
    request.resolve(result)
    ref.current?.close()
    onDone()
  }

  return (
    <dialog ref={ref} className="dialog" onCancel={() => finish(null)} aria-labelledby="request-dialog-title">
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault()
          if (request.kind === 'prompt') {
            if (value.trim()) finish(value.trim())
          } else finish(true)
        }}
      >
        <div className="dialog__body">
          <h2 id="request-dialog-title" className="dialog__title">
            {request.title}
          </h2>
          {request.text && <p className="dialog__text">{request.text}</p>}
          {request.kind === 'prompt' && (
            <input
              className="field"
              autoFocus
              value={value}
              placeholder={request.placeholder}
              onChange={(e) => setValue(e.target.value)}
              aria-label={request.title}
            />
          )}
        </div>
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={() => finish(null)}>
            Annuler
          </button>
          <button
            type="submit"
            className={request.danger ? 'btn btn--danger' : 'btn btn--primary'}
            autoFocus={request.kind === 'confirm'}
            disabled={request.kind === 'prompt' && !value.trim()}
          >
            {request.confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  )
}

// ── États ───────────────────────────────────────────────────────────────────

export function ErrorNotice({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="notice notice--danger" role="alert">
      <AlertTriangle aria-hidden />
      <div style={{ flex: 1 }}>{error.message}</div>
      {onRetry && (
        <button type="button" className="btn btn--sm" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  )
}

export function Skeleton({ lines = 6 }: { lines?: number }) {
  return (
    <div aria-busy="true" aria-label="Chargement">
      <div className="skeleton" style={{ height: '2.2rem', width: '55%', marginBottom: '1.6rem' }} />
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton" style={{ width: `${92 - ((i * 17) % 35)}%` }} />
      ))}
    </div>
  )
}

/** Ferme un menu au clic à l'extérieur et à Échap (le focus revient au déclencheur). */
export function useDismiss(open: boolean, close: (restoreFocus: boolean) => void, root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) close(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close(true)
      }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open, close, root])
}
