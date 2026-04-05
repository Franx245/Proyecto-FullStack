import { QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

import { CATALOG_QUERY_GC_TIME, CATALOG_QUERY_STALE_TIME } from "@/api/store";

const CARDS_CACHE_MAX_AGE = 1000 * 60 * 60 * 6;
const DEFAULT_QUERY_STALE_TIME = 1000 * 60 * 5;
const DEFAULT_QUERY_GC_TIME = 1000 * 60 * 30;
const CARDS_QUERY_GC_TIME = CATALOG_QUERY_GC_TIME;
const QUERY_PERSISTENCE_KEY = "duelvault-react-query-cache-v2";
const VOLATILE_QUERY_KEYS = new Set(["card-detail", "storefront-config"]);
const noopPersister = {
	persistClient: async () => {},
	restoreClient: async () => undefined,
	removeClient: async () => {},
};

/** @param {unknown} previousData */
export function retainPreviousData(previousData) {
	return previousData;
}

/**
 * @typedef {{
 * 	status?: unknown,
 * 	data?: unknown,
 * }} PersistedQueryStateLike
 */

/**
 * @typedef {{
 * 	queryKey?: unknown,
 * 	state?: PersistedQueryStateLike,
 * }} PersistedQueryLike
 */

/** @param {unknown} queryState */
function isRestorableQueryState(queryState) {
	return Boolean(
		queryState
		&& typeof queryState === "object"
		&& "status" in queryState
		&& queryState.status === "success"
	);
}

/**
 * Returns true if a persisted "cards" query looks stale because the server
 * catalog scope changed (e.g. total went from 14k to 396). We compare the
 * `total` / `totalRows` stored in the cached response against a reasonable
 * upper-bound.  If any cached cards page has a total that exceeds the
 * CATALOG_SCOPE_MAX_EXPECTED_TOTAL, we discard ALL cards-family queries so
 * the client fetches fresh data.
 *
 * @param {PersistedQueryLike[]} queries
 */
const CATALOG_SCOPE_MAX_EXPECTED_TOTAL = 2000;
/** @param {PersistedQueryLike[]} queries */
function hasStaleCatalogScope(queries) {
	for (const query of queries) {
		const key = Array.isArray(query?.queryKey) ? query.queryKey[0] : null;
		if (key !== "cards") continue;
		const data = /** @type {Record<string, unknown> | undefined} */ (query?.state?.data);
		const total = Number(data?.total ?? data?.totalRows ?? 0);
		if (total > CATALOG_SCOPE_MAX_EXPECTED_TOTAL) return true;
	}
	return false;
}

/** @param {PersistedQueryLike} query */
function isVolatilePersistedQuery(query) {
	const key = Array.isArray(query?.queryKey) ? query.queryKey[0] : null;
	return typeof key === "string" && VOLATILE_QUERY_KEYS.has(key);
}

/** @param {any} persistedClient */
function sanitizePersistedClient(persistedClient) {
	if (!persistedClient || typeof persistedClient !== "object") {
		return undefined;
	}

	const clientState = persistedClient.clientState;
	if (!clientState || typeof clientState !== "object") {
		return undefined;
	}

	const rawQueries = Array.isArray(clientState.queries) ? clientState.queries : [];
	const validQueries = rawQueries.filter(
		/** @param {PersistedQueryLike} query */
		(query) => isRestorableQueryState(query?.state) && !isVolatilePersistedQuery(query)
	);

	const discardCatalog = hasStaleCatalogScope(validQueries);

	return {
		...persistedClient,
		clientState: {
			...clientState,
			queries: discardCatalog
				? validQueries.filter(/** @param {PersistedQueryLike} query */ (query) => {
					const key = Array.isArray(query?.queryKey) ? query.queryKey[0] : null;
					return key !== "cards" && key !== "featured-cards" && key !== "latest-arrivals";
				})
				: validQueries,
		},
	};
}

/**
 * @param {number} failureCount
 * @param {{ message?: string, status?: number, code?: string } | null | undefined} error
 */
function shouldRetryQuery(failureCount, error) {
	const message = String(error?.message || "");
	const status = Number(error?.status || 0);
	const code = String(error?.code || "");

	if (status === 401 || code === "SESSION_EXPIRED" || /session expired/i.test(message)) {
		return false;
	}

	return failureCount < 1;
}

const sharedQueryDefaults = {
	refetchOnWindowFocus: false,
	refetchOnMount: false,
	placeholderData: retainPreviousData,
	retry: shouldRetryQuery,
};

const cardsQueryDefaults = {
	staleTime: CATALOG_QUERY_STALE_TIME,
	gcTime: CARDS_QUERY_GC_TIME,
	refetchOnWindowFocus: false,
	refetchOnMount: false,
	retry: shouldRetryQuery,
};

/**
 * @typedef {{
 * 	page?: number,
	 * 	pageSize?: number,
 * 	search?: string,
 * 	category?: string,
 * 	mainFilter?: unknown,
 * 	serverFiltersKey?: string,
 * 	version?: string,
 * }} CardsQueryKeyOptions
 */

export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			...sharedQueryDefaults,
			staleTime: DEFAULT_QUERY_STALE_TIME,
			gcTime: DEFAULT_QUERY_GC_TIME,
		},
	},
});

