// ============================================================
// RAG Multiempresa — Registro público + Mercado Pago
// Rutas montadas bajo /api (ver server.js): /signup,
// /billing/plans, /billing/webhook, /billing/status, /billing/cancel
// ============================================================

import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import * as Sentry from '@sentry/node'
import { PrismaClient } from '@prisma/client'

import { asyncHandler } from './async-handler.js'
import { authMiddleware } from './auth-middleware.js'
import { PLAN_LIMITS, TRIAL_DAYS } from './plan-limits.js'
import {
  createPreapproval,
  getPreapproval,
  cancelPreapproval,
  getPayment,
  verifyWebhookSignature,
} from './mercadopago-client.js'
import { InvalidWebhookSignatureError } from 'mercadopago'

const router = Router()
const prisma = new PrismaClient()

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de registro. Probá de nuevo más tarde.' },
})

// ------------------------------------------------------------
// POST /api/signup — alta pública de un tenant nuevo
// Requiere tarjeta (tokenizada en el cliente) desde el día 1,
// pero Mercado Pago no cobra nada hasta que termine el trial.
// ------------------------------------------------------------
router.post('/signup', signupLimiter, asyncHandler(async (req, res) => {
  const { companyName, slug, adminEmail, adminPassword, plan, cardToken, payerEmail } = req.body

  if (!companyName || !slug || !adminEmail || !adminPassword || !cardToken) {
    return res.status(400).json({ error: 'Faltan datos requeridos' })
  }

  // El slug se usa después para armar rutas de archivos en Supabase
  // Storage (`${slug}/${docId}/...`) — validar formato acá evita que
  // alguien mande '/', '..' u otros caracteres que rompan esas rutas.
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    return res.status(400).json({ error: 'El identificador solo puede tener letras minúsculas, números y guiones' })
  }

  if (adminPassword.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })
  }

  // El plan "GRATIS" no es un destino de facturación válido — es solo
  // el estado durante el trial. Si no eligieron un plan pago, se
  // asume el más económico como plan de facturación post-trial.
  const billingPlan = plan === 'PYMES' ? 'PYMES' : 'EMPRENDEDORES'
  const planConfig = PLAN_LIMITS[billingPlan]

  const exists = await prisma.tenant.findUnique({ where: { slug } })
  if (exists) return res.status(409).json({ error: 'El slug ya está en uso' })

  const now = new Date()
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)

  let preapproval
  try {
    preapproval = await createPreapproval({
      cardTokenId: cardToken,
      payerEmail: payerEmail || adminEmail,
      amountArs: planConfig.priceArs,
      startDate: trialEndsAt.toISOString(),
      reason: `Ragbase - Plan ${planConfig.label}`,
      externalReference: slug,
    })
  } catch (err) {
    console.error('[signup] Error creando suscripción en Mercado Pago:', err.message)
    Sentry.captureException(err)
    return res.status(502).json({ error: 'No pudimos validar tu tarjeta. Revisá los datos e intentá de nuevo.' })
  }

  let tenant
  try {
    const passwordHash = await bcrypt.hash(adminPassword, 10)

    tenant = await prisma.tenant.create({
      data: {
        name: companyName,
        slug,
        plan: billingPlan,
        subscriptionStatus: 'TRIALING',
        trialStartedAt: now,
        trialEndsAt,
        mpPayerId: preapproval.payer_id ? String(preapproval.payer_id) : null,
        mpPreapprovalId: preapproval.id,
        mpPreapprovalStatus: preapproval.status,
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
      include: { botConfig: true, users: true },
    })
  } catch (err) {
    // Si la DB falla después de que MP ya aceptó la suscripción,
    // cancelarla para no dejar un cobro programado huérfano.
    console.error('[signup] Error creando tenant, cancelando preapproval:', err.message)
    Sentry.captureException(err)
    await cancelPreapproval(preapproval.id).catch(() => {})
    return res.status(500).json({ error: 'Error al crear la cuenta. Intentá de nuevo.' })
  }

  await prisma.auditLog.create({
    data: {
      action: 'SIGNUP_COMPLETED',
      targetTenantId: tenant.id,
      metadata: { slug, plan: billingPlan, mpPreapprovalId: preapproval.id },
    },
  }).catch(() => {})

  const admin = tenant.users[0]
  const token = jwt.sign(
    { tenantId: tenant.id, userId: admin.id, role: admin.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )

  return res.status(201).json({
    token,
    user: { id: admin.id, email: admin.email, role: admin.role },
    tenant,
    subscription: { status: tenant.subscriptionStatus, trialEndsAt: tenant.trialEndsAt },
  })
}))

