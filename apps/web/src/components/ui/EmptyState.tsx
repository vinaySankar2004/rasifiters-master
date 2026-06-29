"use client";

export function EmptyState({ message = "Nothing to display." }: { message?: string }) {
  return (
    <div className="glass-card rounded-3xl p-6 text-sm text-rf-text-muted">
      {message}
    </div>
  );
}
