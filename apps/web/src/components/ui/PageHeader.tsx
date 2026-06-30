"use client";

import { BackButton } from "@/components/BackButton";

export function PageHeader({
  title,
  subtitle,
  backHref,
  actions
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="space-y-2">
      {backHref && <BackButton fallbackHref={backHref} />}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-rf-text">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-rf-text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    </header>
  );
}
