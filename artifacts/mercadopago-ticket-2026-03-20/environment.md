# Resumen de entorno

Fecha de validación: `2026-03-20`
Zona horaria local: `America/Buenos_Aires`

## Integración

- Producto: `Checkout Pro`
- País: `Argentina (MLA)`
- Dominio público usado para reproducir: `https://duelvault-store-api.vercel.app`
- Webhook configurado en la preferencia:
  `https://duelvault-store-api.vercel.app/api/checkout/webhook?source_news=webhooks`

## Seller test

- User ID: `3280065165`
- Nickname: `TESTUSER3719552300977747255`
- Email: `test_user_3719552300977747255@testuser.com`

## Buyer test usado en la prueba

- Username: `TESTUSER938439403543093719`

## Casos reproducidos

1. Preferencia creada por la tienda:
   `external_reference = 48`
2. Preferencia creada directo en la API:
   `external_reference = manual-test-1774014995914`

## Resultado común

- El checkout abre una pantalla de error de Mercado Pago.
- No se crea ningún `payment`.
- No llega webhook.