// ------------------------------------------------------------
// GET /api/billing/plans — planes públicos para /precios y /registro
// ------------------------------------------------------------
router.get('/billing/plans', (req, res) => {
  const plans = Object.entries(PLAN_LIMITS).map(([key, cfg]) => ({ key, ...cfg }))
  return res.json({ plans, trialDays: TRIAL_DAYS })
})

// ------------------------------------------------------------
// GET /api/billing/status — estado de suscripción del tenant actual
// ------------------------------------------------------------
router.get('/billing/status', authMiddleware, asyncHandler(async (req, res) => {
  const tenant = req.tenant
  return res.json({
    plan: tenant.plan,
    subscriptionStatus: tenant.subscriptionStatus,
    trialEndsAt: tenant.trialEndsAt,
    lastPaymentAt: tenant.lastPaymentAt,
    lastPaymentFailedAt: tenant.lastPaymentFailedAt,
  })
}))

// ------------------------------------------------------------
// POST /api/billing/cancel — el admin del tenant cancela su propia suscripción
// ------------------------------------------------------------
router.post('/billing/cancel', authMiddleware, asyncHandler(async (req, res) => {
  const tenant = req.tenant

  if (req.user?.role !== 'ADMIN' && req.user?.role !== 'SUPERADMIN') {
    return res.status(403).json({ error: 'Solo un admin puede cancelar la suscripción' })
  }

  if (!tenant.mpPreapprovalId) {
    return res.status(400).json({ error: 'Este tenant no tiene una suscripción activa en Mercado Pago' })
  }

  await cancelPreapproval(tenant.mpPreapprovalId).catch((err) => {
    console.error('[billing] Error cancelando preapproval en MP:', err.message)
    Sentry.captureException(err)
  })

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { subscriptionStatus: 'CANCELLED' },
  })

  await prisma.auditLog.create({
    data: { action: 'SUBSCRIPTION_CANCELLED', targetTenantId: tenant.id, adminId: req.user.id },
  }).catch(() => {})

  return res.json({ ok: true })
}))

// ------------------------------------------------------------
// POST /api/billing/webhook — notificaciones de Mercado Pago
// Sin JWT (lo llama MP directamente) — se valida con x-signature.
// ------------------------------------------------------------
router.post('/billing/webhook', asyncHandler(async (req, res) => {
  const xSignature = req.headers['x-signature']
  const xRequestId = req.headers['x-request-id']
  const dataId = req.query['data.id'] || req.query.id || req.body?.data?.id

  try {
    verifyWebhookSignature({ xSignature, xRequestId, dataId })
  } catch (err) {
    if (err instanceof InvalidWebhookSignatureError) {
      console.warn('[webhook] Firma inválida:', err.reason)
      return res.status(401).json({ error: 'Firma inválida' })
    }
    throw err
  }

  const eventType = req.body?.type || req.body?.topic || 'unknown'

  // Responder rápido y procesar — si algo falla, igual devolvemos 200
  // para que MP no reintente indefinidamente; queda todo registrado
  // en SubscriptionEvent para revisar manualmente si hace falta.
  try {
    await processWebhookEvent(eventType, dataId, req.body)
  } catch (err) {
    console.error('[webhook] Error procesando evento:', err.message)
    Sentry.captureException(err)
  }

  return res.status(200).json({ received: true })
}))

