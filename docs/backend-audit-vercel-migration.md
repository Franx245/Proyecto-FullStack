# Auditoría Backend y Plan de Modularización / Migración Railway -> Vercel

## Alcance

Este documento describe el backend real que existe hoy en el repo, los acoplamientos que todavía viven en [backend/server.js](../backend/server.js), el uso actual de Redis, BullMQ y SSE, y una secuencia segura para migrar de Railway a Vercel sin cambiar contratos HTTP ni comportamiento funcional intencional.

Base del análisis:

- [backend/server.js](../backend/server.js)
- [backend/worker.js](../backend/worker.js)
- [backend/config/env.js](../backend/config/env.js)
- [backend/src/lib/cache.js](../backend/src/lib/cache.js)
- [backend/src/lib/cache-invalidation.js](../backend/src/lib/cache-invalidation.js)
- [backend/src/lib/redis.js](../backend/src/lib/redis.js)
- [backend/src/lib/redis-tcp.js](../backend/src/lib/redis-tcp.js)
- [backend/src/lib/requestGuards.js](../backend/src/lib/requestGuards.js)
- [backend/src/lib/sse.js](../backend/src/lib/sse.js)
- [backend/src/lib/events.js](../backend/src/lib/events.js)
- [backend/src/lib/prisma.js](../backend/src/lib/prisma.js)
- [backend/src/lib/jobs/queue.js](../backend/src/lib/jobs/queue.js)
- [backend/src/lib/jobs/worker.js](../backend/src/lib/jobs/worker.js)
- [backend/src/lib/jobs/order-jobs.js](../backend/src/lib/jobs/order-jobs.js)
- [backend/src/lib/services/payment-reconciliation.js](../backend/src/lib/services/payment-reconciliation.js)
- [backend/src/lib/jobs/warm-public-cache.js](../backend/src/lib/jobs/warm-public-cache.js)
- [backend/src/lib/catalogSync.js](../backend/src/lib/catalogSync.js)
- [backend/prisma/schema.prisma](../backend/prisma/schema.prisma)
- [api/[...all].js](../api/%5B...all%5D.js)
- [api/index.js](../api/index.js)
- [vercel.json](../vercel.json)

## Resumen Ejecutivo

La conclusión principal es que este backend no es un monolito puro, pero tampoco está realmente modularizado por dominio. Hoy es un backend híbrido:

