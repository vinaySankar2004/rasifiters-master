"use client";

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="error-banner rounded-2xl px-4 py-3 text-sm font-semibold">
      {message}
    </div>
  );
}