async function processWebhookEvent(eventType, dataId, rawPayload) {
  // El `id` de nivel superior identifica la notificación en sí (distinto
  // de `data.id`, que es el recurso). MP reintenta/reenvía la misma
  // notificación — usamos esto para no reprocesar un evento ya manejado.
  const notificationId = rawPayload?.id != null ? String(rawPayload.id) : null

  if (notificationId) {
    const alreadyProcessed = await prisma.subscriptionEvent.findUnique({
      where: { mpNotificationId: notificationId },
    })
    if (alreadyProcessed) {
      console.log(`[webhook] Notificación ${notificationId} ya procesada, ignorando`)
      return
    }
  }

  if (eventType.includes('preapproval')) {
    const preapproval = await getPreapproval(dataId)
    const tenant = await prisma.tenant.findFirst({ where: { mpPreapprovalId: preapproval.id } })
    if (!tenant) {
      console.warn(`[webhook] Tenant no encontrado para preapproval ${preapproval.id}`)
      return
    }

    try {
      await prisma.subscriptionEvent.create({
        data: { tenantId: tenant.id, mpPreapprovalId: preapproval.id, mpNotificationId: notificationId, eventType, rawPayload },
      })
    } catch (err) {
      if (err.code === 'P2002') {
        console.log(`[webhook] Notificación ${notificationId} ya procesada (carrera), ignorando`)
        return
      }
      throw err
    }

    const statusMap = { cancelled: 'CANCELLED', paused: 'PAUSED' }
    const mappedStatus = statusMap[preapproval.status]

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        mpPreapprovalStatus: preapproval.status,
        ...(mappedStatus ? { subscriptionStatus: mappedStatus } : {}),
      },
    })

    if (mappedStatus === 'CANCELLED') {
      await prisma.auditLog.create({
        data: { action: 'SUBSCRIPTION_CANCELLED', targetTenantId: tenant.id },
      }).catch(() => {})
    }
    return
  }

  if (eventType.includes('payment')) {
    const payment = await getPayment(dataId)
    const preapprovalId = payment.metadata?.preapproval_id || payment.point_of_interaction?.transaction_data?.subscription_id
    const externalReference = payment.external_reference

    const tenant = await prisma.tenant.findFirst({
      where: preapprovalId ? { mpPreapprovalId: preapprovalId } : { slug: externalReference },
    })
    if (!tenant) {
      console.warn(`[webhook] Tenant no encontrado para pago ${payment.id}`)
      return
    }

    try {
      await prisma.subscriptionEvent.create({
        data: { tenantId: tenant.id, mpPreapprovalId: tenant.mpPreapprovalId, mpNotificationId: notificationId, eventType, rawPayload },
      })
    } catch (err) {
      if (err.code === 'P2002') {
        console.log(`[webhook] Notificación ${notificationId} ya procesada (carrera), ignorando`)
        return
      }
      throw err
    }

    if (payment.status === 'approved') {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { subscriptionStatus: 'ACTIVE', lastPaymentAt: new Date() },
      })
      await prisma.auditLog.create({
        data: { action: 'SUBSCRIPTION_ACTIVATED', targetTenantId: tenant.id },
      }).catch(() => {})
    } else if (['rejected', 'cancelled'].includes(payment.status)) {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { subscriptionStatus: 'PAST_DUE', lastPaymentFailedAt: new Date() },
      })
      await prisma.auditLog.create({
        data: { action: 'SUBSCRIPTION_PAYMENT_FAILED', targetTenantId: tenant.id },
      }).catch(() => {})
    }
    return
  }

  console.log(`[webhook] Evento no reconocido, ignorado: ${eventType}`)
}

export default router
