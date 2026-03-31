import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  fetchCurrentUser,
  loginUser,
  logoutUser,
  registerUser,
} from "@/api/store";
import {
  clearStoredUserSession,
  getStoredUserSession,
  getUsableStoredUserSession,
  isJwtExpired,
  setStoredUserSession,
} from "@/lib/userSession";
import { clearTrackedOrderIds } from "@/lib/orderTracking";

/**
 * @typedef {{
 *   id: number,
 *   email?: string | null,
 *   username?: string | null,
 *   full_name?: string | null,
 *   avatar_url?: string | null,
 *   phone?: string | null,
 *   role?: string | null,
 * }} AuthUser
 *
 * @typedef {{
 *   accessToken: string,
 *   refreshToken: string,
 *   user: AuthUser,
 * }} UserSession
 *
 * @typedef {{
 *   session: UserSession | null,
 *   user: AuthUser | null,
 *   isAuthenticated: boolean,
 *   isBootstrapping: boolean,
 *   isAdmin: boolean,
 *   isStaff: boolean,
 *   login: (credentials: Record<string, unknown>) => Promise<UserSession>,
 *   register: (payload: Record<string, unknown>) => Promise<UserSession>,
 *   refreshProfile: () => Promise<AuthUser>,
 *   logout: () => Promise<void>,
 *   setSession: (nextSession: UserSession | null) => void,
 * }} AuthContextValue
 */

/** @type {import("react").Context<AuthContextValue | null>} */
const AuthContext = createContext(/** @type {AuthContextValue | null} */ (null));

/** @type {Promise<UserSession | null> | null} */
let authBootstrapPromise = null;
let authBootstrapToken = "";

function resetBootstrapCache() {
  authBootstrapPromise = null;
  authBootstrapToken = "";
}

/** @param {*} error */
function isSessionExpiredError(error) {
  return Boolean(
    error &&
    typeof error === "object" &&
    (
      error.code === "SESSION_EXPIRED" ||
      error.status === 401 ||
      error.message === "Session expired"
    )
  );
}

async function resolveBootstrappedSession() {
  const storedSession = getUsableStoredUserSession();
  if (!storedSession?.accessToken) {
    resetBootstrapCache();
    return null;
  }

  if (authBootstrapPromise && authBootstrapToken === storedSession.accessToken) {
    return authBootstrapPromise;
  }

  authBootstrapToken = storedSession.accessToken;
  authBootstrapPromise = fetchCurrentUser()
    .then((payload) => ({
      ...storedSession,
      user: payload.user,
    }))
    .catch((error) => {
      resetBootstrapCache();
      throw error;
    });

  return authBootstrapPromise;
}

/** @param {{ children: import("react").ReactNode }} props */
export function AuthProvider({ children }) {
  const [session, setSessionState] = useState(/** @type {UserSession | null} */ (null));
  const [user, setUserState] = useState(/** @type {AuthUser | null} */ (null));
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const storedSession = getUsableStoredUserSession();

      if (!storedSession?.accessToken) {
        if (!cancelled) {
          setSessionState(null);
          setUserState(null);
          setIsBootstrapping(false);
        }
        return;
      }

      if (!cancelled) {
        setSessionState(storedSession);
        setUserState(storedSession.user ?? null);
      }

      try {
        const nextSession = await resolveBootstrappedSession();
        if (cancelled) {
          return;
        }

        if (!nextSession) {
          setSessionState(null);
          setUserState(null);
          return;
        }

        setStoredUserSession(nextSession);
        setSessionState(nextSession);
        setUserState(nextSession.user);
      } catch (error) {
        resetBootstrapCache();
        if (isSessionExpiredError(error)) {
          clearStoredUserSession();
          clearTrackedOrderIds();
          if (!cancelled) {
            setSessionState(null);
            setUserState(null);
          }
          return;
        }

        if (!cancelled) {
          setSessionState(storedSession);
          setUserState(storedSession.user ?? null);
        }
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => ({
    session,
    user,
    isAuthenticated: Boolean(session?.accessToken && user),
    isBootstrapping,
    isAdmin: user?.role === "ADMIN",
    isStaff: user?.role === "STAFF",
    async login(/** @type {Record<string, unknown>} */ credentials) {
      const nextSession = await loginUser(credentials);
      authBootstrapToken = nextSession.accessToken;
      authBootstrapPromise = Promise.resolve(nextSession);
      setSessionState(nextSession);
      setUserState(nextSession.user);
      return nextSession;
    },
    async register(/** @type {Record<string, unknown>} */ payload) {
      const nextSession = await registerUser(payload);
      authBootstrapToken = nextSession.accessToken;
      authBootstrapPromise = Promise.resolve(nextSession);
      setSessionState(nextSession);
      setUserState(nextSession.user);
      return nextSession;
    },
    async refreshProfile() {
      const currentSession = getUsableStoredUserSession();
      if (!currentSession?.accessToken || isJwtExpired(currentSession.refreshToken)) {
        clearStoredUserSession();
        clearTrackedOrderIds();
        setSessionState(null);
        setUserState(null);
        throw new Error("Session expired");
      }

      const payload = await fetchCurrentUser();
      const current = getStoredUserSession();
      const nextSession = current ? { ...current, user: payload.user } : null;
      if (nextSession) {
        setStoredUserSession(nextSession);
        authBootstrapToken = nextSession.accessToken;
        authBootstrapPromise = Promise.resolve(nextSession);
      }
      setSessionState(nextSession);
      setUserState(payload.user);
      return payload.user;
    },
    async logout() {
      await logoutUser();
      resetBootstrapCache();
      clearTrackedOrderIds();
      clearStoredUserSession();
      setSessionState(null);
      setUserState(null);
    },
    setSession(/** @type {UserSession | null} */ nextSession) {
      if (nextSession) {
        setStoredUserSession(nextSession);
        authBootstrapToken = nextSession.accessToken;
        authBootstrapPromise = Promise.resolve(nextSession);
      } else {
        resetBootstrapCache();
        clearStoredUserSession();
      }
      setSessionState(nextSession);
      setUserState(nextSession?.user ?? null);
    },
  }), [isBootstrapping, session, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** @returns {AuthContextValue} */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}