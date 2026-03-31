const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(url, attempts = 30) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
    } catch {}

    await sleep(500);
  }

  throw new Error(`No responde ${url}`);
}

const health = await waitFor("http://127.0.0.1:3001/api/health");
const featuredResponse = await fetch("http://127.0.0.1:3001/api/cards?featured=true&page=1&pageSize=1");
const featuredPayload = await featuredResponse.json();
const cardId = featuredPayload.cards?.[0]?.id;

if (!cardId) {
  throw new Error("No se obtuvo una carta destacada para probar el detalle");
}

const detailResponse = await fetch(`http://127.0.0.1:3001/api/cards/${cardId}`);
const detailPayload = await detailResponse.json();
const pageResponse = await fetch(`http://127.0.0.1:3000/card/${cardId}`);
const pageHtml = await pageResponse.text();
const invalidResponse = await fetch("http://127.0.0.1:3000/card/abc");
const invalidHtml = await invalidResponse.text();

console.log(JSON.stringify({
  healthStatus: health.status,
  cardId,
  apiCardName: detailPayload.card?.name ?? null,
  apiVersions: Array.isArray(detailPayload.versions) ? detailPayload.versions.length : null,
  detailStatus: pageResponse.status,
  detailContainsName: pageHtml.includes(detailPayload.card?.name ?? ""),
  legacyRedirectPresent: pageHtml.includes("Redirigiendo al storefront actual"),
  invalidStatus: invalidResponse.status,
  invalidContainsNotFound: invalidHtml.includes("Carta no encontrada"),
}, null, 2));