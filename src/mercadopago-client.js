// ============================================================
// RAG Multiempresa — Cliente de Mercado Pago
// Suscripciones recurrentes (Preapproval) sin plan asociado,
// usando card_token_id generado 100% en el cliente (el backend
// nunca recibe el número de tarjeta).
// ============================================================

import { MercadoPagoConfig, PreApproval, Payment } from 'mercadopago'
import { WebhookSignatureValidator } from 'mercadopago'

const config = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN })
const preApprovalClient = new PreApproval(config)
const paymentClient = new Payment(config)

// ------------------------------------------------------------
// Crear una suscripción con inicio de cobro diferido
// (autorizada hoy, primer cobro recién en `startDate`)
// ------------------------------------------------------------
export async function createPreapproval({ cardTokenId, payerEmail, amountArs, startDate, reason, externalReference }) {
  return preApprovalClient.create({
    body: {
      card_token_id: cardTokenId,
      payer_email: payerEmail,
      reason,
      external_reference: externalReference,
      back_url: process.env.APP_URL,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: amountArs,
        currency_id: 'ARS',
        start_date: startDate, // ISO 8601 — fecha del primer cobro (hoy + TRIAL_DAYS)
      },
    },
  })
}

export async function getPreapproval(id) {
  return preApprovalClient.get({ id })
}

export async function cancelPreapproval(id) {
  return preApprovalClient.update({ id, body: { status: 'cancelled' } })
}

// ------------------------------------------------------------
// Consultar un pago puntual (para eventos de webhook de tipo
// "payment" / "subscription_authorized_payment")
// ------------------------------------------------------------
export async function getPayment(id) {
  return paymentClient.get({ id })
}

// ------------------------------------------------------------
// Verificar la firma de un webhook de Mercado Pago
// Lanza InvalidWebhookSignatureError si no es auténtico
// ------------------------------------------------------------
export function verifyWebhookSignature({ xSignature, xRequestId, dataId }) {
  WebhookSignatureValidator.validate({
    xSignature,
    xRequestId,
    dataId,
    secret: process.env.MERCADOPAGO_WEBHOOK_SECRET,
    toleranceSeconds: 300,
  })
}
