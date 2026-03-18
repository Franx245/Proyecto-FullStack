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
- Panel admin: Vercel o despliegue separado bajo la misma API
- Backend API: Railway o ejecución local con Node.js
- Base de datos: SQLite con Prisma

Flujo general:

1. El storefront en React consulta la API para catálogo, destacados, productos custom y órdenes.
2. El panel admin autentica usuarios con JWT y refresh tokens.
3. El backend Express centraliza validaciones, permisos, stock, estados de órdenes y persistencia.
4. Prisma actúa como capa de acceso a datos y mantiene el esquema.

## Tech Stack

- React
- Node.js
- Express
- Prisma
- SQLite
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
DATABASE_URL=file:./dev.db
JWT_SECRET=replace-with-a-long-random-secret
ACCESS_TOKEN_SECRET=replace-with-a-different-access-secret
REFRESH_TOKEN_SECRET=replace-with-a-different-refresh-secret
MP_ACCESS_TOKEN=
PORT=3001
NODE_ENV=development
```

Qué hace cada variable:

- DATABASE_URL: URL de conexión de Prisma. En este repo el esquema local usa SQLite; para producción conviene externalizarlo si cambias de proveedor o almacenamiento.
- JWT_SECRET: secreto general de JWT. El proyecto lo usa como fallback si no definís secretos separados.
- ACCESS_TOKEN_SECRET: firma de access tokens del admin.
- REFRESH_TOKEN_SECRET: firma de refresh tokens del admin.
- MP_ACCESS_TOKEN: token privado de Mercado Pago para una futura integración de pagos.
- PORT: puerto del backend Express.
- NODE_ENV: ajusta logging y comportamiento de entorno.

Nota importante:

- El backend actual puede correr en local sin secretos explícitos porque tiene defaults de desarrollo para JWT y SQLite embebido.
- En producción no deberías usar esos defaults.

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

Podés desplegar el admin como proyecto separado en Vercel usando frontend-admin como directorio raíz.

Configuración sugerida:

- Root Directory: frontend-admin
- Build Command: npm run build
- Output Directory: dist

Si lo servís detrás del mismo dominio o proxy, asegurate de que /api apunte al backend productivo.

## Backend en Railway

1. Crear un nuevo servicio en Railway y conectar el repositorio.
2. Configurar el start command del backend:

```bash
node backend/server.js
```

3. Configurar las variables del servicio:

- JWT_SECRET
- ACCESS_TOKEN_SECRET
- REFRESH_TOKEN_SECRET
- MP_ACCESS_TOKEN si implementás pagos
- PORT si tu plataforma lo requiere explícitamente

4. Si mantenés SQLite en Railway, necesitás asegurar persistencia del archivo o migrar a un storage adecuado. Para producción real, evaluá mover Prisma a una base persistente administrada.

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