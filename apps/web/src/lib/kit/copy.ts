import type { AppErrorKind } from "@/lib/kit/app-error";

// Every user-facing string the frontend kit shows — verbatim the frontend-kit SPEC §3 copy table.
// iOS (Shared/Kit/KitCopy.swift) and Android (core/kit/KitCopy.kt) carry the identical strings: change all
// three + the SPEC table in one commit (D-KIT-2). update/bannerUpdate are unused on web (D-KIT-9).

const ERROR_MESSAGES: Record<AppErrorKind, string> = {
  offline: "Can't connect. Check your internet connection and try again.",
  timeout: "This is taking longer than usual. Try again.",
  signedOut: "Your session has ended. Please sign in again.",
  forbidden: "You don't have access to this.",
  notFound: "We couldn't find that. It may have been removed.",
  conflict: "That conflicts with something already saved. Refresh and try again.",
  invalidInput: "Some details aren't valid. Check them and try again.",
  updateRequired: "This version of RaSi Fiters is no longer supported. Please update the app.",
  unavailable: "RaSi Fiters is busy right now. Try again in a moment.",
  server: "Something went wrong on our end. Try again.",
  unknown: "Something went wrong. Try again."
};

export const KIT_COPY = {
  retry: "Retry",
  update: "Update",
  dismiss: "Dismiss",
  bannerOffline: "You're offline",
  bannerStale: "Couldn't refresh",
  bannerUpdate: "A new version of RaSi Fiters is available",
  errorViewTitle: "Couldn't load this",
  errors: ERROR_MESSAGES
} as const;
