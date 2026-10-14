"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { NOTIFICATION_COPY, type InboxItem, type UnreadCounts } from "@/lib/api/notifications";
import {
  NOTIFICATION_KEYS,
  useClearInbox,
  useInboxQuery,
  useMarkRead,
  useRemoveInboxItem
} from "@/lib/notifications/queries";
import { appError, toAppError } from "@/lib/kit/app-error";
import { fromQuery, retryNow } from "@/lib/kit/async-state";
import { KIT_COPY } from "@/lib/kit/copy";
import { useOnlineStatus } from "@/lib/kit/use-online-status";
import { ErrorView } from "@/components/kit/ErrorView";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { InboxItemRow } from "@/components/notifications/InboxItemRow";

const offlineLine = (lead: string) => `${lead} ${KIT_COPY.errors.offline}`;

// The inbox (D-N4) under the pending invites in the "+" sheet: newest first, 90 days, "Load more" by next_cursor.
// The reading rule (D-N5): once the first FRESH page is on screen, everything is marked read with one { all: true }
// (decided from that page or a non-zero cached unread count, never the cached count alone — the read flag is the legacy
// acknowledged flag, so it clears on every device); an item that arrives while it is on screen is marked read on
// arrival; unmounted, it marks nothing. Dots keep showing what was new for the whole visit. Kit states: loading line,
// ErrorView + Retry (offline swap), an inline "Couldn't refresh" + Retry over kept items while online — offline, the
// global banner (drawn above page modals) says it. `onFailedChange` lets the sheet hide the invitations' own error
// while this list has failed (the inbox-states rule: one ErrorView on screen).
// Remove one + Clear all (§3.9 rule 11, D-C32): an × per row (web's idiom — the phones swipe) and "Clear all" on the
// heading line while a notification is listed. Both are optimistic (rows leave at once, come back on a refusal). Offline
// fails at once with the kit's offline words (Clear all: before its dialog opens). Failures show under the heading; a
// refused Clear all shows inside its ConfirmDialog (kept open while it runs — the web dialog idiom). While an edit runs
// the reading rule waits: the edit cancels any in-flight read (the page on screen may be the stale cached one) and
// re-reads the inbox when it settles, so marking only ever decides from a fresh page.
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
  const removeMutation = useRemoveInboxItem(token);
  const clearMutation = useClearInbox(token);
  const [newIds, setNewIds] = useState<Set<string>>(() => new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const markedAll = useRef(false);
  const state = fromQuery(inboxQuery);
  const failed = state.status === "failed";
  const editing = removeMutation.isPending || clearMutation.isPending;
  const items = inboxQuery.data?.pages.flatMap((page) => page.items) ?? [];

  useEffect(() => {
    onFailedChange?.(failed);
  }, [failed]);

  useEffect(() => () => onFailedChange?.(false), []);

  useEffect(() => {
    if (!inboxQuery.data || inboxQuery.fetchStatus !== "idle" || inboxQuery.isError || editing) return;
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
  }, [inboxQuery.data, inboxQuery.fetchStatus, inboxQuery.isError, editing]);

  const open = (item: InboxItem) => {
    if (item.read_at === null) markRead.mutate([item.id]);
    onOpenItem(item);
  };

  const remove = async (item: InboxItem) => {
    if (!online) {
      setActionError(offlineLine(NOTIFICATION_COPY.removeFailed));
      return;
    }
    setActionError(null);
    try {
      await removeMutation.mutateAsync(item.id);
    } catch (error) {
      setActionError(`${NOTIFICATION_COPY.removeFailed} ${toAppError(error).message}`);
    }
  };

  const askClearAll = () => {
    if (!online) {
      setActionError(offlineLine(NOTIFICATION_COPY.clearFailed));
      return;
    }
    setActionError(null);
    setClearError(null);
    setConfirmingClear(true);
  };

  const clearAll = async () => {
    if (!online) {
      setClearError(offlineLine(NOTIFICATION_COPY.clearFailed));
      return;
    }
    setClearError(null);
    try {
      await clearMutation.mutateAsync();
      setConfirmingClear(false);
    } catch (error) {
      setClearError(`${NOTIFICATION_COPY.clearFailed} ${toAppError(error).message}`);
    }
  };

  // The dialog sits outside the spaced section: a space-y margin on its fixed overlay would leave an undimmed strip.
  return (
    <div>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-rf-text-muted">
            {NOTIFICATION_COPY.notificationsHeading}
          </h3>
          {items.length > 0 && (
            <button
              type="button"
              onClick={askClearAll}
              className="inline-flex min-h-[44px] shrink-0 items-center rounded-full px-3 text-sm font-semibold text-rf-accent transition hover:text-rf-accent-strong"
            >
              {NOTIFICATION_COPY.clearAll}
            </button>
          )}
        </div>
        {actionError && (
          <p role="alert" className="text-sm font-semibold text-rf-danger">
            {actionError}
          </p>
        )}
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
        {items.map((item) => (
          <InboxItemRow
            key={item.id}
            item={item}
            unread={item.read_at === null || newIds.has(item.id)}
            onOpen={() => open(item)}
            onRemove={() => void remove(item)}
          />
        ))}
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
      <ConfirmDialog
        open={confirmingClear}
        title={NOTIFICATION_COPY.clearConfirmTitle}
        description={NOTIFICATION_COPY.clearConfirmBody}
        confirmLabel={NOTIFICATION_COPY.clearAll}
        danger
        loading={clearMutation.isPending}
        loadingLabel={NOTIFICATION_COPY.clearing}
        errorMessage={clearError}
        closeOnConfirm={false}
        onConfirm={() => void clearAll()}
        onClose={() => setConfirmingClear(false)}
      />
    </div>
  );
}
