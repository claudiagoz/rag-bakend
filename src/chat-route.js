// ============================================================
// RAG Multiempresa — Ruta de chat
// POST /api/chat
// Usa: OpenAI GPT · queryRAG con pgvector · Prisma
// ============================================================

import { Router } from 'express'
import * as Sentry from '@sentry/node'
import OpenAI from 'openai'
import { PrismaClient } from '@prisma/client'
import { queryRAG } from './ingest-pipeline.js'

const router = Router()
const prisma = new PrismaClient()
// timeout corto: el default del SDK es 10 minutos, que hace parecer
// "colgado" el endpoint cuando en realidad OpenAI solo está lento
// (ej. límites de velocidad bajos en cuentas nuevas)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 25_000, maxRetries: 1 })

// ------------------------------------------------------------
// POST /api/chat
// Headers: Authorization: Bearer <jwt>  (middleware → req.tenant)
// Body:    { message: string, sessionId?: string }
// ------------------------------------------------------------
router.post('/', async (req, res) => {
  const { message, sessionId } = req.body
  const tenant = req.tenant  // cargado por authMiddleware

  if (!message?.trim()) {
    return res.status(400).json({ error: 'El mensaje no puede estar vacío' })
  }

  try {
    // 1. Obtener o crear sesión
    const session = sessionId
      ? await prisma.chatSession.findFirst({
          where: { id: sessionId, tenantId: tenant.id },
          include: { messages: { orderBy: { createdAt: 'asc' }, take: 20 } },
        })
      : await prisma.chatSession.create({
          data: {
            tenantId: tenant.id,
            userId: req.user?.id ?? null,
            title: message.slice(0, 60),
          },
          include: { messages: true },
        })

    if (!session) return res.status(404).json({ error: 'Sesión no encontrada' })

    // 2. Guardar mensaje del usuario
    await prisma.chatMessage.create({
      data: { sessionId: session.id, role: 'USER', content: message },
    })

    // 3. Recuperar chunks relevantes de pgvector filtrados por tenant
    const config = tenant.botConfig ?? {}
    const topK = config.topK ?? 5
    const threshold = config.similarityThreshold ?? 0.3

    const relevantChunks = await queryRAG(tenant.id, message, topK, threshold)

    // 4. Construir contexto RAG
    const ragContext =
      relevantChunks.length > 0
        ? relevantChunks
            .map(
              (chunk, i) =>
                `[Fuente ${i + 1}: ${chunk.filename}${chunk.page ? `, p.${chunk.page}` : ''}]\n${chunk.content}`
            )
            .join('\n\n---\n\n')
        : 'No se encontraron documentos relevantes para esta consulta.'

    // 5. Construir historial para la API de OpenAI
    const systemPrompt = buildSystemPrompt(config, ragContext)

    const history = session.messages.slice(-10).map(m => ({
      role: m.role === 'USER' ? 'user' : 'assistant',
      content: m.content,
    }))

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: message },
    ]

    // 6. Llamar a OpenAI
    const completion = await openai.chat.completions.create({
      model: config.model ?? 'gpt-4o',
      messages,
      temperature: config.temperature ?? 0.2,
      max_tokens: config.maxTokens ?? 1024,
    })

    const assistantContent = completion.choices[0].message.content
    const usage = completion.usage

    // 7. Formatear fuentes
    const sources = relevantChunks.map(chunk => ({
      documentId: chunk.documentId,
      filename: chunk.filename,
      page: chunk.page,
      score: Math.round(chunk.score * 100) / 100,
    }))

    // 8. Guardar respuesta
    const savedMessage = await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: 'ASSISTANT',
        content: assistantContent,
        sources,
        tokensUsed: usage?.total_tokens ?? null,
      },
    })

    // 9. Registrar uso para billing
    await prisma.usageLog.create({
      data: {
        tenantId: tenant.id,
        sessionId: session.id,
        action: 'CHAT_QUERY',
        tokensIn: usage?.prompt_tokens ?? 0,
        tokensOut: usage?.completion_tokens ?? 0,
        model: config.model ?? 'gpt-4o',
      },
    })

    return res.json({
      sessionId: session.id,
      message: {
        id: savedMessage.id,
        role: 'ASSISTANT',
        content: assistantContent,
        sources,
        createdAt: savedMessage.createdAt,
      },
    })
  } catch (err) {
    console.error('[chat] Error:', err.message)
    Sentry.captureException(err)
    return res.status(500).json({ error: 'Error al procesar la consulta' })
  }
})

// ------------------------------------------------------------
// Helper — system prompt con contexto RAG inyectado
// ------------------------------------------------------------
function buildSystemPrompt(config, ragContext) {
  const base =
    config.systemPrompt ||
    'Eres un asistente que responde preguntas usando exclusivamente la información de los documentos proporcionados.'

  return `${base}

INSTRUCCIONES:
- Responde SOLO con información del contexto de documentos.
- Si la información no está disponible, responde: "No encontré información sobre esto en los documentos disponibles."
- Cita las fuentes usando [Fuente N] cuando uses información de un documento.
- Responde en el mismo idioma que la pregunta del usuario.
- Sé conciso y directo.

DOCUMENTOS RELEVANTES:
${ragContext}`
}

export default router
