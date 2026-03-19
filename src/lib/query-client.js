import { keepPreviousData, QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

import { CATALOG_QUERY_STALE_TIME } from "@/api/store";

const CARDS_CACHE_MAX_AGE = 1000 * 60 * 60 * 6;
const CARDS_QUERY_GC_TIME = 1000 * 60 * 30;
const noopPersister = {
	persistClient: async () => {},
	restoreClient: async () => undefined,
	removeClient: async () => {},
};

/**
 * @typedef {{
 * 	page?: number,
	 * 	pageSize?: number,
 * 	search?: string,
 * 	category?: string,
 * 	mainFilter?: unknown,
 * 	version?: string,
 * }} CardsQueryKeyOptions
 */

export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: CATALOG_QUERY_STALE_TIME,
			gcTime: CARDS_QUERY_GC_TIME,
			refetchOnWindowFocus: false,
			refetchOnMount: false,
			placeholderData: keepPreviousData,
			retry: 1,
		},
	},
});

/** @param {{ queryKey?: unknown }} query */
function shouldPersistQuery(query) {
	if (!Array.isArray(query.queryKey)) {
		return false;
	}

	return query.queryKey[0] === "cards" || query.queryKey[0] === "ygopro-card-sets";
}

/** @param {CardsQueryKeyOptions} [options] */
export function buildCardsQueryKey({ page = 1, pageSize, search = "", category, mainFilter = null, version } = {}) {
	const queryState = {
		page,
		...(typeof pageSize === "number" ? { pageSize } : {}),
		search: typeof search === "string" ? search.trim() : "",
		category: typeof category === "string" ? category : "",
		mainFilter,
		...(version ? { version } : {}),
	};

	return ["cards", queryState];
}

export const queryPersister = typeof window !== "undefined"
	? createSyncStoragePersister({
			storage: window.localStorage,
			key: "duelvault-react-query-cache",
		})
	: noopPersister;

export const queryPersistOptions = {
	persister: queryPersister,
	maxAge: CARDS_CACHE_MAX_AGE,
	dehydrateOptions: {
		shouldDehydrateQuery: shouldPersistQuery,
	},
};

export function refreshCards() {
	return queryClientInstance.invalidateQueries({ queryKey: ["cards"] });
}