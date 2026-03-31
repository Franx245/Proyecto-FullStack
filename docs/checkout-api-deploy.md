# Runbook Deploy Checkout API

Este runbook deja el deployment listo para el flujo nuevo de pagos directos con Mercado Pago Checkout API.

Objetivo:
- publicar el backend con POST /api/payments/create
- publicar el storefront con el formulario tokenizado de Mercado Pago
- aplicar el schema nuevo de Prisma
- validar CSP, webhooks y expiracion de ordenes

## 1. Antes de desplegar

Confirmar que estos archivos ya estan incluidos en el cambio:

- [backend/server.js](backend/server.js)
- [backend/src/lib/mercadopagoPayments.js](backend/src/lib/mercadopagoPayments.js)
- [backend/prisma/schema.prisma](backend/prisma/schema.prisma)
- [src/pages/OrderPayment.jsx](src/pages/OrderPayment.jsx)
- [src/lib/mercadopago.js](src/lib/mercadopago.js)
- [src/api/store.js](src/api/store.js)
- [vercel.json](vercel.json)

Validar localmente:

```bash
npx prisma generate
npm run lint
npm run build:store
```

## 2. Variables exactas

### Requeridas en Vercel para API + storefront

```env
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
ACCESS_TOKEN_SECRET=...
REFRESH_TOKEN_SECRET=...
JWT_SECRET=...
BACKEND_URL=https://duelvault-store-api.vercel.app
FRONTEND_URL=https://duelvault-store-api.vercel.app
ADMIN_URL=https://duelvault-admin.vercel.app
CRON_SECRET=...
MP_ACCESS_TOKEN=APP_USR-...
MP_WEBHOOK_SECRET=...
VITE_API_BASE_URL=https://duelvault-store-api.vercel.app
VITE_MP_PUBLIC_KEY=APP_USR-...
VITE_APP_ENV=production
VITE_STOREFRONT_URL=https://duelvault-store-api.vercel.app
```

### Recomendadas

```env
NODE_ENV=production
ALLOW_VERCEL_PREVIEWS=true
CORS_ALLOWED_ORIGINS=https://duelvault-store-api.vercel.app,https://duelvault-admin.vercel.app
API_REQUEST_TIMEOUT_MS=15000
CHECKOUT_REQUEST_TIMEOUT_MS=45000
MP_WEBHOOK_TIMEOUT_MS=25000
CHECKOUT_EXPIRATION_MINUTES=30
VITE_API_TIMEOUT=10000
VITE_ENABLE_CART=true
VITE_ENABLE_ORDERS=true
VITE_ENABLE_ANALYTICS=false
```

### Opcionales segun el storefront actual

```env
VITE_CLOUDINARY_CLOUD_NAME=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_ENABLE_SUPABASE_REALTIME=false
VITE_SUPABASE_SCHEMA=public
VITE_SUPABASE_CARDS_TABLE=cards
VITE_AUTH_PROVIDER=base44
VITE_AUTH_DOMAIN=
VITE_AUTH_CLIENT_ID=
VITE_ANALYTICS_ID=
```

## 3. Paso de base de datos

Antes del deploy final, aplicar schema en la base que usa produccion:

```bash
npm run db
```

Con esta migracion, Order necesita al menos:

- payment_id
- payment_status
- payment_status_detail
- preference_id
- currency
- exchange_rate
- total_ars
- payment_approved_at
- expires_at

Si hay riesgo de duplicados historicos en payment_id, seguir antes [docs/mercadopago-db-runbook.md](docs/mercadopago-db-runbook.md).

## 4. Webhook de Mercado Pago

En el panel de Mercado Pago configurar:

- Notification URL: https://duelvault-store-api.vercel.app/api/checkout/webhook
- Secret de firma: el mismo valor cargado en MP_WEBHOOK_SECRET
- Evento: payment

Notas:

- El backend tambien acepta /api/webhook/mercadopago, pero la ruta canonica del repo es /api/checkout/webhook.
- El pago no debe marcar la orden como paid desde POST /api/payments/create. La confirmacion final llega solo por webhook.

## 5. Checklist exacto de deploy

### API y storefront

1. Cargar variables en Vercel.
2. Ejecutar npx prisma generate localmente para validar cliente.
3. Ejecutar npm run lint.
4. Ejecutar npm run build:store.
5. Aplicar npm run db contra la base de produccion.
6. Deployar el repo.
7. Confirmar que la release nueva responde en /api/payments/create.

### Post-deploy tecnico

1. Abrir https://duelvault-store-api.vercel.app y confirmar que no hay errores de CSP del SDK de Mercado Pago en la consola.
2. Confirmar que carga el script https://sdk.mercadopago.com/js/v2.
3. Confirmar que el formulario /checkout/pay/:orderId muestra campos embebidos de tarjeta.
4. Ejecutar una compra sandbox y verificar que POST /api/payments/create ya no devuelve 404.
5. Confirmar que la respuesta del backend incluye:

```json
{
  "order": {
    "status": "pending_payment"
  },
  "payment": {
    "id": "...",
    "status": "approved|pending|rejected",
    "status_detail": "..."
  },
  "webhook_pending": true
}
```

6. Verificar que la orden guarda payment_status_detail.
7. Esperar webhook y confirmar la transicion final de la orden.
8. Verificar que una orden failed sigue siendo reintentable si no vencio.
9. Verificar que una orden expired no permite pago y libera stock.
10. Verificar que un retry no duplica payment_id ni crea orden nueva.

## 6. Verificaciones HTTP exactas

### Endpoint nuevo publicado

```bash
curl -i -X POST https://duelvault-store-api.vercel.app/api/payments/create
```

Esperado despues del deploy:

- no debe responder Cannot POST /api/payments/create
- debe responder 401 o 400 si falta auth/body

### Cron de expiracion

```bash
curl -i https://duelvault-store-api.vercel.app/api/internal/orders/expire-pending \
  -H "Authorization: Bearer $CRON_SECRET"
```

Esperado:

- 200 OK
- ordenes vencidas pasan a expired

## 7. Falla conocida a evitar

Si despues del deploy el frontend carga pero el pago no empieza:

- revisar CSP en [vercel.json](vercel.json)
- revisar que VITE_MP_PUBLIC_KEY exista en el build del storefront
- revisar que MP_ACCESS_TOKEN y MP_WEBHOOK_SECRET existan en el backend
- revisar que BACKEND_URL y FRONTEND_URL apunten a la release correcta
- revisar que la base ya tenga payment_status_detail y el resto del schema

## 8. Resultado del post-deploy check del 2026-03-20

Checks ejecutados sobre https://duelvault-store-api.vercel.app:

- GET / -> 200 OK
- GET /orders -> 200 OK
- GET /checkout/pay/123 -> 200 OK
- POST /api/payments/create sin auth -> 401 Unauthorized
- POST /api/auth/orders autenticado -> 200 OK despues de aplicar payment_status_detail en producción

Interpretacion:

- la SPA publica carga correctamente
- la nueva ruta de pago esta publicada y accesible
- el endpoint nuevo de pagos directos ya existe en produccion
- el backend nuevo esta efectivamente desplegado
- el historial autenticado dejo de fallar despues de sincronizar la base real de producción

Hallazgo residual:

- los headers de seguridad declarados en [vercel.json](vercel.json) no aparecieron en las respuestas estaticas del deploy al momento de este check
- no bloquea acceso ni checkout en esta validacion, pero conviene revisarlo antes de cerrar el hardening de produccion

Nota operativa:

- al usar variables exportadas por Vercel via archivo local, conviene sanear secuencias literales \r\n antes de reutilizarlas para Prisma CLI