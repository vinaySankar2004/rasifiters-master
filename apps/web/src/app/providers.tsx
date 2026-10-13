"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AuthProvider } from "@/lib/auth/auth-provider";
import { ThemeProvider } from "@/lib/theme-provider";
import { toAppError } from "@/lib/kit/app-error";
import { isOnlineNow } from "@/lib/kit/use-online-status";

// frontend-kit §10 adoption: queries retry at most twice and only on a retryable kit kind (never a 4xx other than
// 408 / 429), honouring Retry-After; mutations never auto-retry (auth §3.1 rule 6 password writes included).
// Never while offline (polish-1 rule 6): the failure shows the offline error view at once, not a retry spinner.
const MAX_QUERY_RETRIES = 2;

function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_QUERY_RETRIES || !isOnlineNow()) return false;
  const appError = toAppError(error);
  const status = appError.status;
  if (status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429) return false;
  return appError.retryable;
}

function queryRetryDelay(attempt: number, error: unknown): number {
  const retryAfter = toAppError(error).retryAfter;
  return retryAfter !== undefined ? Math.min(retryAfter, 30) * 1000 : Math.min(1000 * 2 ** attempt, 30_000);
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: shouldRetryQuery, retryDelay: queryRetryDelay },
          mutations: { retry: false }
        }
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
