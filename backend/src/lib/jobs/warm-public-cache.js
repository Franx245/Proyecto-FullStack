import { prisma } from "../prisma.js";

const WARM_PAGE_SIZE = 24;
const TOP_CARD_LIMIT = 12;

function resolveBackendBaseUrl() {
  const explicitBaseUrl = String(process.env.BACKEND_URL || "").trim().replace(/\/$/, "");
  if (explicitBaseUrl) {
    return explicitBaseUrl;
  }

  return `http://127.0.0.1:${Number(process.env.PORT || 3001)}`;
}

async function warmUrl(path) {
  const response = await fetch(`${resolveBackendBaseUrl()}${path}`, {
    headers: {
      "x-cache-warming": "1",
    },
  });

  return {
    path,
    ok: response.ok,
    status: response.status,
  };
}

export async function handleWarmPublicCache() {
  const popularCards = await prisma.card.findMany({
    where: { isVisible: true, stock: { gt: 0 } },
    select: { id: true },
    orderBy: [
      { salesCount: "desc" },
      { updatedAt: "desc" },
    ],
    take: TOP_CARD_LIMIT,
  });

  const warmingTargets = [
    "/api/catalog?page=1&pageSize=24",
    "/api/catalog?featured=true&page=1&pageSize=12",
    "/api/catalog?latest=true&page=1&pageSize=12",
    "/api/catalog/filters",
    ...popularCards.map((card) => `/api/catalog/${card.id}`),
  ];

  const results = await Promise.all(warmingTargets.map((path) => warmUrl(path)));
  const successCount = results.filter((entry) => entry.ok).length;

  return {
    total: results.length,
    successCount,
    warmedPages: WARM_PAGE_SIZE,
  };
}