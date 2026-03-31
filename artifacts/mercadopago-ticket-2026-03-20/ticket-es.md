Asunto sugerido: Error en Checkout Pro sandbox con test users: "Hubo un error accediendo a esta pagina" antes de crear el pago

Hola,

estamos integrando Checkout Pro para una tienda propia y necesitamos ayuda con un error reproducible en sandbox.

## Resumen del problema

Al abrir el checkout de una preferencia de prueba, Mercado Pago no llega al flujo normal de login/pago y muestra directamente la pantalla:

`Hubo un error accediendo a esta pagina...`

En otras pruebas del mismo entorno también vimos:

- `ERR_TOO_MANY_REDIRECTS`
- loops en `/challenge/`

Lo importante es que el problema ocurre antes de que exista un pago real: no se crea ningún `payment` y no llega webhook.

## Cuenta y aplicación

- Site: `MLA`
- Seller test user id: `3280065165`
- Seller nickname: `TESTUSER3719552300977747255`
- `users/me` confirma `test_user=true`
- `client_id` que devuelve `users/me.test_data.client_id`: `1719385973552315`
- `client_id` que devuelve la preferencia: `3991009768505159`

## Tienda afectada

- Frontend/backend público usado para reproducir: `https://duelvault-store-api.vercel.app`

## Reproducción 1: preferencia generada por la tienda

- Orden interna: `48`
- Preference id: `3280065165-1c2aced9-d7e2-4e47-8cf1-861d4e99d6c3`
- `sandbox_init_point`:
  `https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=3280065165-1c2aced9-d7e2-4e47-8cf1-861d4e99d6c3`

Resultado:

- La preferencia se crea correctamente.
- El navegador termina en la pantalla `Hubo un error accediendo a esta pagina...`
- No se crea `payment`.

## Reproducción 2: preferencia creada directo por API

También probamos crear una preferencia directo contra la API de Mercado Pago, fuera de la tienda, para descartar un problema de nuestro backend.

Preference id:

- `3280065165-5549d5c6-91af-4000-9cb9-c65f5fa87542`

Características del payload usado:

- `payer.email`
- `statement_descriptor`
- `expires=true`
- `expiration_date_from`
- `expiration_date_to`
- `notification_url`
- item detallado con `id`, `title`, `description`, `category_id`

Resultado:

- La API acepta la preferencia.
- `init_point` y `sandbox_init_point` son válidos.
- El navegador vuelve a terminar en `Hubo un error accediendo a esta pagina...`
- Tampoco se crea `payment`.

## Reproducción 3: flujo real desde storefront autenticado

También reproducimos el flujo completo desde la tienda, con una sesión activa de usuario autenticado en el storefront.

Pasos:

- iniciar sesión en la tienda
- entrar a `Historial de pedidos`
- hacer clic en `Continuar pago`

Resultado:

- la tienda crea una nueva preferencia al reintentar el pago
- se abre la ventana popup de Mercado Pago
- Mercado Pago no llega a mostrar el campo de usuario/login
- la popup termina directamente en:
  `Hubo un error accediendo a esta pagina...`
- tampoco se crea `payment`

Datos de esta reproducción:

- Orden interna: `54`
- `init_point` inicial de la orden:
  `https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=3280065165-6f000675-07ff-420d-bbc8-79853c4ccfaf`
- URL final observada en la popup:
  `https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=3280065165-f6fba033-a385-47b1-a714-275a45e16032`

Esta prueba es importante porque descarta que el problema ocurra por falta de sesión activa en el storefront.

## Reproducción 4: preferencia mínima

También probamos una preferencia mínima creada directamente en la API oficial, para descartar que el problema sea causado por un payload inconsistente.

Payload usado:

```json
{
  "items": [
    {
      "title": "Test minimo DuelVault",
      "quantity": 1,
      "unit_price": 100,
      "currency_id": "ARS"
    }
  ]
}
```

Sin:

- `payer`
- `expires`
- `expiration_date_from`
- `expiration_date_to`
- `notification_url`
- `back_urls`
- `category_id`

Preference id:

- `3280065165-5c6dc0b0-579e-428a-b413-26c202be9140`

Resultado:

- la API acepta la preferencia
- `sandbox_init_point` e `init_point` válidos
- el checkout vuelve a caer directamente en:
  `Hubo un error accediendo a esta pagina...`
- no llega siquiera al campo de usuario/login

Esto nos lleva a pensar que el problema no depende del payload de la preferencia.

## Buyer test user usado en la reproducción

- Username: `TESTUSER938439403543093719`

No adjuntamos contraseña por seguridad, pero la prueba se ejecutó con credenciales válidas del buyer test correspondiente.

## Evidencia adjunta

- Respuesta de `users/me`
- Preferencia creada por la tienda
- Preferencia creada directo por API
- Reproducción del flujo autenticado desde storefront `/orders`
- Preferencia mínima sin `payer`, sin `expires`, sin `notification_url`
- Búsqueda de pagos por `external_reference` sin resultados
- Snapshot textual de Playwright con la pantalla de error

## Consulta puntual

¿Podrían revisar por qué una preferencia sandbox válida para este seller test user está redirigiendo a una pantalla de error previa al login/pago, incluso cuando la preferencia se crea directamente con la API oficial e incluso con un payload mínimo (solo `items`)?

También agradeceríamos confirmación sobre cuál es el `client_id` correcto asociado a esta cuenta de prueba, porque vimos:

- `users/me.test_data.client_id = 1719385973552315`
- `preference.client_id = 3991009768505159`

Gracias.
