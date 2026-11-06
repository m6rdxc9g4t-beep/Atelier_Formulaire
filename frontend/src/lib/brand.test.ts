// Charte v2 de la suite : copies verbatim de la marque, thème commun et signature de Formulaire.

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('marque de la suite (charte v2)', () => {
  it('charge le thème commun avant l’affichage, copie exacte de la source', () => {
    // public/theme-init.js est servi sans connexion (Caddy) : il doit rester identique à atelier-theme.js.
    assert.equal(read('../../public/theme-init.js'), read('../styles/atelier-brand/atelier-theme.js'))
    assert.match(read('../styles/atelier-brand/atelier-theme.js'), /window\.atelierTheme = \{ get: get, set: set/)
    const html = read('../../index.html')
    assert.match(html, /<html[^>]* data-atelier-app="formulaire"/)
    assert.ok(html.indexOf('/theme-init.js') < html.indexOf('/src/main.tsx'), 'le thème est posé avant l’interface')
  })

  it('porte la signature sarcelle et la police Inter embarquée', () => {
    const brand = read('../styles/atelier-brand/atelier-brand.css')
    assert.match(brand, /--atelier-sig-formulaire: #008478;/)
    assert.match(brand, /url\("\.\/inter-latin-wght-normal\.woff2"\)/)
    for (const file of ['inter-latin-wght-normal.woff2', 'inter-latin-ext-wght-normal.woff2', 'LICENSE-Inter.txt']) {
      assert.ok(existsSync(new URL(`../styles/atelier-brand/${file}`, import.meta.url)), file)
    }
    assert.match(read('../../public/favicon.svg'), /#008478/)
  })

  it('garde les variables de fondation et les couleurs officielles des copies du design system', () => {
    const themes = read('../styles/atelier-ds/light.css') + read('../styles/atelier-ds/dark.css')
    for (const v of ['--bg-main', '--bg-surface', '--bg-elevated', '--text-primary', '--text-muted', '--border-color']) assert.match(themes, new RegExp(`${v}:`))
    const colors = read('../styles/atelier-ds/colors.css')
    assert.equal(colors.match(/--(type|status)-[a-z]+: #[0-9A-F]{6};/g)?.length, 15)
  })

  it('n’utilise aucune couleur littérale dans l’interface propre à l’app', () => {
    const css = read('../styles/formulaire.css').replace(/\/\*[\s\S]*?\*\//g, '')
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/)
  })
})
