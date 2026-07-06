// ============================================================
// RAG Multiempresa — Sistema de alertas por límite de uso
//
// Tres mecanismos:
//   1. checkUsageQuota — bloquea si el tenant superó su cuota
//      de conversaciones (mensual, o total durante el trial).
//   2. checkSubscriptionActive — bloquea si el trial venció sin
//      pago exitoso, o si la suscripción está en mora/cancelada.
//   3. Job periódico (cron) — corre cada hora, detecta tenants
//      con plan pago cerca del límite y envía emails proactivos.
//      (Los tenants en trial no entran en este job: su cuota no
//      se reinicia por mes, así que la lógica de "ya avisado
//      este mes" no aplica — se bloquean en tiempo real nomás.)
// ============================================================

import { PrismaClient } from '@prisma/client'
import nodemailer from 'nodemailer'
import * as Sentry from '@sentry/node'
import { PLAN_LIMITS } from './plan-limits.js'

const prisma = new PrismaClient()

const ALERT_THRESHOLDS = [0.8, 0.95, 1.0] // 80%, 95%, 100%

// ------------------------------------------------------------
// Plan "efectivo" — mientras el tenant está en trial, siempre
// se le aplican los límites de GRATIS, sin importar a qué plan
// pago vaya a pasar cuando termine el trial.
// ------------------------------------------------------------
function getEffectivePlanKey(tenant) {
  return tenant.subscriptionStatus === 'TRIALING' ? 'GRATIS' : tenant.plan
}

// ------------------------------------------------------------
// 1. MIDDLEWARE — verificar cuota antes de cada consulta de chat
// ------------------------------------------------------------
export async function checkUsageQuota(req, res, next) {
  const tenant = req.tenant
  const planKey = getEffectivePlanKey(tenant)
  const planConfig = PLAN_LIMITS[planKey]
  const limit = planConfig.conversations

  const usage = await getMonthlyUsage(tenant)

  if (usage >= limit) {
    await prisma.auditLog.create({
      data: {
        action: 'USAGE_BLOCKED',
        targetTenantId: tenant.id,
        metadata: { usage, limit, plan: planKey },
      },
    }).catch(() => {})

    return res.status(429).json({
      error: planConfig.isTrialTotal
        ? 'Alcanzaste el límite de conversaciones de tu prueba gratis.'
        : 'Límite de consultas del mes alcanzado.',
      code: 'QUOTA_EXCEEDED',
      usage,
      limit,
      plan: planKey,
      resetDate: planConfig.isTrialTotal ? null : getMonthResetDate(),
      upgradeUrl: `${process.env.APP_URL}/precios?tenant=${tenant.slug}`,
    })
  }

  req.currentUsage = usage
  req.usageLimit = limit
  next()
}

// ------------------------------------------------------------
// MIDDLEWARE — verificar que la suscripción esté vigente
// (trial no vencido, o pago al día). Independiente de la cuota
// de conversaciones y del flag isActive (suspensión manual).
// ------------------------------------------------------------
export async function checkSubscriptionActive(req, res, next) {
  const tenant = req.tenant
  const now = new Date()

  const trialExpired =
    tenant.subscriptionStatus === 'TRIALING' &&
    tenant.trialEndsAt &&
    tenant.trialEndsAt < now

  const inactiveStatus = ['PAST_DUE', 'CANCELLED', 'PAUSED'].includes(tenant.subscriptionStatus)

  if (trialExpired || inactiveStatus) {
    if (trialExpired) {
      await prisma.auditLog.create({
        data: { action: 'TRIAL_EXPIRED_BLOCKED', targetTenantId: tenant.id },
      }).catch(() => {})
    }

    return res.status(402).json({
      error: 'Tu período de prueba terminó o tu pago no se procesó. Actualizá tu método de pago para seguir usando Ragbase.',
      code: 'SUBSCRIPTION_INACTIVE',
      subscriptionStatus: tenant.subscriptionStatus,
      trialEndsAt: tenant.trialEndsAt,
    })
  }

  next()
}

