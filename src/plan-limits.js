// ============================================================
// RAG Multiempresa — Precios y límites por plan
// Única fuente de verdad: usada por usage-alerts.js, server.js
// y expuesta al frontend vía GET /api/billing/plans
// ============================================================

export const PLAN_LIMITS = {
  GRATIS: {
    label: 'Gratis',
    priceArs: 0,
    conversations: 100,
    isTrialTotal: true, // 100 conversaciones para todo el trial, no por mes
    maxDocs: 5,
    features: [
      'Conectá WhatsApp o probá el simulador',
      '100 conversaciones nuevas',
      'Onboarding gratis, compres o no compres',
      'Hasta 5 fuentes de conocimiento',
    ],
  },
  EMPRENDEDORES: {
    label: 'Emprendedores',
    priceArs: 150000,
    conversations: 300,
    isTrialTotal: false,
    maxDocs: 10,
    features: [
      '1 sector',
      '300 conversaciones/mes',
      '1 usuario agente',
      'Onboarding gratis, en el día',
      'Hasta 10 fuentes de conocimiento',
    ],
  },
  PYMES: {
    label: 'Pymes',
    priceArs: 300000,
    conversations: 1000,
    isTrialTotal: false,
    maxDocs: 30,
    features: [
      'Hasta 3 sectores',
      '1.000 conversaciones/mes',
      '3 usuarios agentes',
      'Onboarding gratis, en el día',
      'Setup incluido del bot. Lo capacitamos con vos',
      'Hasta 30 fuentes de conocimiento',
    ],
  },
}

export const TRIAL_DAYS = Number(process.env.TRIAL_DAYS ?? 15)
