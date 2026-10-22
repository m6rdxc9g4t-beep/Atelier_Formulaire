// Outils communs des tests : application en mémoire, sans réseau ni fichier (sauf mention).

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildApp } from '../src/app.js'
import { loadConfig, type FormsConfig } from '../src/config.js'
import { openDatabase } from '../src/db/database.js'

export function testConfig(overrides: Partial<FormsConfig> = {}): FormsConfig {
  return {
    ...loadConfig({}),
    dataDir: mkdtempSync(join(tmpdir(), 'atelier-formulaire-')),
    staticDir: null,
    allowedHosts: ['formulaire.atelier.test'],
    ...overrides,
  }
}

export async function testApp(options: { seed?: boolean; config?: Partial<FormsConfig> } = {}) {
  const db = openDatabase(':memory:')
  const app = await buildApp({ config: testConfig(options.config), db, seed: options.seed ?? false })
  return { app, db }
}

/** Requête JSON sur l'hôte de bouclage (comme Nexus) ou l'hôte public. */
export function json(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown, headers: Record<string, string> = {}) {
  return {
    method,
    url,
    headers: { host: '127.0.0.1:3300', ...(payload !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    ...(payload !== undefined ? { payload: JSON.stringify(payload) } : {}),
  }
}
