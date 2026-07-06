import 'dotenv/config'
import './instrument.js'
import * as Sentry from '@sentry/node'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import multer from 'multer'
import rateLimit from 'express-rate-limit'
import { PrismaClient } from '@prisma/client'

import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'

import { authMiddleware, apiKeyMiddleware } from './auth-middleware.js'
import chatRouter from './chat-route.js'
import impersonationRouter, { impersonationAwareAuth } from './impersonation.js'
import { checkUsageQuota, checkSubscriptionActive, startUsageMonitor, getMonthlyUsage } from './usage-alerts.js'
import { ingestDocument, deleteDocument, uploadToStorage } from './ingest-pipeline.js'
import { asyncHandler } from './async-handler.js'
import billingRouter from './billing-route.js'
import { PLAN_LIMITS } from './plan-limits.js'
import { getRedisClient } from './redis-client.js'

const app = express()
const prisma = new PrismaClient()

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

// ── Middlewares globales ──────────────────────────────────────
app.use(helmet())
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*' }))
app.use(express.json())
app.use(morgan('dev'))

// ── Auth: Login y generación de JWT ──────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Probá de nuevo en unos minutos.' },
})

app.post('/api/auth/login', loginLimiter, asyncHandler(async (req, res) => {
  const { email, password, tenantSlug } = req.body

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    include: { botConfig: true },
  })
  if (!tenant || !tenant.isActive) {
    return res.status(401).json({ error: 'Empresa no encontrada o inactiva' })
  }

  const user = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email } },
  })
  if (!user || !user.passwordHash) {
    return res.status(401).json({ error: 'Credenciales inválidas' })
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return res.status(401).json({ error: 'Credenciales inválidas' })

  const token = jwt.sign(
    { tenantId: tenant.id, userId: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

  return res.json({ token, user: { id: user.id, email: user.email, role: user.role }, tenant })
}))

// ── Chat (acepta JWT de usuario o API key para el widget) ─────
app.use('/api/chat',
  (req, res, next) => {
    const hasApiKey = req.headers['x-api-key']
    if (hasApiKey) return apiKeyMiddleware(req, res, next)
    return impersonationAwareAuth(req, res, next)
  },
  asyncHandler(checkSubscriptionActive),
  asyncHandler(checkUsageQuota),
  chatRouter
)

// ── Upload de documentos ──────────────────────────────────────
app.post('/api/documents/upload',
  authMiddleware,
  asyncHandler(checkSubscriptionActive),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' })

    const tenant = req.tenant
    const file = req.file

    const docCount = await prisma.document.count({
      where: { tenantId: tenant.id, status: { not: 'DELETED' } },
    })
    const planKey = tenant.subscriptionStatus === 'TRIALING' ? 'GRATIS' : tenant.plan
    const maxDocs = PLAN_LIMITS[planKey].maxDocs

    if (docCount >= maxDocs) {
      await prisma.auditLog.create({
        data: {
          action: 'DOC_LIMIT_BLOCKED',
          targetTenantId: tenant.id,
          metadata: { docCount, maxDocs, plan: planKey },
        },
      }).catch(() => {})

      return res.status(403).json({
        error: 'Alcanzaste el límite de fuentes de conocimiento de tu plan.',
        code: 'DOC_LIMIT_EXCEEDED',
        current: docCount,
        limit: maxDocs,
        plan: planKey,
      })
    }

    const docId = crypto.randomUUID()

    // Subir a Supabase Storage
    const storagePath = await uploadToStorage(
      tenant.slug, docId, file.originalname, file.buffer, file.mimetype
    )

    // Registrar en DB
    const doc = await prisma.document.create({
      data: {
        id: docId,
        tenantId: tenant.id,
        filename: `${docId}-${file.originalname}`,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath,
        status: 'PENDING',
        uploadedById: req.user?.id ?? null,
      },
    })

    // Encolar ingestión de forma asíncrona (no bloquear el response)
    setImmediate(() => {
      ingestDocument(doc.id).catch((err) => {
        console.error(`[upload] Error ingesting ${doc.id}:`, err.message)
        Sentry.captureException(err)
      })
    })

    return res.status(201).json({
      id: doc.id,
      filename: doc.originalName,
      status: 'PENDING',
      message: 'Archivo recibido. La indexación comenzará en segundos.',
    })
  })
)

// ── Estado de un documento ────────────────────────────────────
app.get('/api/documents/:id/status', authMiddleware, asyncHandler(async (req, res) => {
  const doc = await prisma.document.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id },
    select: { id: true, originalName: true, status: true, chunkCount: true, errorMessage: true },
  })
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' })
  return res.json(doc)
}))

