"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  clearSession,
  hydrateSessionFromToken,
  loadSession,
  newerStoredSession,
  saveSession,
  type SessionState,
  type SessionUser
} from "@/lib/auth/session";
import { clearActiveProgram } from "@/lib/storage";
import { clearLaunchCache } from "@/lib/cache/launch-cache";
import { expiresWithin, isTokenExpired, tokenSubject } from "@/lib/auth/jwt";
import { fetchMe, logout as apiLogout, logoutAll as apiLogoutAll, refreshSession as apiRefreshSession } from "@/lib/api/auth";
import { ApiError, REFRESH_WINDOW_S, setSessionBridge } from "@/lib/api/client";
import { KIT_COPY } from "@/lib/kit/copy";
import { failureProps, flushEvents, reportEvent, requestIdOf, startClientEvents } from "@/lib/events/client-events";

// Sessions client contract (auth SPEC §3.1; DESIGN_BOARD §2 client rules 1-6). One token store (session.ts); the HTTP
// client reads the token at send time through the bridge below and refreshes only when needed. Sign-out happens ONLY
// on /auth/refresh 401 session_invalid (or an unreadable store). 503 / 429 / 5xx / timeout / offline keep the session:
// one quick retry within 5 s, then back off. Every sign-out path runs teardown(). Bootstrap does NOT wait for /me
// (instant opens): pages render with the stored identity, which /me then heals.

type ForcedReason = "refresh_session_invalid" | "token_store_unreadable";
/** `?reason=` the auth guard puts on /login after a forced sign-out (login shows the kit's signedOut copy). */
export type SignOutReason = "expired" | null;

type AuthContextValue = {
  session: SessionState | null;
  /** A sign-in (login / sign-up / OAuth). */
  setSession: (session: SessionState | null) => void;
  /** Display-field edits (profile save) — tokens always come from the live session, never a React snapshot. */
  updateUser: (patch: Partial<SessionUser>) => void;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
  signOutReason: SignOutReason;
  isBootstrapping: boolean;
};

const QUICK_RETRY_DEFAULT_S = 2;
const QUICK_RETRY_MAX_S = 5;
const REFRESH_BACKOFF_MS = [30_000, 60_000, 120_000, 300_000];