// ------------------------------------------------------------
// 2. JOB PERIÓDICO — revisar tenants con plan pago cada hora
// ------------------------------------------------------------
export function startUsageMonitor() {
  const INTERVAL_MS = 60 * 60 * 1000 // cada hora

  console.log('[usage-monitor] Iniciado — revisión cada hora')

  runUsageCheck()
  setInterval(runUsageCheck, INTERVAL_MS)
}

async function runUsageCheck() {
  console.log('[usage-monitor] Revisando uso de todos los tenants...')

  try {
    // Solo tenants con suscripción activa (pagos) — los que están
    // en trial se controlan en tiempo real, no por este job mensual
    const tenants = await prisma.tenant.findMany({
      where: { isActive: true, subscriptionStatus: 'ACTIVE' },
      select: { id: true, slug: true, name: true, plan: true, subscriptionStatus: true },
    })

    for (const tenant of tenants) {
      await checkTenantAlerts(tenant).catch((err) => {
        console.error(`[usage-monitor] Error revisando tenant "${tenant.slug}":`, err.message)
        Sentry.captureException(err)
      })
    }

    console.log(`[usage-monitor] Revisión completa — ${tenants.length} tenants`)
  } catch (err) {
    console.error('[usage-monitor] Error en la revisión periódica:', err.message)
    Sentry.captureException(err)
  }
}

async function checkTenantAlerts(tenant) {
  const planKey = getEffectivePlanKey(tenant)
  const limit = PLAN_LIMITS[planKey].conversations
  const usage = await getMonthlyUsage(tenant)
  const ratio = usage / limit

  const crossedThreshold = ALERT_THRESHOLDS.slice().reverse().find((t) => ratio >= t)

  if (!crossedThreshold) return

  const alreadySent = await prisma.auditLog.findFirst({
    where: {
      targetTenantId: tenant.id,
      action: `USAGE_ALERT_${Math.round(crossedThreshold * 100)}`,
      createdAt: { gte: getStartOfMonth() },
    },
  })

  if (alreadySent) return

  await sendUsageAlert(tenant, usage, limit, crossedThreshold)

  await prisma.auditLog.create({
    data: {
      action: `USAGE_ALERT_${Math.round(crossedThreshold * 100)}`,
      targetTenantId: tenant.id,
      metadata: { usage, limit, ratio: Math.round(ratio * 100), plan: planKey },
    },
  })

  console.log(
    `[usage-monitor] Alerta ${Math.round(crossedThreshold * 100)}% enviada → ${tenant.slug} (${usage}/${limit})`
  )
}

// ------------------------------------------------------------
// 3. ENVÍO DE EMAILS
// ------------------------------------------------------------
const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

async function sendUsageAlert(tenant, usage, limit, threshold) {
  const admins = await prisma.user.findMany({
    where: { tenantId: tenant.id, role: { in: ['ADMIN', 'EDITOR'] } },
    select: { email: true, name: true },
  })

  if (admins.length === 0) {
    console.warn(`[usage-monitor] Sin admins para notificar en tenant "${tenant.slug}"`)
    return
  }

  const pct = Math.round(threshold * 100)
  const remaining = Math.max(0, limit - usage)
  const isBlocked = threshold >= 1.0
  const upgradeUrl = `${process.env.APP_URL}/precios?tenant=${tenant.slug}`
  const resetDate = getMonthResetDate()
  const planLabel = PLAN_LIMITS[tenant.plan]?.label ?? tenant.plan

  const subject = isBlocked
    ? `[Ragbase] Tu plan alcanzó el límite — consultas bloqueadas`
    : `[Ragbase] Usaste el ${pct}% de tus consultas este mes`

  const html = buildAlertEmail({
    tenantName: tenant.name,
    plan: planLabel,
    usage,
    limit,
    remaining,
    pct,
    isBlocked,
    upgradeUrl,
    resetDate,
  })

  for (const admin of admins) {
    await mailer.sendMail({
      from: `Ragbase <${process.env.SMTP_FROM}>`,
      to: admin.email,
      subject,
      html,
    })
  }

  if (isBlocked && process.env.SUPERADMIN_EMAIL) {
    await mailer.sendMail({
      from: `Ragbase <${process.env.SMTP_FROM}>`,
      to: process.env.SUPERADMIN_EMAIL,
      subject: `[Super Admin] Tenant bloqueado: ${tenant.name} (${tenant.slug})`,
      html: `<p><strong>${tenant.name}</strong> (${tenant.slug}) alcanzó su límite de ${limit} consultas en el plan ${planLabel}.</p><p><a href="${upgradeUrl}">Ver detalles</a></p>`,
    })
  }
}

