// En-tête : sélecteur de la suite, marque « atelier_Formulaire », thème, personne connectée.

import { BookOpenText, CalendarCheck, ChartColumn, Check, ClipboardList, LayoutGrid, Monitor, Moon, Sun, Table2, Workflow } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import { checkHealth, CURRENT_APP, PORTAL_URL, SUITE_APPS, type SuiteAppId } from '../lib/suite.ts'
import { useTheme, type ThemePreference } from '../lib/theme.ts'
import { useDismiss } from './ui.tsx'

const ICONS: Record<SuiteAppId, ReactNode> = {
  nexus: <Workflow />,
  viz: <ChartColumn />,
  tab: <Table2 />,
  projets: <CalendarCheck />,
  wiki: <BookOpenText />,
  formulaire: <ClipboardList />,
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
export const MOD_KEY = isMac ? '⌘' : 'Ctrl'

export function Header({ user, children }: { user: string; children?: ReactNode }) {
  return (
    <header className="topbar">
      <SuiteSwitcher />
      <Brand />
      <div className="topbar__spacer">{children}</div>
      <ThemeMenu />
      {user && (
        <span className="user-chip" title={`Connecté : ${user}`}>
          <span className="avatar" aria-hidden>
            {user.slice(0, 1)}
          </span>
          <span className="user-chip__name">{user}</span>
        </span>
      )}
    </header>
  )
}

function Brand() {
  const dialog = useRef<HTMLDialogElement>(null)
  return (
    <>
      <button type="button" className="atelier-brand topbar__brand" aria-haspopup="dialog" title="À propos d’Atelier Formulaire" onClick={() => dialog.current?.showModal()}>
        <span className="atelier-brand__tile" aria-hidden="true">
          <ClipboardList />
        </span>
        <span className="atelier-brand__name">
          <span className="atelier-brand__prefix">atelier_</span>Formulaire
        </span>
      </button>
      <dialog
        ref={dialog}
        className="atelier-about"
        aria-labelledby="about-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close()
        }}
      >
        <div className="atelier-about__panel">
          <button type="button" className="atelier-about__close" aria-label="Fermer" onClick={() => dialog.current?.close()}>
            ×
          </button>
          <img className="atelier-about__logo" src="/favicon.svg" alt="Logo Atelier Formulaire" width={200} height={200} />
          <h2 id="about-title" className="atelier-about__name">
            <span className="atelier-brand__prefix">atelier_</span>Formulaire
          </h2>
          <p className="atelier-about__tagline">Questionnaires, inscriptions et retours : les réponses arrivent rangées, prêtes pour Viz et Nexus.</p>
          <p className="atelier-about__suite">Suite Atelier · hébergé chez toi</p>
        </div>
      </dialog>
    </>
  )
}

type Health = 'up' | 'down' | 'checking'
const HEALTH_TEXT: Record<Health, string> = { up: 'En marche', down: 'Arrêtée', checking: 'Vérification…' }

function SuiteSwitcher() {
  const [open, setOpen] = useState(false)
  const [health, setHealth] = useState<Partial<Record<SuiteAppId, Health>>>({})
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  const close = useCallback((restore: boolean) => {
    setOpen(false)
    if (restore) trigger.current?.focus()
  }, [])
  useDismiss(open, close, root)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    for (const app of SUITE_APPS) {
      if (app.id === CURRENT_APP || !app.healthUrl) continue
      setHealth((h) => ({ ...h, [app.id]: 'checking' }))
      void checkHealth(app.healthUrl).then((ok) => {
        if (!cancelled) setHealth((h) => ({ ...h, [app.id]: ok ? 'up' : 'down' }))
      })
    }
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus())
    return () => {
      cancelled = true
    }
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

  return (
    <div style={{ position: 'relative' }} ref={root}>
      <button
        ref={trigger}
        type="button"
        className="btn btn--ghost btn--icon"
        aria-label="Suite Atelier : changer d’application"
        title="Suite Atelier"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <LayoutGrid />
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label="Suite Atelier" className="popover" style={{ top: 'calc(100% + 8px)', left: 0, width: 330 }} onKeyDown={onMenuKey}>
          {SUITE_APPS.map((app) => {
            const current = app.id === CURRENT_APP
            const state: Health = current ? 'up' : (health[app.id] ?? 'checking')
            return (
              <a
                key={app.id}
                role="menuitem"
                className="menu-item"
                href={app.url}
                target={current ? undefined : '_blank'}
                rel={current ? undefined : 'noreferrer'}
                aria-current={current ? 'page' : undefined}
                onClick={(e) => {
                  if (current) {
                    e.preventDefault()
                    close(true)
                  } else close(false)
                }}
              >
                <span className="atelier-brand__tile atelier-brand__tile--sm" data-atelier-app={app.id} aria-hidden="true">
                  {ICONS[app.id]}
                </span>
                <span className="menu-item__body">
                  <span className="atelier-brand__name atelier-brand__name--sm">
                    <span className="atelier-brand__prefix">atelier_</span>
                    {app.short}
                  </span>
                  <span className="menu-item__sub">{app.description}</span>
                </span>
                {current ? (
                  <Check aria-label="Application ouverte" />
                ) : (
                  <span className="dot" data-state={state} title={HEALTH_TEXT[state]} aria-label={HEALTH_TEXT[state]} />
                )}
              </a>
            )
          })}
          {PORTAL_URL && (
            <>
              <div className="menu-sep" />
              <a role="menuitem" className="menu-item" href={PORTAL_URL}>
                <LayoutGrid aria-hidden />
                <span className="menu-item__body">Portail de la suite</span>
              </a>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const THEMES: { value: ThemePreference; label: string; icon: ReactNode }[] = [
  { value: 'light', label: 'Clair', icon: <Sun aria-hidden /> },
  { value: 'dark', label: 'Sombre', icon: <Moon aria-hidden /> },
  { value: 'system', label: 'Système', icon: <Monitor aria-hidden /> },
]

function ThemeMenu() {
  const [preference, setPreference] = useTheme()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const close = useCallback((restore: boolean) => {
    setOpen(false)
    if (restore) trigger.current?.focus()
  }, [])
  useDismiss(open, close, root)
  const current = THEMES.find((t) => t.value === preference) ?? THEMES[2]!

  return (
    <div style={{ position: 'relative' }} ref={root}>
      <button
        ref={trigger}
        type="button"
        className="btn btn--ghost btn--icon"
        aria-label={`Thème : ${current.label}`}
        title={`Thème : ${current.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {current.icon}
      </button>
      {open && (
        <div role="menu" className="popover" style={{ top: 'calc(100% + 8px)', right: 0, minWidth: 170 }}>
          {THEMES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="menuitemradio"
              aria-checked={t.value === preference}
              className="menu-item"
              onClick={() => {
                setPreference(t.value)
                close(true)
              }}
            >
              {t.icon}
              <span className="menu-item__body">{t.label}</span>
              {t.value === preference && <Check aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
