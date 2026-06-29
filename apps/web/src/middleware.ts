import { NextRequest, NextResponse } from "next/server";

const TOKEN_COOKIE = "rasi.fiters.token";

export const config = {
  matcher: [
    "/summary/:path*",
    "/members/:path*",
    "/lifestyle/:path*",
    "/program/:path*",
    "/programs/:path*"
  ]
};

export function middleware(req: NextRequest) {
  const token = req.cookies.get(TOKEN_COOKIE)?.value;
  if (!token) {
    return redirectToLogin(req);
  }

  const result = verifyJwt(token);
  if (result.status === "invalid") {
    return redirectToLogin(req, { clearCookie: true, reason: "invalid" });
  }

  // "valid" and "expired" both pass through; the client-side AuthProvider
  // will silently refresh an expired token using the stored refresh token.
  return NextResponse.next();
}

function redirectToLogin(
  req: NextRequest,
  options?: {
    clearCookie?: boolean;
    reason?: "expired" | "invalid";
  }
) {
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("from", req.nextUrl.pathname);
  if (options?.reason) {
    loginUrl.searchParams.set("reason", options.reason);
  }
  const response = NextResponse.redirect(loginUrl);
  if (options?.clearCookie) {
    response.cookies.set(TOKEN_COOKIE, "", { maxAge: 0, path: "/" });
  }
  return response;
}

type JwtResult =
  | { status: "valid"; payload: Record<string, unknown> }
  | { status: "expired" }
  | { status: "invalid" };

// D-C1 (migration decision, RESOLVED): the legacy port verified an HS256 token
// signed with a shared JWT_SECRET, but auth migrated to Supabase ES256 (asymmetric)
// tokens — so signature verification at the edge would mark every real session token
// invalid (redirect loop). The middleware is a UX redirect GATE, not the security
// boundary: the Express backend JWKS-verifies (ES256) EVERY API call and owns all
// authorization (CLAUDE.md auth model — authz stays in Express, not RLS). So the edge
// only DECODES the token and checks the `exp` claim — a forged/garbage token still
// reaches a page, but every API call it makes 401s. This avoids a per-navigation JWKS
// network fetch at the edge and keeps the middleware's faithful role (route gating).
// "invalid" = malformed (not a 3-part JWT, or an unparseable payload) → clear + bounce.
// "expired" passes through so the client can silently refresh via the refresh token.
function verifyJwt(token: string): JwtResult {
  const parts = token.split(".");
  if (parts.length !== 3) return { status: "invalid" };

  const payload = safeJsonParse(decodeBase64Url(parts[1]));
  if (!payload) return { status: "invalid" };

  const exp = typeof payload.exp === "number" ? payload.exp : Number(payload.exp);
  if (Number.isFinite(exp) && Date.now() >= exp * 1000) {
    return { status: "expired" };
  }

  return { status: "valid", payload };
}

function decodeBase64Url(input: string) {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  let result = "";
  for (let i = 0; i < binary.length; i += 1) {
    result += String.fromCharCode(binary.charCodeAt(i));
  }
  return result;
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
