// ============================================================
// RAG Multiempresa — Impersonación de tenant
// Permite al super admin operar como cualquier empresa
// sin conocer sus credenciales.
//
// Flujo:
//   1. Super admin llama POST /api/superadmin/impersonate/:tenantId
//   2. El servidor emite un JWT de corta duración con flag impersonating=true
//   3. El super admin usa ese token en la API normal (/api/chat, etc.)
//   4. Cada acción queda registrada en AuditLog con el adminId real
//   5. POST /api/superadmin/impersonate/end revoca el token
// ============================================================

import { Router } from 'express'
import jwt from 'jsonwebtoken'
import * as Sentry from '@sentry/node'
import { PrismaClient } from '@prisma/client'
import { asyncHandler } from './async-handler.js'
import { getRedisClient } from './redis-client.js'

const router = Router()
const prisma = new PrismaClient()

const REVOKED_KEY_PREFIX = 'impersonation:revoked:'

// ------------------------------------------------------------
// POST /api/superadmin/impersonate/:tenantId
// Emite un token de impersonación de 30 minutos
// ------------------------------------------------------------
router.post('/:tenantId', requireSuperAdmin, asyncHandler(async (req, res) => {
  const { tenantId } = req.params
  const adminId = req.user.id

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { botConfig: true },
  })

  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' })
  if (!tenant.isActive) return res.status(403).json({ error: 'El tenant está suspendido' })

  // Token de corta duración (30 min) con flag de impersonación
  const impersonationToken = jwt.sign(
    {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      impersonating: true,
      adminId,             // quién inició la impersonación
      iat: Math.floor(Date.now() / 1000),
    },
    process.env.JWT_SECRET,
    { expiresIn: '30m' }
  )

  // Registrar en auditoría
  await prisma.auditLog.create({
    data: {
      adminId,
      action: 'IMPERSONATE_START',
      targetTenantId: tenant.id,
      metadata: {
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
        expiresIn: '30m',
      },
    },
  })

  console.log(`[impersonate] Admin ${adminId} inició impersonación de "${tenant.slug}"`)

  return res.json({
    token: impersonationToken,
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      plan: tenant.plan,
    },
    expiresIn: 1800, // segundos
    warning: 'Este token da acceso completo al workspace del tenant. Úsalo con cuidado.',
  })
}))

// ------------------------------------------------------------
// POST /api/superadmin/impersonate/end
// Revoca el token de impersonación activo
// ------------------------------------------------------------
router.post('/end', requireSuperAdmin, async (req, res) => {
  const { token } = req.body

  if (!token) return res.status(400).json({ error: 'Token requerido' })

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)

    if (!payload.impersonating) {
      return res.status(400).json({ error: 'No es un token de impersonación' })
    }

    // Marcar como revocado en Redis, con TTL igual al tiempo de vida restante del token
    const ttlSeconds = payload.exp - Math.floor(Date.now() / 1000)
    if (ttlSeconds > 0) {
      const redis = await getRedisClient()
      await redis.set(`${REVOKED_KEY_PREFIX}${token}`, '1', { EX: ttlSeconds })
    }

    await prisma.auditLog.create({
      data: {
        adminId: req.user.id,
        action: 'IMPERSONATE_END',
        targetTenantId: payload.tenantId,
        metadata: { tenantSlug: payload.tenantSlug },
      },
    })

    return res.json({ ok: true, message: 'Impersonación finalizada' })
  } catch {
    return res.status(400).json({ error: 'Token inválido o expirado' })
  }
})

// ------------------------------------------------------------
// GET /api/superadmin/audit
// Historial de acciones del super admin
// ------------------------------------------------------------
router.get('/audit', requireSuperAdmin, asyncHandler(async (req, res) => {
  const { tenantId, action, limit = 50, offset = 0 } = req.query

  const logs = await prisma.auditLog.findMany({
    where: {
      ...(tenantId ? { targetTenantId: tenantId } : {}),
      ...(action ? { action } : {}),
    },
    include: {
      targetTenant: { select: { name: true, slug: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: Number(limit),
    skip: Number(offset),
  })

  return res.json({ logs, total: logs.length })
}))

// ------------------------------------------------------------
// Middleware — authMiddleware extendido para validar
// tokens de impersonación (agregar en auth-middleware.js)
// ------------------------------------------------------------
export async function impersonationAwareAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' })
  }

  const token = authHeader.slice(7)

  // Verificar si fue revocado (Redis). Si Redis falla, no tumbamos el chat
  // completo por esto — la revocación es una capa extra, no la única defensa
  // (el JWT igual expira solo a los 30 min).
  try {
    console.log('[chat][debug] 0a. chequeando redis')
    const redis = await getRedisClient()
    console.log('[chat][debug] 0b. redis client obtenido, consultando exists')
    if (await redis.exists(`${REVOKED_KEY_PREFIX}${token}`)) {
      return res.status(401).json({ error: 'Token revocado' })
    }
    console.log('[chat][debug] 0c. redis ok, token no revocado')
  } catch (err) {
    console.log('[chat][debug] 0x. redis fallo, catch alcanzado:', err.message)
    console.error('[impersonate] Error consultando Redis, se permite la request:', err.message)
    Sentry.captureException(err)
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)

    if (!payload.tenantId) {
      return res.status(401).json({ error: 'Token inválido: falta tenantId' })
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: payload.tenantId },
      include: { botConfig: true },
    })

    if (!tenant) return res.status(401).json({ error: 'Empresa no encontrada' })
    if (!tenant.isActive) return res.status(403).json({ error: 'Cuenta suspendida' })

    // Marcar en el request si es una sesión de impersonación
    req.isImpersonating = payload.impersonating === true
    req.impersonatingAdminId = payload.adminId ?? null
    req.tenant = tenant
    req.user = payload.userId ? { id: payload.userId, role: payload.role } : null

    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sesión expirada' })
    }
    return res.status(401).json({ error: 'Token inválido o expirado' })
  }
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== 'SUPERADMIN') {
    return res.status(403).json({ error: 'Acceso restringido a super admins' })
  }
  next()
}

export default router
