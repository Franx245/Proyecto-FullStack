const BASE_URL = String(process.env.CHECK_BASE_URL || "https://duelvault-store-api.vercel.app").replace(/\/$/, "");
const ITERATIONS = Math.max(1, Number(process.env.CHECK_ITERATIONS || 4));
const PAUSE_MS = Math.max(0, Number(process.env.CHECK_PAUSE_MS || 400));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarizePayload(url, payload) {
  if (url.endsWith("/api/cards/filters")) {
    return {
      rarities: Array.isArray(payload?.filters?.rarities) ? payload.filters.rarities.length : null,
      sets: Array.isArray(payload?.filters?.sets) ? payload.filters.sets.length : null,
    };
  }

  return {
    cards: Array.isArray(payload?.cards) ? payload.cards.length : null,
    total: Number.isFinite(payload?.total) ? payload.total : null,
    totalPages: Number.isFinite(payload?.totalPages) ? payload.totalPages : null,
  };
}

async function hit(url) {
  const startedAt = performance.now();
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  const rawText = await response.text();
  const elapsedMs = Number((performance.now() - startedAt).toFixed(2));
  let payload = null;

  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    payload = null;
  }

  return {
    url,
    status: response.status,
    elapsedMs,
    bytes: rawText.length,
    summary: summarizePayload(url, payload),
  };
}

function buildAggregate(label, entries) {
  const durations = entries.map((entry) => entry.elapsedMs);
  const first = durations[0] ?? null;
  const min = durations.length ? Math.min(...durations) : null;
  const max = durations.length ? Math.max(...durations) : null;
  const average = durations.length
    ? Number((durations.reduce((accumulator, value) => accumulator + value, 0) / durations.length).toFixed(2))
    : null;
  const warmedAverage = durations.length > 1
    ? Number((durations.slice(1).reduce((accumulator, value) => accumulator + value, 0) / (durations.length - 1)).toFixed(2))
    : average;

  return {
    label,
    iterations: durations.length,
    first,
    min,
    max,
    average,
    warmedAverage,
  };
}

async function main() {
  const targets = [
    {
      label: "cards",
      url: `${BASE_URL}/api/cards?page=7&pageSize=17&sort=featured&condition=Near%20Mint`,
    },
    {
      label: "filters",
      url: `${BASE_URL}/api/cards/filters`,
    },
  ];

  const runs = [];

  for (const target of targets) {
    for (let iteration = 1; iteration <= ITERATIONS; iteration += 1) {
      const result = await hit(target.url);
      runs.push({
        label: target.label,
        iteration,
        ...result,
      });

      if (iteration < ITERATIONS && PAUSE_MS > 0) {
        await sleep(PAUSE_MS);
      }
    }
  }

  const aggregates = targets.map((target) => buildAggregate(
    target.label,
    runs.filter((entry) => entry.label === target.label)
  ));

  console.log(JSON.stringify({
    baseUrl: BASE_URL,
    iterations: ITERATIONS,
    pauseMs: PAUSE_MS,
    runs,
    aggregates,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
  }, null, 2));
  process.exitCode = 1;
});