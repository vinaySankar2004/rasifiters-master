export type DecodedAuthToken = {
  id?: string;
  username?: string;
  member_name?: string;
  global_role?: string;
  role?: string;
  exp?: number;
};

export function decodeJwtPayload<T = DecodedAuthToken>(token: string): T | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payload = parts[1];
  if (!payload) return null;
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const decoded =
      typeof atob === "function"
        ? atob(normalized)
        : Buffer.from(normalized, "base64").toString("utf-8");
    return JSON.parse(decoded) as T;
  } catch {
    return null;
  }
}

/** True when the token's `exp` is within `seconds` of now (or past). A token without `exp` never expires. */
export function expiresWithin(token: string, seconds: number): boolean {
  const decoded = decodeJwtPayload<DecodedAuthToken>(token);
  if (!decoded?.exp) return false;
  return decoded.exp * 1000 - Date.now() <= seconds * 1000;
}

export function isTokenExpired(token: string) {
  return expiresWithin(token, 0);
}

/** The token's `exp` (seconds since the epoch), when it has a numeric one. */
export function tokenExpiresAt(token: string): number | undefined {
  const exp = decodeJwtPayload<DecodedAuthToken>(token)?.exp;
  return typeof exp === "number" && Number.isFinite(exp) ? exp : undefined;
}

/** The Supabase auth user id (`sub`) — tells two stored sessions of the same account apart from another account's. */
export function tokenSubject(token: string): string | undefined {
  const sub = decodeJwtPayload<{ sub?: unknown }>(token)?.sub;
  return typeof sub === "string" && sub ? sub : undefined;
}

export function resolveGlobalRole({
  tokenGlobalRole,
  tokenRole,
  responseGlobalRole,
  responseRole,
  fallback = "standard"
}: {
  tokenGlobalRole?: string | null;
  tokenRole?: string | null;
  responseGlobalRole?: string | null;
  responseRole?: string | null;
  fallback?: string;
}) {
  const normalizedTokenGlobal = tokenGlobalRole?.toLowerCase();
  if (normalizedTokenGlobal === "global_admin" || normalizedTokenGlobal === "standard") {
    return normalizedTokenGlobal;
  }
  const normalizedResponseGlobal = responseGlobalRole?.toLowerCase();
  if (normalizedResponseGlobal === "global_admin" || normalizedResponseGlobal === "standard") {
    return normalizedResponseGlobal;
  }
  const normalizedRole = (tokenRole ?? responseRole ?? "").toLowerCase();
  if (normalizedRole === "admin") return "global_admin";
  if (normalizedRole === "member" || normalizedRole === "standard") return "standard";
  return fallback;
}
