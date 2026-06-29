"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { clearSession, loadSession, saveSession, type SessionState } from "@/lib/auth/session";
import { clearActiveProgram } from "@/lib/storage";
import { decodeJwtPayload, isTokenExpired, resolveGlobalRole, type DecodedAuthToken } from "@/lib/auth/jwt";
import { refreshSession as apiRefreshSession } from "@/lib/api/auth";
import { setTokenRefreshHandler } from "@/lib/api/client";

type AuthContextValue = {
  session: SessionState | null;
  setSession: (session: SessionState | null) => void;
  signOut: () => Promise<void>;
  isBootstrapping: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<SessionState | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const sessionRef = useRef<SessionState | null>(null);

  const applySession = useCallback((next: SessionState | null) => {
    if (next?.token && isTokenExpired(next.token)) {
      clearSession();
      setSessionState(null);
      sessionRef.current = null;
      return;
    }
    const hydrated = next ? hydrateSessionFromToken(next) : null;
    const currentUserId = sessionRef.current?.user.id;
    const nextUserId = hydrated?.user.id;
    if (!hydrated || (currentUserId && nextUserId && currentUserId !== nextUserId)) {
      clearActiveProgram();
    }
    if (hydrated) {
      saveSession(hydrated);
      setSessionState(hydrated);
      sessionRef.current = hydrated;
    } else {
      clearSession();
      setSessionState(null);
      sessionRef.current = null;
    }
  }, []);

  const performRefresh = useCallback(async (refreshToken: string): Promise<string | null> => {
    try {
      const response = await apiRefreshSession(refreshToken);
      const newSession: SessionState = {
        token: response.token,
        refreshToken: response.refresh_token ?? refreshToken,
        user: sessionRef.current?.user ?? {}
      };
      const hydrated = hydrateSessionFromToken(newSession);
      saveSession(hydrated);
      setSessionState(hydrated);
      sessionRef.current = hydrated;
      return response.token;
    } catch {
      clearSession();
      setSessionState(null);
      sessionRef.current = null;
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const stored = loadSession();
      if (!stored) {
        setIsBootstrapping(false);
        return;
      }

      if (isTokenExpired(stored.token)) {
        if (stored.refreshToken) {
          const newToken = await performRefresh(stored.refreshToken);
          if (cancelled) return;
          if (!newToken) {
            clearSession();
          }
        } else {
          clearSession();
        }
      } else {
        const hydrated = hydrateSessionFromToken(stored);
        setSessionState(hydrated);
        sessionRef.current = hydrated;
        saveSession(hydrated);
      }
      if (!cancelled) {
        setIsBootstrapping(false);
      }
    }

    bootstrap();
    return () => { cancelled = true; };
  }, [performRefresh]);

  useEffect(() => {
    setTokenRefreshHandler(() => {
      const rt = sessionRef.current?.refreshToken;
      if (!rt) return Promise.resolve(null);
      return performRefresh(rt);
    });
    return () => setTokenRefreshHandler(null);
  }, [performRefresh]);

  const setSession = useCallback((next: SessionState | null) => {
    applySession(next);
  }, [applySession]);

  const signOut = useCallback(async () => {
    applySession(null);
  }, [applySession]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, setSession, signOut, isBootstrapping }),
    [session, setSession, signOut, isBootstrapping]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

function hydrateSessionFromToken(session: SessionState): SessionState {
  const decoded = decodeJwtPayload<DecodedAuthToken>(session.token);
  if (!decoded) return session;
  const globalRole = resolveGlobalRole({
    tokenGlobalRole: decoded.global_role,
    tokenRole: decoded.role,
    responseGlobalRole: session.user.globalRole,
    fallback: session.user.globalRole ?? "standard"
  });
  return {
    ...session,
    user: {
      id: decoded.id ?? session.user.id,
      username: decoded.username ?? session.user.username,
      memberName: decoded.member_name ?? session.user.memberName,
      globalRole
    }
  };
}
