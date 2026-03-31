# Runbook DB Mercado Pago

Este runbook prepara la base de datos de producción antes de aplicar el schema nuevo de Prisma.

Objetivo:
- detectar payment_id duplicados
- limpiar duplicados sin borrar órdenes
- aplicar el schema con Prisma
- validar que la base quedó consistente
- confirmar payment_status_detail para pagos directos y webhook

Contexto de este repo:
- PostgreSQL sobre Supabase
- Prisma sin migraciones, usando db push
- tabla Order con nueva restricción UNIQUE sobre payment_id
- la columna temporal correcta para ordenar antigüedad es "createdAt"

## 0. Confirmar estado actual de la tabla

Si al ejecutar una consulta aparece este error:

- column "payment_id" does not exist

entonces la base todavía está en estado pre-schema para esta integración.

Primero inspeccioná las columnas reales de Order:

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND table_name = 'Order'
ORDER BY ordinal_position;
```

Interpretación:
- si existe payment_id: seguí con el paso 1 normal.
- si no existe payment_id pero sí existe paymentId: la base tiene un campo legacy camelCase y conviene revisarlo antes del db push.
- si no existe ni payment_id ni paymentId: no hay nada para deduplicar todavía y podés pasar directo al paso 3.

Si encontrás un campo legacy paymentId, usá estas consultas equivalentes:

```sql
SELECT "paymentId", COUNT(*)
FROM "Order"
WHERE "paymentId" IS NOT NULL
GROUP BY "paymentId"
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC, "paymentId" ASC;
```

```sql
WITH ranked AS (
  SELECT
    id,
    "paymentId",
    "createdAt",
    ROW_NUMBER() OVER (
      PARTITION BY "paymentId"
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM "Order"
  WHERE "paymentId" IS NOT NULL
)
SELECT id, "paymentId", "createdAt", rn
FROM ranked
WHERE rn > 1
ORDER BY "paymentId" ASC, "createdAt" ASC, id ASC;
```

## 1. Detectar duplicados

Ejecutar en Supabase SQL Editor:

```sql
SELECT payment_id, COUNT(*)
FROM "Order"
WHERE payment_id IS NOT NULL
GROUP BY payment_id
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC, payment_id ASC;
```

Interpretación:
- 0 filas: no hay duplicados y se puede pasar a aplicar el schema.
- 1 o más filas: cada fila indica un payment_id repetido y cuántas órdenes comparten ese valor.

Para inspeccionar qué órdenes concretas quedarían afectadas:

```sql
WITH ranked AS (
  SELECT
    id,
    payment_id,
    "createdAt",
    ROW_NUMBER() OVER (
      PARTITION BY payment_id
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM "Order"
  WHERE payment_id IS NOT NULL
)
SELECT id, payment_id, "createdAt", rn
FROM ranked
WHERE rn > 1
ORDER BY payment_id ASC, "createdAt" ASC, id ASC;
```

Regla de conservación:
- rn = 1 se conserva.
- rn > 1 se limpia.

## 2. Limpieza segura

No borrar órdenes en producción.

Consulta destructiva de referencia, no recomendada para producción:

```sql
DELETE FROM "Order"
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY payment_id
        ORDER BY "createdAt" ASC, id ASC
      ) AS rn
    FROM "Order"
    WHERE payment_id IS NOT NULL
  ) t
  WHERE rn > 1
);
```

Alternativa segura recomendada:

```sql
BEGIN;

WITH ranked AS (
  SELECT
    id,
    payment_id,
    "createdAt",
    ROW_NUMBER() OVER (
      PARTITION BY payment_id
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM "Order"
  WHERE payment_id IS NOT NULL
)
UPDATE "Order" o
SET payment_id = NULL
FROM ranked r
WHERE o.id = r.id
  AND r.rn > 1
RETURNING o.id, r.payment_id AS cleared_payment_id, o."createdAt";

COMMIT;
```

Alternativa manual por ids ya auditados:

```sql
UPDATE "Order"
SET payment_id = NULL
WHERE id IN (duplicate_ids);
```

Tradeoffs:
- DELETE elimina historial y afecta trazabilidad, conciliación y soporte.
- UPDATE a NULL preserva la orden y elimina solo el dato conflictivo.
- PostgreSQL permite múltiples NULL con UNIQUE, por lo que esta limpieza es compatible con el schema nuevo.

## 3. Aplicar schema con Prisma

Desde la raíz del repo:

```bash
npm run db
```

Qué hace:
- ejecuta prisma db push
- agrega columnas nuevas de pago y expiración en Order
- agrega payment_status_detail para conservar el rechazo o estado detallado del provider
- agrega los estados FAILED y EXPIRED al enum OrderStatus
- aplica UNIQUE sobre payment_id

Advertencia crítica:
- si este paso se omite, checkout y órdenes no quedan operativos
- el backend responde error controlado de schema desactualizado hasta que la base sea compatible

## 4. Validación post-push

### 4.1. Verificar columnas requeridas

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND table_name = 'Order'
  AND column_name IN (
    'payment_id',
    'preference_id',
    'currency',
    'exchange_rate',
    'total_ars',
    'payment_status',
    'payment_status_detail',
    'payment_approved_at',
    'expires_at'
  )
ORDER BY column_name;
```

Esperado:
- 9 filas.

### 4.2. Verificar que ya no queden duplicados

```sql
SELECT payment_id, COUNT(*)
FROM "Order"
WHERE payment_id IS NOT NULL
GROUP BY payment_id
HAVING COUNT(*) > 1;
```

Esperado:
- 0 filas.

### 4.3. Verificar enum OrderStatus

```sql
SELECT e.enumlabel
FROM pg_enum e
JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname = 'OrderStatus'
  AND e.enumlabel IN ('FAILED', 'EXPIRED')
ORDER BY e.enumlabel;
```

Esperado:
- EXPIRED
- FAILED

### 4.4. Verificar restricción UNIQUE sobre payment_id

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = current_schema()
  AND tablename = 'Order'
  AND indexdef ILIKE '%payment_id%'
ORDER BY indexname;
```

Esperado:
- 1 fila con un índice único sobre payment_id, por ejemplo Order_payment_id_key.

## 5. Seguridad backend

Después de esta limpieza y del db push:
- el backend tolera payment_id en NULL
- el webhook ignora notificaciones sin payment id
- la idempotencia de checkout sigue apoyada en actor + routeKey + idempotency key
- la detección de duplicados de webhook compara payment_id y payment_status antes de reaplicar efectos

## 6. Secuencia recomendada de producción

1. Ejecutar detección de duplicados.
2. Ejecutar la previsualización con ROW_NUMBER().
3. Limpiar duplicados con UPDATE a NULL dentro de transacción.
4. Ejecutar npm run db.
5. Ejecutar validaciones post-push.
6. Recién después desplegar backend y abrir tráfico.

## 7. Criterio de salida

La base queda lista para producción cuando se cumplan todas estas condiciones:
- sin payment_id duplicados
- UNIQUE(payment_id) aplicada
- columnas nuevas disponibles en Order
- payment_status_detail disponible en Order
- enum OrderStatus con FAILED y EXPIRED
- backend sin error de schema desactualizado