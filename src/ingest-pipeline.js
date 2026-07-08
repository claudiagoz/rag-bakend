// ============================================================
// RAG Multiempresa — Pipeline de ingestión
// Storage: Supabase Storage
// Vectores: pgvector vía supabase.rpc()
// Embeddings: OpenAI text-embedding-3-small
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { PDFLoader } from 'langchain/document_loaders/fs/pdf'
import { DocxLoader } from 'langchain/document_loaders/fs/docx'
import { CSVLoader } from 'langchain/document_loaders/fs/csv'
import { TextLoader } from 'langchain/document_loaders/fs/text'
import { writeFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

// ------------------------------------------------------------
// Clientes globales
// IMPORTANTE: usar SUPABASE_SERVICE_ROLE_KEY en el backend,
// nunca la anon key — necesita permisos de escritura en Storage
// ------------------------------------------------------------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const prisma = new PrismaClient()

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Bucket en Supabase Storage (crearlo manualmente en el dashboard: "documents")
const STORAGE_BUCKET = 'documents'

// ------------------------------------------------------------
// FUNCIÓN PRINCIPAL — ingestDocument
// Llamar después de que el archivo ya está en Supabase Storage
// ------------------------------------------------------------
export async function ingestDocument(documentId) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { tenant: { include: { botConfig: true } } },
  })

  if (!doc) throw new Error(`Documento ${documentId} no encontrado`)
  if (doc.status !== 'PENDING') {
    console.warn(`Documento ${documentId} ya procesado (status: ${doc.status})`)
    return
  }

  await prisma.document.update({
    where: { id: documentId },
    data: { status: 'PROCESSING' },
  })

  const startedAt = Date.now()

  try {
    // 1. Descargar archivo desde Supabase Storage
    const tmpPath = await downloadFromSupabase(doc.storagePath, doc.mimeType)

    // 2. Extraer texto
    const rawDocs = await extractText(tmpPath, doc.mimeType)
    await unlink(tmpPath).catch(() => {})

    if (rawDocs.length === 0 || rawDocs.every(d => !d.pageContent.trim())) {
      throw new Error('No se pudo extraer texto del documento')
    }

    // 3. Chunking con parámetros del tenant
    const config = doc.tenant.botConfig ?? {}
    const chunkSize = config.chunkSize ?? 512
    const chunkOverlap = config.chunkOverlap ?? 64

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
      separators: ['\n\n', '\n', '. ', ' ', ''],
    })

    const chunks = await splitter.splitDocuments(rawDocs)

    if (chunks.length === 0) throw new Error('El documento no generó chunks')

    // 4. Generar embeddings en batches de 100 (límite de OpenAI por request)
    const EMBED_BATCH = 100
    const allEmbeddings = []

    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = chunks.slice(i, i + EMBED_BATCH)
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: batch.map(c => c.pageContent),
      })
      allEmbeddings.push(...response.data.map(d => d.embedding))
    }

    // 5. Insertar chunks con embeddings en PostgreSQL via Supabase
    //    Prisma no soporta el tipo vector nativo, usamos supabase-js
    //    para los inserts con embedding
    const rows = chunks.map((chunk, i) => ({
      id: `${documentId}_${i}`,
      document_id: documentId,
      tenant_id: doc.tenantId,
      content: chunk.pageContent,
      embedding: JSON.stringify(allEmbeddings[i]),   // pgvector acepta array JSON
      chunk_index: i,
      page: chunk.metadata?.loc?.pageNumber ?? null,
      metadata: {
        filename: doc.originalName,
        mimeType: doc.mimeType,
        ...chunk.metadata,
      },
    }))

    // Insertar en batches de 50 para no superar el límite de payload de Supabase
    const INSERT_BATCH = 50
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      const batch = rows.slice(i, i + INSERT_BATCH)
      const { error } = await supabase
        .from('document_chunks')
        .upsert(batch, { onConflict: 'id' })

      if (error) throw new Error(`Error insertando chunks: ${error.message}`)
    }

    // 6. Actualizar documento como indexado
    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'INDEXED',
        chunkCount: chunks.length,
      },
    })

    // 7. Registrar uso
    await prisma.usageLog.create({
      data: {
        tenantId: doc.tenantId,
        action: 'DOC_INGEST',
        tokensIn: estimateTokens(chunks),
        durationMs: Date.now() - startedAt,
        metadata: {
          documentId: doc.id,
          filename: doc.filename,
          chunkCount: chunks.length,
        },
      },
    })

    console.log(`[ingest] OK — ${doc.filename} → ${chunks.length} chunks (tenant: ${doc.tenant.slug})`)
  } catch (err) {
    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'FAILED', errorMessage: err.message },
    })
    console.error(`[ingest] ERROR en ${documentId}:`, err.message)
    throw err
  }
}

