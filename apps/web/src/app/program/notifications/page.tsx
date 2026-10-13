"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { browserTimeZone } from "@/lib/api/client";
import { NOTIFICATION_CATEGORIES, NOTIFICATION_COPY, type NotificationCategory } from "@/lib/api/notifications";
import { NOTIFICATION_KEYS, usePreferencesQuery, useUpdatePreferences } from "@/lib/notifications/queries";
import { appError, toAppError } from "@/lib/kit/app-error";
import { fromQuery, retryNow } from "@/lib/kit/async-state";
import { useOnlineStatus, useRefetchOnReconnect } from "@/lib/kit/use-online-status";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { Switch } from "@/components/ui/Switch";
import { ErrorView } from "@/components/kit/ErrorView";
import { FloatingBanner } from "@/components/kit/FloatingBanner";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Notifications settings (the inbox contract's /preferences; D-N2, D-N7, D-N10): one switch per category, the daily
// reminder time (default 19:00) with the time zone it uses, honest opt-in wording for Reminders + the weekly digest
// (App Store 4.5.4, D-N7). Each change is a partial PUT with an optimistic flip. Web has no push — the page says where
// things land instead.
export default function NotificationSettingsPage() {
  const queryClient = useQueryClient();
  const { program, token } = useAuthGuard({ requireProgram: false });
  const online = useOnlineStatus();
  const preferencesQuery = usePreferencesQuery(token);
  const update = useUpdatePreferences(token);
  useRefetchOnReconnect([preferencesQuery]);
  const state = fromQuery(preferencesQuery);
  const preferences = preferencesQuery.data;
  const [time, setTime] = useState("");

  useEffect(() => {
    if (preferences?.reminder_time) setTime(preferences.reminder_time);
  }, [preferences?.reminder_time]);

  const toggle = (category: NotificationCategory, next: boolean) =>
    update.mutate({ categories: { [category]: next } as Partial<Record<NotificationCategory, boolean>> });

  const saveTime = () => {
    if (preferences && TIME_RE.test(time) && time !== preferences.reminder_time) {
      update.mutate({ reminder_time: time });
    }
  };

  return (
    <PageShell maxWidth="3xl">
      <PageHeader
        title={NOTIFICATION_COPY.settingsTitle}
        subtitle={NOTIFICATION_COPY.settingsSubtitle}
        backHref={program?.id ? "/program" : "/programs"}
      />

      {state.status === "loading" && <LoadingState message={NOTIFICATION_COPY.settingsLoading} />}
      {state.status === "failed" && (
        <ErrorView
          error={online ? state.error : appError("offline")}
          onRetry={() => void retryNow(queryClient, NOTIFICATION_KEYS.preferences)}
        />
      )}

      {preferences && (
        <GlassCard padding="lg" className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-rf-text-muted">
            {NOTIFICATION_COPY.settingsSection}
          </h2>
          <div className="divide-y divide-rf-border">
            {NOTIFICATION_CATEGORIES.map((category) => {
              const copy = NOTIFICATION_COPY.categories[category];
              const on = preferences.categories?.[category] === true;
              return (
                <div key={category} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p id={`notify-${category}`} className="text-sm font-semibold text-rf-text">
                        {copy.label}
                      </p>
                      <p className="mt-1 text-xs text-rf-text-muted">{copy.hint}</p>
                    </div>
                    <Switch checked={on} labelledBy={`notify-${category}`} onChange={(next) => toggle(category, next)} />
                  </div>
                  {category === "reminders" && on && (
                    <div className="mt-3 space-y-1">
                      <label className="flex flex-wrap items-center justify-between gap-3 text-sm font-semibold text-rf-text">
                        {NOTIFICATION_COPY.reminderTime}
                        <input
                          type="time"
                          value={time}
                          onChange={(event) => setTime(event.target.value)}
                          onBlur={saveTime}
                          className="input-shell rounded-2xl px-4 py-2 text-sm font-medium"
                        />
                      </label>
                      <p className="text-xs text-rf-text-muted">
                        {NOTIFICATION_COPY.timeZone(preferences.time_zone ?? browserTimeZone() ?? "UTC")}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {update.isError && (
            <p className="text-sm font-semibold text-rf-danger">{toAppError(update.error).message}</p>
          )}
          <p className="text-xs text-rf-text-muted">{NOTIFICATION_COPY.optInNote}</p>
          <p className="text-xs text-rf-text-muted">{NOTIFICATION_COPY.webNote}</p>
        </GlassCard>
      )}

      {state.status === "stale" && online && (
        <>
          <div aria-hidden="true" className="h-36" />
          <FloatingBanner variant="stale" onRetry={() => void preferencesQuery.refetch()} />
        </>
      )}
    </PageShell>
  );
}