- ya existe una adaptación a Vercel, porque [api/[...all].js](../api/%5B...all%5D.js) y [api/index.js](../api/index.js) exportan directamente la app Express de [backend/server.js](../backend/server.js#L79-L84)
- la ejecución Railway sigue existiendo como runtime directo, porque [backend/server.js](../backend/server.js#L11791-L11916) todavía hace app.listen, levanta probes, keepalive, loops y shutdown handlers
- la infraestructura sí fue parcialmente extraída a libs reutilizables: cache, Redis REST, Redis TCP, Prisma, request guards, event bus, worker y parte de pagos
- la orquestación crítica sigue concentrada en [backend/server.js](../backend/server.js), sobre todo en catálogo público, checkout, pagos, shipping y mutaciones admin

La migración a Vercel no empieza desde cero. De hecho, el repo ya está preparado para correr la API como serverless. El problema real no es "hacer que Express corra en Vercel". El problema real es preservar equivalencia operativa cuando hoy todavía dependen de runtime persistente:

- worker BullMQ con Redis TCP
- pub/sub por Redis TCP
- SSE con estado en memoria del proceso
- loops periódicos en proceso
- cron/scheduling no equivalentes entre Railway y Vercel

La ruta segura no es reescribir todo ni mover todo de una vez. La ruta segura es:

1. modularizar por dominio manteniendo las rutas actuales
2. separar claramente runtime Railway vs runtime serverless
3. mantener worker y SSE fuera de Vercel mientras se estabiliza el resto
4. recién después dividir el catch-all actual en funciones por dominio

## Estado Real de la Migración

La migración a Vercel ya empezó y eso cambia el diagnóstico.

Evidencia:

- [api/[...all].js](../api/%5B...all%5D.js) exporta la app de Express sin wrapper adicional
- [api/index.js](../api/index.js) hace lo mismo
- [vercel.json](../vercel.json#L1-L37) define rewrite de /api/* al catch-all y configura funciones con 60 segundos y 1024 MB
- [backend/server.js](../backend/server.js#L82-L88) detecta si fue ejecutado directamente por node
- [backend/server.js](../backend/server.js#L11791-L11916) solo hace bootstrap persistente cuando isDirectExecution es true

Eso significa que hoy ya existe un backend de doble runtime:

- Railway: proceso persistente con app.listen, keepalive, loops y shutdown
- Vercel: función serverless que reutiliza la misma app Express pero no entra al bloque de bootstrap directo

Esto es importante porque varios "bloqueos serverless" no rompen el deploy de Vercel, pero sí desaparecen silenciosamente en ese runtime. El riesgo no es solo que algo falle al arrancar. El riesgo es perder comportamiento operativo sin error explícito.

## Mapa Real del Backend

### 1. Runtime y bootstrap

- [backend/server.js](../backend/server.js#L82-L88) detecta ejecución directa
- [backend/server.js](../backend/server.js#L11791-L11916) hace listen, probes, keepalive, loop de shipping tracking y shutdown
- [backend/config/env.js](../backend/config/env.js#L1-L200) resuelve modos de runtime: cacheMode, workerMode, shippingMode

Responsabilidad real:

- decidir si la app vive como servidor persistente o como serverless handler
- resolver configuración productiva vs dev
- arrancar o no los componentes que requieren proceso vivo

### 2. Catálogo público

- [backend/server.js](../backend/server.js#L6471-L6495) contiene handlePublicCatalogDetail, una función top-level muy grande
- [backend/server.js](../backend/server.js#L6769-L6769) define GET /api/catalog
- [backend/server.js](../backend/server.js#L6827-L6827) define GET /api/catalog/:id
- [backend/src/lib/cache.js](../backend/src/lib/cache.js#L49-L61) define claves y TTLs del catálogo público
- [backend/src/lib/cache-invalidation.js](../backend/src/lib/cache-invalidation.js#L57-L90) invalida páginas de lista afectadas por cardId

Responsabilidad real:

- query pública del catálogo
- armado de payload público
- cacheado de listas, filtros, ranking y detalle
- invalidación selectiva por cambios de stock/precio/visibilidad

### 3. Checkout, órdenes y pagos

- [backend/server.js](../backend/server.js#L7387-L7425) define POST /api/checkout
- [backend/server.js](../backend/server.js#L7713-L7750) define POST /api/payments/create
- [backend/server.js](../backend/server.js#L8264-L8316) procesa webhook de Mercado Pago
- [backend/src/lib/jobs/order-jobs.js](../backend/src/lib/jobs/order-jobs.js#L14-L82) expira órdenes pendientes y restaura stock
- [backend/src/lib/payments/queued-reconciliation.js](../backend/src/lib/payments/queued-reconciliation.js#L1-L59) delega la conciliación en un servicio compartido
- [backend/src/lib/services/payment-reconciliation.js](../backend/src/lib/services/payment-reconciliation.js#L1-L220) ya contiene parte de la lógica de reconciliación extraída

Responsabilidad real:

- creación de órdenes
- pagos directos con Mercado Pago
- reconciliación por webhook o job
- expiración de órdenes pendientes
- side effects posteriores: invalidación, eventos, stock

### 4. Shipping y fulfillment

- [backend/server.js](../backend/server.js#L2295-L2403) concentra la actualización de shipment status
- [backend/server.js](../backend/server.js#L2582-L2622) arranca el loop de shipping tracking
- [backend/server.js](../backend/server.js#L8595-L8668) procesa webhook de Envia
- [backend/server.js](../backend/server.js#L8671-L8705) expone GET /api/internal/shipping/sync

Responsabilidad real:

- normalizar estados externos de envío
- actualizar estado de orden a partir del shipping lifecycle
- procesar webhook de Envia
- correr sincronización periódica de tracking

### 5. Admin / backoffice

- [backend/server.js](../backend/server.js#L8829-L8829) define GET /api/admin/dashboard
- [backend/server.js](../backend/server.js#L10803-L10803) define GET /api/admin/orders
- [backend/server.js](../backend/server.js#L10878-L10878) define PUT /api/admin/orders/:id/status
- [backend/server.js](../backend/server.js#L11056-L11056) define PUT /api/admin/orders/:id/shipping
- [backend/server.js](../backend/server.js#L11254-L11310) define PATCH /api/admin/orders/:id/shipment-status
- [backend/server.js](../backend/server.js#L11578-L11578) define DELETE /api/admin/orders

Responsabilidad real:

- dashboard y métricas admin
- inventario y catálogo admin
- mutaciones de órdenes
- contacto y soporte
- auditoría e idempotencia admin

### 6. Infraestructura extraída

- cache REST: [backend/src/lib/cache.js](../backend/src/lib/cache.js)
- Redis REST: [backend/src/lib/redis.js](../backend/src/lib/redis.js)
- Redis TCP: [backend/src/lib/redis-tcp.js](../backend/src/lib/redis-tcp.js)
- rate limit / validación: [backend/src/lib/requestGuards.js](../backend/src/lib/requestGuards.js)
- SSE: [backend/src/lib/sse.js](../backend/src/lib/sse.js)
- pub/sub: [backend/src/lib/events.js](../backend/src/lib/events.js)
- Prisma runtime: [backend/src/lib/prisma.js](../backend/src/lib/prisma.js)
- queue y worker: [backend/src/lib/jobs/queue.js](../backend/src/lib/jobs/queue.js), [backend/src/lib/jobs/worker.js](../backend/src/lib/jobs/worker.js)

Conclusión del mapa:

- la infraestructura sí está razonablemente extraída
- el problema principal ya no es falta de utilitarios
- el problema principal es que la capa de orquestación sigue adentro de rutas y helpers de [backend/server.js](../backend/server.js)

## Hallazgos Estructurales

### Giant functions y handlers de alto riesgo

Puntos de complejidad más visibles:

- handlePublicCatalogDetail en [backend/server.js](../backend/server.js#L6471-L6767): alrededor de 297 líneas
- POST /api/payments/create en [backend/server.js](../backend/server.js#L7713-L8263): alrededor de 551 líneas de zona de handler
- DELETE /api/admin/orders en [backend/server.js](../backend/server.js#L11578-L11916): alrededor de 339 líneas de zona de handler
- POST /api/checkout en [backend/server.js](../backend/server.js#L7387-L7641): alrededor de 255 líneas de zona de handler
- PUT /api/admin/orders/:id/shipping en [backend/server.js](../backend/server.js#L11056-L11258): alrededor de 203 líneas
- PATCH /api/admin/orders/:id/shipment-status en [backend/server.js](../backend/server.js#L11254-L11455): alrededor de 202 líneas
- PUT /api/admin/orders/:id/status en [backend/server.js](../backend/server.js#L10878-L11055): alrededor de 178 líneas

El problema no es solo el tamaño. El problema es la mezcla de responsabilidades dentro de cada handler:

- validación HTTP
- query/transaction Prisma
- lógica de negocio
- side effects de cache
- side effects de eventos
- side effects de cola
- normalización de errores
- trazas y auditoría

### Acoplamientos incorrectos o demasiado fuertes

- Las rutas administran transición de estados de orden directamente, en vez de delegar a un servicio de dominio común. Eso dispersa la lógica entre checkout, webhook, shipping y jobs.
- El runtime de jobs depende del entorno en tiempo de ejecución. La misma operación puede encolar, ejecutar inline o no procesarse según Redis TCP y workerMode, como muestra [backend/src/lib/jobs/queue.js](../backend/src/lib/jobs/queue.js#L40-L64).
- El event bus y SSE están acoplados por estado de proceso. [backend/src/lib/events.js](../backend/src/lib/events.js#L1-L132) hace pub/sub local o Redis TCP; [backend/src/lib/sse.js](../backend/src/lib/sse.js#L1-L123) mantiene Sets de clientes en memoria.
- El job de warm cache hace HTTP contra la propia API, en vez de reutilizar servicios internos. Ver [backend/src/lib/jobs/warm-public-cache.js](../backend/src/lib/jobs/warm-public-cache.js#L1-L46). Eso agrega overhead y acopla warming con BACKEND_URL.
- La invalidación selectiva de catálogo depende de volver a leer payloads cacheados y escanear keys de lista, ver [backend/src/lib/cache-invalidation.js](../backend/src/lib/cache-invalidation.js#L57-L90). Eso es correcto funcionalmente, pero convierte algunas escrituras en operaciones O(numero de páginas cacheadas).

### Qué es crítico y no conviene tocar sin aislar primero

- lifecycle de orden: checkout, pago, conciliación, expiración, shipping
- catálogo público y su cache/invalidation
- auth + idempotencia + auditoría admin
- webhooks de Mercado Pago y Envia

### Qué es relativamente fácil de separar

- endpoints de contacto como [backend/server.js](../backend/server.js#L6426-L6426)
- jobs cron-friendly como recompute-prices, compute-rankings y warm-cache
- dashboard y lecturas admin
- catalog sync ya bastante encapsulado en [backend/src/lib/catalogSync.js](../backend/src/lib/catalogSync.js)
- conciliación de pagos, porque ya tiene una ruta de extracción parcial en [backend/src/lib/payments/queued-reconciliation.js](../backend/src/lib/payments/queued-reconciliation.js)

## Dominios Reales y Dependencias

Los dominios reales que aparecen en el código y en [backend/prisma/schema.prisma](../backend/prisma/schema.prisma#L10-L207) son:

- catálogo de cartas y versiones
- catálogo custom
- órdenes, pagos y stock
- usuarios, auth, direcciones y refresh tokens
- shipping y fulfillment
- soporte/contacto
- backoffice admin, auditoría e idempotencia
- realtime y observabilidad

Dirección de dependencia que hoy se observa:

- route handler -> Prisma
- route handler -> cache / invalidation
- route handler -> event bus
- route handler -> queue
- route handler -> proveedor externo

Dirección de dependencia recomendada para modularizar sin cambiar contratos:

- routes -> application services
- application services -> repositories / provider adapters
- application services -> side effect ports
- infra adapters -> Prisma / Redis / Mercado Pago / Envia / SSE / BullMQ

Lo que falta en el medio es la capa de application services. Hoy la extracción existe sobre todo en infraestructura, no en negocio.

## Redis: Qué Guarda, Cómo se Usa y Qué Riesgos Tiene

### Redis REST / Upstash

[backend/src/lib/redis.js](../backend/src/lib/redis.js#L1-L70) implementa un singleton serverless-friendly en globalThis. Se usa para:

- cache público
- rate limiting cuando Redis REST está disponible
- invalidación de cache

Claves y TTLs principales según [backend/src/lib/cache.js](../backend/src/lib/cache.js#L49-L61):

- cards:v1... para listas públicas, TTL 120s en prod
- card-detail:v1:stock:<id> para detalle público, TTL 120s en prod
- filters:v1 para filtros, TTL 1h
- rankings:v1 para rankings, TTL 15m
- dashboard:v1 para dashboard, TTL 30s

Además existe memoria local del proceso:

- memory mirror de cache pública en [backend/src/lib/cache.js](../backend/src/lib/cache.js#L1-L48)
- fallbackBuckets de rate limiting en [backend/src/lib/requestGuards.js](../backend/src/lib/requestGuards.js#L1-L55)

Esto no rompe serverless, pero cambia semántica:

- la memoria espejo no es compartida entre instancias
- el fallback de rate limit es por instancia y solo sirve como degradación temporal

### Redis TCP / ioredis

[backend/src/lib/redis-tcp.js](../backend/src/lib/redis-tcp.js#L1-L175) mantiene conexiones dedicadas para:

- BullMQ
- subscriber pub/sub
- publisher pub/sub

Es un segundo rol de Redis completamente distinto al de Upstash REST. Hoy conviven dos modelos:

- Redis REST para cache y rate limit
- Redis TCP para worker y realtime cross-instance

### Riesgos y observaciones

- La escritura de catálogo puede encarecerse por el escaneo selectivo de listas cacheadas.
- El memory mirror es útil como optimización, pero no puede ser una garantía de consistencia en Vercel.
- El fallback open del rate limit en [backend/src/lib/requestGuards.js](../backend/src/lib/requestGuards.js#L95-L117) prioriza disponibilidad sobre enforcement estricto.
- Mientras exista BullMQ y pub/sub por Redis TCP, la arquitectura sigue teniendo un componente no serverless-native.

## Worker, Jobs y Scheduling

### Worker actual

[backend/worker.js](../backend/worker.js#L1-L136) es un proceso aparte que:

- exige Redis TCP configurado
- hace ping a Redis TCP y probe de cache
- levanta el BullMQ worker compartido
- arranca un loop propio para expire-pending-orders cada 5 minutos

[backend/src/lib/jobs/worker.js](../backend/src/lib/jobs/worker.js#L1-L130) registra handlers para:

- expire-pending-orders
- recompute-prices
- compute-rankings
- warm-cache
- process-order-post-checkout
- reconcile-mercadopago-payment
- sync-stock-cache

[backend/src/lib/jobs/queue.js](../backend/src/lib/jobs/queue.js#L40-L64) hace fallback inline cuando no hay Redis TCP y workerMode permite inline. Si workerMode es external y no hay Redis TCP, el job queda sin procesar.

### Estado del scheduling en Vercel

[vercel.json](../vercel.json#L10-L23) ya define crons para:

- /api/internal/orders/expire-pending
- /api/internal/recompute-prices
- /api/internal/compute-rankings
- /api/internal/warm-cache

Pero hay dos desajustes críticos:

- el worker corre expire-pending-orders cada 5 minutos en [backend/worker.js](../backend/worker.js#L17-L18) y [backend/worker.js](../backend/worker.js#L64-L85); Vercel lo agenda solo una vez por día a las 03:00
- existe el endpoint [backend/server.js](../backend/server.js#L8671-L8685) GET /api/internal/shipping/sync, pero no hay cron asociado en [vercel.json](../vercel.json)

Eso significa que la migración operativa ya intentó reemplazar parte del scheduler, pero hoy no es equivalente en frecuencia ni cobertura.

### Clasificación de jobs para migración

Cron-friendly:

- expire-pending-orders, pero con cadencia correcta
- recompute-prices
- compute-rankings
- warm-cache, idealmente sin self-HTTP
- shipping sync

Queue-friendly o de mayor riesgo en serverless puro:

- process-order-post-checkout
- reconcile-mercadopago-payment
- cualquier job que dependa de retries, deduplicación o latencia fuera del request principal

## Riesgos Reales para Vercel

### Lo que ya es compatible hoy

- exportar la app Express directamente desde [api/[...all].js](../api/%5B...all%5D.js)
- Prisma singleton en globalThis en [backend/src/lib/prisma.js](../backend/src/lib/prisma.js#L94-L120)
- Redis REST singleton en globalThis en [backend/src/lib/redis.js](../backend/src/lib/redis.js#L36-L47)
- webhooks HTTP si se conserva el manejo de body tal como está

### Lo que no es serverless-native aunque hoy no rompa el deploy

- app.listen y process.on, porque viven solo en runtime directo, ver [backend/server.js](../backend/server.js#L11791-L11916)
- keepalive DB, porque también vive en runtime directo, ver [backend/src/lib/prisma.js](../backend/src/lib/prisma.js#L216-L264)
- shipping tracking loop, ver [backend/server.js](../backend/server.js#L2582-L2622)
- BullMQ worker dedicado, ver [backend/worker.js](../backend/worker.js#L1-L136)
- SSE con Sets de conexiones en memoria, ver [backend/src/lib/sse.js](../backend/src/lib/sse.js#L1-L123)
- pub/sub por Redis TCP, ver [backend/src/lib/events.js](../backend/src/lib/events.js#L1-L132)

### Riesgos de comportamiento, no solo de infraestructura

- La lógica de expiración de órdenes puede quedar degradada si se reemplaza 5 minutos por una corrida diaria.
- Shipping sync puede desaparecer por completo en Vercel si no existe scheduler equivalente.
- El catch-all actual en [api/[...all].js](../api/%5B...all%5D.js) carga toda la app para cualquier endpoint; eso maximiza cold starts y blast radius.
- Endpoints grandes como checkout, pagos y mutaciones admin quedan más expuestos a timeout o cold-start tax que si estuvieran separados por dominio.
- Webhooks pueden funcionar, pero siguen atravesando una cadena grande de lógica y side effects que hoy no está lo bastante encapsulada.

## Propuesta de Modularización Segura

La modularización correcta no es partir por archivo técnico. Debe partir por responsabilidad real.

Estructura objetivo recomendada:

- backend/src/modules/catalog/public
- backend/src/modules/catalog/admin
- backend/src/modules/orders
- backend/src/modules/payments
- backend/src/modules/shipping
- backend/src/modules/auth
- backend/src/modules/support
- backend/src/modules/admin-dashboard
- backend/src/modules/realtime

Cada módulo debería tener, como mínimo:

- routes adapters o controller functions
- application services
- repository queries sobre Prisma
- serializers / response mappers si hacen falta

Extracciones prioritarias sin cambiar contratos:

- createCheckoutOrder desde POST /api/checkout
- createMercadoPagoPayment desde POST /api/payments/create
- reconcileMercadoPagoPayment como servicio central reutilizado por webhook, job y soporte manual
- updateOrderShippingInfo y updateOrderShipmentStatus desde rutas admin y webhooks
- listPublicCatalog y getPublicCatalogDetail desde catálogo público
- expirePendingOrders como caso de uso compartido entre cron, worker y fallback inline

Regla importante:

- no mover primero las rutas
- mover primero la lógica de negocio a servicios
- dejar las rutas actuales como adaptadores finos hasta que el comportamiento esté estabilizado

## Plan de Migración por Fases

### Fase 0. Aceptar el estado híbrido actual

No asumir que "todavía falta Vercel". Vercel ya está. Lo que falta es alinear comportamiento y reducir acoplamiento.

Objetivo:

- definir Railway y Vercel como runtimes coexistentes del mismo backend
- congelar contratos HTTP actuales

### Fase 1. Reducir server.js sin cambiar topología

Objetivo:

- extraer servicios de dominio manteniendo todas las rutas y payloads actuales

Acciones:

- mover lógica de checkout, pagos, shipping y admin orders a módulos
- centralizar transiciones de estado de orden
- centralizar side effects post-mutación: cache invalidation, publishEvent, enqueueJob, audit log

Salida esperada:

- [backend/server.js](../backend/server.js) pasa a ser composición de middlewares y routes, no contenedor de negocio

### Fase 2. Separar runtime persistente de runtime serverless

Objetivo:

- que la app compartida no cargue decisiones operativas mezcladas con la lógica de negocio

Acciones:

- mantener la app Express compartida para Vercel
- mover bootstrap Railway a una entrada explícita de runtime
- mover worker persistente a su propia entrada ya existente
- dejar claro qué features viven solo en Railway mientras dure la convivencia

Salida esperada:

- app compartida limpia
- entrypoint Railway explícito
- entrypoint Vercel explícito

### Fase 3. Alinear scheduling antes de cualquier corte de tráfico

Objetivo:

- evitar regresiones silenciosas por frecuencia de jobs

Acciones:

- igualar la cadencia de expire-pending-orders con la operativa actual
- agendar shipping sync si shippingMode real depende de esa rutina
- decidir qué jobs quedan en cron y cuáles siguen en worker

Salida esperada:

- equivalencia operativa entre Railway y Vercel en tareas periódicas

### Fase 4. Mantener worker y SSE fuera de Vercel

Objetivo:

- no forzar en serverless lo que hoy depende de proceso persistente

Acciones:

- dejar [backend/worker.js](../backend/worker.js) corriendo en Railway o servicio equivalente
- dejar SSE fuera del runtime Vercel mientras siga basado en Sets en memoria
- mantener Redis TCP solo para worker/pubsub mientras exista esa necesidad

Salida esperada:

- Vercel atiende HTTP compartido
- Railway sostiene lo que todavía es process-bound

### Fase 5. Dividir el catch-all en funciones por dominio

Objetivo:

- reducir bundle size, cold start y blast radius

Esto conviene hacerlo después de modularizar, no antes. Mientras todo dependa de [backend/server.js](../backend/server.js), partir el catch-all solo multiplica complejidad.

Partición natural futura:

- api/catalog/*
- api/orders/*
- api/payments/*
- api/webhooks/*
- api/admin/*
- api/internal/*

### Fase 6. Evaluar retiro final de Railway API

Solo después de que se cumplan estas condiciones:

- ningún endpoint crítico dependa de loops en proceso
- worker y retries estén resueltos fuera del API runtime
- SSE tenga reemplazo o siga explícitamente fuera de Vercel
- cron/scheduling tenga paridad real
- checkout y webhooks estén estabilizados en funciones separadas o runtime adecuado

## Cuellos de Botella y Oportunidades Sin Cambiar Comportamiento

- El catch-all actual obliga a cargar toda la app para cualquier endpoint. Eso penaliza cold start y observabilidad por dominio.
- La invalidación selectiva de listas puede crecer linealmente con la cantidad de páginas cacheadas.
- El warm-cache actual usa self-HTTP; conviene que el futuro job llame servicios internos y no la propia API pública.
- La lógica de lifecycle de órdenes está duplicada o dispersa entre checkout, webhook, shipping y jobs. Esa es la mayor fuente potencial de drift funcional.
- [backend/src/lib/prisma.js](../backend/src/lib/prisma.js#L146-L214) ya tiene semaphore, probe cache y retry wrapper. Eso ayuda, pero no reemplaza una separación clara entre casos de uso rápidos y handlers gigantes.

## Prioridad Recomendada

Si hubiera que decidir qué hacer primero, el orden correcto es:

1. extraer dominio orders/payments/shipping desde [backend/server.js](../backend/server.js)
2. alinear scheduling real entre Railway y Vercel
3. mantener BullMQ y SSE fuera de Vercel en la transición
4. partir el catch-all en funciones por dominio recién después de estabilizar la lógica

## Conclusión

El backend ya es híbrido y ya tiene una puerta de entrada serverless. La deuda no está en la falta de adaptación a Vercel, sino en que la lógica de negocio más sensible sigue concentrada en [backend/server.js](../backend/server.js), mientras el comportamiento operativo todavía depende de worker, Redis TCP, SSE y loops persistentes.

La migración segura no requiere un rewrite. Requiere convertir el híbrido actual en una arquitectura explícita:

- app compartida para HTTP
- servicios de dominio para la lógica
- runtime persistente separado para lo que Vercel no debe absorber todavía
- cron y queue con equivalencia funcional antes del corte final