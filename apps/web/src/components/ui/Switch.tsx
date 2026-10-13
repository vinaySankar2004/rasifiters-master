"use client";

import { cn } from "@/lib/utils";

// Accessible on/off switch (role="switch" + aria-checked) — the web idiom for iOS Toggle / Android Switch. The whole
// 44px button is the tap target; the label lives next to it (aria-labelledby) or in `label`.
export function Switch({
  checked,
  onChange,
  disabled,
  labelledBy,
  label
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  labelledBy?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex h-11 w-14 shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex h-7 w-12 items-center rounded-full p-0.5 transition-colors",
          checked ? "bg-rf-accent" : "bg-rf-border"
        )}
      >
        <span
          className={cn(
            "h-6 w-6 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </span>
    </button>
  );
}
