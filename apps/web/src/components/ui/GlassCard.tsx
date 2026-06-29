"use client";

import { cn } from "@/lib/utils";

const paddingMap = {
  sm: "p-4",
  md: "p-5",
  lg: "p-6"
} as const;

type Padding = keyof typeof paddingMap;

export function GlassCard({
  padding = "md",
  className,
  children,
  ...rest
}: {
  padding?: Padding;
  className?: string;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "className" | "children">) {
  return (
    <div className={cn("glass-card rounded-3xl", paddingMap[padding], className)} {...rest}>
      {children}
    </div>
  );
}
