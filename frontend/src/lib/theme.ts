// Thème clair / sombre (docs/SUITE.md §1.5 d'Atelier Projets) : sur <html>, data-theme="dark" ET la classe « dark »
// en sombre, data-theme="light" sans « dark » en clair. Préférence : Clair, Sombre ou Système.
// public/theme-init.js applique la même règle avant le premier rendu.

import { useEffect, useState } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'
const KEY = 'atelier-formulaire:theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

function read(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* stockage indisponible : préférence par défaut */
  }
  return 'system'
}

function apply(preference: ThemePreference) {
  const dark = preference === 'dark' || (preference === 'system' && matchMedia(DARK_QUERY).matches)
  const root = document.documentElement
  root.dataset.themePreference = preference
  root.dataset.theme = dark ? 'dark' : 'light'
  root.classList.toggle('dark', dark)
}

export function useTheme(): [ThemePreference, (p: ThemePreference) => void] {
  const [preference, setPreference] = useState<ThemePreference>(read)
  useEffect(() => {
    apply(preference)
    try {
      localStorage.setItem(KEY, preference)
    } catch {
      /* rien */
    }
    if (preference !== 'system') return
    const query = matchMedia(DARK_QUERY)
    const onChange = () => apply('system')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [preference])
  return [preference, setPreference]
}