const AuthContext = createContext<AuthContextValue | null>(null);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSessionState] = useState<SessionState | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [signOutReason, setSignOutReason] = useState<SignOutReason>(null);
  const sessionRef = useRef<SessionState | null>(null);
  const generationRef = useRef(0); // +1 on every sign-in / sign-out, never on a refresh
  const failuresRef = useRef(0);
  const backoffUntilRef = useRef(0);
  const lastRefreshErrorRef = useRef<unknown>(null);

  // Memory first, then persistence: a storage error must never lose a rotated pair (the old refresh token is spent).
  const store = useCallback((next: SessionState) => {
    sessionRef.current = next;
    setSessionState(next);
    try {
      saveSession(next);
    } catch {
      // saveSession already swallows storage errors; belt-and-braces for the cookie write
    }
  }, []);

  const resetRefreshState = () => {
    failuresRef.current = 0;
    backoffUntilRef.current = 0;
    lastRefreshErrorRef.current = null;
  };

  const teardown = useCallback(() => {
    const own = sessionRef.current;
    generationRef.current += 1;
    sessionRef.current = null; // before clear(): mounted queries see no token and stay disabled
    // The shared store (and its active program) may already hold ANOTHER account, signed in from another tab: a
    // stale tab must not wipe it. Absent / corrupt / same-account (`sub`) stores are cleared.
    const stored = loadSession();
    const ownSub = own ? tokenSubject(own.token) : undefined;
    const otherAccount =
      stored.status === "ok" && ownSub !== undefined && tokenSubject(stored.session.token) !== ownSub;
    if (!otherAccount) {
      clearSession();
      clearActiveProgram();
    }
    clearLaunchCache(); // the events queue is deliberately kept (observability §8)
    queryClient.clear();
    setSessionState(null);
    resetRefreshState();
  }, [queryClient]);

  const forceSignOut = useCallback((reason: ForcedReason, error?: unknown) => {
    const props: Record<string, unknown> = { reason };
    if (error instanceof ApiError) {
      props.status = error.status;
      if (error.code) props.code = error.code;
    }
    reportEvent("auth.forced_sign_out", props, requestIdOf(error));
    void flushEvents(sessionRef.current?.token); // captures the last token synchronously, before teardown drops it
    teardown();
    setSignOutReason("expired");
  }, [teardown]);

  // Server-authoritative identity (/auth/me, D-C7): heals a stale/missing session.user.id. Failures keep the session.
  const healIdentity = useCallback(async () => {
    const generation = generationRef.current;
    const start = sessionRef.current;
    if (!start) return;
    try {
      const me = await fetchMe(start.token);
      const current = sessionRef.current;
      if (!current || generationRef.current !== generation) return;
      const base = newerStoredSession(current) ?? current; // never write an older pair over another tab's newer one
      store({
        ...base,
        user: {
          id: me.member_id ?? base.user.id,
          username: me.username ?? base.user.username,
          memberName: me.member_name ?? base.user.memberName,
          globalRole: me.global_role ?? base.user.globalRole
        }
      });
    } catch {
      // Keep the existing session; /me is retried on the next load.
    }
  }, [store]);

  // Another tab of the same account rotated the pair (shared store): adopt it (later `exp`) instead of replaying ours.
  // Returns the adopted session, or null when there is nothing newer.
  const adoptNewerStored = useCallback((from: SessionState): SessionState | null => {
    const newer = newerStoredSession(from);
    if (!newer?.refreshToken) return null;
    sessionRef.current = newer;
    setSessionState(newer);
    return newer;
  }, []);

  const refreshWithPolicy = useCallback(async (): Promise<string> => {
    const current = sessionRef.current;
    if (!current?.refreshToken) {
      if (current) forceSignOut("token_store_unreadable");
      throw new ApiError(KIT_COPY.errors.signedOut, 401);
    }
    let base: SessionState = current;
    let refreshToken: string = current.refreshToken;
    // Adopts another tab's newer pair: returned as-is while it has > 60 s left, else refreshed with ITS refresh token.
    const adoptedToken = (): string | null => {
      const adopted = adoptNewerStored(sessionRef.current ?? base);
      if (!adopted?.refreshToken) return null;
      base = adopted;
      refreshToken = adopted.refreshToken;
      if (expiresWithin(adopted.token, REFRESH_WINDOW_S)) return null;
      resetRefreshState();
      return adopted.token;
    };
    const early = adoptedToken();
    if (early) return early;
    if (Date.now() < backoffUntilRef.current) {
      throw lastRefreshErrorRef.current ?? new ApiError(KIT_COPY.errors.unavailable, 503);
    }
    const generation = generationRef.current;
    for (let attempt = 0; ; attempt += 1) {
      try {
        const res = await apiRefreshSession(refreshToken);
        if (generationRef.current !== generation) throw new ApiError(KIT_COPY.errors.signedOut, 401);
        store(hydrateSessionFromToken({
          ...(sessionRef.current ?? base),
          token: res.token,
          refreshToken: res.refresh_token ?? refreshToken
        }));
        resetRefreshState();
        return res.token;
      } catch (error) {
        if (generationRef.current !== generation) throw error;
        if (error instanceof ApiError && error.status === 401 && error.code === "session_invalid") {
          forceSignOut("refresh_session_invalid", error);
          throw error;
        }
        lastRefreshErrorRef.current = error;
        if (attempt === 0) {
          const retryAfter = error instanceof ApiError ? error.retryAfter : undefined;
          await sleep(Math.min(retryAfter ?? QUICK_RETRY_DEFAULT_S, QUICK_RETRY_MAX_S) * 1000);
          if (generationRef.current !== generation) throw error;
          const adopted = adoptedToken();
          if (adopted) return adopted;
          continue;
        }
        // Once per failure cycle, after the quick retry (the session is kept).
        reportEvent("auth.refresh_failed", failureProps(error, false), requestIdOf(error));
        backoffUntilRef.current =
          Date.now() + REFRESH_BACKOFF_MS[Math.min(failuresRef.current, REFRESH_BACKOFF_MS.length - 1)];
        failuresRef.current += 1;
        throw error;
      }
    }
  }, [adoptNewerStored, forceSignOut, store]);

  // Declared BEFORE the bootstrap effect (effects run in order), so bootstrap's /me already goes through the bridge.
  useEffect(() => {
    setSessionBridge({ getToken: () => sessionRef.current?.token ?? null, refresh: refreshWithPolicy });
    return () => setSessionBridge(null);
  }, [refreshWithPolicy]);

  useEffect(() => {
    const stored = loadSession();
    if (stored.status === "corrupt") {
      forceSignOut("token_store_unreadable");
    } else if (stored.status === "ok") {
      if (isTokenExpired(stored.session.token) && !stored.session.refreshToken) {
        forceSignOut("token_store_unreadable");
      } else {
        // An expired token is kept: the first request refreshes it, so a temporary failure never signs anyone out.
        generationRef.current += 1;
        store(hydrateSessionFromToken(stored.session));
        void healIdentity();
      }
    }
    setIsBootstrapping(false);
  }, [forceSignOut, store, healIdentity]);

  // After bootstrap, so events left by an earlier visit flush with the restored session's Bearer.
  useEffect(() => {
    if (isBootstrapping) return;
    return startClientEvents();
  }, [isBootstrapping]);

  // Back online = the refresh backoff (set while offline) is moot: the next request or Retry refreshes at once.
  useEffect(() => {
    const onOnline = () => {
      backoffUntilRef.current = 0;
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  // A fresh sign-in is taken as issued — never bounced on the device clock (a fast clock would read it as expired).
  const setSession = useCallback((next: SessionState | null) => {
    if (!next) {
      teardown();
      return;
    }
    const hydrated = hydrateSessionFromToken(next);
    const previous = sessionRef.current;
    if (previous?.user.id && hydrated.user.id && previous.user.id !== hydrated.user.id) clearActiveProgram();
    generationRef.current += 1; // a sign-in: in-flight refreshes / /me of an earlier session are discarded
    resetRefreshState();
    store(hydrated);
    setSignOutReason(null);
    void healIdentity();
  }, [teardown, store, healIdentity]);

  const updateUser = useCallback((patch: Partial<SessionUser>) => {
    const current = sessionRef.current;
    if (!current) return;
    const base = newerStoredSession(current) ?? current;
    store({ ...base, user: { ...base.user, ...patch } });
  }, [store]);

  // The user's own sign-out (rule 1): revoke THIS device's session (outcome ignored; fetch is already issued when
  // teardown runs), then the full teardown.
  const signOut = useCallback(async () => {
    const current = sessionRef.current;
    if (current) void apiLogout(current.token, current.refreshToken).catch(() => undefined);
    teardown();
    setSignOutReason(null);
  }, [teardown]);

  // POST /auth/logout-all: every session ends, this one included → teardown on 200. Errors propagate (session kept).
  const signOutEverywhere = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    await apiLogoutAll(current.token);
    teardown();
    setSignOutReason(null);
  }, [teardown]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, setSession, updateUser, signOut, signOutEverywhere, signOutReason, isBootstrapping }),
    [session, setSession, updateUser, signOut, signOutEverywhere, signOutReason, isBootstrapping]
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
