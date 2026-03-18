function buildQuery(params) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  });

  return searchParams.toString();
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }

  return payload;
}

export async function fetchCatalogCards(options = {}) {
  const search = typeof options.search === "string" ? options.search.trim() : "";
  const priceRange = options.priceRange ?? null;
  const query = buildQuery({
    page: options.page ?? 1,
    pageSize: options.pageSize ?? 20,
    q: search,
    category: options.category,
    minPrice: priceRange?.min ?? options.minPrice,
    maxPrice: priceRange?.max ?? options.maxPrice,
    rarities: options.rarities,
    cardTypes: options.cardTypes,
    conditions: options.conditions,
    sets: options.sets,
  });

  const payload = await request(`/api/cards?${query}`);

  return {
    cards: payload.cards ?? [],
    totalPages: payload.totalPages ?? 0,
    totalRows: payload.total ?? 0,
    filters: payload.filters ?? { rarities: [], sets: [] },
  };
}

export async function fetchCardSets() {
  const payload = await request("/api/cards?page=1&pageSize=100");
  return payload.filters?.sets ?? [];
}

export async function fetchFeaturedCards(limit = 5) {
  const payload = await request(`/api/cards?featured=true&page=1&pageSize=${limit}`);
  return payload.cards ?? [];
}

export async function fetchLatestArrivalCards(limit = 5) {
  const payload = await request(`/api/cards?latest=true&page=1&pageSize=${limit}`);
  return payload.cards ?? [];
}

export async function fetchVisibleCustomCategoryTree() {
  const payload = await request("/api/custom/categories/tree");
  return payload.categories ?? [];
}

export async function fetchCustomCategoryByPath(slugPath = "") {
  const query = buildQuery({ slugPath });
  return request(`/api/custom/categories/path?${query}`);
}

export async function fetchCustomProductDetail(slug) {
  return request(`/api/custom/products/${slug}`);
}

export async function fetchCardDetail(id) {
  return request(`/api/cards/${id}`);
}

export async function checkoutCart(payload) {
  return request("/api/checkout", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchOrdersByIds(ids) {
  if (!ids.length) {
    return { orders: [] };
  }

  return request(`/api/orders?ids=${ids.join(",")}`);
}