function buildAlertEmail({ tenantName, plan, usage, limit, remaining, pct, isBlocked, upgradeUrl, resetDate }) {
  const color = isBlocked ? '#9F2F2D' : pct >= 95 ? '#956400' : '#346538'
  const bgColor = isBlocked ? '#FDEBEC' : pct >= 95 ? '#FBF3DB' : '#EDF3EC'

  return `<!DOCTYPE html>
<html>
<body style="font-family:'Helvetica Neue',sans-serif;background:#FBFBFA;margin:0;padding:40px 20px;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #EAEAEA;border-radius:8px;overflow:hidden;">

    <div style="padding:24px 32px;border-bottom:1px solid #EAEAEA;">
      <p style="font-size:13px;font-weight:500;color:#111;margin:0;">Ragbase</p>
    </div>

    <div style="padding:32px;">
      <div style="background:${bgColor};border-radius:6px;padding:14px 18px;margin-bottom:24px;">
        <p style="color:${color};font-size:13px;font-weight:500;margin:0;">
          ${isBlocked ? 'Límite de consultas alcanzado' : `${pct}% del límite mensual usado`}
        </p>
      </div>

      <p style="font-size:14px;color:#111;line-height:1.6;">
        Hola equipo de <strong>${tenantName}</strong>,
      </p>

      <p style="font-size:13px;color:#787774;line-height:1.7;">
        ${isBlocked
          ? `Tu plan <strong>${plan}</strong> alcanzó las <strong>${limit} consultas</strong> incluidas este mes. Las nuevas consultas están bloqueadas hasta el <strong>${resetDate}</strong> o hasta que actualices tu plan.`
          : `Tu plan <strong>${plan}</strong> lleva <strong>${usage} de ${limit} consultas</strong> este mes. Te quedan <strong>${remaining} consultas</strong> disponibles.`
        }
      </p>

      <!-- Barra de uso -->
      <div style="background:#EAEAEA;border-radius:4px;height:6px;margin:20px 0;">
        <div style="background:${color};width:${Math.min(pct, 100)}%;height:6px;border-radius:4px;"></div>
      </div>
      <p style="font-size:11px;color:#787774;margin:0 0 24px;font-family:'Courier New',monospace;">${usage} / ${limit} consultas (${pct}%)</p>

      <a href="${upgradeUrl}" style="display:inline-block;background:#111111;color:#ffffff;padding:10px 20px;border-radius:5px;text-decoration:none;font-size:13px;font-weight:500;">
        ${isBlocked ? 'Actualizar plan ahora' : 'Ver opciones de plan'}
      </a>

      <p style="font-size:12px;color:#787774;margin-top:24px;padding-top:20px;border-top:1px solid #EAEAEA;">
        El contador se reinicia el <strong>${resetDate}</strong>.
        Si tenés preguntas escribinos a <a href="mailto:soporte@ragbase.io" style="color:#111;">soporte@ragbase.io</a>
      </p>
    </div>
  </div>
</body>
</html>`
}

// ------------------------------------------------------------
// 4. HELPERS
// ------------------------------------------------------------
export async function getMonthlyUsage(tenant) {
  const planKey = getEffectivePlanKey(tenant)
  const planConfig = PLAN_LIMITS[planKey]

  // Plan GRATIS: cuota total del trial, no se reinicia por mes
  const since = planConfig.isTrialTotal && tenant.trialStartedAt
    ? tenant.trialStartedAt
    : getStartOfMonth()

  const result = await prisma.usageLog.count({
    where: {
      tenantId: tenant.id,
      action: 'CHAT_QUERY',
      createdAt: { gte: since },
    },
  })
  return result
}

function getStartOfMonth() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

function getMonthResetDate() {
  const now = new Date()
  const reset = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return reset.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
}
