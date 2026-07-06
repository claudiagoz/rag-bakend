// ============================================================
// RAG Multiempresa — Cliente Redis compartido
// Usado para revocación de tokens de impersonación (con TTL)
// ============================================================

import { createClient } from 'redis'

const client = createClient({ url: process.env.REDIS_URL })

client.on('error', (err) => console.error('[redis] Error de conexión:', err.message))

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
