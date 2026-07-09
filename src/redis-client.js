// ============================================================
// RAG Multiempresa — Cliente Redis compartido
// Usado para revocación de tokens de impersonación (con TTL)
// ============================================================

import { createClient } from 'redis'

// disableOfflineQueue: sin esto, un comando emitido mientras el cliente
// está desconectado/reconectando queda en cola esperando indefinidamente
// si la reconexión nunca se recupera — eso colgaba /api/chat para siempre
// en vez de fallar rápido y seguir sin la capa de revocación.
const client = createClient({
  url: process.env.REDIS_URL,
  disableOfflineQueue: true,
  socket: { connectTimeout: 5000 },
})

let loggedError = false
client.on('error', (err) => {
  if (!loggedError) {
    console.error('[redis] Error de conexión:', err.message)
    loggedError = true
  }
})
client.on('ready', () => { loggedError = false })

let connectPromise = null

export function getRedisClient() {
  if (!connectPromise) {
    connectPromise = client.connect().then(() => {
      console.log('[redis] Conectado')
      return client
    })
  }
  return connectPromise.then(() => client)
}

export default client
