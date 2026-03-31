const SESSION_KEY = "duelvault_user_session";

function getSafeStorage() {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return null;
  }

  return window.localStorage;
}

/** @param {string} value */
function decodeBase64Url(value) {
  if (typeof value !== "string" || !value) {
    return "";
  }

  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  const padded = padding ? normalized.padEnd(normalized.length + (4 - padding), "=") : normalized;

  try {
    return atob(padded);
  } catch {
    return "";
  }
}

/** @param {string} token */
function readJwtPayload(token) {
  if (typeof token !== "string") {
    return null;
  }

  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    return JSON.parse(decodeBase64Url(parts[1]));
  } catch {
    return null;
  }
}

/** @param {string} token */
export function isJwtExpired(token) {
  const payload = readJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") {
    return true;
  }

  return payload.exp * 1000 <= Date.now();
}

/**
 * @typedef {{
 *   id: number,
 *   email?: string | null,
 *   username?: string | null,
 *   full_name?: string | null,
 *   avatar_url?: string | null,
 *   phone?: string | null,
 *   role?: string | null,
 * }} StoredUser
 *
 * @typedef {{
 *   accessToken: string,
 *   refreshToken: string,
 *   user: StoredUser,
 * }} StoredUserSession
 */

/** @returns {StoredUserSession | null} */
export function getStoredUserSession() {
  try {
    const storage = getSafeStorage();
    if (!storage) {
      return null;
    }

    const raw = storage.getItem(SESSION_KEY);
    return raw ? /** @type {StoredUserSession} */ (JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** @param {StoredUserSession} session */
export function setStoredUserSession(session) {
  const storage = getSafeStorage();
  if (!storage) {
    return;
  }

  storage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearStoredUserSession() {
  const storage = getSafeStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(SESSION_KEY);
}

export function getUsableStoredUserSession() {
  const session = getStoredUserSession();
  if (!session?.accessToken || !session?.refreshToken) {
    return null;
  }

  if (isJwtExpired(session.refreshToken)) {
    clearStoredUserSession();
    return null;
  }

  return session;
}