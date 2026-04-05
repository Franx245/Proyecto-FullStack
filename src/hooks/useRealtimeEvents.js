import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ENV } from "@/config/env";
import { useCart } from "@/lib/cartStore";
import { buildCardsInvalidationFilters } from "@/lib/query-client";

/* ── Helpers ── */

function patchCardsPage(old, cardId, cardSnapshot) {
  if (!old || !Array.isArray(old.cards)) return old;

  let changed = false;
  const nextCards = old.cards.map((card) => {
    if (Number(card.id) !== Number(cardId)) return card;
    if (cardSnapshot.updated_at && card.updated_at && new Date(cardSnapshot.updated_at) < new Date(card.updated_at)) return card;
    changed = true;
    return { ...card, ...cardSnapshot };
  });

  return changed ? { ...old, cards: nextCards } : old;
}

function patchCardDetail(old, cardSnapshot) {
  if (!old?.card) return old;
  if (cardSnapshot.updated_at && old.card.updated_at && new Date(cardSnapshot.updated_at) < new Date(old.card.updated_at)) return old;
  return { ...old, card: { ...old.card, ...cardSnapshot } };
}

function getEntityId(value) {
  const normalizedValue = Number(value?.id ?? value?.version_id ?? value?.card_id ?? value?.orderId ?? value?.order_id);
  return Number.isFinite(normalizedValue) ? normalizedValue : null;
}

function isOlderSnapshot(currentValue, nextValue) {
  if (!nextValue?.updated_at || !currentValue?.updated_at) {
    return false;
  }

  return new Date(nextValue.updated_at) < new Date(currentValue.updated_at);
}

