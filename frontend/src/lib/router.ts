// Routeur minimal (History API) : quelques adresses lisibles, sans dépendance.
//   /                      liste des formulaires
//   /supprimes             formulaires supprimés
//   /f/<id>                constructeur (questions)
//   /f/<id>/reponses       réponses : synthèse et tableau
//   /f/<id>/partage        ouverture, accès, réglages
//   /f/<id>/apercu         aperçu (rien n'est envoyé)
//   /f/<id>/repondre       répondre (personnes connectées)
//   /r/<lien>              répondre par le lien public (sans connexion)

import { useSyncExternalStore, type MouseEvent } from 'react'

export type FormTab = 'questions' | 'reponses' | 'partage'

export type Route =
  | { name: 'home' }
  | { name: 'deleted' }
  | { name: 'form'; id: number; tab: FormTab }
  | { name: 'preview'; id: number }
  | { name: 'fill'; id: number }
  | { name: 'public'; token: string }
  | { name: 'notFound' }

export function parseRoute(pathname: string, _search = ''): Route {
  const path = decodeURIComponent(pathname).replace(/\/+$/, '') || '/'
  if (path === '/') return { name: 'home' }
  if (path === '/supprimes') return { name: 'deleted' }
  let m = /^\/r\/([A-Za-z0-9_-]{8,64})$/.exec(path)
  if (m) return { name: 'public', token: m[1]! }
  m = /^\/f\/(\d+)(?:\/(reponses|partage|apercu|repondre))?$/.exec(path)
  if (m) {
    const id = Number(m[1])
    if (m[2] === 'apercu') return { name: 'preview', id }
    if (m[2] === 'repondre') return { name: 'fill', id }
    return { name: 'form', id, tab: (m[2] as FormTab | undefined) ?? 'questions' }
  }
  return { name: 'notFound' }
}

type Guard = () => boolean
const listeners = new Set<() => void>()
/** Une vue avec des modifications non enregistrées peut refuser de quitter (confirmation). */
let leaveGuard: Guard | null = null

export function setLeaveGuard(guard: Guard | null): void {
  leaveGuard = guard
}

function emit() {
  for (const l of listeners) l()
}

if (typeof window !== 'undefined') window.addEventListener('popstate', emit)

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  const current = location.pathname + location.search + location.hash
  if (to === current) return
  if (leaveGuard && !leaveGuard()) return
  if (options.replace) history.replaceState(null, '', to)
  else history.pushState(null, '', to)
  const [, hash] = to.split('#')
  if (!hash) window.scrollTo(0, 0)
  emit()
}

let snapshot = typeof location === 'undefined' ? { path: '/', search: '', key: '/' } : { path: location.pathname, search: location.search, key: location.pathname + location.search }
function getSnapshot() {
  const key = location.pathname + location.search
  if (key !== snapshot.key) snapshot = { path: location.pathname, search: location.search, key }
  return snapshot
}

export function useLocation() {
  return useSyncExternalStore((cb) => {
    listeners.add(cb)
    return () => listeners.delete(cb)
  }, getSnapshot)
}

export function useRoute(): Route {
  const loc = useLocation()
  return parseRoute(loc.path, loc.search)
}

/** Clic sur un lien interne : navigation sans recharger (sauf ⌘/Ctrl/milieu → nouvel onglet). */
export function onLinkClick(event: MouseEvent<HTMLAnchorElement>, to: string): void {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  navigate(to)
}
