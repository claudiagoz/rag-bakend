# RAG Multiempresa — Guía de arranque completo

## Estructura del proyecto

```
ragbase/
├── prisma/
│   └── schema.prisma          # Modelos de base de datos
├── src/
│   ├── server.js              # Entrada principal
│   ├── auth-middleware.js     # JWT + API keys
│   ├── ingest-pipeline.js     # Ingestión de documentos
│   ├── chat-route.js          # Endpoint de chat
│   ├── impersonation.js       # Super admin impersonation
│   └── usage-alerts.js        # Alertas de uso
├── .env
├── package.json
└── README.md
```

---

## 1. Requisitos previos

- Node.js 20+
- PostgreSQL 15+ (local o en la nube)
- Cuenta en Pinecone (vector store)
- Cuenta en OpenAI (embeddings + LLM)
- Bucket en AWS S3 (almacenamiento de archivos)
- Cuenta SMTP — Resend.com es la opción más simple

---

## 2. Crear el proyecto

```bash
mkdir ragbase && cd ragbase
npm init -y
```

---

## 3. Instalar dependencias

```bash
# Framework y utilidades
npm install express jsonwebtoken bcrypt cors helmet morgan dotenv

# Prisma (ORM)
npm install @prisma/client
npm install -D prisma

# LangChain + loaders de documentos
npm install langchain @langchain/openai @langchain/core
npm install pdf-parse mammoth csv-parse

# Pinecone
npm install @pinecone-database/pinecone

# AWS S3
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner

# Email
npm install nodemailer

# Upload de archivos
npm install multer
```

---

## 4. Archivo .env

Crear `.env` en la raíz del proyecto:

```env
# Base de datos
DATABASE_URL="postgresql://usuario:password@localhost:5432/ragbase"

# JWT
JWT_SECRET="un-string-largo-y-aleatorio-de-al-menos-32-chars"

# OpenAI
OPENAI_API_KEY="sk-..."

# Pinecone
PINECONE_API_KEY="pcsk_..."
PINECONE_INDEX_NAME="ragbase"

# AWS S3
AWS_REGION="us-east-1"
AWS_ACCESS_KEY_ID="AKIA..."
AWS_SECRET_ACCESS_KEY="..."
S3_BUCKET="ragbase-docs"

# Email (Resend.com como SMTP)
SMTP_HOST="smtp.resend.com"
SMTP_PORT="587"
SMTP_USER="resend"
SMTP_PASS="re_..."
SMTP_FROM="noreply@tudominio.com"
SUPERADMIN_EMAIL="tu@email.com"

# App
APP_URL="http://localhost:3000"
NODE_ENV="development"
PORT="3000"
```

---

## 5. Configurar la base de datos

### 5a. Inicializar Prisma

```bash
npx prisma init
```

Esto crea la carpeta `prisma/` con un `schema.prisma` vacío.
Reemplazarlo con el archivo `schema.prisma` que generamos antes
(incluir también el modelo `AuditLog` de `audit-log-schema.prisma`).

### 5b. Crear la base de datos y tablas

```bash
# Crea todas las tablas según el schema
npx prisma migrate dev --name init

# Genera el cliente de Prisma
npx prisma generate
```

### 5c. Verificar en Prisma Studio (opcional)

```bash
npx prisma studio
# Abre http://localhost:5555 con UI para ver las tablas
```

---

## 6. Crear el índice en Pinecone

Entrar a https://app.pinecone.io y crear un índice con:

- **Name:** ragbase
- **Dimensions:** 1536  (modelo text-embedding-3-small de OpenAI)
- **Metric:** cosine
- **Plan:** Starter es gratis hasta 100k vectores

Los namespaces por tenant se crean solos al hacer el primer upsert.
No hay que configurar nada más en Pinecone.

---

## 7. Crear el bucket en S3

```bash
# Con AWS CLI (o hacerlo desde la consola web de AWS)
aws s3 mb s3://ragbase-docs --region us-east-1

# Configurar que los archivos no sean públicos por defecto
aws s3api put-public-access-block \
  --bucket ragbase-docs \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

---

## 8. Servidor principal

Crear `src/server.js`:

```js
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import multer from 'multer'
import { PrismaClient } from '@prisma/client'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'

