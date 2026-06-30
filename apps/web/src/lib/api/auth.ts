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

// Self-service password recovery — reset (consume) step via a typed 6-digit code. The /reset-password page
// collects the email (carried from forgot-password), the code from the recovery email, and the new
// password; the backend verifyOtp-consumes the code and sets the password. Public (the code is the proof).
// A 401 means the code is invalid or expired. Switched off the magic link because email scanners
// (Outlook Safe Links) pre-consumed the single-use link.
export async function resetPasswordWithCode(email: string, code: string, newPassword: string) {
  return apiRequest<{ message?: string }>("/auth/reset-password", {
    method: "POST",
    body: { email, code, new_password: newPassword }
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
