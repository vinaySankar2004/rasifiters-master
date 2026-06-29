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

export function isTokenExpired(token: string) {
  const decoded = decodeJwtPayload<DecodedAuthToken>(token);
  if (!decoded?.exp) return false;
  return decoded.exp * 1000 <= Date.now();
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
