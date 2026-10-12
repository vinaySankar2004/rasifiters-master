"use client";

import { Button } from "@/components/ui/Button";
import type { AppError } from "@/lib/kit/app-error";
import { KIT_COPY } from "@/lib/kit/copy";

// Error-with-no-data view (frontend-kit SPEC §6): never an endless spinner, never fake zeros. Same glass-card
// chrome as components/ui/LoadingState + EmptyState (the web majority idiom). Retry renders only when a
// handler is given AND the error is retryable (D-KIT-8).
export function ErrorView({ error, onRetry }: { error: AppError; onRetry?: () => void }) {
  return (
    <div role="alert" className="glass-card flex flex-col items-center gap-3 rounded-3xl p-6 text-center">
      <p className="text-base font-semibold text-rf-text">{KIT_COPY.errorViewTitle}</p>
      <p className="max-w-full break-words text-sm text-rf-text-muted">{error.message}</p>
      {onRetry && error.retryable && (
        <Button variant="primary" size="lg" className="mt-1 w-40" onClick={onRetry}>
          {KIT_COPY.retry}
        </Button>
      )}
    </div>
  );
}