// ------------------------------------------------------------
// FUNCIÓN — deleteDocument
// Borra chunks de pgvector y archivo de Supabase Storage
// ------------------------------------------------------------
export async function deleteDocument(documentId) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { tenant: true },
  })

  if (!doc) throw new Error(`Documento ${documentId} no encontrado`)

  // Borrar todos los chunks del documento en pgvector
  const { error: chunksError } = await supabase
    .from('document_chunks')
    .delete()
    .eq('documentId', documentId)

  if (chunksError) throw new Error(`Error borrando chunks: ${chunksError.message}`)

  // Borrar archivo de Supabase Storage
  const { error: storageError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([doc.storagePath])

  if (storageError) {
    // No lanzar error si el archivo ya no existe en Storage
    console.warn(`[delete] Archivo no encontrado en Storage: ${doc.storagePath}`)
  }

  // Soft delete en la DB
  await prisma.document.update({
    where: { id: documentId },
    data: { status: 'DELETED' },
  })

  await prisma.usageLog.create({
    data: {
      tenantId: doc.tenantId,
      action: 'DOC_DELETE',
      metadata: { documentId, filename: doc.filename },
    },
  })

  console.log(`[delete] ${doc.filename} eliminado (tenant: ${doc.tenant.slug})`)
}

// ------------------------------------------------------------
// FUNCIÓN — queryRAG
// Búsqueda semántica filtrada por tenant usando pgvector
// Llama a la función RPC match_chunks definida en la migración SQL
// ------------------------------------------------------------
export async function queryRAG(tenantId, query, topK = 5, threshold = 0.75) {
  // 1. Generar embedding de la consulta
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  })
  const queryEmbedding = response.data[0].embedding

  // 2. Llamar a la función RPC de pgvector
  //    match_chunks está definida en supabase-migration.sql
  const { data, error } = await supabase.rpc('match_chunks', {
    query_embedding: queryEmbedding,
    match_tenant_id: tenantId,
    match_threshold: threshold,
    match_count: topK,
  })

  if (error) throw new Error(`Error en búsqueda vectorial: ${error.message}`)

  return (data ?? []).map(row => ({
    content: row.content,
    score: row.similarity,
    documentId: row.document_id,
    filename: row.metadata?.filename ?? 'Documento',
    page: row.page ?? null,
    chunkIndex: row.chunk_index,
  }))
}

// ------------------------------------------------------------
// FUNCIÓN — uploadToStorage
// Sube un archivo a Supabase Storage y devuelve el storagePath
// Llamar antes de crear el registro en Document
// ------------------------------------------------------------
export async function uploadToStorage(tenantSlug, documentId, filename, buffer, mimeType) {
  const storagePath = `${tenantSlug}/${documentId}/${filename}`

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: false,
    })

  if (error) throw new Error(`Error subiendo archivo: ${error.message}`)

  return storagePath
}

// ------------------------------------------------------------
// HELPERS internos
// ------------------------------------------------------------

async function downloadFromSupabase(storagePath, mimeType) {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(storagePath)

  if (error) throw new Error(`Error descargando desde Storage: ${error.message}`)

  const ext = mimeTypeToExt(mimeType)
  const tmpPath = join(tmpdir(), `rag-${Date.now()}${ext}`)
  const buffer = Buffer.from(await data.arrayBuffer())
  await writeFile(tmpPath, buffer)

  return tmpPath
}

async function extractText(filePath, mimeType) {
  let loader

  if (mimeType === 'application/pdf') {
    loader = new PDFLoader(filePath, { splitPages: true })
  } else if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    loader = new DocxLoader(filePath)
  } else if (mimeType === 'text/csv') {
    loader = new CSVLoader(filePath)
  } else if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
    loader = new TextLoader(filePath)
  } else {
    throw new Error(`Tipo de archivo no soportado: ${mimeType}`)
  }

  return loader.load()
}

function mimeTypeToExt(mimeType) {
  const map = {
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'text/csv': '.csv',
    'text/plain': '.txt',
    'text/markdown': '.md',
  }
  return map[mimeType] ?? '.bin'
}

function estimateTokens(chunks) {
  const totalChars = chunks.reduce((acc, c) => acc + c.pageContent.length, 0)
  return Math.round(totalChars / 4)
}
