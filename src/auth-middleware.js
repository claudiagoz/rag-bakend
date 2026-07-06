// ============================================================
// RAG Multiempresa — Middleware de autenticación
// Valida JWT propio · carga tenant desde Supabase/Prisma
// ============================================================

import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import * as Sentry from '@sentry/node'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Cache en memoria (60s TTL) — reemplazar con Redis en producción
const tenantCache = new Map()
const CACHE_TTL_MS = 60_000

// ------------------------------------------------------------
// authMiddleware — para usuarios autenticados con JWT propio
// ------------------------------------------------------------
export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticación requerido' })
  }

  const token = authHeader.slice(7)

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)

    if (!payload.tenantId) {
      return res.status(401).json({ error: 'Token inválido: falta tenantId' })
    }

    const tenant = await getTenantCached(payload.tenantId)

    if (!tenant) return res.status(401).json({ error: 'Empresa no encontrada' })
    if (!tenant.isActive) return res.status(403).json({ error: 'Cuenta suspendida' })

    req.tenant = tenant
    req.user = payload.userId
      ? { id: payload.userId, role: payload.role }
      : null

    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sesión expirada' })
    }
    return res.status(401).json({ error: 'Token inválido' })
  }
}

// ------------------------------------------------------------
// apiKeyMiddleware — para el widget embebido (header x-api-key)
// ------------------------------------------------------------
export async function apiKeyMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key']

  if (!apiKey) return res.status(401).json({ error: 'API key requerida' })

  try {
    // Buscar por prefijo para acotar el lookup
    const prefix = apiKey.slice(0, 12)

    const candidates = await prisma.apiKey.findMany({
      where: { keyPrefix: prefix, isActive: true },
      include: { tenant: { include: { botConfig: true } } },
    })

    // Verificar el hash de cada candidata
    let validKey = null
    for (const k of candidates) {
      const match = await bcrypt.compare(apiKey, k.keyHash)
      if (match) { validKey = k; break }
    }

    if (!validKey) return res.status(401).json({ error: 'API key inválida' })
    if (!validKey.tenant.isActive) return res.status(403).json({ error: 'Cuenta suspendida' })

    if (validKey.expiresAt && validKey.expiresAt < new Date()) {
      return res.status(401).json({ error: 'API key expirada' })
    }

    // Actualizar lastUsedAt sin bloquear la respuesta
    prisma.apiKey
      .update({ where: { id: validKey.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {})

    req.tenant = validKey.tenant
    req.user = null
    next()
  } catch (err) {
    console.error('[auth] Error validando API key:', err.message)
    Sentry.captureException(err)
    return res.status(500).json({ error: 'Error de autenticación' })
  }
}

// ------------------------------------------------------------
// Middleware combinado — acepta JWT o API key en el mismo endpoint
// ------------------------------------------------------------
export async function flexAuthMiddleware(req, res, next) {
  if (req.headers['x-api-key']) {
    return apiKeyMiddleware(req, res, next)
  }
  return authMiddleware(req, res, next)
}

// ------------------------------------------------------------
// Helper — tenant con cache
// ------------------------------------------------------------
async function getTenantCached(tenantId) {
  const cached = tenantCache.get(tenantId)
  const now = Date.now()

  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.data

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { botConfig: true },
  })

  if (tenant) tenantCache.set(tenantId, { data: tenant, ts: now })
  return tenant
}
