const SESSION_KEY = "duelvault_user_session";

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
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? /** @type {StoredUserSession} */ (JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** @param {StoredUserSession} session */
export function setStoredUserSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearStoredUserSession() {
  localStorage.removeItem(SESSION_KEY);
}