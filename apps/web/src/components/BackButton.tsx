"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

export function BackButton({
  fallbackHref = "/",
  label = "Back",
  className = "back-button inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold text-rf-text-muted transition"
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
