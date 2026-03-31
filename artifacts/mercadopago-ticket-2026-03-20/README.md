# Paquete de Evidencia Mercado Pago

Fecha de armado: 2026-03-20
Workspace: `C:\Users\franc\OneDrive\Escritorio\MARCOS`
Tienda afectada: `https://duelvault-store-api.vercel.app`

## Contenido

- `ticket-es.md`
  Texto listo para pegar en el ticket de soporte.
- `environment.md`
  Resumen corto del entorno, usuarios y referencias usadas.
- `users-me.json`
  Respuesta cruda de `GET https://api.mercadopago.com/users/me` con el token configurado en la tienda.
- `preference-store-order-48.json`
  Preferencia generada por la tienda para la orden `48`.
- `preference-direct-api.json`
  Preferencia creada directamente contra la API de Mercado Pago con payload reforzado.
- `payments-search-empty.json`
  Búsqueda de pagos por `external_reference` sin resultados para ambos casos.
- `playwright-error-context.md`
  Snapshot textual de Playwright mostrando la pantalla de error de Mercado Pago.

## Hallazgo principal

La falla se reprodujo de dos maneras:

1. Usando la preferencia generada por la tienda.
2. Usando una preferencia creada directamente en la API oficial de Mercado Pago con un payload más completo.

En ambos casos, el navegador terminó en la misma pantalla:

`Hubo un error accediendo a esta pagina...`

Eso indica que el problema no depende solamente del payload que arma la tienda.

## IDs relevantes

- Seller test user: `3280065165`
- Seller nickname: `TESTUSER3719552300977747255`
- Buyer test username usado en la prueba: `TESTUSER938439403543093719`
- Preferencia desde la tienda: `3280065165-1c2aced9-d7e2-4e47-8cf1-861d4e99d6c3`
- Preferencia directa API: `3280065165-5549d5c6-91af-4000-9cb9-c65f5fa87542`
- Orden de tienda usada para reproducir: `48`

