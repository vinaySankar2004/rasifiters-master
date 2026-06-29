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

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(TOKEN_COOKIE)?.value;
  if (!token) {
    return redirectToLogin(req);
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return redirectToLogin(req, { clearCookie: true, reason: "invalid" });
  }

  const result = await verifyJwt(token, secret);
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

// FAITHFUL PORT — but DOES NOT WORK with the migrated auth model. This verifies an
// HS256 token signed with a shared JWT_SECRET; the migration moved to Supabase
// ES256 (asymmetric) tokens, so `header.alg !== "HS256"` marks every real session
// token invalid → redirect loop. NONE of the matched routes (/summary, /members,
// /lifestyle, /program, /programs) exist on the web app yet, so this is INERT for
// the foundation + splash + login (public). MUST be resolved before /programs lands
// (the first protected route after login). Open decision for the auth-path SPEC:
//   (a) ES256/JWKS verify at the edge (mirror the backend middleware/auth.js), or
//   (b) decode + expiry check only (no signature verify) — the backend re-verifies
//       every API call, so the middleware is only a UX redirect gate.
// See apps/web/CONTEXT.md "Foundation port" + PROGRESS.md open questions.
async function verifyJwt(token: string, secret: string): Promise<JwtResult> {
  const parts = token.split(".");
  if (parts.length !== 3) return { status: "invalid" };
  const [headerPart, payloadPart, signaturePart] = parts;

  const header = safeJsonParse(decodeBase64Url(headerPart));
  if (!header || header.alg !== "HS256") return { status: "invalid" };

  const data = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
  const signature = base64UrlToUint8Array(signaturePart);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const valid = await crypto.subtle.verify("HMAC", key, signature, data);
  if (!valid) return { status: "invalid" };

  const payload = safeJsonParse(decodeBase64Url(payloadPart));
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

function base64UrlToUint8Array(input: string) {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
