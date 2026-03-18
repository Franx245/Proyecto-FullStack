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
  setStoredUserSession,
} from "@/lib/userSession";
import { clearTrackedOrderIds } from "@/lib/orderTracking";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSessionState] = useState(() => getStoredUserSession());
  const [user, setUserState] = useState(() => getStoredUserSession()?.user ?? null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const storedSession = getStoredUserSession();

      if (!storedSession?.accessToken) {
        if (!cancelled) {
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

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}