import { apiRequest } from "@/lib/api/client";
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

export async function logout(refreshToken: string) {
  return apiRequest<{ message?: string }>("/auth/logout", {
    method: "POST",
    body: { refresh_token: refreshToken }
  });
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

export async function deleteAccount(token: string) {
  return apiRequest<{ message?: string }>("/auth/account", {
    method: "DELETE",
    token
  });
}
