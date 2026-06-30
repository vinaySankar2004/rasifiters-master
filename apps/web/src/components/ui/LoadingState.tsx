"use client";

export function LoadingState({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="glass-card rounded-3xl p-6 text-sm text-rf-text-muted">
      {message}
    </div>
  );
}
