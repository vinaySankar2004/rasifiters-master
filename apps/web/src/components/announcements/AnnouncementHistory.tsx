"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ANNOUNCEMENT_COPY,
  ANNOUNCEMENT_KEYS,
  cancelAnnouncement,
  listAnnouncements,
  type AnnouncementSummary
} from "@/lib/api/announcements";
import { appError, toAppError } from "@/lib/kit/app-error";
import { fromQuery, retryNow } from "@/lib/kit/async-state";
import { useOnlineStatus } from "@/lib/kit/use-online-status";
import { GlassCard } from "@/components/ui/GlassCard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ErrorView } from "@/components/kit/ErrorView";

const STATUS_VARIANT = { scheduled: "info", sending: "accent", sent: "success", cancelled: "neutral" } as const;

const formatWhen = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

const targetLabel = (item: AnnouncementSummary) =>
  item.target_kind === "everyone"
    ? ANNOUNCEMENT_COPY.targetEveryone
    : item.target_kind === "members"
      ? ANNOUNCEMENT_COPY.targetMembers(item.recipient_count)
      : item.target_program_name ?? ANNOUNCEMENT_COPY.targetProgramFallback;

const deliveryLabel = (item: AnnouncementSummary) =>
  item.mode === "local" && item.send_date && item.send_time
    ? ANNOUNCEMENT_COPY.deliveryLocal(item.send_date, item.send_time)
    : ANNOUNCEMENT_COPY.deliveryNow(formatWhen(item.created_at));

// The composer's audit (GET /announcements — newest 50): status, target, timing, progress; Cancel while scheduled /
// sending (W11 — the only way to stop a scheduled send). A 409 (already sent) reads the kit conflict copy + a reload.
export function AnnouncementHistory({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const [cancelTarget, setCancelTarget] = useState<AnnouncementSummary | null>(null);
  const historyQuery = useQuery({
    queryKey: ANNOUNCEMENT_KEYS.list,
    queryFn: () => listAnnouncements(token),
    enabled: !!token
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelAnnouncement(token, id),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ANNOUNCEMENT_KEYS.list })
  });
  const state = fromQuery(historyQuery);
  const announcements = historyQuery.data?.announcements ?? [];

  return (
    <>
      <GlassCard padding="lg" className="space-y-4">
        <p className="text-base font-semibold text-rf-text">{ANNOUNCEMENT_COPY.historyTitle}</p>
        {state.status === "loading" && <p className="text-sm text-rf-text-muted">{ANNOUNCEMENT_COPY.historyLoading}</p>}
        {state.status === "failed" && (
          <ErrorView
            error={online ? state.error : appError("offline")}
            onRetry={() => void retryNow(queryClient, ANNOUNCEMENT_KEYS.list)}
          />
        )}
        {cancel.isError && <p className="text-sm font-semibold text-rf-danger">{toAppError(cancel.error).message}</p>}
        {(state.status === "loaded" || state.status === "stale") && announcements.length === 0 && (
          <p className="text-sm text-rf-text-muted">{ANNOUNCEMENT_COPY.historyEmpty}</p>
        )}
        <div className="space-y-3">
          {announcements.map((item) => (
            <div key={item.id} className="rounded-2xl border border-rf-border bg-rf-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 break-words text-sm font-semibold text-rf-text">{item.title}</p>
                <StatusBadge variant={STATUS_VARIANT[item.status]}>{ANNOUNCEMENT_COPY.status[item.status]}</StatusBadge>
              </div>
              <p className="mt-1 line-clamp-2 break-words text-sm text-rf-text-muted">{item.body}</p>
              <p className="mt-2 text-xs text-rf-text-muted">
                {[targetLabel(item), deliveryLabel(item), ANNOUNCEMENT_COPY.progress(item.sent_count, item.recipient_count)].join(" · ")}
              </p>
              {(item.status === "scheduled" || item.status === "sending") && (
                <button
                  type="button"
                  disabled={cancel.isPending}
                  onClick={() => setCancelTarget(item)}
                  className="mt-3 min-h-[44px] rounded-full border border-rf-danger px-4 text-xs font-semibold text-rf-danger disabled:opacity-50"
                >
                  {ANNOUNCEMENT_COPY.cancel}
                </button>
              )}
            </div>
          ))}
        </div>
      </GlassCard>

      <ConfirmDialog
        open={!!cancelTarget}
        title={ANNOUNCEMENT_COPY.cancelTitle}
        description={ANNOUNCEMENT_COPY.cancelBody}
        confirmLabel={ANNOUNCEMENT_COPY.cancel}
        cancelLabel={ANNOUNCEMENT_COPY.keep}
        danger
        onClose={() => setCancelTarget(null)}
        onConfirm={() => {
          if (cancelTarget) cancel.mutate(cancelTarget.id);
        }}
      />
    </>
  );
}
