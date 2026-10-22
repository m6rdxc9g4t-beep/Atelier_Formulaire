// Dates et tailles, en français.

const ABSOLUTE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
const DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
const RELATIVE = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })

export const formatDate = (iso: string) => ABSOLUTE.format(new Date(iso))
export const formatDay = (iso: string) => DAY.format(new Date(iso))

/** « il y a 3 minutes », « hier », puis la date au-delà d'une semaine. */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 45) return 'à l’instant'
  if (abs < 3600) return RELATIVE.format(Math.round(seconds / 60), 'minute')
  if (abs < 86400) return RELATIVE.format(Math.round(seconds / 3600), 'hour')
  if (abs < 7 * 86400) return RELATIVE.format(Math.round(seconds / 86400), 'day')
  return `le ${formatDay(iso)}`
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} Ko`
  return `${(bytes / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`
}

export const plural = (n: number, one: string, many: string) => `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`
