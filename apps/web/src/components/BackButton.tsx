"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

export function BackButton({
  fallbackHref = "/",
  label = "Back",
  className = "back-button inline-flex rounded-full px-3 py-1 text-xs font-semibold text-rf-text-muted transition"
}: {
  fallbackHref?: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  }, [fallbackHref, router]);

  return (
    <button type="button" onClick={handleBack} className={className}>
      {label}
    </button>
  );
}
