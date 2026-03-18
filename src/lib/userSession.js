const SESSION_KEY = "duelvault_user_session";

export function getStoredUserSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredUserSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearStoredUserSession() {
  localStorage.removeItem(SESSION_KEY);
}