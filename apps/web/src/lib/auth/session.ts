import {
  decodeJwtPayload,
  resolveGlobalRole,
  tokenExpiresAt,
  tokenSubject,
  type DecodedAuthToken
} from "@/lib/auth/jwt";

export type SessionUser = {
  id?: string;
  username?: string;
  memberName?: string;
  globalRole?: string;
};

export type SessionState = {
  token: string;
  refreshToken?: string;
  user: SessionUser;
};

const STORAGE_KEY = "rasi.fiters.session";
const TOKEN_COOKIE = "rasi.fiters.token";

function setCookie(name: string, value: string) {
  if (typeof window === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax${secure}`;
}

function clearCookie(name: string) {
  if (typeof window === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

/** Never throws: a storage-quota / disabled-storage error must not lose a rotated pair already held in memory. */
export function saveSession(session: SessionState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // quota / disabled storage: the in-memory session (the caller's ref) stays authoritative for this tab
  }
  if (session.token) {
    setCookie(TOKEN_COOKIE, session.token);
  }
}

export type StoredSession = { status: "absent" } | { status: "corrupt" } | { status: "ok"; session: SessionState };

/** "corrupt" = a stored value that is not a usable session (reported as token_store_unreadable). */
export function loadSession(): StoredSession {
  if (typeof window === "undefined") return { status: "absent" };
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return { status: "absent" };
  }
  if (!raw) return { status: "absent" };
  try {
    const parsed = JSON.parse(raw) as Partial<SessionState> | null;
    if (!parsed || typeof parsed.token !== "string" || parsed.token.length === 0) return { status: "corrupt" };
    return {
      status: "ok",
      session: {
        token: parsed.token,
        refreshToken: typeof parsed.refreshToken === "string" && parsed.refreshToken ? parsed.refreshToken : undefined,
        user: parsed.user && typeof parsed.user === "object" ? parsed.user : {}
      }
    };
  } catch {
    return { status: "corrupt" };
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  clearCookie(TOKEN_COOKIE);
}

export function hydrateSessionFromToken(session: SessionState): SessionState {
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

/**
 * Web two-tab idiom (one shared store): another tab of the SAME account (`sub`) may already have rotated the
 * refresh token. Its pair is adopted when its access token expires LATER than `current`'s, however little time
 * it has left — replaying an already-rotated refresh token ends the session for every tab. Else undefined.
 */
export function newerStoredSession(current: SessionState): SessionState | undefined {
  const stored = loadSession();
  if (stored.status !== "ok" || !stored.session.refreshToken) return undefined;
  const sub = tokenSubject(current.token);
  if (sub === undefined || tokenSubject(stored.session.token) !== sub) return undefined;
  const storedExp = tokenExpiresAt(stored.session.token);
  const currentExp = tokenExpiresAt(current.token);
  if (storedExp === undefined || currentExp === undefined || storedExp <= currentExp) return undefined;
  return hydrateSessionFromToken({ ...stored.session, user: { ...current.user, ...stored.session.user } });
}
