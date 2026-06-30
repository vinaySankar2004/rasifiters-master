"use client";

import { useEffect, useState } from "react";
import { applyTheme, getStoredTheme, setStoredTheme, type ThemePreference } from "@/lib/theme";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { IconMonitor, IconSun, IconMoon } from "@/components/icons";

const OPTIONS: { value: ThemePreference; title: string; description: string; icon: React.ReactNode }[] = [
  {
    value: "system",
    title: "System",
    description: "Follows your device settings",
    icon: <IconMonitor className="h-5 w-5" />
  },
  {
    value: "light",
    title: "Light",
    description: "Always use light appearance",
    icon: <IconSun className="h-5 w-5" />
  },
  {
    value: "dark",
    title: "Dark",
    description: "Always use dark appearance",
    icon: <IconMoon className="h-5 w-5" />
  }
];

export default function AppearancePage() {
  const { program } = useAuthGuard({ requireProgram: false });
  const fallbackHref = program?.id ? "/program" : "/programs";
  const [selection, setSelection] = useState<ThemePreference>("system");

  useEffect(() => {
    const stored = getStoredTheme();
    setSelection(stored);
    applyTheme(stored);
  }, []);

  const handleSelect = (value: ThemePreference) => {
    setSelection(value);
    setStoredTheme(value);
  };

  return (
    <PageShell maxWidth="2xl">
      <PageHeader
        title="Appearance"
        subtitle="Choose how RaSi Fiters looks to you."
        backHref={fallbackHref}
      />

      <GlassCard padding="lg" className="space-y-4">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => handleSelect(option.value)}
            className={`flex w-full items-center gap-4 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
              selection === option.value
                ? "border-rf-accent bg-rf-accent/10 text-rf-text"
                : "border-rf-border bg-rf-surface-muted text-rf-text-muted"
            }`}
          >
            <span className="metric-pill flex h-10 w-10 items-center justify-center rounded-full text-rf-text">
              {option.icon}
            </span>
            <div>
              <p className="text-rf-text">{option.title}</p>
              <p className="text-xs text-rf-text-muted">{option.description}</p>
            </div>
            {selection === option.value && <span className="ml-auto">✓</span>}
          </button>
        ))}
      </GlassCard>
    </PageShell>
  );
}
