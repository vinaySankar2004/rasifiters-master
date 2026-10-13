"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { NOTIFICATION_COPY, type InboxItem, type UnreadCounts } from "@/lib/api/notifications";
import { NOTIFICATION_KEYS, useInboxQuery, useMarkRead } from "@/lib/notifications/queries";
import { appError } from "@/lib/kit/app-error";
import { fromQuery, retryNow } from "@/lib/kit/async-state";
import { KIT_COPY } from "@/lib/kit/copy";
import { useOnlineStatus } from "@/lib/kit/use-online-status";
import { ErrorView } from "@/components/kit/ErrorView";

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** Just now · 5m ago · 3h ago · Yesterday · Oct 12 · Oct 12, 2025 (the browser's time zone; same rule on the phones). */
export function inboxTimeLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = (now.getTime() - date.getTime()) / 1000;
  if (seconds < 60) return NOTIFICATION_COPY.justNow;
  if (seconds < 3600) return NOTIFICATION_COPY.minutesAgo(Math.floor(seconds / 60));
  const day = startOfDay(date);
  if (day === startOfDay(now)) return NOTIFICATION_COPY.hoursAgo(Math.floor(seconds / 3600));
  if (day === new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime()) return NOTIFICATION_COPY.yesterday;
  return date.toLocaleDateString(
    undefined,
    date.getFullYear() === now.getFullYear()
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" }
  );
}

// The inbox (D-N4) under the pending invites in the "+" sheet: newest first, 90 days, "Load more" by next_cursor.
// The reading rule (D-N5): once the first FRESH page is on screen, everything is marked read with one { all: true }
// (decided from that page or a non-zero cached unread count, never the cached count alone — the read flag is the legacy
// acknowledged flag, so it clears on every device); an item that arrives while it is on screen is marked read on
// arrival; unmounted, it marks nothing. Dots keep showing what was new for the whole visit. Kit states: loading line,
// ErrorView + Retry (offline swap), an inline "Couldn't refresh" + Retry over kept items while online — offline, the
// global banner (drawn above page modals) says it. `onFailedChange` lets the sheet hide the invitations' own error
// while this list has failed (the inbox-states rule: one ErrorView on screen).
export function InboxList({
  token,
  onOpenItem,
  onFailedChange,
  onRetry
}: {
  token: string;
  onOpenItem: (item: InboxItem) => void;
  onFailedChange?: (failed: boolean) => void;
  /** Runs with this list's Retry (the sheet re-reads the invitations too). */
  onRetry?: () => void;
}) {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const inboxQuery = useInboxQuery(token);
  const markRead = useMarkRead(token);
  const [newIds, setNewIds] = useState<Set<string>>(() => new Set());
  const markedAll = useRef(false);
  const state = fromQuery(inboxQuery);
  const failed = state.status === "failed";
  const items = inboxQuery.data?.pages.flatMap((page) => page.items) ?? [];

  useEffect(() => {
    onFailedChange?.(failed);
  }, [failed]);

  useEffect(() => () => onFailedChange?.(false), []);

  useEffect(() => {
    if (!inboxQuery.data || inboxQuery.isFetching || inboxQuery.isError) return;
    const unreadIds = items.filter((item) => item.read_at === null).map((item) => item.id);
    if (!markedAll.current) {
      markedAll.current = true;
      setNewIds(new Set(unreadIds));
      const unreadCount = queryClient.getQueryData<UnreadCounts>(NOTIFICATION_KEYS.unread)?.unread ?? 0;
      if (unreadIds.length > 0 || unreadCount > 0) markRead.mutate("all");
      return;
    }
    if (unreadIds.length > 0) {
      setNewIds((previous) => new Set([...previous, ...unreadIds]));
      markRead.mutate(unreadIds.slice(0, 100));
    }
  }, [inboxQuery.data, inboxQuery.isFetching, inboxQuery.isError]);

  const open = (item: InboxItem) => {
    if (item.read_at === null) markRead.mutate([item.id]);
    onOpenItem(item);
  };

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-rf-text-muted">
        {NOTIFICATION_COPY.notificationsHeading}
      </h3>
      {state.status === "loading" && (
        <p className="py-4 text-center text-sm text-rf-text-muted">{NOTIFICATION_COPY.inboxLoading}</p>
      )}
      {state.status === "failed" && (
        <ErrorView
          error={online ? state.error : appError("offline")}
          onRetry={() => {
            void retryNow(queryClient, NOTIFICATION_KEYS.inbox);
            onRetry?.();
          }}
        />
      )}
      {state.status === "stale" && online && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-rf-surface-muted px-4 py-1 text-sm font-semibold text-rf-text-muted">
          <span className="py-2">{KIT_COPY.bannerStale}</span>
          <button
            type="button"
            onClick={() => void inboxQuery.refetch()}
            className="h-11 shrink-0 rounded-full px-3 text-rf-accent"
          >
            {KIT_COPY.retry}
          </button>
        </div>
      )}
      {(state.status === "loaded" || state.status === "stale") && items.length === 0 && (
        <div className="rounded-2xl bg-rf-surface-muted px-6 py-8 text-center">
          <p className="text-base font-semibold text-rf-text">{NOTIFICATION_COPY.inboxEmptyTitle}</p>
          <p className="mt-2 text-sm text-rf-text-muted">{NOTIFICATION_COPY.inboxEmptyBody}</p>
        </div>
      )}
      {items.map((item) => {
        const unread = item.read_at === null || newIds.has(item.id);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => open(item)}
            className="flex w-full items-start gap-3 rounded-2xl border border-rf-border bg-rf-surface p-4 text-left transition hover:border-rf-accent/60"
          >
            <span
              aria-hidden="true"
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? "bg-rf-accent" : "bg-transparent"}`}
            />
            <span className="min-w-0 flex-1">
              <span className="block break-words text-sm font-semibold text-rf-text">{item.title}</span>
              {item.body && <span className="mt-1 block break-words text-sm text-rf-text-muted">{item.body}</span>}
              <span className="mt-1 block text-xs text-rf-text-muted">{inboxTimeLabel(item.created_at)}</span>
            </span>
            {unread && <span className="sr-only">{NOTIFICATION_COPY.unread}</span>}
          </button>
        );
      })}
      {inboxQuery.hasNextPage && (
        <button
          type="button"
          disabled={inboxQuery.isFetchingNextPage}
          onClick={() => void inboxQuery.fetchNextPage()}
          className="pill-button w-full rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-50"
        >
          {inboxQuery.isFetchingNextPage ? NOTIFICATION_COPY.loadingMore : NOTIFICATION_COPY.loadMore}
        </button>
      )}
    </section>
  );
}