function normalizeComparableText(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function parseCardsQueryState(queryKey) {
  if (!Array.isArray(queryKey)) {
    return {};
  }

  const queryState = queryKey[1];
  return queryState && typeof queryState === "object" ? queryState : {};
}

function readCardsServerFilters(queryState = {}) {
  const fallbackFilters = {
    rarities: [],
    cardTypes: [],
    conditions: [],
    sets: [],
    priceRange: null,
  };

  if (typeof queryState.serverFiltersKey === "string" && queryState.serverFiltersKey.trim()) {
    try {
      const parsed = JSON.parse(queryState.serverFiltersKey);
      return {
        rarities: Array.isArray(parsed?.rarities) ? parsed.rarities : [],
        cardTypes: Array.isArray(parsed?.cardTypes) ? parsed.cardTypes : [],
        conditions: Array.isArray(parsed?.conditions) ? parsed.conditions : [],
        sets: Array.isArray(parsed?.sets) ? parsed.sets : [],
        priceRange: parsed?.priceRange && typeof parsed.priceRange === "object"
          ? {
              min: Number(parsed.priceRange.min),
              max: parsed.priceRange.max == null ? null : Number(parsed.priceRange.max),
            }
          : null,
      };
    } catch {
      return fallbackFilters;
    }
  }

  const mainFilter = queryState.mainFilter;
  if (!mainFilter || typeof mainFilter !== "object") {
    return fallbackFilters;
  }

  if (mainFilter.kind === "rarities" && typeof mainFilter.value === "string") {
    return { ...fallbackFilters, rarities: [mainFilter.value] };
  }

  if (mainFilter.kind === "cardTypes" && typeof mainFilter.value === "string") {
    return { ...fallbackFilters, cardTypes: [mainFilter.value] };
  }

  if (mainFilter.kind === "conditions" && typeof mainFilter.value === "string") {
    return { ...fallbackFilters, conditions: [mainFilter.value] };
  }

  if (mainFilter.kind === "sets" && typeof mainFilter.value === "string") {
    return { ...fallbackFilters, sets: [mainFilter.value] };
  }

  if (mainFilter.kind === "priceRange" && mainFilter.value && typeof mainFilter.value === "object") {
    return {
      ...fallbackFilters,
      priceRange: {
        min: Number(mainFilter.value.min),
        max: mainFilter.value.max == null ? null : Number(mainFilter.value.max),
      },
    };
  }

  return fallbackFilters;
}

function matchesCatalogSearch(card, search) {
  const normalizedSearch = normalizeComparableText(search);
  if (!normalizedSearch) {
    return true;
  }

  return [card?.name, card?.card_type, card?.rarity].some((value) => normalizeComparableText(value).includes(normalizedSearch));
}

function matchesCatalogCategory(card, category) {
  const normalizedCategory = normalizeComparableText(category);
  if (!normalizedCategory) {
    return true;
  }

  const cardType = normalizeComparableText(card?.card_type);
  if (normalizedCategory.includes("monster") || normalizedCategory.includes("monstruo")) {
    return cardType.includes("monster");
  }

  if (normalizedCategory.includes("spell") || normalizedCategory.includes("magia")) {
    return cardType.includes("spell");
  }

  if (normalizedCategory.includes("trap") || normalizedCategory.includes("trampa")) {
    return cardType.includes("trap");
  }

  return true;
}

function matchesCatalogConditions(card, conditions = []) {
  if (!Array.isArray(conditions) || conditions.length === 0) {
    return true;
  }

  const normalizedConditions = conditions.map((condition) => normalizeComparableText(condition));
  const wantsOutOfStock = normalizedConditions.includes("out of stock");
  const wantsAvailable = normalizedConditions.some((condition) => condition && condition !== "out of stock");
  const stock = Number(card?.stock || 0);

  if (wantsOutOfStock && wantsAvailable) {
    return true;
  }

  if (wantsOutOfStock) {
    return stock <= 0;
  }

  if (wantsAvailable) {
    return stock > 0;
  }

  return true;
}

function matchesCatalogCardTypes(card, cardTypes = []) {
  if (!Array.isArray(cardTypes) || cardTypes.length === 0) {
    return true;
  }

  const normalizedCardType = normalizeComparableText(card?.card_type);
  return cardTypes.some((cardType) => normalizedCardType.includes(normalizeComparableText(cardType)));
}

function matchesCatalogRarities(card, rarities = []) {
  if (!Array.isArray(rarities) || rarities.length === 0) {
    return true;
  }

  const normalizedRarity = normalizeComparableText(card?.rarity);
  return rarities.some((rarity) => normalizeComparableText(rarity) === normalizedRarity);
}

function matchesCatalogSets(card, sets = []) {
  if (!Array.isArray(sets) || sets.length === 0) {
    return true;
  }

  const normalizedSetName = normalizeComparableText(card?.set_name);
  return sets.some((setName) => normalizeComparableText(setName) === normalizedSetName);
}

function matchesCatalogPriceRange(card, priceRange) {
  if (!priceRange || typeof priceRange !== "object") {
    return true;
  }

  const price = Number(card?.price);
  if (!Number.isFinite(price)) {
    return false;
  }

  if (Number.isFinite(Number(priceRange.min)) && price < Number(priceRange.min)) {
    return false;
  }

  if (priceRange.max != null && Number.isFinite(Number(priceRange.max)) && price > Number(priceRange.max)) {
    return false;
  }

  return true;
}

function matchesCardsQuery(cardSnapshot, queryKey) {
  if (!cardSnapshot) {
    return false;
  }

  if (!Boolean(cardSnapshot.is_visible) || Number(cardSnapshot.stock || 0) <= 0) {
    return false;
  }

  const queryState = parseCardsQueryState(queryKey);
  const serverFilters = readCardsServerFilters(queryState);

  return matchesCatalogSearch(cardSnapshot, queryState.search)
    && matchesCatalogCategory(cardSnapshot, queryState.category)
    && matchesCatalogRarities(cardSnapshot, serverFilters.rarities)
    && matchesCatalogCardTypes(cardSnapshot, serverFilters.cardTypes)
    && matchesCatalogConditions(cardSnapshot, serverFilters.conditions)
    && matchesCatalogSets(cardSnapshot, serverFilters.sets)
    && matchesCatalogPriceRange(cardSnapshot, serverFilters.priceRange);
}

function compareCatalogCards(left, right) {
  const featuredDelta = Number(Boolean(right?.is_featured)) - Number(Boolean(left?.is_featured));
  if (featuredDelta !== 0) {
    return featuredDelta;
  }

  const salesDelta = Number(right?.sales_count || 0) - Number(left?.sales_count || 0);
  if (salesDelta !== 0) {
    return salesDelta;
  }

  const nameDelta = String(left?.name || "").localeCompare(String(right?.name || ""), undefined, { sensitivity: "base" });
  if (nameDelta !== 0) {
    return nameDelta;
  }

  return Number(left?.id || 0) - Number(right?.id || 0);
}

function compareFeaturedCards(left, right) {
  const salesDelta = Number(right?.sales_count || 0) - Number(left?.sales_count || 0);
  if (salesDelta !== 0) {
    return salesDelta;
  }

  return String(left?.name || "").localeCompare(String(right?.name || ""), undefined, { sensitivity: "base" });
}

function patchCardsPageTotals(old, totalRows, pageSize) {
  const nextTotalRows = Math.max(0, totalRows);
  return {
    ...old,
    ...(typeof old.totalRows === "number" ? { totalRows: nextTotalRows } : {}),
    ...(typeof old.total === "number" ? { total: nextTotalRows } : {}),
    ...(typeof old.totalPages === "number" ? { totalPages: Math.ceil(nextTotalRows / pageSize) } : {}),
  };
}

function upsertCardInCardsPage(old, queryKey, cardSnapshot) {
  if (!old || !Array.isArray(old.cards)) {
    return old;
  }

  const normalizedCardId = getEntityId(cardSnapshot);
  if (!Number.isFinite(normalizedCardId)) {
    return old;
  }

  const queryState = parseCardsQueryState(queryKey);
  const page = Math.max(1, Number(queryState.page) || 1);
  const pageSize = Math.max(1, Number(queryState.pageSize) || old.cards.length || 20);
  const existingIndex = old.cards.findIndex((card) => getEntityId(card) === normalizedCardId);
  const currentTotalRows = Number.isFinite(Number(old.totalRows)) ? Number(old.totalRows) : old.cards.length;

  if (existingIndex >= 0) {
    const currentCard = old.cards[existingIndex];
    if (isOlderSnapshot(currentCard, cardSnapshot)) {
      return old;
    }

    const nextCard = { ...currentCard, ...cardSnapshot };
    if (!matchesCardsQuery(nextCard, queryKey)) {
      const nextCards = old.cards.filter((_, index) => index !== existingIndex);
      return patchCardsPageTotals({ ...old, cards: nextCards }, currentTotalRows - 1, pageSize);
    }

    return patchCardsPage(old, normalizedCardId, cardSnapshot);
  }

  if (page !== 1 || !matchesCardsQuery(cardSnapshot, queryKey)) {
    return old;
  }

  const nextCards = [...old.cards, cardSnapshot].sort(compareCatalogCards);
  const insertIndex = nextCards.findIndex((card) => getEntityId(card) === normalizedCardId);
  if (insertIndex < 0 || insertIndex >= pageSize) {
    return old;
  }

  return patchCardsPageTotals({
    ...old,
    cards: nextCards.slice(0, pageSize),
  }, currentTotalRows + 1, pageSize);
}

function patchFeaturedCards(old, entries) {
  if (!Array.isArray(old)) return old;

  let nextCards = old;
  let changed = false;
  const maxItems = old.length || Number.POSITIVE_INFINITY;

  for (const { card } of entries) {
    if (!card) continue;

    const normalizedCardId = getEntityId(card);
    const existingIndex = nextCards.findIndex((featuredCard) => getEntityId(featuredCard) === normalizedCardId);
    const shouldAppear = Boolean(card.is_featured) && Boolean(card.is_visible) && Number(card.stock || 0) > 0;

    if (existingIndex >= 0) {
      const currentCard = nextCards[existingIndex];
      if (isOlderSnapshot(currentCard, card)) {
        continue;
      }

      changed = true;
      if (!shouldAppear) {
        nextCards = nextCards.filter((featuredCard) => getEntityId(featuredCard) !== normalizedCardId);
        continue;
      }

      nextCards = nextCards.map((featuredCard) => (
        getEntityId(featuredCard) === normalizedCardId ? { ...featuredCard, ...card } : featuredCard
      ));
      continue;
    }

    if (!shouldAppear) {
      continue;
    }

    changed = true;
    nextCards = [...nextCards, card].sort(compareFeaturedCards).slice(0, maxItems);
  }

  return changed ? nextCards : old;
}

function syncCardsQueries(queryClient, entries) {
  for (const [queryKey] of queryClient.getQueriesData({ queryKey: ["cards"] })) {
    queryClient.setQueryData(queryKey, (old) => {
      let result = old;
      for (const { card } of entries) {
        if (card) {
          result = upsertCardInCardsPage(result, queryKey, card);
        }
      }
      return result;
    });
  }
}

function invalidateCardDetailQueries(queryClient, cardId) {
  queryClient.invalidateQueries({ queryKey: ["card-detail", cardId] });
  queryClient.invalidateQueries({ queryKey: ["card-detail", String(cardId)] });
  queryClient.invalidateQueries({ queryKey: ["product", cardId] });
  queryClient.invalidateQueries({ queryKey: ["product", String(cardId)] });
}

function invalidateStoreOrderQueries(queryClient) {
  queryClient.invalidateQueries({ queryKey: ["orders"] });
  queryClient.invalidateQueries({ queryKey: ["my-orders"] });
  queryClient.invalidateQueries({ queryKey: ["public-orders"] });
}

function patchStoreOrdersPage(old, orderId, orderSnapshot) {
  if (!old?.orders?.length) {
    return old;
  }

  let changed = false;
  const nextOrders = old.orders.map((order) => {
    if (Number(order.id) !== Number(orderId)) {
      return order;
    }

    if (isOlderSnapshot(order, orderSnapshot)) {
      return order;
    }

    changed = true;
    return { ...order, ...orderSnapshot };
  });

  return changed ? { ...old, orders: nextOrders } : old;
}

function syncStoreOrderQueries(queryClient, orderId, orderSnapshot) {
  for (const prefix of [["orders"], ["my-orders"], ["public-orders"]]) {
    for (const [queryKey] of queryClient.getQueriesData({ queryKey: prefix })) {
      queryClient.setQueryData(queryKey, (old) => patchStoreOrdersPage(old, orderId, orderSnapshot));
    }
  }
}

function buildStoreOrderSnapshot(data) {
  if (!data || typeof data !== "object") {
    return null;
  }

  if (data.order && typeof data.order === "object") {
    return data.order;
  }

  const snapshot = {};
  const nextStatus = data.status ?? data.newStatus ?? data.order_status;
  if (nextStatus !== undefined) {
    snapshot.status = String(nextStatus || "").trim().toLowerCase();
  }

  const shipmentStatus = data.shipment_status ?? data.shipmentStatus ?? data.shippingStatus;
  if (shipmentStatus !== undefined) {
    snapshot.shipment_status = shipmentStatus || null;
    snapshot.shippingStatus = shipmentStatus || null;
  }

  if (Object.prototype.hasOwnProperty.call(data, "carrier")) {
    snapshot.carrier = data.carrier || null;
  }

  const trackingCode = Object.prototype.hasOwnProperty.call(data, "tracking_code")
    ? data.tracking_code
    : data.trackingCode;
  if (trackingCode !== undefined) {
    snapshot.tracking_code = trackingCode || null;
    snapshot.trackingNumber = trackingCode || null;
  }

  const trackingVisibleToUser = Object.prototype.hasOwnProperty.call(data, "tracking_visible_to_user")
    ? data.tracking_visible_to_user
    : data.trackingVisibleToUser;
  if (trackingVisibleToUser !== undefined) {
    snapshot.tracking_visible_to_user = Boolean(trackingVisibleToUser);
    snapshot.trackingVisibleToUser = Boolean(trackingVisibleToUser);
  }

  const paymentStatus = data.payment_status ?? data.paymentStatus;
  if (paymentStatus !== undefined) {
    snapshot.payment_status = paymentStatus || null;
  }

  const paymentStatusDetail = data.payment_status_detail ?? data.paymentStatusDetail;
  if (paymentStatusDetail !== undefined) {
    snapshot.payment_status_detail = paymentStatusDetail || null;
  }

  const updatedAt = data.updated_at ?? data.updatedAt;
  if (updatedAt) {
    snapshot.updated_at = updatedAt;
  }

  return Object.keys(snapshot).length ? snapshot : null;
}

function buildEventStreamUrl(path) {
  return ENV.API_BASE_URL ? `${ENV.API_BASE_URL}${path}` : path;
}

export function useRealtimeEvents(mode = "public") {
  const queryClient = useQueryClient();
  const { patchItemsByCardId } = useCart();
  const connectRef = useRef(() => {});
  const eventSourceRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    clearReconnectTimeout();
    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      connectRef.current();
    }, 5000);
  }, [clearReconnectTimeout]);

  const connect = useCallback(() => {
    if (eventSourceRef.current) return;

    clearReconnectTimeout();

    const path = mode === "admin"
      ? "/api/admin/events/stream"
      : "/api/events/stream";

    const url = buildEventStreamUrl(path);

    try {
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.addEventListener("stock-update", (e) => {
        const { data } = JSON.parse(e.data);
        const entries = data?.bulk
          ? (data.cards || [])
          : data?.cardId ? [{ cardId: data.cardId, card: data.card }] : [];

        if (!entries.length) return;

        const hasSnapshots = entries.some((entry) => entry.card);
        if (hasSnapshots) {
          syncCardsQueries(queryClient, entries);
          queryClient.setQueriesData({ queryKey: ["featured-cards"] }, (old) => patchFeaturedCards(old, entries));

          for (const { cardId, card } of entries) {
            if (!card) continue;
            queryClient.setQueriesData({ queryKey: ["card-detail", cardId] }, (old) => patchCardDetail(old, card));
            queryClient.setQueriesData({ queryKey: ["card-detail", String(cardId)] }, (old) => patchCardDetail(old, card));
            patchItemsByCardId(Number(cardId), { stock: card.stock, price: card.price });
          }
          return;
        }

        const changedCardIds = entries
          .map(({ cardId }) => Number(cardId))
          .filter((cardId) => Number.isFinite(cardId));

        queryClient.invalidateQueries(buildCardsInvalidationFilters({ cardIds: changedCardIds }));
        queryClient.invalidateQueries({ queryKey: ["featured-cards"], type: "active", refetchType: "active" });
        for (const { cardId } of entries) {
          invalidateCardDetailQueries(queryClient, cardId);
        }
      });

      es.addEventListener("price-change", (e) => {
        const { data } = JSON.parse(e.data);
        const entries = data?.bulk
          ? (data.cards || [])
          : data?.cardId ? [{ cardId: data.cardId, card: data.card }] : [];

        if (!entries.length) return;

        const hasSnapshots = entries.some((entry) => entry.card);
        if (hasSnapshots) {
          syncCardsQueries(queryClient, entries);
          queryClient.setQueriesData({ queryKey: ["featured-cards"] }, (old) => patchFeaturedCards(old, entries));

          for (const { cardId, card } of entries) {
            if (!card) continue;
            queryClient.setQueriesData({ queryKey: ["card-detail", cardId] }, (old) => patchCardDetail(old, card));
            queryClient.setQueriesData({ queryKey: ["card-detail", String(cardId)] }, (old) => patchCardDetail(old, card));
            patchItemsByCardId(Number(cardId), { price: card.price });
          }
          return;
        }

        const changedCardIds = entries
          .map(({ cardId }) => Number(cardId))
          .filter((cardId) => Number.isFinite(cardId));

        queryClient.invalidateQueries(buildCardsInvalidationFilters({ cardIds: changedCardIds }));
        queryClient.invalidateQueries({ queryKey: ["featured-cards"], type: "active", refetchType: "active" });
      });

      es.addEventListener("visibility-change", (e) => {
        const { data } = JSON.parse(e.data);
        const entries = data?.bulk
          ? (data.cards || [])
          : data?.cardId ? [{ cardId: data.cardId, card: data.card }] : [];

        if (!entries.length) return;

        const hasSnapshots = entries.some((entry) => entry.card);
        if (hasSnapshots) {
          syncCardsQueries(queryClient, entries);
          queryClient.setQueriesData({ queryKey: ["featured-cards"] }, (old) => patchFeaturedCards(old, entries));

          for (const { cardId, card } of entries) {
            if (!card) continue;
            queryClient.setQueriesData({ queryKey: ["card-detail", cardId] }, (old) => patchCardDetail(old, card));
            queryClient.setQueriesData({ queryKey: ["card-detail", String(cardId)] }, (old) => patchCardDetail(old, card));
            patchItemsByCardId(Number(cardId), {
              stock: card.stock,
              price: card.price,
              isVisible: typeof card.is_visible === "boolean" ? card.is_visible : undefined,
            });
          }
          return;
        }

        const changedCardIds = entries
          .map(({ cardId }) => Number(cardId))
          .filter((cardId) => Number.isFinite(cardId));

        queryClient.invalidateQueries(buildCardsInvalidationFilters({ cardIds: changedCardIds }));
        queryClient.invalidateQueries({ queryKey: ["featured-cards"], type: "active", refetchType: "active" });
        for (const { cardId } of entries) {
          invalidateCardDetailQueries(queryClient, cardId);
        }
      });

      es.addEventListener("catalog-synced", () => {
        queryClient.invalidateQueries({ queryKey: ["cards"], type: "active", refetchType: "active" });
        queryClient.invalidateQueries({ queryKey: ["ygopro-card-sets"], type: "active", refetchType: "active" });
      });

      es.addEventListener("new-order", () => {
        if (mode === "admin") {
          queryClient.invalidateQueries({ queryKey: ["orders"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard"] });
          return;
        }

        invalidateStoreOrderQueries(queryClient);
      });

      const handleOrderUpdate = (e) => {
        if (mode === "admin") {
          queryClient.invalidateQueries({ queryKey: ["orders"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard"] });
          return;
        }

        try {
          const { data } = JSON.parse(e.data);
          const orderId = Number(data?.orderId ?? data?.order_id);
          const orderSnapshot = buildStoreOrderSnapshot(data);

          if (Number.isFinite(orderId) && orderSnapshot) {
            syncStoreOrderQueries(queryClient, orderId, orderSnapshot);
            return;
          }
        } catch {
          // Fall back to invalidation below when payload is incomplete.
        }

        invalidateStoreOrderQueries(queryClient);
      };

      es.addEventListener("order-update", handleOrderUpdate);
      es.addEventListener("order-updated", handleOrderUpdate);

      es.onopen = () => {
        clearReconnectTimeout();
      };

      es.onerror = () => {
        es.close();
        if (eventSourceRef.current === es) {
          eventSourceRef.current = null;
        }
        scheduleReconnect();
      };
    } catch {
      scheduleReconnect();
    }
  }, [queryClient, patchItemsByCardId, mode, clearReconnectTimeout, scheduleReconnect]);

  connectRef.current = connect;

  useEffect(() => {
    connect();

    return () => {
      clearReconnectTimeout();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [connect, clearReconnectTimeout]);
}
