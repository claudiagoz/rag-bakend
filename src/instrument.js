// ============================================================
// RAG Multiempresa — Inicialización de Sentry
// Debe importarse antes que cualquier otro módulo del servidor.
// ============================================================

import * as Sentry from '@sentry/node'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
  })
  console.log('[sentry] Inicializado')
} else {
  console.log('[sentry] SENTRY_DSN no configurado — monitoreo de errores deshabilitado')
}
