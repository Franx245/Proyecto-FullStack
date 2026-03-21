# DuelVault 🃏

DuelVault es una plataforma ecommerce + CRM orientada a la venta de cartas y productos de Yu-Gi-Oh!. El proyecto combina una tienda pública para clientes, un backend con reglas de negocio y un panel administrativo para operar catálogo, inventario, home, órdenes y contenido custom.

## Descripción del proyecto 📝
# DuelVault 🃏

## Descripción del proyecto 📝

El sistema resuelve dos necesidades en una sola base de código:
## Tabla de contenido 📚

- [Descripción del proyecto](#descripción-del-proyecto-📝)
- [Quick Start](#quick-start-🚀)
- [Arquitectura](#arquitectura-🏗️)
- [Tech Stack](#tech-stack-🛠️)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Deployment Guide](#deployment-guide-🚀)
- [Diagramas del stack](#diagramas-del-stack-📊)
- [Próxima actualización: Redis](#notas-sobre-la-próxima-actualización-redis)

## Quick Start 🚀

Rápido para desarrolladores — levantar localmente el storefront, admin y backend:

```bash
npm install
npm run dev
```

URLs típicas al levantar el stack:

- Storefront: http://127.0.0.1:5173
- Admin: http://127.0.0.1:5178
- API: http://127.0.0.1:3001
## Arquitectura 🏗️

## Diagramas del stack 📊

Diagrama simple de la arquitectura actual (alto nivel):

```mermaid
flowchart LR
	SF["Storefront\n(Vite / React)"] -->|API requests| API["Backend API\n(Express, Vercel)"]
	Admin["Admin\n(frontend-admin)"] -->|API requests| API
	API -->|ORM: Prisma| DB["Supabase / Postgres"]
	API -->|webhooks| MP["Mercado Pago"]
	CDN["Vercel CDN"] --> SF
	CDN --> Admin
```

Diagrama objetivo con Redis (próxima actualización):

```mermaid
flowchart LR
	SF["Storefront\n(Vite / React)"] -->|API requests / cache| API["Backend API\n(Express)"]
	Admin -->|API requests| API
	API -->|reads/writes| DB["Supabase / Postgres"]
	API -->|cache reads/writes| Redis["Redis\n(Cache / Session)"]
	API -->|enqueue| Jobs["Background Workers"]
	Jobs -->|expire orders / rebuild cache| Redis
	MP["Mercado Pago"] -->|webhooks| API
	CDN --> SF
```

- Ecommerce: catálogo público, detalle de producto, carrito, pedidos y storefront responsive.
- CRM / operación interna: panel admin con autenticación, gestión de inventario, merchandising, órdenes y publicaciones custom.

La separación entre frontend público y backend permite exponer una experiencia rápida al usuario final sin publicar secretos ni lógica sensible. El panel admin consume la misma API, pero con permisos y tokens de sesión.

## Arquitectura 🏗️

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

## Tech Stack 🛠️

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

## Getting Started local 🚀

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
MP_WEBHOOK_SECRET=
BACKEND_URL=https://tu-api-produccion.com
CRON_SECRET=replace-with-a-long-random-secret
CHECKOUT_EXPIRATION_MINUTES=30
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
- MP_ACCESS_TOKEN: token privado de Mercado Pago usado por Checkout Pro y consulta de pagos.
- MP_WEBHOOK_SECRET: firma secreta del panel de Webhooks de Mercado Pago para validar x-signature.
- BACKEND_URL: URL pública del backend para notification_url y webhooks de Mercado Pago.
- CRON_SECRET: secreto que Vercel envía como Authorization Bearer al cron de expiración.
- CHECKOUT_EXPIRATION_MINUTES: ventana de vigencia de una orden pendiente antes de pasar a EXPIRED y liberar stock.
- PORT: puerto del backend Express.
- NODE_ENV: ajusta logging y comportamiento de entorno.
- FRONTEND_URL: URL pública del storefront en Vercel.
- ADMIN_URL: URL pública del panel admin en Vercel.
- CORS_ALLOWED_ORIGINS: lista separada por comas para orígenes extra.
- ALLOW_VERCEL_PREVIEWS: permite previews de Vercel durante QA.

Nota importante:

- El backend puede correr en local con defaults de JWT, pero ya no debe usar SQLite como base productiva.
- En producción no deberías usar secretos por defecto ni ejecutar seeds automáticamente.

## Cambios de schema obligatorios

La integración de Mercado Pago ahora requiere estos cambios en Order dentro de [backend/prisma/schema.prisma](backend/prisma/schema.prisma):

- payment_id: string nullable y único.
- preference_id: string nullable.
- currency: string.
- exchange_rate: float nullable.
- total_ars: float nullable.
- expires_at: DateTime nullable.
- payment_status: string nullable.
- payment_status_detail: string nullable.
- payment_approved_at: DateTime nullable.

También se agregaron estos estados al enum OrderStatus:

- FAILED
- EXPIRED

## Actualización de base requerida

Tenés que aplicar el schema antes de levantar backend o usar checkout:

```bash
npm run db
```

Sin este paso, el backend va a fallar cuando intente leer o escribir columnas nuevas de órdenes y pagos. El servidor ahora responde un error controlado de schema desactualizado para rutas de órdenes y checkout, pero la integración no funciona hasta correr ese comando.

Para una preparación segura de producción, incluyendo detección y limpieza no destructiva de payment_id duplicados antes del UNIQUE, seguí el runbook en [docs/mercadopago-db-runbook.md](docs/mercadopago-db-runbook.md).

Para el despliegue completo del flujo nuevo de Checkout API directo, variables requeridas, CSP y verificación post-deploy, seguí [docs/checkout-api-deploy.md](docs/checkout-api-deploy.md).

## Expiración automática de órdenes

El backend expira órdenes PENDING_PAYMENT cuando expires_at ya pasó, las marca como EXPIRED y devuelve stock.

- Endpoint interno: GET /api/internal/orders/expire-pending
- Autenticación requerida: Authorization: Bearer ${CRON_SECRET}

En Vercel conviene ejecutar ese endpoint con Cron Jobs. Si tu plan no permite la frecuencia deseada, usá un scheduler externo con el mismo header Bearer.

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

## Deployment Guide 🚀

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

## Estado actual y cambios implementados

Esta base quedó evolucionada en cuatro frentes: storefront, panel admin, backend operacional y despliegue productivo. Abajo se resume qué cambió y por qué existe cada cambio.

### 1. Storefront público: rendimiento, navegación y conversión

- Persistencia de caché con TanStack Query en [src/lib/query-client.js](src/lib/query-client.js).
	Por qué: evita refetches innecesarios, reduce tiempo de carga percibido y permite reutilizar catálogo y filtros entre navegaciones.

- Bootstrap temprano del catálogo en [index.html](index.html) y [src/api/store.js](src/api/store.js).
	Por qué: la primera visita a /singles precalienta la página 1 del catálogo y la primera imagen crítica, reduciendo el tiempo hasta contenido útil.

- Precarga diferida de rutas, drawer del carrito y vistas pesadas en [src/App.jsx](src/App.jsx) y [src/components/marketplace/MarketplaceLayout.jsx](src/components/marketplace/MarketplaceLayout.jsx).
	Por qué: la tienda no necesita descargar toda la aplicación al primer render; se prioriza lo visible y el resto se carga en idle.

- CSS crítico inline y service worker de shell en [vite.config.js](vite.config.js), [src/critical.css](src/critical.css) y [src/main.jsx](src/main.jsx).
	Por qué: mejora el first paint, evita flashes visuales en producción y mantiene una capa de caché controlada para assets del storefront.

- Optimización de imágenes y fallback Cloudinary/YGOPRODeck en [src/lib/cardImage.js](src/lib/cardImage.js), [src/components/marketplace/CardImage.jsx](src/components/marketplace/CardItem.jsx) y [src/components/marketplace/HeroSection.jsx](src/components/marketplace/HeroSection.jsx).
	Por qué: las cartas son el activo visual principal; se necesitaba bajar peso, mejorar nitidez y tolerar fallos del origen remoto.

- Rework del grid, quick add, detalle y navegación desde carrito/pedidos en [src/components/marketplace/CardGrid.jsx](src/components/marketplace/CardItem.jsx), [src/components/marketplace/CardVersionsTable.jsx](src/components/marketplace/CartDrawer.jsx), [src/pages/Cart.jsx](src/pages/Orders.jsx) y [src/pages/Singles.jsx](src/pages/Contact.jsx).
	Por qué: el flujo comercial ahora tiene menos fricción. El usuario puede abrir detalle desde más puntos, agregar rápido al carrito y mantener contexto.

- Footer dinámico con datos reales de soporte en [src/components/marketplace/StoreFooter.jsx](src/components/marketplace/MarketplaceLayout.jsx).
	Por qué: el storefront necesitaba reflejar el canal de contacto configurado por operación, no texto hardcodeado.

### 2. Panel admin: operación real, persistencia y UX de operador

- Dashboard administrativo reescrito en [frontend-admin/src/views/DashboardView.jsx](frontend-admin/src/views/DashboardView.jsx).
	Por qué: el panel dejó de ser solo informativo y pasó a ser un centro de mando con filtros persistidos, alertas operativas y acciones rápidas sobre pedidos.

- Inventario virtualizado, con drawer de detalle, historial, edición masiva y borrado seguro en [frontend-admin/src/views/InventoryView.jsx](frontend-admin/src/views/InventoryView.jsx).
	Por qué: con miles de cartas el listado anterior no escalaba. La virtualización y el guardado diferido reducen costo de render y errores de operador.

- Persistencia del estado de vistas y cache admin en [frontend-admin/src/lib/queryClient.js](frontend-admin/src/App.jsx), [frontend-admin/src/views/OrdersView.jsx](frontend-admin/src/views/UsersView.jsx) y [frontend-admin/src/views/DashboardView.jsx](frontend-admin/src/views/WhatsappSettingsView.jsx).
	Por qué: el operador no debe perder filtros, página o contexto al navegar. También se corrigió un bug productivo donde inventario quedaba atascado en datos persistidos viejos.

- Invalidación de claves viejas de localStorage en [frontend-admin/src/App.jsx](frontend-admin/src/App.jsx) y versionado de caché en [frontend-admin/src/lib/queryClient.js](frontend-admin/src/lib/queryClient.js).
	Por qué: en producción había sesiones con estado obsoleto. Se forzó una limpieza controlada para que el admin cargue páginas y conteos actuales.

- Resolución robusta del backend API desde el admin en [frontend-admin/src/lib/api.js](frontend-admin/src/lib/api.js).
	Por qué: el admin estaba desplegado en dominio separado y, cuando faltaba VITE_API_BASE_URL, intentaba pegarle a rutas relativas que devolvían 404. Ahora resuelve el origen correcto según entorno.

- Observabilidad de interacciones y mutaciones en [frontend-admin/src/lib/observability.js](frontend-admin/src/lib/observability.js).
	Por qué: hace falta trazabilidad para errores de operador, flujos lentos y debugging sin depender solo de consola.

- Confirmaciones modales reutilizables e imágenes admin optimizadas en [frontend-admin/src/views/shared.jsx](frontend-admin/src/views/OrdersView.jsx), [frontend-admin/src/views/UsersView.jsx](frontend-admin/src/views/WhatsappSettingsView.jsx) y [frontend-admin/src/views/HomeMerchandisingView.jsx](frontend-admin/src/views/CustomContentView.jsx).
	Por qué: se eliminaron confirms del navegador, se unificó UX crítica y se mejoró claridad visual en flujos destructivos.

- Reglas de routing para rutas profundas del admin en [frontend-admin/vercel.json](frontend-admin/vercel.json).
	Por qué: Vercel debía devolver index.html en rutas como /inventory, /orders o /users para que el router del admin funcione también con refresh directo.

- Ajustes de build del admin en [frontend-admin/vite.config.js](frontend-admin/vite.config.js) y limpieza de import inútil en [frontend-admin/src/main.jsx](frontend-admin/src/main.jsx).
	Por qué: se mejoró carga inicial, partición de chunks, precarga de vistas críticas y se eliminó un warning/editor error real.

### 3. Backend y capa de datos: seguridad operativa e idempotencia

- Validación de concurrencia optimista, idempotencia y auditoría administrativa documentadas en la memoria de repo y aplicadas en backend/server.js y Prisma.
	Por qué: varias mutaciones críticas podían pisarse entre operadores o reintentarse desde red inestable. Ahora el backend rechaza conflictos con estructura explícita y deja huella auditable.

- Manejo más seguro de sesiones/JWT en [src/lib/userSession.js](src/lib/auth.jsx) y [src/api/store.js](src/api/store.js).
	Por qué: el frontend ya no debe seguir usando tokens expirados; primero valida refresh token útil y limpia sesión si quedó vencida.

- Soporte de consultas de contacto persistidas y administración de respuestas en [src/pages/Contact.jsx](src/api/store.js) y [frontend-admin/src/views/WhatsappSettingsView.jsx](frontend-admin/src/views/WhatsappSettingsView.jsx).
	Por qué: el formulario público dejó de ser solo cosmético. Ahora genera registros reales que operación puede tomar, responder y archivar.

- Base para sincronización de catálogo en [backend/src/lib/catalogSync.js](backend/src/lib/catalogSync.js).
	Por qué: la importación del catálogo necesita una pieza dedicada para crear, actualizar, ocultar o eliminar cartas de forma coherente con pedidos existentes.

- Integración opcional con Supabase realtime en [src/lib/supabase.js](src/hooks/useCardsRealtime.js), [src/config/env.js](src/App.jsx) y dependencias nuevas en [package.json](package.json).
	Por qué: cuando está habilitado, el storefront puede refrescar queries de cartas frente a cambios en la base sin esperar navegación manual.

### 4. Producción y despliegue: estabilidad real en Vercel

- Separación formal entre storefront/API y admin según memoria de repo.
	Por qué: el admin se despliega como proyecto Vercel independiente y la tienda/API como proyecto raíz; esto evita mezclar tiempos de build y configuración.

## Diagramas del stack 📊

Diagrama de la arquitectura actual (alto nivel):

```mermaid
flowchart LR
	Storefront[Storefront (Vite / React)] -->|API requests| API[Backend API (Express, Vercel)]
	Admin[Admin (frontend-admin)] -->|API requests| API
	API -->|ORM: Prisma| DB[(Supabase / Postgres)]
	API -->|Mercado Pago Webhooks| MP[Mercado Pago]
	CDN[(Vercel CDN)] --> Storefront
	CDN --> Admin
	classDef infra fill:#0f172a,color:#e6eefb,stroke:#0b1220;
	class API,DB,MP,CDN infra;
```

Diagrama objetivo con Redis (próxima actualización):

```mermaid
flowchart LR
	Storefront -->|API requests / cache| API
	Admin -->|API requests| API
	API -->|reads/writes| DB[(Supabase / Postgres)]
	API -->|cache reads/writes| Redis[(Redis Cache / Session Store)]
	API -->|enqueue| Jobs[Background Workers]
	Jobs -->|expire orders / rebuild cache| Redis
	MP[Mercado Pago] -->|webhooks| API
	CDN --> Storefront
	classDef infra fill:#07112b,color:#e6eefb,stroke:#07203a;
	class API,DB,Redis,Jobs,MP,CDN infra;
```

## Notas sobre la próxima actualización: Redis

- Objetivos:
	- Añadir caching de respuestas pesadas (catálogo, listas de cards) para reducir latencia y coste de consultas.
	- Usar Redis como session store para sesiones admin (si se decide migrar a server-render o SSR en futuro).
	- Delegar expiración de órdenes y tareas programadas a workers (BullMQ / Bee-Queue) con Redis como broker.

- Cambios necesarios:
	- Añadir cliente Redis en `backend/src/lib/redis.js` y wrapper con TTLs por clave.
	- Introducir capa de cache en puntos calientes: `getPublicCardFilters`, `listPublicCards` y endpoints de catálogo.
	- Modificar `expirePendingOrders` para encolar tareas idempotentes y evitar bloqueos largos en transacciones.
	- Añadir despliegue de worker (proc. separado) o serverless que consuma colas (Vercel + worker provider / render background worker).

- Riesgos y mitigaciones:
	- Invalidez de cache → usar keys versionadas por `catalogVersion` y TTLs conservadores.
	- Consistencia stock/pedido → mantener invalidación de cache inmediata tras `updateOrderStatusWithEffects`.

## Próxima actualización (plan rápido)

1. Añadir dependencia `ioredis` y archivo `backend/src/lib/redis.js` (cliente con reconnect/backoff).
2. Implementar helpers `cacheGet(key)`, `cacheSet(key, value, ttl)`, `cacheDel(key)` y una estrategia de versionado de keys.
3. Cachear resultados de `listPublicCards` y `getPublicCardFilters` con invalidación en `updateOrderStatusWithEffects` y cambios de `card`.
4. Desplegar worker (BullMQ) para `expirePendingOrders` y tareas asíncronas.

---

Si querés, hago el commit con este README actualizado y genero el push al remoto ahora.

- URLs productivas actualmente utilizadas:
	- Storefront/API: https://duelvault-store-api.vercel.app
	- Admin: https://duelvault-admin.vercel.app

- Compatibilidad de login admin desde el storefront en [src/pages/Auth.jsx](src/pages/Auth.jsx).
	Por qué: si la app corre fuera de localhost, el redireccionamiento al admin ya no depende de puertos locales y usa la URL productiva correcta.

- SEO y descubribilidad básica en [public/robots.txt](public/robots.txt) y [public/sitemap.xml](public/sitemap.xml).
	Por qué: la tienda pública necesitaba archivos mínimos para indexación controlada en producción.

### 5. Resumen funcional de los fixes más recientes

- Se corrigió el fallo donde el admin cargaba HTML pero no podía iniciar sesión ni listar cartas en producción.
	Motivo técnico: estaba consumiendo /api relativo desde el dominio del admin, que no expone esos endpoints.

- Se corrigió el caso donde el inventario del admin parecía limitado a 33 cartas.
	Motivo técnico: el backend devolvía el total correcto, pero el navegador conservaba estado persistido viejo; se versionaron y limpiaron claves de cache/localStorage.

- Se dejó el proyecto sin errores activos de editor reportados durante el último ciclo de deploy.
	Motivo técnico: había imports residuales y varios warnings menores que ya no aportaban valor.

## Variables adicionales usadas por la versión actual

Además de las variables mínimas ya listadas, la versión actual puede usar:

```env
VITE_CLOUDINARY_CLOUD_NAME=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_ENABLE_SUPABASE_REALTIME=false
VITE_SUPABASE_SCHEMA=public
VITE_SUPABASE_CARDS_TABLE=cards
```

Qué habilitan:

- VITE_CLOUDINARY_CLOUD_NAME: optimización remota de imágenes de cartas.
- VITE_SUPABASE_URL: endpoint del proyecto Supabase para realtime en frontend.
- VITE_SUPABASE_ANON_KEY: clave pública necesaria para suscripción realtime.
- VITE_ENABLE_SUPABASE_REALTIME: activa o desactiva invalidación reactiva del catálogo.
- VITE_SUPABASE_SCHEMA: schema observado para cambios.
- VITE_SUPABASE_CARDS_TABLE: tabla observada para refresco de cartas.

## Credenciales y entorno de prueba

Usuarios documentados para QA y desarrollo:

- admin@test.com / admin123
- staff@test.com / staff123

Estas cuentas sirven para validar login, panel administrativo y los flujos básicos luego de cada deploy.

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