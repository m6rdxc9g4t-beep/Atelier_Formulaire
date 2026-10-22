// Gardes de toutes les requêtes :
// - Host : adresses de bouclage ou hôtes déclarés (ALLOWED_HOSTS) — protège du DNS rebinding ;
// - Origin, pour toute écriture : absente (appel serveur, ex. Atelier Nexus), de bouclage, ou d'un hôte déclaré —
//   protège des requêtes envoyées par un autre site. L'origine « null » est refusée (iframe sandbox, fichier local).
// La connexion elle-même est vérifiée en amont par le portail de la suite (Caddy forward_auth).

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

/** Nom d'hôte sans port, en minuscules (`[::1]:3200` → `[::1]`, `wiki.x.fr:443` → `wiki.x.fr`). */
export function hostname(hostHeader: string | undefined): string {
  const value = (hostHeader ?? '').trim().toLowerCase()
  if (value.startsWith('[')) return value.slice(0, value.indexOf(']') + 1)
  return value.split(':')[0] ?? ''
}

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK.has(host) || host.endsWith('.localhost')
}

export function isAllowedHost(hostHeader: string | undefined, allowed: readonly string[]): boolean {
  const host = hostname(hostHeader)
  return host !== '' && (isLoopbackHost(host) || allowed.includes(host))
}

export function isAllowedOrigin(origin: string | undefined, allowed: readonly string[]): boolean {
  if (origin === undefined) return true
  if (origin === 'null') return false
  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    return isLoopbackHost(host) || isLoopbackHost(`[${host}]`) || allowed.includes(host)
  } catch {
    return false
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
export const isWrite = (method: string) => !SAFE_METHODS.has(method.toUpperCase())

/**
 * Auteur de la requête : posé par le portail de la suite (`X-Atelier-User`, recopié par Caddy après vérification
 * de la session). Sans portail (local) : l'auteur par défaut.
 */
export function requestUser(header: string | string[] | undefined, fallback: string): string {
  const value = Array.isArray(header) ? header[0] : header
  const cleaned = (value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80)
  return cleaned || fallback
}