import { authMiddleware, apiKeyMiddleware } from './auth-middleware.js'
import chatRouter from './chat-route.js'
import impersonationRouter, { impersonationAwareAuth } from './impersonation.js'
import { checkUsageQuota, startUsageMonitor, getMonthlyUsage } from './usage-alerts.js'
import { ingestDocument, deleteDocument } from './ingest-pipeline.js'

const app = express()
const prisma = new PrismaClient()
const s3 = new S3Client({ region: process.env.AWS_REGION })
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

// ── Middlewares globales ──────────────────────────────────────
app.use(helmet())
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*' }))
app.use(express.json())
app.use(morgan('dev'))

// ── Auth: Login y generación de JWT ──────────────────────────
app.post('/api/auth/login', async (req, res) => {
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
})

// ── Chat (acepta JWT de usuario o API key para el widget) ─────
app.use('/api/chat',
  (req, res, next) => {
    const hasApiKey = req.headers['x-api-key']
    if (hasApiKey) return apiKeyMiddleware(req, res, next)
    return impersonationAwareAuth(req, res, next)
  },
  checkUsageQuota,
  chatRouter
)

// ── Upload de documentos ──────────────────────────────────────
app.post('/api/documents/upload',
  authMiddleware,
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' })

    const tenant = req.tenant
    const file = req.file
    const docId = crypto.randomUUID()
    const storageKey = `tenants/${tenant.slug}/docs/${docId}-${file.originalname}`

    // Subir a S3
    await s3.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: storageKey,
      Body: file.buffer,
      ContentType: file.mimetype,
    }))

    // Registrar en DB
    const doc = await prisma.document.create({
      data: {
        id: docId,
        tenantId: tenant.id,
        filename: `${docId}-${file.originalname}`,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey,
        status: 'PENDING',
        uploadedById: req.user?.id ?? null,
      },
    })

    // Encolar ingestión de forma asíncrona (no bloquear el response)
    setImmediate(() => {
      ingestDocument(doc.id).catch((err) =>
        console.error(`[upload] Error ingesting ${doc.id}:`, err.message)
      )
    })

    return res.status(201).json({
      id: doc.id,
      filename: doc.originalName,
      status: 'PENDING',
      message: 'Archivo recibido. La indexación comenzará en segundos.',
    })
  }
)

// ── Estado de un documento ────────────────────────────────────
app.get('/api/documents/:id/status', authMiddleware, async (req, res) => {
  const doc = await prisma.document.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id },
    select: { id: true, originalName: true, status: true, chunkCount: true, errorMessage: true },
  })
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' })
  return res.json(doc)
})

// ── Listar documentos del tenant ──────────────────────────────
app.get('/api/documents', authMiddleware, async (req, res) => {
  const docs = await prisma.document.findMany({
    where: { tenantId: req.tenant.id, status: { not: 'DELETED' } },
    select: { id: true, originalName: true, status: true, chunkCount: true, sizeBytes: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  return res.json(docs)
})

// ── Eliminar documento ────────────────────────────────────────
app.delete('/api/documents/:id', authMiddleware, async (req, res) => {
  const doc = await prisma.document.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id },
  })
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' })

  await deleteDocument(doc.id)
  return res.json({ ok: true })
})

// ── Uso del tenant actual ─────────────────────────────────────
app.get('/api/usage', authMiddleware, async (req, res) => {
  const tenant = req.tenant
  const usage = await getMonthlyUsage(tenant.id)
  const limit = { STARTER: 500, PRO: 5000, ENTERPRISE: null }[tenant.plan]
  return res.json({ usage, limit, plan: tenant.plan })
})

// ── Super admin: impersonación ────────────────────────────────
app.use('/api/superadmin/impersonate', authMiddleware, impersonationRouter)

