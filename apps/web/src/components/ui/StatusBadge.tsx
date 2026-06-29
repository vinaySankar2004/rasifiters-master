"use client";

import { cn } from "@/lib/utils";

const variantClasses = {
  success: "bg-rf-success/15 text-rf-success",
  warning: "bg-rf-warning/15 text-rf-warning",
  danger: "bg-rf-danger/15 text-rf-danger",
  info: "bg-rf-info/15 text-rf-info",
  accent: "bg-rf-accent/15 text-rf-accent",
  neutral: "bg-rf-surface-muted text-rf-text-muted"
} as const;

type Variant = keyof typeof variantClasses;

export function StatusBadge({
  variant = "neutral",
  className,
  children
}: {
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase",
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export function programStatusVariant(status?: string | null): Variant {
  switch ((status ?? "").toLowerCase()) {
    case "completed":
      return "success";
    case "planned":
      return "info";
    default:
      return "accent";
  }
}
