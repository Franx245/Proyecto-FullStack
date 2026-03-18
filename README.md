# DuelVault

DuelVault es una plataforma ecommerce + CRM orientada a la venta de cartas y productos de Yu-Gi-Oh!. El proyecto combina una tienda pública para clientes, un backend con reglas de negocio y un panel administrativo para operar catálogo, inventario, home, órdenes y contenido custom.

## Descripción del proyecto

El sistema resuelve dos necesidades en una sola base de código:

- Ecommerce: catálogo público, detalle de producto, carrito, pedidos y storefront responsive.
- CRM / operación interna: panel admin con autenticación, gestión de inventario, merchandising, órdenes y publicaciones custom.

La separación entre frontend público y backend permite exponer una experiencia rápida al usuario final sin publicar secretos ni lógica sensible. El panel admin consume la misma API, pero con permisos y tokens de sesión.

## Arquitectura

Arquitectura recomendada para producción:

- Frontend público: Vercel
- Panel admin: Vercel como proyecto separado
- Backend API: Vercel Functions sobre Express
- Base de datos: Supabase Postgres con Prisma

Flujo general:

1. El storefront en React consulta la API para catálogo, destacados, productos custom y órdenes.
2. El panel admin autentica usuarios con JWT y refresh tokens.
3. El backend Express centraliza validaciones, permisos, stock, estados de órdenes y persistencia.
4. Prisma actúa como capa de acceso a datos y mantiene el esquema sobre Supabase Postgres.

## Tech Stack

- React
- Node.js
- Express
- Prisma
- Supabase Postgres
- JWT
- TanStack Query
- Tailwind CSS
- Vite

## Estructura del proyecto

- /backend: API Express, Prisma, seed de datos y lógica de autenticación.
- /frontend-admin: panel administrativo separado del storefront público.
- /src: storefront público principal servido por Vite.
- /scripts: utilidades de arranque coordinado y soporte de desarrollo.
- /entities: definiciones del dominio heredadas del catálogo.

## Getting Started local

La forma recomendada de correr el proyecto es desde la raíz para levantar tienda, backend y admin de manera coordinada.

### Requisitos previos

- Node.js 18+
- npm 9+

### Paso a paso

1. Instalar dependencias:

```bash
npm install
```

2. Preparar base local y seed:

```bash
npm run setup
```

3. Levantar el stack completo:

```bash
npm run dev
```

Cuando el stack arranca, el orquestador imprime las URLs reales disponibles. Un ejemplo típico:

```text
[boot] Store: http://127.0.0.1:5173
[boot] Admin: http://127.0.0.1:5178
[boot] API:   http://127.0.0.1:3001
```

### Comandos útiles

```bash
npm run dev
npm run dev:api
npm run dev:store
npm run dev:admin
npm run lint
npm run build
npm run build --workspace frontend-admin
```

## Variables de entorno

### Backend (.env o variables del proveedor)

Ejemplo recomendado para producción o para inyectar variables desde Railway, Render o tu shell:

```env
DATABASE_URL=postgresql://postgres.xxxxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
DIRECT_URL=postgresql://postgres.xxxxx:password@db.xxxxx.supabase.co:5432/postgres
JWT_SECRET=replace-with-a-long-random-secret
ACCESS_TOKEN_SECRET=replace-with-a-different-access-secret
REFRESH_TOKEN_SECRET=replace-with-a-different-refresh-secret
MP_ACCESS_TOKEN=
PORT=3001
NODE_ENV=development
FRONTEND_URL=https://tu-storefront.vercel.app
ADMIN_URL=https://tu-admin.vercel.app
CORS_ALLOWED_ORIGINS=
ALLOW_VERCEL_PREVIEWS=true
```

Qué hace cada variable:

- DATABASE_URL: URL pooled de Supabase para runtime Prisma.
- DIRECT_URL: URL directa de Supabase para operaciones de schema y Prisma CLI.
- JWT_SECRET: secreto general de JWT. El proyecto lo usa como fallback si no definís secretos separados.
- ACCESS_TOKEN_SECRET: firma de access tokens del admin.
- REFRESH_TOKEN_SECRET: firma de refresh tokens del admin.
- MP_ACCESS_TOKEN: token privado de Mercado Pago para una futura integración de pagos.
- PORT: puerto del backend Express.
- NODE_ENV: ajusta logging y comportamiento de entorno.
- FRONTEND_URL: URL pública del storefront en Vercel.
- ADMIN_URL: URL pública del panel admin en Vercel.
- CORS_ALLOWED_ORIGINS: lista separada por comas para orígenes extra.
- ALLOW_VERCEL_PREVIEWS: permite previews de Vercel durante QA.

Nota importante:

- El backend puede correr en local con defaults de JWT, pero ya no debe usar SQLite como base productiva.
- En producción no deberías usar secretos por defecto ni ejecutar seeds automáticamente.

### Frontend (.env)

El storefront usa estas variables. El archivo de ejemplo incluido es [.env.example](.env.example).