queryClientInstance.setQueryDefaults(["cards"], cardsQueryDefaults);
queryClientInstance.setQueryDefaults(["featured-cards"], cardsQueryDefaults);

/** @param {PersistedQueryLike} query */
function shouldPersistQuery(query) {
	if (!isRestorableQueryState(query?.state)) {
		return false;
	}

	if (!Array.isArray(query.queryKey)) {
		return false;
	}

	if (VOLATILE_QUERY_KEYS.has(query.queryKey[0])) {
		return false;
	}

	if (["ygopro-card-sets"].includes(query.queryKey[0])) {
		return true;
	}

	if (query.queryKey[0] !== "cards") {
		return false;
	}

	return true;
}

/** @param {CardsQueryKeyOptions} [options] */
export function buildCardsQueryKey({ page = 1, pageSize, search = "", category, mainFilter = null, serverFiltersKey = "", version } = {}) {
	const queryState = {
		page,
		...(typeof pageSize === "number" ? { pageSize } : {}),
		search: typeof search === "string" ? search.trim() : "",
		category: typeof category === "string" ? category : "",
		mainFilter,
		...(serverFiltersKey ? { serverFiltersKey } : {}),
		...(version ? { version } : {}),
	};

	return ["cards", queryState];
}

/**
 * @param {import("@tanstack/react-query").Query} query
 * @param {Array<number | string>} cardIds
 */
function queryContainsCardIds(query, cardIds) {
	if (!Array.isArray(cardIds) || !cardIds.length) {
		return true;
	}

	const cards = Array.isArray(query?.state?.data?.cards) ? query.state.data.cards : [];
	if (!cards.length) {
		return true;
	}

	const normalizedCardIds = new Set(
		cardIds
			.map((cardId) => Number(cardId))
			.filter((cardId) => Number.isFinite(cardId))
	);

	if (!normalizedCardIds.size) {
		return true;
	}

	/** @param {{ id?: number | string, version_id?: number | string, card_id?: number | string }} card */
	const matchesCardId = (card) => normalizedCardIds.has(Number(card?.id ?? card?.version_id ?? card?.card_id));

	return cards.some(matchesCardId);
}

	/** @typedef {{ cardId?: number | string | null, cardIds?: Array<number | string | null | undefined> }} CardsInvalidationOptions */

/**
 * @param {CardsInvalidationOptions} [options]
 * @returns {import("@tanstack/react-query").InvalidateQueryFilters}
 */
export function buildCardsInvalidationFilters(options = {}) {
	const candidateCardIds = Array.isArray(options.cardIds)
		? options.cardIds.filter((cardId) => cardId != null)
		: [];

	if (candidateCardIds.length === 0 && options.cardId != null) {
		candidateCardIds.push(options.cardId);
	}

	/** @param {import("@tanstack/react-query").Query} query */
	const predicate = (query) => queryContainsCardIds(query, candidateCardIds);

	return /** @type {import("@tanstack/react-query").InvalidateQueryFilters} */ ({
		queryKey: ["cards"],
		type: "active",
		predicate,
	});
}

export const queryPersister = typeof window !== "undefined"
	? (() => {
			const basePersister = createSyncStoragePersister({
				storage: window.localStorage,
				key: QUERY_PERSISTENCE_KEY,
				deserialize: (cachedValue) => sanitizePersistedClient(JSON.parse(cachedValue)),
			});

			/** @type {(persistedClient: unknown) => Promise<void>} */
			const persistClient = async (persistedClient) => {
				const sanitizedClient = sanitizePersistedClient(persistedClient);
				if (!sanitizedClient) {
					await basePersister.removeClient();
					return;
				}

				await basePersister.persistClient(sanitizedClient);
			};

			return {
				persistClient,
				restoreClient: async () => {
					try {
						const restoredClient = await basePersister.restoreClient();
						const sanitizedClient = sanitizePersistedClient(restoredClient);

						if (!sanitizedClient) {
							await basePersister.removeClient();
							return undefined;
						}

						return sanitizedClient;
					} catch {
						await basePersister.removeClient();
						return undefined;
					}
				},
				removeClient: async () => basePersister.removeClient(),
			};
		})()
	: noopPersister;

export const queryPersistOptions = {
	persister: queryPersister,
	maxAge: CARDS_CACHE_MAX_AGE,
	dehydrateOptions: {
		shouldDehydrateQuery: shouldPersistQuery,
	},
};

/** @param {CardsInvalidationOptions} [options] */
export function refreshCards(options = {}) {
	return queryClientInstance.invalidateQueries(buildCardsInvalidationFilters(options));
}
