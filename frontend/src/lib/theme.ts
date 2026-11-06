// Thème clair / sombre (docs/SUITE.md §1.5 d'Atelier Projets) : préférence commune à la suite (Système, Clair, Sombre).
// public/theme-init.js est la copie verbatim de design-system/brand/atelier-theme.js : chargé avant le premier rendu,
// il pose data-theme + la classe « dark » sur <html> et expose window.atelierTheme (cookie atelier_theme sur le VPS,
// sinon localStorage « atelier:theme »). Ce module ne fait que lire et écrire par cette API.

import { useEffect, useState } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'

interface AtelierTheme {
  get: () => ThemePreference
  set: (pref: ThemePreference) => void
  resolved: () => 'light' | 'dark'
}

declare global {
  interface Window {
    atelierTheme?: AtelierTheme
  }
}

function read(): ThemePreference {
  return typeof window !== 'undefined' ? (window.atelierTheme?.get() ?? 'system') : 'system'
}

export function useTheme(): [ThemePreference, (p: ThemePreference) => void] {
  const [preference, setPreference] = useState<ThemePreference>(read)
  useEffect(() => {
    // Changement ailleurs (autre onglet au retour, autre app de la suite, ou cet appel) : on suit.
    const onChange = () => setPreference(read())
    window.addEventListener('atelier-theme', onChange)
    document.addEventListener('visibilitychange', onChange)
    return () => {
      window.removeEventListener('atelier-theme', onChange)
      document.removeEventListener('visibilitychange', onChange)
    }
  }, [])
  return [preference, (p) => window.atelierTheme?.set(p)]
}