```env
VITE_APP_NAME=DuelVault
VITE_APP_ENV=development
VITE_API_BASE_URL=http://127.0.0.1:3001
VITE_API_TIMEOUT=10000
VITE_MP_PUBLIC_KEY=
VITE_ENABLE_CART=true
VITE_ENABLE_ORDERS=true
VITE_ENABLE_ANALYTICS=false
VITE_STOREFRONT_URL=http://127.0.0.1:5173
```

Qué hace cada variable:

- VITE_APP_NAME: nombre público mostrado por la app.
- VITE_APP_ENV: etiqueta de entorno para desarrollo o producción.
- VITE_API_BASE_URL: endpoint base del backend consumido por el storefront. Es la variable efectiva de este repo; equivale al clásico VITE_API_URL de otros proyectos.
- VITE_API_TIMEOUT: timeout base para requests del cliente.
- VITE_MP_PUBLIC_KEY: clave pública de Mercado Pago para checkout futuro.
- VITE_ENABLE_CART: habilita la experiencia de carrito.
- VITE_ENABLE_ORDERS: habilita flujo de órdenes.
- VITE_ENABLE_ANALYTICS: activa banderas de analítica del frontend.
- VITE_STOREFRONT_URL: URL del storefront usada por el admin para redirigir al login público.

## Deployment Guide

## Frontend en Vercel

### Storefront

1. Crear un proyecto nuevo en Vercel y conectar este repositorio.
2. Configurar como Root Directory la raíz del repo si desplegás el storefront principal.
3. Usar el comando de build:

```bash
npm run build:store
```

4. Usar como output directory:

```text
dist
```

5. Configurar variables de entorno:

- VITE_API_BASE_URL=https://tu-api-produccion.com
- VITE_APP_ENV=production
- VITE_MP_PUBLIC_KEY=tu-clave-publica-si-corresponde

### Panel admin

Desplegá el admin como proyecto separado en Vercel usando frontend-admin como directorio raíz.

Configuración sugerida:

- Root Directory: frontend-admin
- Build Command: npm run build
- Output Directory: dist

Variables mínimas del admin:

- VITE_API_BASE_URL=https://tu-api-produccion.com
- VITE_STOREFRONT_URL=https://tu-storefront.vercel.app

## Backend API en Vercel + Supabase

La raíz del repo ya puede desplegar el backend como función serverless desde api/index.js reutilizando Express.

Configuración recomendada del proyecto API/store en Vercel:

- Root Directory: raíz del repo
- Build Command: npm run build:store
- Output Directory: dist

Variables mínimas del proyecto:

- DATABASE_URL
- DIRECT_URL
- JWT_SECRET
- ACCESS_TOKEN_SECRET
- REFRESH_TOKEN_SECRET
- FRONTEND_URL
- ADMIN_URL
- ALLOW_VERCEL_PREVIEWS=true

Antes de apuntar producción, aplicá el esquema en Supabase con Prisma:

```bash
npm run db:push
```

Si además necesitás datos iniciales:

```bash
npm run db:seed
```

## Supabase Setup

1. Crear un proyecto en Supabase.
2. Obtener dos cadenas de conexión:

- Session pooler para DATABASE_URL.
- Direct connection para DIRECT_URL.

3. Ejecutar desde este repo:

```bash
npm install
npm run db:push
```

4. Opcionalmente cargar seed:

```bash
npm run db:seed
```

## Features

- ecommerce storefront público
- panel admin separado
- inventario y stock
- gestión de órdenes
- autenticación admin con JWT y refresh tokens
- merchandising de home
- categorías y publicaciones custom

## Test Users

Usuarios documentados para desarrollo:

- admin@test.com / admin123
- staff@test.com / staff123

Usuarios locales heredados actualmente disponibles en algunas semillas:

- admin / admin

## Security Notes

- .env está ignorado para evitar que secretos terminen versionados.
- Los secretos deben vivir en backend o en el proveedor de despliegue, nunca en el frontend público.
- El frontend sólo debe recibir claves públicas o flags no sensibles.
- La lógica de autorización, estados de órdenes y firma de tokens pertenece al backend porque ahí es donde se puede confiar en el entorno.

## Notas de diseño

- El backend maneja la lógica porque es la única capa donde podés validar permisos, stock y reglas de negocio sin exponer secretos.
- El frontend es público porque su objetivo es renderizar experiencia, no custodiar credenciales ni decisiones críticas.
- El panel admin está separado del storefront para no mezclar dependencias, UX ni costos de carga inicial.

## Future Improvements

- integración real de pagos
- cálculo de envíos
- analytics comercial más profundo
- CRM de clientes y seguimiento postventa
- cupones, promociones y campañas

## Colaboración

Para trabajar en equipo sin romper flujos existentes:

1. Usá siempre npm run dev desde la raíz.
2. Probá npm run build antes de abrir un PR.
3. Mantené secretos fuera del repositorio.
4. Documentá cualquier nueva variable de entorno en este README y en el ejemplo correspondiente.