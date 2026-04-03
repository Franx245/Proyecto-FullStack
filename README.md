<div align="center">

# ⚔️ DuelVault

**Plataforma ecommerce + CRM para la venta de cartas Yu-Gi-Oh!**

[![Node.js](https://img.shields.io/badge/Node.js-≥20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-4-000000?logo=express)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma)](https://www.prisma.io/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![MercadoPago](https://img.shields.io/badge/MercadoPago-Checkout-009EE3?logo=mercadopago&logoColor=white)](https://www.mercadopago.com.ar/)
[![Vercel](https://img.shields.io/badge/Vercel-Deploy-000?logo=vercel)](https://vercel.com/)
[![Render](https://img.shields.io/badge/Render-Backend-46E3B7?logo=render&logoColor=white)](https://render.com/)

</div>

---

## Tabla de contenidos

- [Descripción](#descripción)
- [Arquitectura](#arquitectura)
- [Tech Stack](#tech-stack)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Quick Start](#quick-start)
- [Scripts disponibles](#scripts-disponibles)
- [Variables de entorno](#variables-de-entorno)
- [Deployment](#deployment)
- [Seguridad y hardening](#seguridad-y-hardening)
- [Features](#features)
- [Testing y QA](#testing-y-qa)
- [Colaboración](#colaboración)

---

## Descripción

DuelVault resuelve dos necesidades en un monorepo:

| Capa | Propósito |
|------|-----------|
| **Storefront** | Catálogo público, detalle de carta, carrito, checkout con MercadoPago, pedidos y landing responsive |
| **Panel Admin** | CRM interno con inventario virtualizado, dashboard operativo, órdenes, merchandising, auditoría y contenido custom |
| **Backend API** | Express monolith con auth JWT, rate limiting, stock atómico, cache Redis, SSE realtime, BullMQ jobs y webhooks de pago |

La separación frontend/backend garantiza que secretos y lógica de negocio nunca se exponen al navegador. El admin consume la misma API con permisos elevados.

---

## Arquitectura

```
┌─────────────┐    ┌─────────────┐
│  Storefront │    │  Admin Panel │
│ React + Vite│    │ React + Vite │
│   (Vercel)  │    │   (Vercel)   │
└──────┬──────┘    └──────┬───────┘
       │                  │
       └────────┬─────────┘
                │ HTTPS
       ┌────────▼────────┐
       │  Express API     │
       │  (Render)        │
       │                  │
       │  ┌─── Auth ────┐ │      ┌──────────────┐
       │  │ JWT + RBAC  │ │◄────►│  Redis        │
       │  └─────────────┘ │      │  (Upstash +   │
       │  ┌─── Cache ───┐ │      │   IORedis TCP) │
       │  │ LRU + Redis │ │      └──────────────┘
       │  └─────────────┘ │
       │  ┌─── Queue ───┐ │      ┌──────────────┐
       │  │   BullMQ    │ │      │  Cloudinary   │
       │  └─────────────┘ │      │  (fetch proxy)│
       │  ┌─── SSE ─────┐ │      └──────────────┘
       │  │  Realtime   │ │
       │  └─────────────┘ │
       └────────┬─────────┘
                │
       ┌────────▼────────┐
       │  PostgreSQL      │
       │  Supabase        │
       │  (PgBouncer)     │
       └─────────────────┘
```

**Flujo principal:**

1. El storefront consulta la API para catálogo, filtros, carrito y checkout.
2. MercadoPago procesa pagos (Checkout Pro + API directa) y notifica via webhook.
3. El backend reserva stock atómicamente, gestiona estados de orden y emite eventos SSE.
4. BullMQ ejecuta jobs en background (sync de catálogo, actualización de stock).
5. Redis cachea respuestas con singleflight y fallback LRU in-memory (500 entries).
6. Prisma mantiene el schema sobre Supabase Postgres con connection pooling.

---

## Tech Stack

| Categoría | Tecnología |
|-----------|-----------|
| **Frontend** | React 19, Vite 6, Tailwind CSS 3, TanStack Query 5, React Router 7 |
| **Backend** | Node.js ≥20, Express 4, Prisma ORM |
| **Database** | PostgreSQL (Supabase PgBouncer, sa-east-1) |
| **Cache** | Redis dual: Upstash REST (cache) + IORedis TCP (BullMQ/pub-sub) + LRU in-memory fallback |
| **Queues** | BullMQ (stock sync, catalog sync, scheduled jobs) |
| **Realtime** | SSE con Redis pub/sub (stock, precios, órdenes) |
| **Payments** | MercadoPago Checkout Pro + Direct Payment API |
| **Images** | Cloudinary fetch proxy (q_auto:eco, f_auto, responsive srcset) |
| **Auth** | JWT access (15min) + refresh tokens (30d), RBAC (admin/staff/client) |
| **Deploy** | Vercel (frontends) + Render (backend) |
| **Monitoring** | Health endpoint con DB probe, structured JSON logging, audit trail |

---

## Estructura del proyecto

```
duelvault/
├── backend/                    # API Express principal
│   ├── server.js               # Monolith (~7600 LOC) — rutas, middleware, lógica
│   ├── prisma/                 # Schema, migraciones y seed
│   └── src/lib/                # Módulos: auth, cache, dollar, events, queues, SSE, redis...
├── frontend-admin/             # Panel admin (workspace npm separado)
│   └── src/                    # Views, lib, components del admin
├── src/                        # Storefront público
│   ├── api/                    # Capa de fetch del storefront
│   ├── components/             # UI components (marketplace, cart, checkout)
│   ├── config/                 # env.js — resolución unificada de env vars
│   ├── hooks/                  # Custom hooks (realtime, auth, queries)
│   └── lib/                    # Utilidades (cardImage, mercadopago, userSession)
├── app/                        # Next.js app directory (SSR experimental)
├── scripts/                    # Dev stack, QA, sandbox checkout, DB smoke checks
├── docs/                       # Runbooks de MercadoPago y deploy
├── api/                        # Vercel serverless entry (Express adapter)
└── prisma.config.ts            # Prisma config
```

---

## Quick Start

### Requisitos

- **Node.js ≥20**
- **npm ≥9**
- PostgreSQL (local o Supabase)

### Setup

```bash
# 1. Clonar e instalar
git clone https://github.com/Franx245/Proyecto-FullStack.git
cd Proyecto-FullStack
npm install

# 2. Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con tus credenciales (ver sección Variables de Entorno)

# 3. Preparar base de datos y seed
npm run setup

# 4. Levantar el stack completo (store + admin + API)
npm run dev
```

El orquestador imprime las URLs reales:

```
[boot] Store: http://127.0.0.1:5181
[boot] Admin: http://127.0.0.1:5182
[boot] API:   http://127.0.0.1:3001
```

Notas:

- El backend carga primero `.env.local`; usar sólo `.env` no es el flujo principal del repo.
- `npm run dev` sobreescribe en runtime las URLs locales del API, store y admin.
- `REDIS_TCP_URL` sólo hace falta si querés BullMQ/pub/sub reales o levantar el worker; sin eso el API usa fallback inline.

---

## Scripts disponibles

| Script | Descripción |
|--------|------------|
| `npm run dev` | Levanta store + admin + API coordinados |
| `npm run dev:api` | Solo backend |
| `npm run dev:api:watch` | Backend con hot-reload |
| `npm run dev:store` | Solo storefront Vite |
| `npm run dev:admin` | Solo panel admin |
| `npm start` | **Producción** — `node backend/server.js` |
| `npm run build` | Build store + admin |
| `npm run setup` | Prisma generate + db push + seed |
| `npm run db:push` | Aplicar schema a la base |
| `npm run db:seed` | Cargar datos iniciales |
| `npm run lint` | ESLint quiet |
| `npm run check` | Lint + typecheck |

---

## Variables de entorno

### Backend (Render / .env)

```env
# ── Database ──
DATABASE_URL=postgresql://postgres.xxx:password@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=10
DIRECT_URL=postgresql://postgres.xxx:password@db.xxx.supabase.co:5432/postgres

# ── Auth (REQUIRED — server crashes on startup without these) ──
ACCESS_TOKEN_SECRET=<random-64-char>
REFRESH_TOKEN_SECRET=<random-64-char>

# ── MercadoPago ──
MP_ACCESS_TOKEN=APP_USR-xxx
MP_WEBHOOK_SECRET=<from-mp-dashboard>

# ── Redis ──
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx
REDIS_TCP_URL=rediss://default:xxx@xxx.upstash.io:6379   # BullMQ + pub/sub

# ── URLs ──
BACKEND_URL=https://tu-backend.onrender.com
FRONTEND_URL=https://tu-storefront.vercel.app
ADMIN_URL=https://tu-admin.vercel.app

# ── Server ──
PORT=3001
NODE_ENV=production
CRON_SECRET=<random-64-char>
CHECKOUT_EXPIRATION_MINUTES=30
CORS_ALLOWED_ORIGINS=
ALLOW_VERCEL_PREVIEWS=true
```

| Variable | Descripción |
|----------|------------|
| `DATABASE_URL` | Supabase pooled connection string (PgBouncer) |
| `DIRECT_URL` | Supabase direct connection (migrations/schema) |
| `ACCESS_TOKEN_SECRET` | Firma JWT access tokens — **fail-fast si falta** |
| `REFRESH_TOKEN_SECRET` | Firma JWT refresh tokens — **fail-fast si falta** |
| `MP_ACCESS_TOKEN` | Token privado MercadoPago (Checkout Pro + pagos directos) |
| `MP_WEBHOOK_SECRET` | Validación HMAC de webhooks MercadoPago |
| `UPSTASH_REDIS_REST_URL` | Upstash REST endpoint para cache |
| `UPSTASH_REDIS_REST_TOKEN` | Token REST de Upstash |
| `REDIS_TCP_URL` | Redis TCP para BullMQ y pub/sub (IORedis) |
| `BACKEND_URL` | URL pública del backend (webhooks, notification_url) |
| `FRONTEND_URL` | Storefront URL (CORS, redirects) |
| `ADMIN_URL` | Admin URL (CORS) |
| `CRON_SECRET` | Bearer token para cron de expiración de órdenes |

### Storefront (Vercel)

```env
VITE_APP_NAME=DuelVault
VITE_APP_ENV=production
VITE_API_BASE_URL=https://tu-backend.onrender.com
VITE_API_TIMEOUT=10000
VITE_MP_PUBLIC_KEY=APP_USR-xxx
VITE_CLOUDINARY_CLOUD_NAME=tu-cloud
VITE_ENABLE_CART=true
VITE_ENABLE_ORDERS=true
```

### Admin (Vercel)

```env
VITE_API_BASE_URL=https://tu-backend.onrender.com
VITE_STOREFRONT_URL=https://tu-storefront.vercel.app
```

---

## Deployment

### Render (Backend API)

| Config | Valor |
|--------|-------|
| **Build Command** | `npm install && npx prisma generate` |
| **Start Command** | `npm start` |
| **Health Check** | `GET /api/health` (returns 503 if DB down) |
| **Node Version** | ≥20 (set en `engines`) |
| **Auto-Deploy** | Push to `main` |

El backend incluye `trust proxy`, graceful shutdown con `server.close()` y body limit de 256KB.

### Vercel (Storefront)

| Config | Valor |
|--------|-------|
| **Root Directory** | `/` (raíz del repo) |
| **Build Command** | `npm run build:store` |
| **Output Directory** | `dist` |

### Vercel (Admin Panel)

| Config | Valor |
|--------|-------|
| **Root Directory** | `frontend-admin` |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |

### Supabase (Base de datos)

```bash
# Aplicar schema
npm run db:push

# Cargar datos iniciales (opcional)
npm run db:seed
```

### Expiración automática de órdenes

El backend expira órdenes `PENDING_PAYMENT` cuando `expires_at` ya pasó → marca como `EXPIRED` y libera stock.

```
GET /api/internal/orders/expire-pending
Authorization: Bearer ${CRON_SECRET}
```

Configurar como Vercel Cron Job o scheduler externo.

---

## Seguridad y hardening

El proyecto pasó por una auditoría de producción completa. Estas son las protecciones activas:

### Autenticación y autorización

| Medida | Detalle |
|--------|---------|
| JWT fail-fast | `requireEnv()` crashes on startup si faltan secrets |
| Access tokens | 15 min TTL, firmados con `ACCESS_TOKEN_SECRET` |
| Refresh tokens | 30 días, hash almacenado en DB |
| RBAC | Roles `ADMIN` / `STAFF` / `CLIENT` con middleware `requireAdminRole()` |
| IDOR protection | `GET /api/orders` filtra por `userId` del token autenticado |

### Rate limiting

| Scope | Límite |
|-------|--------|
| Global `/api/*` | 100 req/min por IP |
| Checkout | 5 req/min por IP |
| Admin login | Rate limit dedicado |

Excluidos del global: `/api/health`, webhooks MercadoPago, SSE streams.

### Resiliencia

| Componente | Estrategia |
|------------|-----------|
| **Stock** | Reserva atómica con `updateMany WHERE stock >= quantity` (no read-check-write) |
| **Exchange rate** | 3-tier fallback: APIs externas → cache stale → DB persisted rate → emergency 1250 ARS |
| **SSE** | Límite 200 conexiones + timeout 5 min + heartbeat 30s |
| **Dashboard** | Queries scoped a 90 días (previene full table scans) |
| **Health** | `GET /api/health` probe SQL con timeout 2s, retorna 503 si DB down |
| **Cache** | Redis singleflight + LRU in-memory fallback (500 entries) |
| **Graceful shutdown** | `SIGTERM` → `server.close()` → drain connections → exit |
| **Body limit** | `express.json({ limit: "256kb" })` |
| **Trust proxy** | `app.set("trust proxy", 1)` para IP real detrás de LB |

---

## Features

### Storefront

- Catálogo paginado con filtros por categoría, rarity, set y búsqueda
- Detalle de carta con variantes y stock real
- Carrito persistente con drawer lateral
- Checkout con MercadoPago (Checkout Pro + Direct Payment API)
- Mis pedidos con tracking y estados
- Imágenes optimizadas via Cloudinary fetch proxy (q_auto:eco, f_auto, responsive srcset)
- CSS crítico inline + code splitting por ruta
- SSE realtime para cambios de stock/precios
- Bootstrap temprano de catálogo para first paint rápido
- Contacto con formulario persistido en DB

### Panel Admin

- Dashboard operativo con KPIs, alertas y acciones rápidas
- Inventario virtualizado (escala a miles de cartas)
- Gestión de órdenes con estados, tracking y notificaciones
- Edición masiva de stock/precios
- Merchandising de home (destacados, nuevas llegadas)
- Contenido custom y publicaciones
- CRM de usuarios con roles y actividad
- Audit trail de mutaciones administrativas
- Observabilidad integrada (logging estructurado)

### Backend

- Express monolith con 60+ endpoints
- Auth JWT con access + refresh tokens y RBAC
- MercadoPago Checkout Pro + Direct Payment + webhooks con HMAC
- Redis dual (cache REST + TCP pub/sub/queues)
- BullMQ worker para jobs en background
- SSE realtime bidireccional (public + admin)
- Concurrencia optimista e idempotencia en mutaciones admin
- Exchange rate USD→ARS con 3-tier fallback
- Expiración automática de órdenes + liberación de stock
- Health endpoint con DB probe
- Structured JSON logging + API metrics

---

## Testing y QA

### Credenciales de desarrollo

| Rol | Email | Password |
|-----|-------|----------|
| Admin | `admin@test.com` | `admin123` |
| Staff | `staff@test.com` | `staff123` |

### Scripts de QA

```bash
node scripts/db-smoke-check.mjs          # Verificar conexión DB
node scripts/check-production-cache.mjs   # Validar cache en producción
node scripts/sandbox-checkout-flow.mjs    # Test E2E checkout MercadoPago
node scripts/qa-next-e2e.mjs             # E2E del storefront Next.js
```

### Runbooks

- [docs/mercadopago-db-runbook.md](docs/mercadopago-db-runbook.md) — Preparación segura de DB para MercadoPago
- [docs/checkout-api-deploy.md](docs/checkout-api-deploy.md) — Deploy del checkout directo
- [docs/mercadopago-sandbox-runbook.md](docs/mercadopago-sandbox-runbook.md) — Testing en sandbox

---

## Colaboración

1. Usá `npm run dev` desde la raíz para levantar todo coordinado
2. Ejecutá `npm run build` antes de abrir un PR
3. Mantené secretos fuera del repositorio (`.env` está en `.gitignore`)
4. Documentá nuevas variables de entorno en este README
5. Los cambios de schema requieren `npm run db:push` antes de levantar

---

<div align="center">

**Hecho con React, Express y mucho café** ☕

</div>