// ── Super admin: crear tenant ─────────────────────────────────
app.post('/api/superadmin/tenants', authMiddleware, async (req, res) => {
  if (req.user?.role !== 'SUPERADMIN') {
    return res.status(403).json({ error: 'Solo super admins' })
  }

  const { name, slug, plan, adminEmail, adminPassword } = req.body

  const exists = await prisma.tenant.findUnique({ where: { slug } })
  if (exists) return res.status(409).json({ error: 'El slug ya está en uso' })

  const passwordHash = await bcrypt.hash(adminPassword, 10)

  const tenant = await prisma.tenant.create({
    data: {
      name, slug,
      plan: plan ?? 'STARTER',
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
})

// ── Healthcheck ───────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }))

// ── Arranque ──────────────────────────────────────────────────
const PORT = process.env.PORT ?? 3000

app.listen(PORT, () => {
  console.log(`\nRagbase corriendo en http://localhost:${PORT}`)
  console.log('Iniciando monitor de uso...')
  startUsageMonitor()
})
```

---

## 9. Agregar `"type": "module"` al package.json

```json
{
  "name": "ragbase",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "node --watch src/server.js",
    "start": "node src/server.js",
    "db:migrate": "npx prisma migrate dev",
    "db:studio": "npx prisma studio"
  }
}
```

---

## 10. Arrancar en desarrollo

```bash
npm run dev
```

Deberías ver:
```
Ragbase corriendo en http://localhost:3000
Iniciando monitor de uso...
[usage-monitor] Iniciado — revisión cada hora
```

---

## 11. Crear el primer tenant y usuario super admin

```bash
# Insertar super admin directamente en la DB (solo la primera vez)
npx prisma studio
# → Ir a tabla User → Add record
# email: admin@tudominio.com
# role: SUPERADMIN
# passwordHash: generar con bcrypt online o con este snippet:

node -e "import('bcrypt').then(b => b.default.hash('tu-password', 10).then(console.log))"
```

Después desde la API ya podés crear tenants:

```bash
# Login como super admin
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@tudominio.com","password":"tu-password","tenantSlug":"superadmin"}'

# Crear primer tenant
curl -X POST http://localhost:3000/api/superadmin/tenants \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corp",
    "slug": "acme",
    "plan": "PRO",
    "adminEmail": "admin@acme.com",
    "adminPassword": "password123"
  }'
```

---

## 12. Probar el flujo completo

```bash
# 1. Login como admin de Acme
curl -X POST http://localhost:3000/api/auth/login \
  -d '{"email":"admin@acme.com","password":"password123","tenantSlug":"acme"}'

# 2. Subir un documento PDF
curl -X POST http://localhost:3000/api/documents/upload \
  -H "Authorization: Bearer <TOKEN>" \
  -F "file=@./mi-documento.pdf"

# 3. Esperar que se indexe (status: INDEXED)
curl http://localhost:3000/api/documents/<DOC_ID>/status \
  -H "Authorization: Bearer <TOKEN>"

# 4. Hacer una consulta de chat
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"message":"¿Cuál es la política de devoluciones?"}'
```

---

## 13. Checklist antes de producción

- [ ] Cambiar `JWT_SECRET` por un valor aleatorio largo (`openssl rand -hex 32`)
- [ ] Configurar HTTPS (nginx reverse proxy o Railway/Render lo hacen automático)
- [ ] Mover la revocación de tokens de impersonación a Redis
- [ ] Agregar rate limiting global con `express-rate-limit`
- [ ] Configurar backups automáticos de PostgreSQL
- [ ] Monitoreo de errores con Sentry (`npm install @sentry/node`)
- [ ] Variables de entorno en un gestor seguro (Railway secrets, AWS Secrets Manager)

---

## Servicios recomendados para deploy rápido

| Servicio | Para qué | Costo |
|---|---|---|
| Railway.app | Node.js + PostgreSQL | desde $0 |
| Pinecone | Vector store | gratis hasta 100k vectores |
| Resend.com | Emails transaccionales | gratis hasta 3k/mes |
| AWS S3 | Almacenamiento de archivos | ~$0.023/GB |
| Render.com | Alternativa a Railway | desde $0 |
