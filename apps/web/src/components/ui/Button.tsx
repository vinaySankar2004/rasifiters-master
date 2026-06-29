"use client";

import { cn } from "@/lib/utils";

const variantClasses = {
  primary: "button-primary button-primary--dark-white",
  secondary: "pill-button",
  accent: "bg-rf-accent text-black",
  danger: "danger-pill",
  ghost: "bg-rf-surface-muted text-rf-text-muted hover:bg-rf-surface"
} as const;

const sizeClasses = {
  sm: "rounded-full px-3 py-1 text-xs font-semibold",
  md: "rounded-2xl px-4 py-3 text-sm font-semibold",
  lg: "rounded-full px-8 min-h-[50px] text-base font-semibold"
} as const;

type ButtonVariant = keyof typeof variantClasses;
type ButtonSize = keyof typeof sizeClasses;

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center transition",
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && "w-full",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
