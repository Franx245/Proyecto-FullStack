# Runbook Sandbox Mercado Pago

Este runbook resume como validar Checkout Pro con credenciales de prueba sin romper la navegacion de la tienda.

Referencias oficiales:
- https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/integration-test
- https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-settings/redirect-purchase-mode

## Lo que ya esta validado en este repo

- `POST /api/checkout` ahora crea la orden y reserva stock sin redirigir a Mercado Pago.
- `POST /api/payments/create` crea el cargo directo usando token de tarjeta generado en el navegador.
- El webhook de Mercado Pago sigue siendo la unica fuente que cierra la orden como `paid`, `pending_payment`, `failed` o `expired`.
- Las ordenes quedan retomables desde `Mis pedidos` y desde `/checkout/pay/:orderId`.

## Sintoma conocido en sandbox

Durante la prueba con usuarios test puede aparecer alguno de estos comportamientos justo al pagar:

- `ERR_TOO_MANY_REDIRECTS`
- loop en `/challenge/`
- salto a login de Mercado Pago o Mercado Libre
- pantalla `Algo salio mal... No pudimos procesar tu pago`

Cuando pasa eso:
- no se crea un `payment` real en Mercado Pago
- no llega webhook
- la orden queda en `pending_payment`

Eso indica que el corte ocurre dentro del sandbox de Mercado Pago, antes de que la tienda pueda recibir una notificacion.

## Estado de la migracion a Checkout API

- El repo ya tiene implementado el flujo directo de pago y la pantalla tokenizada del storefront.
- El script `scripts/sandbox-checkout-flow.mjs` ya prueba orden + intento de pago directo.
- Si se ejecuta contra `https://duelvault-store-api.vercel.app`, hoy devuelve `404 Cannot POST /api/payments/create`.
  Eso significa que el deployment publico todavia no tiene publicado este backend nuevo.
- Si se ejecuta contra `http://localhost:3001`, el backend arranca pero falla cualquier acceso a Prisma si falta `DATABASE_URL`.
  Eso significa que el entorno local necesita variables de base de datos antes de poder validar el flujo end-to-end.

## Evidencia reproducida el 20 de marzo de 2026

- El seller test configurado en la tienda responde como `user_id 3280065165` y `nickname TESTUSER3719552300977747255`.
- La API de Mercado Pago confirma que la cuenta es `test_user`.
- `POST /api/checkout` en produccion sigue creando orden e `init_point` validos.
- La orden `48` se creo correctamente en `pending_payment` y devolvio `sandbox_init_point`.
- Tambien se creo una preferencia directa contra la API de Mercado Pago con payload reforzado:
  `payer.email`, `statement_descriptor`, `expiration_date_from`, `notification_url` e item detallado.
- Esa preferencia directa fue aceptada por Mercado Pago y devolvio:
  `init_point` y `sandbox_init_point` validos.
- Aun asi, Playwright reprodujo la misma pantalla:
  `Hubo un error accediendo a esta pagina...`
- La falla ocurrio igual usando `sandbox_init_point` y `init_point`.

Conclusion operativa:
- el problema no depende solamente del payload que arma la tienda
- el problema tampoco desaparece creando la preferencia directamente en la API oficial
- hoy el bloqueo sigue estando del lado del entorno sandbox/login/challenge de Mercado Pago

## Protocolo recomendado de prueba

1. Abrir una ventana privada o InPrivate nueva.
2. Usar Chrome o Edge para la prueba.
   Si se usa Brave, desactivar Shields para `mercadopago.com.ar`, `mercadolibre.com` y `sandbox.mercadopago.com.ar`.
3. Asegurar que el navegador permita cookies y redirecciones.
4. No reutilizar una sesion donde ya haya quedado logueado otro usuario de Mercado Pago o Mercado Libre.
5. Iniciar la compra desde la tienda o ejecutar `node scripts/sandbox-checkout-flow.mjs`.
6. Si se usa script local, definir `CHECKOUT_BASE_URL=http://localhost:3001` y asegurar `DATABASE_URL` + credenciales de MP.
7. Si Mercado Pago pide autenticacion, entrar con el comprador de prueba, no con el vendedor.
8. Si el sandbox vuelve a caer en `challenge` o `ERR_TOO_MANY_REDIRECTS`, cerrar esa ventana, limpiar cookies de Mercado Pago/Mercado Libre y repetir la prueba en una ventana privada nueva.

## Comprobaciones despues de una prueba

Si el pago no termino:
- revisar `GET /api/orders?ids=<orderId>`
- esperar estado `pending_payment` sin `payment_id`
- confirmar que no hubo `payment` en Mercado Pago para ese `external_reference`

Si el pago termino bien:
- verificar que la orden salga de `pending_payment`
- confirmar `payment_id`
- confirmar `payment_status`
- validar la llegada del webhook en produccion

## Nota para esta tienda

Cuando el `init_point` apunta a `sandbox.mercadopago.com.ar`, el storefront ahora abre Mercado Pago en una pestana aparte y deja al usuario en `Mis pedidos`. Esto evita perder contexto si el sandbox entra en loop y permite reintentar el pago sin rehacer el carrito.
