import { ApiError } from "@/lib/api/client";
import type { BulkRowError } from "@/lib/api/logs";
import { KIT_COPY } from "@/lib/kit/copy";

// The shared error vocabulary (frontend-kit SPEC §4) — identical kinds, status rules and copy on iOS
// (Shared/Kit/AppError.swift) and Android (core/kit/AppError.kt). The kit only LABELS errors; it never signs
// anyone out (sign-out policy is the sessions contract, DESIGN_BOARD §2).
// Scope rule — credential endpoints (SPEC §4): on login, sign-up, OAuth, link/unlink, set/change password and
// the email re-auth a 401 means wrong credentials, not an ended session. Those screens must NOT pass a 401
// through toAppError / fromHttp (it would read "signedOut"); they show the ApiError's own server text — use
// `credentialErrorMessage`.

export type AppErrorKind =
  | "offline"
  | "timeout"
  | "signedOut"
  | "forbidden"
  | "notFound"
  | "conflict"
  | "invalidInput"
  | "updateRequired"
  | "unavailable"
  | "server"
  | "unknown";

export type AppError = {
  kind: AppErrorKind;
  /** User-facing copy (raw server text only for invalidInput or when rowErrors are present). */
  message: string;
  status?: number;
  /** Backend machine code when known ("session_invalid", "auth_unavailable"). Never changes `kind`. */
  code?: string;
  /** Whole seconds from a Retry-After header (unavailable). */
  retryAfter?: number;
  /** Per-row errors from the batch log endpoints (Add-workouts / Add-health row highlighting). */
  rowErrors?: BulkRowError[];
  retryable: boolean;
};

type AppErrorExtra = {
  message?: string;
  status?: number;
  code?: string;
  retryAfter?: number;
  rowErrors?: BulkRowError[];
};

const RETRYABLE_KINDS: ReadonlySet<AppErrorKind> = new Set<AppErrorKind>([
  "offline",
  "timeout",
  "unavailable",
  "server",
  "unknown"
]);

const GENERIC_SERVER_PREFIX = "Request failed (";
const NETWORK_FAILURE = /failed to fetch|load failed|networkerror|network request failed/i;

export function appError(kind: AppErrorKind, extra: AppErrorExtra = {}): AppError {
  return {
    kind,
    message: extra.message ?? KIT_COPY.errors[kind],
    status: extra.status,
    code: extra.code,
    retryAfter: extra.retryAfter,
    rowErrors: extra.rowErrors,
    retryable: RETRYABLE_KINDS.has(kind)
  };
}

function kindForStatus(status: number): AppErrorKind {
  if (status === 400 || status === 422) return "invalidInput";
  if (status === 401) return "signedOut";
  if (status === 403) return "forbidden";
  if (status === 404) return "notFound";
  if (status === 408) return "timeout";
  if (status === 409) return "conflict";
  if (status === 426) return "updateRequired";
  if (status === 429 || status === 503) return "unavailable";
  if (status >= 500) return "server";
  return "unknown";
}

/** The server's text when it is specific (non-empty, not the generic "Request failed (N)"), else undefined. */
function serverText(message: string | undefined): string | undefined {
  const text = message?.trim() ?? "";
  return text === "" || text.startsWith(GENERIC_SERVER_PREFIX) ? undefined : text;
}

/**
 * Pure HTTP → AppError mapping: the status decides the kind; `code` is carried, never decisive.
 * Not for a 401 from a credential endpoint — see the scope rule at the top of this file.
 */
export function fromHttp(
  status: number,
  code?: string,
  retryAfter?: number,
  serverMessage?: string,
  rowErrors?: BulkRowError[]
): AppError {
  const kind = kindForStatus(status);
  const rows = rowErrors && rowErrors.length > 0 ? rowErrors : undefined;
  const useServerText = kind === "invalidInput" || rows !== undefined;
  return appError(kind, {
    message: useServerText ? serverText(serverMessage) : undefined,
    status,
    code,
    retryAfter,
    rowErrors: rows
  });
}

export { parseRetryAfter } from "@/lib/api/client";

function isAppError(value: unknown): value is AppError {
  return typeof value === "object" && value !== null && "kind" in value && "message" in value && "retryable" in value;
}

function errorName(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const name = (value as { name?: unknown }).name;
  return typeof name === "string" ? name : undefined;
}

/** Any thrown value → AppError (D-KIT-4). Credential screens keep their 401 text (scope rule above). */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  if (error instanceof ApiError) {
    return fromHttp(
      error.status,
      error.code,
      error.retryAfter,
      error.message,
      Array.isArray(error.details) ? (error.details as BulkRowError[]) : undefined
    );
  }
  const name = errorName(error);
  if (name === "TimeoutError" || name === "AbortError") return appError("timeout");
  if (error instanceof TypeError && NETWORK_FAILURE.test(error.message)) return appError("offline");
  return appError("unknown");
}

const CREDENTIAL_TEXT_STATUSES: ReadonlySet<number> = new Set([400, 401, 409, 422]);

/**
 * Credential screens (scope rule above; the same rule on iOS + Android): the server's own text for 400 / 401 / 409 /
 * 422 (wrong credentials, validation, the collision text); the kit copy for everything else (403, 404, offline,
 * timeout, 408, 426, 429, 5xx). `scope: "account"` = an authenticated credential route (link / unlink, set / change
 * password, email re-auth): a 401 there means the session ended, never the credentials, so it reads `signedOut`.
 */
export function credentialErrorMessage(error: unknown, scope: "signIn" | "account" = "signIn"): string {
  // No response while the browser reports offline (incl. a timeout or a dropped connection) = offline.
  if (!(error instanceof ApiError) && typeof navigator !== "undefined" && navigator.onLine === false) {
    return KIT_COPY.errors.offline;
  }
  if (
    error instanceof ApiError &&
    CREDENTIAL_TEXT_STATUSES.has(error.status) &&
    !(scope === "account" && error.status === 401)
  ) {
    return serverText(error.message) ?? toAppError(error).message;
  }
  return toAppError(error).message;
}
