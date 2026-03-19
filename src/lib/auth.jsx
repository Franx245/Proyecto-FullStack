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
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSessionState] = useState(/** @type {UserSession | null} */ (getUsableStoredUserSession()));
  const [user, setUserState] = useState(/** @type {AuthUser | null} */ (getUsableStoredUserSession()?.user ?? null));
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

      try {
        const payload = await fetchCurrentUser();
        if (cancelled) {
          return;
        }

        const nextSession = {
          ...storedSession,
          user: payload.user,
        };

        setStoredUserSession(nextSession);
        setSessionState(nextSession);
        setUserState(payload.user);
      } catch {
        clearStoredUserSession();
        clearTrackedOrderIds();
        if (!cancelled) {
          setSessionState(null);
          setUserState(null);
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
    async login(credentials) {
      const nextSession = await loginUser(credentials);
      setSessionState(nextSession);
      setUserState(nextSession.user);
      return nextSession;
    },
    async register(payload) {
      const nextSession = await registerUser(payload);
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
      }
      setSessionState(nextSession);
      setUserState(payload.user);
      return payload.user;
    },
    async logout() {
      await logoutUser();
      clearTrackedOrderIds();
      clearStoredUserSession();
      setSessionState(null);
      setUserState(null);
    },
    setSession(nextSession) {
      if (nextSession) {
        setStoredUserSession(nextSession);
      } else {
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