// ── Listar documentos del tenant ──────────────────────────────
app.get('/api/documents', authMiddleware, asyncHandler(async (req, res) => {
  const docs = await prisma.document.findMany({
    where: { tenantId: req.tenant.id, status: { not: 'DELETED' } },
    select: { id: true, originalName: true, status: true, chunkCount: true, sizeBytes: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  return res.json(docs)
}))

// ── Eliminar documento ────────────────────────────────────────
app.delete('/api/documents/:id', authMiddleware, asyncHandler(async (req, res) => {
  const doc = await prisma.document.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id },
  })
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' })

  await deleteDocument(doc.id)
  return res.json({ ok: true })
}))

// ── Uso del tenant actual ─────────────────────────────────────
app.get('/api/usage', authMiddleware, asyncHandler(async (req, res) => {
  const tenant = req.tenant
  const usage = await getMonthlyUsage(tenant)
  const planKey = tenant.subscriptionStatus === 'TRIALING' ? 'GRATIS' : tenant.plan
  const limit = PLAN_LIMITS[planKey].conversations
  return res.json({ usage, limit, plan: tenant.plan, subscriptionStatus: tenant.subscriptionStatus, trialEndsAt: tenant.trialEndsAt })
}))

// ── Registro público + Mercado Pago ────────────────────────────
app.use('/api', billingRouter)

// ── Super admin: impersonación ────────────────────────────────
app.use('/api/superadmin/impersonate', authMiddleware, impersonationRouter)

// ── Super admin: crear tenant ─────────────────────────────────
app.post('/api/superadmin/tenants', authMiddleware, asyncHandler(async (req, res) => {
  if (req.user?.role !== 'SUPERADMIN') {
    return res.status(403).json({ error: 'Solo super admins' })
  }

  const { name, slug, plan, adminEmail, adminPassword } = req.body

  if (!name || !slug || !adminEmail || !adminPassword) {
    return res.status(400).json({ error: 'Faltan datos requeridos' })
  }

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    return res.status(400).json({ error: 'El identificador solo puede tener letras minúsculas, números y guiones' })
  }

  const exists = await prisma.tenant.findUnique({ where: { slug } })
  if (exists) return res.status(409).json({ error: 'El slug ya está en uso' })

  const passwordHash = await bcrypt.hash(adminPassword, 10)

  const tenant = await prisma.tenant.create({
    data: {
      name, slug,
      plan: plan ?? 'EMPRENDEDORES',
      // Los tenants creados a mano por el superadmin quedan activos
      // directamente (no pasan por Mercado Pago) — se asume que ya
      // hay un acuerdo comercial fuera de la app.
      subscriptionStatus: 'ACTIVE',
      botConfig: {
        create: {
          systemPrompt: 'Eres un asistente que responde usando los documentos internos de la empresa.',
          botName: 'Asistente',
          welcomeMessage: '¿En qué puedo ayudarte hoy?',
        },
      },
      users: {
        create: { email: adminEmail, passwordHash, role: 'ADMIN' },
      },
    },
    include: { botConfig: true },
  })

  await prisma.auditLog.create({
    data: {
      adminId: req.user.id,
      action: 'TENANT_CREATED',
      targetTenantId: tenant.id,
      metadata: { name, slug, plan },
    },
  })

  return res.status(201).json(tenant)
}))

// ── Raíz — evita el "Cannot GET /" por defecto de Express ──────
app.get('/', (req, res) => res.json({
  service: 'Ragbase API',
  status: 'operational',
  health: '/health',
}))

// ── Healthcheck — confirma que el proceso y la DB responden ────
app.get('/health', asyncHandler(async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    return res.json({ ok: true, db: 'connected', ts: new Date().toISOString() })
  } catch (err) {
    console.error('[health] Error de conexión a la base:', err.message)
    Sentry.captureException(err)
    return res.status(503).json({ ok: false, db: 'disconnected', ts: new Date().toISOString() })
  }
}))

// ── Manejo de errores centralizado ─────────────────────────────
// Cualquier error atrapado por asyncHandler llega acá en vez de
// tumbar el proceso. No exponemos detalles internos al cliente.
app.use((err, req, res, next) => {
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err)
  Sentry.captureException(err)
  if (res.headersSent) return next(err)
  res.status(500).json({ error: 'Error interno del servidor' })
})

// ── Arranque ──────────────────────────────────────────────────
const PORT = process.env.PORT ?? 3000

app.listen(PORT, () => {
  console.log(`\nRagbase corriendo en http://localhost:${PORT}`)
  console.log('Iniciando monitor de uso...')
  startUsageMonitor()

  getRedisClient().catch((err) => {
    console.error('[redis] No se pudo conectar al arrancar:', err.message)
    Sentry.captureException(err)
  })
})
