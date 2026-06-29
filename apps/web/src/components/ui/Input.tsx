"use client";

import { useIsMobile } from "@/lib/hooks/use-is-mobile";
import { cn } from "@/lib/utils";
import { forwardRef } from "react";

type InputProps = {
  label?: string;
  error?: string;
  wrapperClassName?: string;
} & React.InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, wrapperClassName, className, type, ...rest },
  ref
) {
  const isMobile = useIsMobile();
  const isDateOnMobile = type === "date" && isMobile;

  if (isDateOnMobile) {
    return (
      <div className={wrapperClassName}>
        {label && (
          <label className="text-sm font-semibold text-rf-text">{label}</label>
        )}
        <div
          className={cn(
            "input-shell flex w-full items-center rounded-2xl px-4 py-3 min-h-[3rem]",
            label && "mt-2"
          )}
        >
          <input
            ref={ref}
            type="date"
            className={cn(
              "min-w-0 flex-1 border-0 bg-transparent text-sm font-medium outline-none [color-scheme:inherit]",
              className
            )}
            {...rest}
          />
        </div>
        {error && (
          <p className="mt-2 text-xs font-semibold text-rf-danger">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className={wrapperClassName}>
      {label && (
        <label className="text-sm font-semibold text-rf-text">{label}</label>
      )}
      <input
        ref={ref}
        type={type}
        className={cn(
          "input-shell w-full rounded-2xl px-4 py-3 text-sm font-medium",
          label && "mt-2",
          className
        )}
        {...rest}
      />
      {error && (
        <p className="mt-2 text-xs font-semibold text-rf-danger">{error}</p>
      )}
    </div>
  );
});
