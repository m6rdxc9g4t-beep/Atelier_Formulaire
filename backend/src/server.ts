// Point d'entrée : lit la configuration, ouvre la base et écoute (127.0.0.1:3300 par défaut).

import { buildApp } from './app.js'
import { loadConfig } from './config.js'

const config = loadConfig()
const app = await buildApp({ config, logger: true })

const stop = async (signal: string) => {
  app.log.info(`${signal} reçu : arrêt des formulaires`)
  await app.close()
  process.exit(0)
}
process.on('SIGINT', () => void stop('SIGINT'))
process.on('SIGTERM', () => void stop('SIGTERM'))

try {
  await app.listen({ host: config.host, port: config.port })
  app.log.info(`Atelier Formulaire : http://${config.host}:${config.port} · données dans ${config.dataDir}${config.staticDir ? '' : ' · interface non compilée (API seule)'}`)
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
