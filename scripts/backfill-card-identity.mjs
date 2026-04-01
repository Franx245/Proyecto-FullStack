/**
 * Backfill card_identity and external_id from ygoproId.
 *
 * Usage:
 *   node scripts/backfill-card-identity.mjs              # dry-run (default)
 *   node scripts/backfill-card-identity.mjs --apply       # apply changes
 */

import { PrismaClient } from "@prisma/client";

const DRY_RUN = !process.argv.includes("--apply");
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL },
  },
});

async function main() {
  console.log(`\n🃏 Backfill card_identity  (${DRY_RUN ? "DRY RUN" : "APPLYING"})\n`);

  if (DRY_RUN) {
    const sample = await prisma.card.findMany({
      where: { cardIdentity: null },
      select: { id: true, name: true, ygoproId: true },
      take: 20,
      orderBy: { id: "asc" },
    });
    const total = await prisma.card.count({ where: { cardIdentity: null } });
    for (const c of sample) {
      console.log(`  [dry] #${c.id} ${c.name} → card_identity=${c.ygoproId}`);
    }
    console.log(`\n✅ ${total} cards would be updated (showing first ${sample.length})\n`);
    return;
  }

  // Bulk update using raw SQL — much faster than 14K individual updates
  const result = await prisma.$executeRaw`
    UPDATE cards
    SET card_identity = CAST(ygopro_id AS TEXT),
        external_id   = CAST(ygopro_id AS TEXT)
    WHERE ygopro_id IS NOT NULL
      AND (card_identity IS NULL OR card_identity != CAST(ygopro_id AS TEXT))
  `;

  console.log(`\n✅ ${result} cards updated via bulk SQL\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
