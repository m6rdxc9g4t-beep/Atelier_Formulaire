// Coquille de la suite (charte v2, comme le portail) : barre latérale (marque « Atelier Formulaire », sélecteur
// de la suite, navigation, thème, personne connectée) et barre haute de 44 px propre à chaque vue.

import { BookOpen, ChartColumn, Check, ClipboardList, Kanban, LayoutGrid, Monitor, Moon, Sun, Table, Trash2, Workflow, X } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import { onLinkClick, type Route } from '../lib/router.ts'
import { checkHealth, CURRENT_APP, PORTAL_URL, SUITE_APPS, type SuiteAppId } from '../lib/suite.ts'
import { useTheme, type ThemePreference } from '../lib/theme.ts'
import { useDismiss } from './ui.tsx'

/** Icônes Lucide des apps (docs/SUITE.md §1.6 d'Atelier Projets). */
const ICONS: Record<SuiteAppId, ReactNode> = {
  nexus: <Workflow />,
  viz: <ChartColumn />,
  tab: <Table />,
  projets: <Kanban />,
  wiki: <BookOpen />,
  formulaire: <ClipboardList />,
}

export function Sidebar({ user, route }: { user: string; route: Route }) {
  const inDeleted = route.name === 'deleted'
  const nav = [
    { href: '/', label: 'Formulaires', icon: <ClipboardList aria-hidden />, current: !inDeleted },
    { href: '/supprimes', label: 'Formulaires supprimés', icon: <Trash2 aria-hidden />, current: inDeleted },
  ]
  return (
    <aside className="side">
      <div className="side__head">
        <Brand />
        <SuiteSwitcher />
      </div>
      <nav className="side__nav" aria-label="Navigation">
        {nav.map((n) => (
          <a key={n.href} className="nav-item" href={n.href} aria-current={n.current ? 'page' : undefined} onClick={(e) => onLinkClick(e, n.href)}>
            {n.icon}
            <span>{n.label}</span>
          </a>
        ))}
      </nav>
      <div className="side__foot">
        <ThemeSwitch />
        {user && (
          <span className="user-chip" title={`Connecté : ${user}`}>
            <span className="avatar" aria-hidden>
              {user.slice(0, 1)}
            </span>
            <span className="user-chip__name">{user}</span>
          </span>
        )}
      </div>
    </aside>
  )
}

/** Barre haute d'une vue : titre (et fil d'Ariane) à gauche, actions à droite. */
export function TopBar({ title, parent, meta, children }: { title: ReactNode; parent?: { href: string; label: string; ariaLabel?: string }; meta?: ReactNode; children?: ReactNode }) {
  return (
    <header className="top">
      <div className="top__title">
        {parent && (
          <>
            <a className="top__parent" href={parent.href} aria-label={parent.ariaLabel} onClick={(e) => onLinkClick(e, parent.href)}>
              {parent.label}
            </a>
            <span className="top__sep" aria-hidden>
              /
            </span>
          </>
        )}
        <h1>{title}</h1>
        {meta}
      </div>
      {children && <div className="top__actions">{children}</div>}
    </header>
  )
}

function Brand() {
  const dialog = useRef<HTMLDialogElement>(null)
  return (
    <>
      <button type="button" className="atelier-brand side__brand" aria-haspopup="dialog" title="À propos d’Atelier Formulaire" onClick={() => dialog.current?.showModal()}>
        <span className="atelier-brand__tile" aria-hidden="true">
          <ClipboardList />
        </span>
        <span className="atelier-brand__name">
          <span className="atelier-brand__prefix">Atelier </span>Formulaire
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
            <X aria-hidden width={16} height={16} />
          </button>
          <span className="atelier-about__icon atelier-brand__tile" aria-hidden="true">
            <ClipboardList />
          </span>
          <h2 id="about-title" className="atelier-about__name">
            <span className="atelier-brand__prefix">Atelier </span>Formulaire
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
    <div className="suite-switcher" ref={root}>
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
        <div id={menuId} role="menu" aria-label="Suite Atelier" className="popover suite-switcher__menu" onKeyDown={onMenuKey}>
          {SUITE_APPS.map((app) => {
            const current = app.id === CURRENT_APP
            const state: Health = current ? 'up' : (health[app.id] ?? 'checking')
            return (
              <a
                key={app.id}
                role="menuitem"
                className="menu-item menu-item--app"
                href={app.url}
                target={current ? undefined : '_blank'}
                rel={current ? undefined : 'noreferrer'}
                aria-current={current ? 'page' : undefined}
                data-state={state}
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
                    <span className="atelier-brand__prefix">Atelier </span>
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
  { value: 'system', label: 'Système', icon: <Monitor aria-hidden /> },
  { value: 'light', label: 'Clair', icon: <Sun aria-hidden /> },
  { value: 'dark', label: 'Sombre', icon: <Moon aria-hidden /> },
]

/** Choix du thème (Système / Clair / Sombre), commun à toute la suite. */
function ThemeSwitch() {
  const [preference, setPreference] = useTheme()
  return (
    <div className="segmented segmented--icons" role="group" aria-label="Thème">
      {THEMES.map((t) => (
        <button key={t.value} type="button" aria-pressed={t.value === preference} aria-label={`Thème : ${t.label}`} title={t.label} onClick={() => setPreference(t.value)}>
          {t.icon}
        </button>
      ))}
    </div>
  )
}
