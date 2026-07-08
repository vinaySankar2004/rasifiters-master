"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { clearSession, loadSession, saveSession, type SessionState } from "@/lib/auth/session";
import { clearActiveProgram } from "@/lib/storage";
import { decodeJwtPayload, isTokenExpired, resolveGlobalRole, type DecodedAuthToken } from "@/lib/auth/jwt";
import { refreshSession as apiRefreshSession, fetchMe } from "@/lib/api/auth";
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

  // Re-derive the member identity from the server. session.user.id (= the member's members.id) is only
  // ever set from the login response and then reused forever; a stock Supabase JWT carries no `id` claim to
  // recover it, so a stale/missing id would stay broken until re-login — breaking workout logging and the
  // Members tab. Calling /auth/me on load makes the id (and role) authoritative and self-healing. Failures
  // are swallowed so a transient network error never wipes a working login.
  const healIdentity = useCallback(async (current: SessionState) => {
    if (!current.token || isTokenExpired(current.token)) return;
    try {
      const me = await fetchMe(current.token);
      // The session may have changed (sign-out, re-login) while /me was in flight — only apply if it hasn't.
      if (sessionRef.current?.token !== current.token) return;
      const merged: SessionState = {
        ...current,
        user: {
          id: me.member_id ?? current.user.id,
          username: me.username ?? current.user.username,
          memberName: me.member_name ?? current.user.memberName,
          globalRole: me.global_role ?? current.user.globalRole
        }
      };
      saveSession(merged);
      setSessionState(merged);
      sessionRef.current = merged;
    } catch {
      // Keep the existing session; /me will be retried on the next load.
    }
  }, []);

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
      void healIdentity(hydrated);
    } else {
      clearSession();
      setSessionState(null);
      sessionRef.current = null;
    }
  }, [healIdentity]);

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
          } else if (sessionRef.current) {
            await healIdentity(sessionRef.current);
          }
        } else {
          clearSession();
        }
      } else {
        const hydrated = hydrateSessionFromToken(stored);
        setSessionState(hydrated);
        sessionRef.current = hydrated;
        saveSession(hydrated);
        if (cancelled) return;
        await healIdentity(hydrated);
      }
      if (!cancelled) {
        setIsBootstrapping(false);
      }
    }

    bootstrap();
    return () => { cancelled = true; };
  }, [performRefresh, healIdentity]);

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
