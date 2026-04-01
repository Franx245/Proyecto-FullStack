require("dotenv").config({ path: ".env.local" });
const { PrismaClient } = require("@prisma/client");

// Use the pooler URL with current credentials
const url = process.env.DATABASE_URL || "postgresql://postgres.bqhjgxcilraozoridozd:DuelVault2026@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1";
console.log("Connecting to:", url.substring(0, 40) + "...");

const p = new PrismaClient({
  datasources: { db: { url } },
});

p.$executeRawUnsafe(
  "UPDATE cards SET card_identity = CAST(ygopro_id AS TEXT), external_id = CAST(ygopro_id AS TEXT) WHERE ygopro_id IS NOT NULL AND (card_identity IS NULL OR card_identity != CAST(ygopro_id AS TEXT))"
)
  .then((r) => { console.log("Updated:", r); return p.$disconnect(); })
  .catch((e) => { console.error(e); process.exit(1); });
