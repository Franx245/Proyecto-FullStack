import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const columns = await prisma.$queryRawUnsafe(`
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
        'payment_approved_at',
        'expires_at'
      )
    ORDER BY column_name
  `);

  const duplicates = await prisma.$queryRawUnsafe(`
    SELECT payment_id, COUNT(*)::int AS count
    FROM "Order"
    WHERE payment_id IS NOT NULL
    GROUP BY payment_id
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC, payment_id ASC
  `);

  const enums = await prisma.$queryRawUnsafe(`
    SELECT e.enumlabel
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'OrderStatus'
      AND e.enumlabel IN ('FAILED', 'EXPIRED')
    ORDER BY e.enumlabel
  `);

  const uniqueConstraints = await prisma.$queryRawUnsafe(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'Order'
      AND indexdef ILIKE '%payment_id%'
    ORDER BY indexname
  `);

  console.log(JSON.stringify({
    columns,
    duplicateCount: duplicates.length,
    duplicates,
    enums,
    uniqueConstraints,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });