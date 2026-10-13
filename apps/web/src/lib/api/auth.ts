import { ApiError, apiRequest, wasNeverSent } from "@/lib/api/client";
import { AUTH_LOGIN_PATH } from "@/lib/config";

export type LoginResponse = {
  token: string;
  refresh_token?: string;
  member_id?: string;
  username?: string;
  member_name?: string;
  global_role?: string;
  message?: string;
};

export async function login(identifier: string, password: string) {
  return apiRequest<LoginResponse>(AUTH_LOGIN_PATH, {
    method: "POST",
    body: { identifier, password }
  });
}

export type MeResponse = {
  member_id?: string;
  username?: string;
  member_name?: string;
  global_role?: string;
};

// Server-authoritative identity ("who am I"). The web derives session.user.id (= the member's members.id)
// from the login response, but never re-derives it afterward — so a stale/missing id would stay broken
// until re-login. Calling this on load lets the session self-heal from the JWKS-verified member.
export async function fetchMe(token: string) {
  return apiRequest<MeResponse>("/auth/me", { token });
}

export type RegisterResponse = {
  message?: string;
  member_id?: string;
  username?: string;
  member_name?: string;
};

export async function registerAccount(payload: {
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  password: string;
  gender?: string;
}) {
  return apiRequest<RegisterResponse>("/auth/register", {
    method: "POST",
    body: payload
  });
}

export type SocialSignInResponse = LoginResponse & {
  needs_profile?: boolean;
  email?: string;
  first_name?: string;
  last_name?: string;
};

// Federated sign-in. The web custom button yields a Google auth `code` (auth-code/popup flow); the backend
// exchanges it for an id_token and hands it to Supabase (R1: the browser never embeds Supabase, never holds
// the client secret). Returns a login session OR needs_profile for a new social user.
export async function socialSignIn(payload: {
  provider: "google" | "apple";
  id_token?: string;
  code?: string;
  nonce?: string;
}) {
  return apiRequest<SocialSignInResponse>("/auth/oauth", { method: "POST", body: payload });
}

// Finish a new federated sign-up: the pending Supabase access_token (from socialSignIn) is the Bearer;
// re-send the refresh_token so the backend echoes the same session back in the AuthResponse.
export async function completeSocialRegistration(
  pendingToken: string,
  payload: { username: string; gender?: string; first_name?: string; last_name?: string; refresh_token?: string }
) {
  return apiRequest<LoginResponse>("/auth/oauth/complete", {
    method: "POST",
    token: pendingToken,
    bearer: "explicit",
    body: payload
  });
}

export type RefreshResponse = {
  token: string;
  refresh_token?: string;
  message?: string;
};

export async function refreshSession(refreshToken: string) {
  return apiRequest<RefreshResponse>("/auth/refresh", {
    method: "POST",
    body: { refresh_token: refreshToken }
  });
}

// /auth/logout ends THIS device's session only (auth §3.1). Explicit Bearer + refresh_token (either alone works);
// the caller ignores the outcome.
export async function logout(token: string, refreshToken?: string) {
  return apiRequest<{ message?: string }>("/auth/logout", {
    method: "POST",
    token,
    bearer: "explicit",
    body: refreshToken ? { refresh_token: refreshToken } : undefined
  });
}

// "Sign out everywhere" (auth §3.1): every session ends, this device's included. No body.
export async function logoutAll(token: string) {
  return apiRequest<{ message?: string }>("/auth/logout-all", { method: "POST", token });
}

// Self-service password recovery — request step. Privacy-safe: the backend always returns a generic
// 200 message (no account-enumeration). Pairs with a reset step landing next run.
export async function requestPasswordReset(email: string) {
  return apiRequest<{ message?: string }>("/auth/forgot-password", {
    method: "POST",
    body: { email }
  });
}

// Self-service password recovery — reset (consume) step. The /reset-password page extracts the Supabase
// recovery access_token from the email-link fragment and passes it here as the Bearer token; the backend
// (authenticateToken + changePassword) sets the new password. R1: the client never embeds Supabase — the
// token round-trips through Express. A 401 means the recovery link expired/was invalid.
export async function resetPassword(accessToken: string, newPassword: string) {
  return apiRequest<{ message?: string }>("/auth/reset-password", {
    method: "POST",
    token: accessToken,
    bearer: "explicit",
    body: { new_password: newPassword }
  });
}

export async function changePassword(token: string, newPassword: string) {
  return apiRequest<{ message?: string }>("/auth/change-password", {
    method: "PUT",
    token,
    body: { new_password: newPassword }
  });
}

// Self-service email change. Direct + password-confirmed: the backend re-auths the current password,
// then updates Supabase auth.users + member_emails together. The session token stays valid afterward.
export async function changeEmail(token: string, newEmail: string, password: string) {
  return apiRequest<{ message?: string; email?: string }>("/auth/email", {
    method: "PUT",
    token,
    body: { new_email: newEmail, password }
  });
}

export async function deleteAccount(token: string) {
  return apiRequest<{ message?: string }>("/auth/account", {
    method: "DELETE",
    token
  });
}

export type Identity = { provider: string; email?: string | null };
export type IdentitiesResponse = { identities: Identity[]; has_password: boolean; message?: string };

// Auth phase-2 (D-C10). List the signed-in member's linked sign-in methods.
export async function listIdentities(token: string) {
  return apiRequest<IdentitiesResponse>("/auth/identities", { token });
}

// Link Google via the web custom-button auth `code`. refresh_token is no longer sent (ignored since 0.13.0, D-C14).
export async function linkGoogle(token: string, code: string) {
  return apiRequest<IdentitiesResponse>("/auth/link", { method: "POST", token, body: { provider: "google", code } });
}

export async function unlinkProvider(token: string, provider: string) {
  return apiRequest<IdentitiesResponse>("/auth/unlink", { method: "POST", token, body: { provider } });
}

// Social-only member adds an email/password credential.
export async function setPassword(token: string, newPassword: string) {
  return apiRequest<IdentitiesResponse>("/auth/set-password", {
    method: "POST", token, body: { new_password: newPassword }
  });
}

// Copy shared 1:1 with iOS + Android (auth §3.1 rules 4 + 6; "Sign out everywhere").
export const AUTH_COPY = {
  passwordChanged: "Password updated. Your other devices will be signed out.",
  passwordSet: "Password set. Your other devices will be signed out.",
  passwordUnconfirmed:
    "We couldn't confirm your password change. It may have gone through, so try signing in with your new password.",
  signOutEverywhere: "Sign out everywhere",
  signOutEverywhereHint: "Signs you out on every device, including this one.",
  signOutEverywhereTitle: "Sign out everywhere?",
  signOutEverywhereBody: "You'll be signed out on all your devices, including this one.",
  signingOut: "Signing out..."
} as const;

const SAME_PASSWORD_ERROR = "New password must be different from your current password.";

/**
 * Rule 6: the write was sent and its outcome is unknown (5xx / 408 / timeout / dropped connection). A failure with no
 * response while the browser reports offline is "offline" (the kit offline copy), not "couldn't confirm".
 */
export function isPasswordWriteUnconfirmed(error: unknown): boolean {
  if (wasNeverSent(error)) return false;
  if (error instanceof ApiError) return error.status >= 500 || error.status === 408;
  return !(typeof navigator !== "undefined" && navigator.onLine === false);
}

/** Rule 6: a manual retry of the same password answered with the same-password 400 = the earlier attempt landed. */
export function isSamePasswordError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 400 && error.message === SAME_PASSWORD_ERROR;
}
