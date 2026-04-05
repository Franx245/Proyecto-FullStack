import "../backend/src/lib/load-env.js";
import { PrismaClient } from "@prisma/client";

if (
  process.env.NODE_ENV === "production"
  || process.env.VERCEL === "1"
  || process.env.RAILWAY_ENVIRONMENT === "production"
) {
  console.error("🚨 populate-admin-scope-from-stock NO puede ejecutarse en producción");
  process.exit(1);
}

const API_BASE_URL = String(
  process.env.API_BASE_URL
  || process.env.BACKEND_URL
  || "http://127.0.0.1:3001"
).trim().replace(/\/$/, "");

const ADMIN_IDENTIFIER = String(process.env.ADMIN_IDENTIFIER || "admin@test.com").trim();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "admin123").trim();
const prisma = new PrismaClient();

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} for ${path}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function loginAdmin() {
  const session = await requestJson("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({
      email: ADMIN_IDENTIFIER,
      password: ADMIN_PASSWORD,
    }),
  });

  return {
    accessToken: session.accessToken,
    admin: session.admin,
  };
}

async function fetchAvailableCardIds() {
  const rows = await prisma.card.findMany({
    where: { stock: { gt: 0 } },
    select: { id: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  return {
    ids: rows.map((row) => row.id),
    total: rows.length,
  };
}

async function updateCatalogScope(accessToken, selectedIds) {
  return requestJson("/api/admin/settings/catalog-scope", {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      mode: "SELECTED",
      selected_card_ids: selectedIds,
    }),
  });
}

async function loadCatalogTotals(accessToken) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const [catalog, inventory] = await Promise.all([
    requestJson("/api/catalog?page=1&pageSize=24"),
    requestJson("/api/admin/inventory?page=1&pageSize=24", { headers }),
  ]);

  return {
    publicTotal: Number(catalog.total || 0),
    publicPageCount: Array.isArray(catalog.cards) ? catalog.cards.length : 0,
    inventoryTotal: Number(inventory.total || 0),
    inventoryPageCount: Array.isArray(inventory.cards) ? inventory.cards.length : 0,
  };
}

async function main() {
  try {
    const session = await loginAdmin();
    const available = await fetchAvailableCardIds();
    const scope = await updateCatalogScope(session.accessToken, available.ids);
    const totals = await loadCatalogTotals(session.accessToken);

    console.log(JSON.stringify({
      apiBaseUrl: API_BASE_URL,
      admin: session.admin?.email || null,
      query: 'SELECT id FROM "Card" WHERE stock > 0 ORDER BY name ASC, id ASC',
      selectedCount: available.ids.length,
      availableTotal: available.total,
      scopeSettings: scope.settings || null,
      totals,
    }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    error: error.message,
    status: error.status || null,
    payload: error.payload || null,
  }));
  process.exitCode = 1;
});