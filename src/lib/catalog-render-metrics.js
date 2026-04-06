/**
 * @param {*} _cardId
 */
export function recordCatalogCardRender(_cardId) {}

/**
 * @param {number} _visibleCardCount
 */
export function markCatalogVisibleCardCount(_visibleCardCount) {}

/**
 * @param {{
 *   phase?: string,
 *   commitDurationMs?: number,
 *   startTime?: number,
 *   commitTime?: number,
 *   visibleCardCount?: number,
 * }} _payload
 */
export function recordCatalogGridCommit(_payload) {}