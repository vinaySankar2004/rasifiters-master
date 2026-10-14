# PLAN: Phase 4 touch-up (a), inbox management (remove one + Clear all; invites untouched), revision 2

**Brief accepted**: yes. 16 code files: the 13 briefed files plus the 3 optional new files the brief allowed (`apps/web/src/components/notifications/InboxItemRow.tsx`, `apps/ios/RaSi-Fiters-App/Features/Home/Inbox/InboxFeed.swift`, `apps/ios/RaSi-Fiters-App/Features/Home/Inbox/InboxSwipeToDelete.swift`). Plus 7 docs at landing.

**Feature/version prediction**: notifications v0.6.1 → v0.7.0. This is MINOR: the owned interface gains 2 additive routes and client rule §3.9 #11. Page SPECs move as follows: web/programs 0.5.0 → 0.6.0, ios/inbox 0.1.0 → 0.2.0, android/inbox 0.1.0 → 0.2.0.

**Surfaces in scope**: [backend, web, ios, android]. The file sets don't overlap. The backend is committed, pushed and live BEFORE the client commits are pushed (Endgame step 25).

### Revision log (how each adversary objection is fixed)
1. **[BLOCKING] commit and deploy isolation.**
   - Step 25 stages exact paths, one commit per surface, and never runs `git add -A` or `git add .`.
   - These stay unstaged and out of every commit: the SEO files (`apps/web/src/app/layout.tsx`, the six `*/layout.tsx`, `plans/phase-4-seo.md`), `HANDOFF.md` and `EdgeSwipeToReturn.swift`.
   - The web fallback deploy runs ONLY from a clean detached worktree of the pushed commit, never from the main tree.
   - The backend is pushed alone first.
2. **(A) vs (B)** is now an explicit USER DECISION, shown first below. The complete (B) delta is written out.
3. **iOS Clear-all alert could be dropped.** iOS failures are now an inline line under the Notifications heading, not an alert. This copies the existing `NotificationPreferencesSection` saveError idiom and matches web and Android, so there is no presentation conflict. Offline is checked at the Clear-all tap on all 3 surfaces, before any confirm opens.
4. **Android swipe threshold.** Android now uses `positionalThreshold = { it * 0.4f }`.
5. **Optimistic edits undone by in-flight loads.**
   - iOS: `InboxFeed.remove` / `clearAll` bump `generation`.
   - Android: `NotificationInbox` gains a `listEdits` counter, and a first-page load that was in flight when an edit happened is dropped.
   - Web: already cancels queries.
6. **Clear all now has its own path, `DELETE /inbox/all`.** An empty-id `DELETE /inbox/` matches no route, so it can never wipe the inbox. A literal path segment also avoids query encoding on iOS, which uses `appendingPathComponent`.
7. **Docs and checklist.**
   - Web `InboxList.tsx` is about 215 lines, so it gets an F7 entry. `inboxTimeLabel` moves into `InboxItemRow.tsx`, its only user.
   - The Android SPEC gets a new "## Flagged" section.
   - The iOS checklist adds back-swipe and the failure line.

## USER DECISION AT APPROVAL: what counts as an "invite" (default = A)
- **(A) default.** "Invites" means the Invitations section (`program_invites` rows with Accept/Decline). These routes never touch that table, so an invite stays until it is answered.
  - Every Notifications row is removable, including the informational `program.invite_received` row.
  - Clear all shows while any notification is listed. That matches "at least one non-invite item", because the Invitations section is the invites.
  - Why A: under (B), invite rows can never be removed and stay for 90 days even after the invite is answered, so Clear all looks broken.
- **(B), if the user picks it.** Apply the "(B) delta" at the end of this plan on top of the steps below. That is everything needed for B; nothing else changes.

**Shared rules (all surfaces, §3.9 rule 11):**
- Removal is optimistic. A refusal puts the rows back and shows the failure line under the Notifications heading.
- A 404 on remove-one counts as removed: no error, and the counts are re-read.
- Offline fails at once with the kit's offline words, and no request is sent. For Clear all, the offline check happens at the tap, so no confirm opens.
- The server's counts update the "+" badge, the account rows' "N new" and the iOS icon badge.
- After a successful Clear all, the newest page is re-read.

**Platform idiom (the only sanctioned divergence):**
- Removing a row: iOS left-swipe reveals a red Remove; Android swipes the card away from end to start; web has an × per row.
- Confirm: iOS `confirmationDialog`, Android `AlertDialog`, web `ConfirmDialog`.
- A refused Clear all: on web the error shows inside the dialog, which stays open (`closeOnConfirm={false}`). On the phones the dialog closes and the line shows under the heading.

**Copy (identical everywhere):**

| Element | Text |
|---|---|
| Heading button | `Clear all` |
| Confirm title | `Clear all notifications?` |
| Confirm body | `They're removed from your Inbox on all your devices. Invitations stay until you answer them.` |
| Confirm buttons | `Clear all` (destructive) and `Cancel`. Web only, while running: `Clearing…` |
| Remove label | phones `Remove`; web × aria-label `Remove notification` |
| Remove failure | `Couldn't remove the notification. <kit message>` |
| Clear all failure | `Couldn't clear your notifications. <kit message>` |

## Steps — backend

1. Replace all of `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/notificationInbox.js` with:
```js
// /api/notifications/inbox — the notification inbox (D-N3 / D-N4 / D-N5) — notifications SPEC §3.5 (the inbox rule).
// Self-only: every route acts on the token's member. Read = the existing acknowledged flag (D-N5): an item read here
// leaves every live binary's /unacknowledged queue, and a live binary's acknowledge marks it read here. Each request also
// captures the caller's X-Time-Zone (the time-zone rule, fire-and-forget). Errors are { error, code } (frontend-kit §4).
// 0.7.0 (D-C32): DELETE /all (Clear all) and DELETE /:id (remove one) hard-delete the member's OWN recipient rows. Clear
// all is the literal /all — never DELETE / — so a remove-one call with an empty id (/inbox/) can never match it.
const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const { parseTimeZone } = require("../utils/clientInfo");
const { AppError } = require("../utils/response");
const { logError } = require("../utils/logError");
const { rateLimit } = require("../utils/rateLimit");
const { rememberTimeZone } = require("../services/notificationPreferenceService");
const inboxService = require("../services/notificationInboxService");

const router = express.Router();

router.use(authenticateToken, (req, _res, next) => {
    rememberTimeZone(req.user.id, parseTimeZone(req.get("x-time-zone")));
    next();
});

// D-C32: ONE per-member bucket for both deletes — 120 / 10 min (utils/rateLimit: process memory, a deploy resets it).
const limitInboxDeletes = rateLimit({ windowMs: 10 * 60 * 1000, max: 120, keyFn: (req) => req.user.id });

const handle = (tag, fallback, run) => async (req, res) => {
    try {
        res.json(await run(req));
    } catch (err) {
        if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
        logError(`[notifications] ${tag} failed:`, err);
        return res.status(500).json({ error: fallback, code: "server_error" });
    }
};

router.get("/", handle("inbox list", "Failed to load notifications.",
    (req) => inboxService.listInbox(req.user.id, req.query)));
router.get("/unread-count", handle("unread count", "Failed to load notifications.",
    (req) => inboxService.getUnreadCounts(req.user.id)));
router.post("/read", handle("mark read", "Failed to update notifications.",
    (req) => inboxService.markRead(req.user.id, req.body)));
// "/all" BEFORE "/:id" (a literal segment; notification ids are uuids, so they never collide).
router.delete("/all", limitInboxDeletes, handle("clear inbox", "Failed to update notifications.",
    (req) => inboxService.clearAll(req.user.id)));
router.delete("/:id", limitInboxDeletes, handle("remove notification", "Failed to update notifications.",
    (req) => inboxService.removeItem(req.user.id, req.params.id)));

module.exports = router;
```

2. In `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/notificationInboxService.js`, after line 5 (`// Daily reminders and weekly digests stay …`), insert:
```js
// Remove one / Clear all (0.7.0, D-C32) hard-delete the member's OWN notification_recipients rows (never program_invites).
```

3. In the same file, replace line 149 (`module.exports = { listInbox, getBadgeCounts, getUnreadCounts, markRead };`) with:
```js
const notFound = () => new AppError(404, "Notification not found.", { code: "not_found" });

/** Remove one (D-C32): THIS member's recipient row only — the notification stays for its other recipients (one left with
 *  none goes with the 90-day retention, D-C28). A malformed id → 400; unknown, another member's or already removed → 404. */
async function removeItem(memberId, id) {
    if (typeof id !== "string" || !UUID_RE.test(id)) throw invalid("id must be a notification id.");
    const deleted = await NotificationRecipient.destroy({
        where: { member_id: memberId, notification_id: id.toLowerCase() }
    });
    if (deleted === 0) throw notFound();
    return { deleted, ...(await getUnreadCounts(memberId)) };
}

/** Clear all (D-C32): every recipient row of THIS member; idempotent (0 deleted is still 200). Invitations live in
 *  program_invites and are never touched; nothing re-sends (send keys + push_deliveries never read these rows). */
async function clearAll(memberId) {
    const deleted = await NotificationRecipient.destroy({ where: { member_id: memberId } });
    return { deleted, ...(await getUnreadCounts(memberId)) };
}

module.exports = { listInbox, getBadgeCounts, getUnreadCounts, markRead, removeItem, clearAll };
```

## Steps — web

4. Edits to `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/lib/api/notifications.ts`:
   - (a) After line 26 (`export type MarkReadResult = …`), add:
```ts
export type InboxDeleteResult = UnreadCounts & { deleted: number };
```
   - (b) After `markNotificationsRead` (ends line 52), add:
```ts

/** DELETE /notifications/inbox/:id — this member's own item, gone on every device; answers fresh counts (404 = gone). */
export function removeInboxItem(token: string, id: string) {
  return apiRequest<InboxDeleteResult>(`/notifications/inbox/${encodeURIComponent(id)}`, { method: "DELETE", token });
}

/** DELETE /notifications/inbox/all — every notification (the invitations are separate and stay); answers fresh counts. */
export function clearInbox(token: string) {
  return apiRequest<InboxDeleteResult>("/notifications/inbox/all", { method: "DELETE", token });
}
```
   - (c) In `NOTIFICATION_COPY`, after line 84 (`loadingMore: "Loading…",`), add:
```ts
  clearAll: "Clear all",
  clearConfirmTitle: "Clear all notifications?",
  clearConfirmBody: "They're removed from your Inbox on all your devices. Invitations stay until you answer them.",
  clearing: "Clearing…",
  removeLabel: "Remove notification",
  removeFailed: "Couldn't remove the notification.",
  clearFailed: "Couldn't clear your notifications.",
```

5. Edits to `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/lib/notifications/queries.ts`:
   - (a) Replace the import block at lines 11–22 with:
```ts
import {
  clearInbox,
  fetchInbox,
  fetchNotificationPreferences,
  fetchUnreadCount,
  markNotificationsRead,
  removeInboxItem,
  updateNotificationPreferences,
  type InboxPage,
  type MarkReadResult,
  type NotificationPreferences,
  type PreferencesUpdate,
  type UnreadCounts
} from "@/lib/api/notifications";
import { toAppError } from "@/lib/kit/app-error";
```
   - (b) Directly above `/** A mark-read answer: …` (line 62 before (a); re-locate it by its text), insert:
```ts
type InboxData = InfiniteData<InboxPage>;

/** The server's fresh counts → the "+" badge and the account row (they share this cache entry). */
function setUnreadCounts(queryClient: QueryClient, result: UnreadCounts): void {
  queryClient.setQueryData<UnreadCounts>(NOTIFICATION_KEYS.unread, {
    unread: result.unread,
    pending_invites: result.pending_invites,
    badge: result.badge
  });
}

```
   - (c) In `applyReadResult`, replace its first statement (`queryClient.setQueryData<UnreadCounts>(NOTIFICATION_KEYS.unread, { unread: result.unread, pending_invites: result.pending_invites, badge: result.badge });`, 5 lines) with:
```ts
  setUnreadCounts(queryClient, result);
```
   - (d) Append at the end of the file:
```ts

/** Optimistic inbox edit: stop in-flight reads (they would overwrite it) and keep the old pages for the rollback. */
async function editInbox(queryClient: QueryClient, edit: (data: InboxData) => InboxData) {
  await queryClient.cancelQueries({ queryKey: NOTIFICATION_KEYS.inbox });
  const previous = queryClient.getQueryData<InboxData>(NOTIFICATION_KEYS.inbox);
  if (previous) queryClient.setQueryData<InboxData>(NOTIFICATION_KEYS.inbox, edit(previous));
  return { previous };
}

/** Remove one (§3.9 rule 11): the row leaves the cached pages at once and comes back if the server refuses; a 404
 *  (already gone on another device) counts as removed. The answer's counts feed the "+" badge and the account row. */
export function useRemoveInboxItem(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<UnreadCounts | null> => {
      try {
        return await removeInboxItem(token, id);
      } catch (error) {
        if (toAppError(error).kind === "notFound") return null;
        throw error;
      }
    },
    onMutate: (id) =>
      editInbox(queryClient, (data) => ({
        ...data,
        pages: data.pages.map((page) => ({ ...page, items: page.items.filter((item) => item.id !== id) }))
      })),
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(NOTIFICATION_KEYS.inbox, context.previous);
    },
    onSuccess: (result) => {
      if (result) setUnreadCounts(queryClient, result);
      else void queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEYS.unread });
    }
  });
}

/** Clear all (§3.9 rule 11): every notification leaves at once (one empty page, so no "Load more"); a refusal restores
 *  the pages; success sets the counts and re-reads the inbox (anything that arrived meanwhile). Invitations are a
 *  separate list and never change here. */
export function useClearInbox(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => clearInbox(token),
    onMutate: () => editInbox(queryClient, () => ({ pages: [{ items: [], next_cursor: null }], pageParams: [null] })),
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(NOTIFICATION_KEYS.inbox, context.previous);
    },
    onSuccess: (result) => {
      setUnreadCounts(queryClient, result);
      void queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEYS.inbox });
    }
  });
}
```

6. Create `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/components/notifications/InboxItemRow.tsx`. `inboxTimeLabel` moves here verbatim from InboxList.tsx; nothing else imports it.
```tsx
"use client";

import { NOTIFICATION_COPY, type InboxItem } from "@/lib/api/notifications";

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

// One inbox row (notifications §3.9 rules 8 + 11): the card opens the item; the × removes it (web's idiom — the phones
// swipe). Two SIBLING buttons in one bordered card (a button inside a button is invalid HTML); the × is a 44 px target.
export function InboxItemRow({
  item,
  unread,
  onOpen,
  onRemove
}: {
  item: InboxItem;
  unread: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex w-full items-start rounded-2xl border border-rf-border bg-rf-surface transition hover:border-rf-accent/60">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-2xl p-4 pr-1 text-left"
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
      <button
        type="button"
        onClick={onRemove}
        aria-label={NOTIFICATION_COPY.removeLabel}
        className="m-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg leading-none text-rf-text-muted transition hover:text-rf-text"
      >
        ×
      </button>
    </div>
  );
}
```

7. Replace all of `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/components/notifications/InboxList.tsx` with:
```tsx
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
// refused Clear all shows inside its ConfirmDialog (kept open while it runs — the web dialog idiom).
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

  return (
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
    </section>
  );
}
```

## Steps — ios

8. In `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Shared/Services/APIClient+Inbox.swift`, after `markAllInboxRead()` (ends line 69), insert:
```swift

    /// DELETE /notifications/inbox/:id — this member's own item, gone on every device → fresh counts (the extra
    /// `deleted` key is ignored). 404 = unknown / not this member's / already gone.
    func deleteInboxItem(id: String) async throws -> InboxCountsDTO {
        let data = try await data(for: authorizedRequest("notifications/inbox/\(id)", method: "DELETE"))
        return try JSONDecoder().decode(InboxCountsDTO.self, from: data)
    }

    /// DELETE /notifications/inbox/all — every notification (the invitations are separate and stay) → fresh counts.
    func clearInbox() async throws -> InboxCountsDTO {
        let data = try await data(for: authorizedRequest("notifications/inbox/all", method: "DELETE"))
        return try JSONDecoder().decode(InboxCountsDTO.self, from: data)
    }
```

9. In `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Shared/Models/ProgramContext+Inbox.swift`, after `markAllInboxRead()` (ends line 100), insert:
```swift

    /// DELETE /inbox/:id (§3.9 rule 11) → fresh counts: the "+" badge, the account rows' "<n> new", the app-icon badge.
    /// A 404 (already gone on another device) counts as removed. Any other failure throws (the Inbox puts the row back).
    func removeInboxItem(id: String) async throws {
        do {
            applyInboxCounts(try await APIClient.shared.deleteInboxItem(id: id))
        } catch let error where AppError(error)?.kind == .notFound {
            await refreshInboxCounts()
        }
    }

    /// DELETE /inbox/all (§3.9 rule 11) → fresh counts. The invitations (program_invites) are never touched.
    func clearInbox() async throws {
        applyInboxCounts(try await APIClient.shared.clearInbox())
    }
```

10. Edits to `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Features/Home/Inbox/InboxRow.swift`:
    - (a) Delete line 1 (`import Combine`). It moves with InboxFeed.
    - (b) Line 67: change `.stroke(Color(.systemGray4).opacity(0.6), lineWidth: 1))` to `.strokeBorder(Color(.systemGray4).opacity(0.6), lineWidth: 1))`. The border is then drawn inside the card, so the swipe ScrollView's clip never thins it.
    - (c) Delete lines 96–166, from `/// The inbox list's paging state (GET /notifications/inbox — C4): …` through the closing `}` of `final class InboxFeed`. It moves to step 11.
    - (d) In `enum InboxCopy`, after `static let toastFallbackTitle = "New notification"`, add:
```swift
    static let clearAll = "Clear all"
    static let clearConfirmTitle = "Clear all notifications?"
    static let clearConfirmMessage = "They're removed from your Inbox on all your devices. Invitations stay until you answer them."
    static let remove = "Remove"
    static let removeFailed = "Couldn't remove the notification."
    static let clearFailed = "Couldn't clear your notifications."
```

11. Create `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Features/Home/Inbox/InboxFeed.swift`. Everything through `inviteItemIds` is the old InboxRow.swift lines 96–166, moved verbatim. The project uses a synchronized group, so there is no pbxproj edit.
```swift
import Combine
import Foundation

/// The inbox list's paging state (GET /notifications/inbox — C4): the first page on open / refresh, then older pages by
/// `next_cursor` as the last row appears. A reload supersedes a page still in flight (generation).
final class InboxFeed: ObservableObject {
    @Published private(set) var state: LoadState<[APIClient.NotificationDTO]> = .idle
    @Published private(set) var isLoadingMore = false
    private var nextCursor: String?
    private var generation = 0

    /// true when THIS call loaded the first page (InboxView marks read only then).
    @discardableResult
    func reload(online: Bool) async -> Bool {
        generation += 1
        let current = generation
        state = state.refreshing()
        do {
            let page = try await APIClient.shared.fetchInbox()
            guard current == generation else { return false }
            nextCursor = page.nextCursor
            state = .fresh(page.items)
            return true
        } catch {
            guard current == generation, let appError = AppError(error) else { return false }
            state = state.failing(with: appError.labeled(online: online))
            return false
        }
    }

    /// A live reload (an item arrived / the catch-up): page 1 merged into the loaded pages — the rows paged in and their
    /// cursor stay; a row inside page 1's span that's gone was removed server-side (e.g. an undone kudos).
    @discardableResult
    func refreshHead(online: Bool) async -> Bool {
        guard state.value != nil else { return await reload(online: online) }
        generation += 1
        let current = generation
        do {
            let page = try await APIClient.shared.fetchInbox()
            guard current == generation else { return false }
            let loaded = state.value ?? []                                  // the rows now, not before the fetch
            let pageIds = Set(page.items.map(\.id))
            let oldest = page.items.last?.createdDate
            let older = page.nextCursor == nil ? [] : loaded.filter { item in
                guard !pageIds.contains(item.id), let date = item.createdDate, let oldest else { return false }
                return date <= oldest
            }
            if older.isEmpty { nextCursor = page.nextCursor }
            state = .fresh(page.items + older)
            return true
        } catch {
            guard current == generation, let appError = AppError(error) else { return false }
            state = state.failing(with: appError.labeled(online: online))
            return false
        }
    }

    func loadMore() async {
        guard !isLoadingMore, let cursor = nextCursor, state.value != nil else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        let current = generation
        guard let page = try? await APIClient.shared.fetchInbox(before: cursor), current == generation,
              let items = state.value else { return }                       // the rows now, not before the fetch
        nextCursor = page.nextCursor
        let known = Set(items.map(\.id))
        state = .fresh(items + page.items.filter { !known.contains($0.id) })
    }

    /// C7.7: the loaded invite notifications of one program (an accept / decline marks them read).
    func inviteItemIds(programId: String) -> [String] {
        (state.value ?? []).filter { $0.type == "program.invite_received" && $0.programId == programId }.map(\.id)
    }

    // MARK: Remove + Clear all (§3.9 rule 11, D-C32) — optimistic; each bumps the generation, so a load already in
    // flight (it would bring the removed rows back) is dropped on landing.

    /// Remove one: the row leaves at once; if `send` throws it comes back where it was (unless a reload already brought
    /// it back) and the error is rethrown.
    func remove(id: String, send: () async throws -> Void) async throws {
        guard let items = state.value, let index = items.firstIndex(where: { $0.id == id }) else { return }
        let item = items[index]
        generation += 1
        replaceItems { $0.filter { $0.id != id } }
        do {
            try await send()
        } catch {
            replaceItems { current in
                guard !current.contains(where: { $0.id == item.id }) else { return current }
                var restored = current
                restored.insert(item, at: min(index, restored.count))
                return restored
            }
            throw error
        }
    }

    /// Clear all: every loaded row leaves at once; if `send` throws they come back under anything that arrived meanwhile
    /// and the error is rethrown; success re-reads the newest page (what arrived meanwhile + a fresh cursor).
    func clearAll(online: Bool, send: () async throws -> Void) async throws {
        guard let items = state.value, !items.isEmpty else { return }
        generation += 1
        replaceItems { _ in [] }
        do {
            try await send()
        } catch {
            replaceItems { current in
                let shown = Set(current.map(\.id))
                return current + items.filter { !shown.contains($0.id) }
            }
            throw error
        }
        await refreshHead(online: online)
    }

    /// Keeps the load state (fresh / stale + its banner) and swaps only the rows.
    private func replaceItems(_ transform: ([APIClient.NotificationDTO]) -> [APIClient.NotificationDTO]) {
        switch state {
        case .loaded(let items, let fetchedAt, let refreshing):
            state = .loaded(transform(items), fetchedAt: fetchedAt, refreshing: refreshing)
        case .stale(let items, let fetchedAt, let error):
            state = .stale(transform(items), fetchedAt: fetchedAt, error: error)
        case .idle, .loading, .failed:
            break
        }
    }
}
```

12. Create `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Features/Home/Inbox/InboxSwipeToDelete.swift`:
```swift
import SwiftUI

/// Swipe-to-remove for one inbox card (notifications §3.9 rule 11; iOS idiom — web shows a ×, Android swipes the card
/// away). The Inbox is a ScrollView of cards, not a List, so `.swipeActions` isn't available: each card sits in its own
/// horizontal ScrollView and a left swipe reveals a red Remove button, settling open or closed (InboxRevealBehavior).
/// UIKit's nested-scroll handling arbitrates the gestures — no DragGesture fights the vertical scroll, the "+" sheet's
/// paged TabView (a swipe that starts ON a card reveals Remove; elsewhere it still pages) or the root keyboard-dismiss
/// tap. Closed, the card looks exactly as before. VoiceOver: the card's "Remove" action.
struct InboxSwipeToDelete<Content: View>: View {
    private let onRemove: () -> Void
    private let content: Content

    init(onRemove: @escaping () -> Void, @ViewBuilder content: () -> Content) {
        self.onRemove = onRemove
        self.content = content()
    }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: InboxRevealBehavior.gap) {
                content
                    .containerRelativeFrame(.horizontal)
                    .accessibilityAction(named: Text(InboxCopy.remove), onRemove)
                Button(action: onRemove) {
                    VStack(spacing: 4) {
                        Image(systemName: "trash")
                            .font(.system(size: 17, weight: .semibold))
                        Text(InboxCopy.remove)
                            .font(.caption.weight(.semibold))
                    }
                    .foregroundColor(.white)
                    .frame(width: InboxRevealBehavior.buttonWidth)
                    .frame(maxHeight: .infinity)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color(.systemRed)))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHidden(true)
            }
            .fixedSize(horizontal: false, vertical: true)
        }
        .scrollTargetBehavior(InboxRevealBehavior())
    }
}

/// Settles a card closed (0) or open (the Remove button showing) — whichever the swipe would end nearer.
/// `nonisolated`: default MainActor isolation would make the ScrollTargetBehavior conformance main-actor-isolated.
nonisolated struct InboxRevealBehavior: ScrollTargetBehavior {
    static let buttonWidth: CGFloat = 76
    static let gap: CGFloat = 8

    func updateTarget(_ target: inout ScrollTarget, context: TargetContext) {
        let open = Self.buttonWidth + Self.gap
        target.rect.origin.x = target.rect.minX > open / 2 ? open : 0
    }
}

/// The Notifications section heading (§3.9 rule 11): "Clear all" in the content (never a custom header), only while
/// notifications are listed, confirmed with a dialog (iOS idiom); the last remove / Clear all failure sits under it
/// (inline, like the notification settings' save error — never an alert racing the dialog's dismissal).
struct InboxNotificationsHeader: View {
    let canClear: Bool
    let failure: String?
    /// The Clear all tap: true → the confirm opens; false → offline (the failure line already says so).
    let shouldConfirm: () -> Bool
    let onClearAll: () -> Void
    @State private var isConfirming = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(InboxCopy.notificationsHeader)
                    .font(.headline.weight(.semibold))
                    .foregroundColor(Color(.label))
                Spacer(minLength: 8)
                if canClear {
                    Button { isConfirming = shouldConfirm() } label: {
                        Text(InboxCopy.clearAll)
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.appOrange)
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .confirmationDialog(InboxCopy.clearConfirmTitle, isPresented: $isConfirming, titleVisibility: .visible) {
                        Button(InboxCopy.clearAll, role: .destructive, action: onClearAll)
                        Button("Cancel", role: .cancel) {}
                    } message: {
                        Text(InboxCopy.clearConfirmMessage)
                    }
                }
            }
            if let failure {
                Text(failure)
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(.appRed)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}
```

13. Edits to `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Features/Home/Inbox/InboxView.swift`:
    - (a) After line 33 (`@State private var blockFutureInvites = false`), add:
```swift
    /// The last remove / Clear all failure ("Couldn't … <kit message>"), under the Notifications heading.
    @State private var actionError: String?
```
    - (b) Replace the whole `notificationsSection` property (lines 118–150) with:
```swift
    private var notificationsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            InboxNotificationsHeader(canClear: !(feed.state.value ?? []).isEmpty,
                                     failure: actionError,
                                     shouldConfirm: { shouldConfirmClearAll() },
                                     onClearAll: { Task { await clearAll() } })
            switch feed.state {
            case .idle, .loading:
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.top, 24)
            case .failed(let error):
                ErrorStateView(error: error, onRetry: { Task { await reload() } })
            case .loaded(let items, _, _), .stale(let items, _, _):
                if items.isEmpty {
                    InboxEmptyState()
                } else {
                    LazyVStack(spacing: 10) {
                        ForEach(items) { item in
                            // §3.9 rule 11: a left swipe reveals Remove (InboxSwipeToDelete).
                            InboxSwipeToDelete(onRemove: { remove(item) }) {
                                InboxRow(item: item, showsUnread: item.wasUnread(atVisitStart: visitStart),
                                         onOpen: item.opensElsewhere ? { open(item) } : nil)
                            }
                            .onAppear {
                                if item.id == items.last?.id { Task { await feed.loadMore() } }
                            }
                        }
                        if feed.isLoadingMore {
                            ProgressView().padding(.vertical, 8)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 20)
    }
```
    - (c) After `open(_:)` (ends line 213), insert:
```swift

    /// §3.9 rule 11 — swipe-remove: offline fails at once (the kit's words, no request); otherwise the row leaves now and
    /// comes back where it was if the server refuses (a 404 — already gone elsewhere — counts as removed).
    private func remove(_ item: APIClient.NotificationDTO) {
        guard programContext.isOnline else { return showFailure(InboxCopy.removeFailed, AppError(kind: .offline)) }
        actionError = nil
        let context = programContext
        Task {
            do {
                try await feed.remove(id: item.id) { try await context.removeInboxItem(id: item.id) }
            } catch {
                showFailure(InboxCopy.removeFailed, error)
            }
        }
    }

    /// The Clear all tap: offline → the failure line at once and no confirm; otherwise the confirm opens.
    private func shouldConfirmClearAll() -> Bool {
        guard programContext.isOnline else {
            showFailure(InboxCopy.clearFailed, AppError(kind: .offline))
            return false
        }
        actionError = nil
        return true
    }

    /// §3.9 rule 11 — Clear all (confirmed): every notification leaves now (the invitations above never change); success
    /// re-reads the newest page, a refusal puts the rows back.
    private func clearAll() async {
        guard programContext.isOnline else { return showFailure(InboxCopy.clearFailed, AppError(kind: .offline)) }
        let context = programContext
        do {
            try await feed.clearAll(online: context.isOnline) { try await context.clearInbox() }
        } catch {
            showFailure(InboxCopy.clearFailed, error)
        }
    }

    /// "Couldn't … <kit message>" under the heading; a cancelled call shows nothing (the next load reconciles).
    private func showFailure(_ lead: String, _ error: Error) {
        guard let appError = AppError(error) else { return }
        actionError = "\(lead) \(appError.labeled(online: programContext.isOnline).message)"
    }
```

## Steps — android

14. In `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/net/ApiService.kt`, after line 291 (`suspend fun markInboxRead(@Body body: InboxReadRequest): UnreadCountsDTO`), insert (`DELETE` and `Path` are already imported):
```kotlin

    /** Remove one of this member's own items (404 = unknown / already gone) → fresh counts. */
    @DELETE("notifications/inbox/{id}")
    suspend fun removeInboxItem(@Path("id") id: String): UnreadCountsDTO

    /** Clear all — every notification (the invitations are separate and stay) → fresh counts. */
    @DELETE("notifications/inbox/all")
    suspend fun clearInbox(): UnreadCountsDTO
```

15. In `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/net/InboxDtos.kt`:
    - After line 40 (`val updated: Int? = null,`), insert:
```kotlin
    /** Only on `DELETE /inbox/:id` / `DELETE /inbox/all`: how many items this call removed. */
    val deleted: Int? = null,
```
    - On line 32, change ``/** `GET /inbox/unread-count` and the `POST /inbox/read` answer.`` to ``/** `GET /inbox/unread-count` and the `POST /inbox/read` / `DELETE /inbox/…` answer.``. The rest of the KDoc is unchanged.

16. Edits to `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/core/NotificationInbox.kt`:
    - (a) Before line 3 (`import com.app.rasifiters.core.kit.UiState`), add:
```kotlin
import com.app.rasifiters.core.kit.AppErrorException
import com.app.rasifiters.core.kit.AppErrorKind
```
    - (b) After line 70 (`val loadingMore: StateFlow<Boolean> = _loadingMore.asStateFlow()`), add:
```kotlin
    /** Bumped by every optimistic remove / Clear all: a first-page load already in flight then is dropped on landing
     *  (its rows would bring the removed items back). */
    private var listEdits = 0
```
    - (c) In `loadFirstPage` (lines 154–167):
      - After `val o = owner() ?: return Result.success(Unit)`, add `val edits = listEdits`.
      - Change `if (o != owner()) return@onSuccess` to `if (o != owner() || edits != listEdits) return@onSuccess`.
      - Change the `.onFailure { … }` line to `.onFailure { if (it !is CancellationException && o == owner() && edits == listEdits) _items.value = _items.value.failing(it.toAppError()) }`.
    - (d) After `markInviteItemsRead` (ends line 227 before (a)/(b); re-locate it by its text), insert:
```kotlin

    // ---- remove one + Clear all (§3.9 rule 11, D-C32) ----

    /** Swipe-remove one item: it leaves the list at once and comes back where it was if the server refuses; a 404
     *  (already gone on another device) counts as removed. The answer's counts move the "+" badge. */
    suspend fun remove(id: String): Result<Unit> {
        val o = owner() ?: return Result.success(Unit)
        val before = _items.value.dataOrNull ?: return Result.success(Unit)
        val index = before.indexOfFirst { it.id == id }
        if (index < 0) return Result.success(Unit)
        val removed = before[index]
        listEdits++
        updateItems { list -> list.filterNot { it.id == id } }
        return runCatching { api.removeInboxItem(id) }.fold(
            onSuccess = { counts -> applyCounts(o, counts); Result.success(Unit) },
            onFailure = { e ->
                if (e is CancellationException) throw e
                val error = e.toAppError()
                when {
                    o != owner() -> Result.success(Unit)
                    error.kind == AppErrorKind.NOT_FOUND -> { refreshCounts(); Result.success(Unit) }
                    else -> {
                        updateItems { list ->
                            if (list.any { it.id == id }) list
                            else list.toMutableList().apply { add(index.coerceAtMost(size), removed) }
                        }
                        Result.failure(AppErrorException(error))
                    }
                }
            },
        )
    }

    /** "Clear all": every notification leaves at once — the invitations (program_invites) are never touched; a refusal
     *  puts them back under anything that arrived meanwhile; success re-reads the newest page. */
    suspend fun clearAll(): Result<Unit> {
        val o = owner() ?: return Result.success(Unit)
        val before = _items.value.dataOrNull ?: return Result.success(Unit)
        if (before.isEmpty()) return Result.success(Unit)
        listEdits++
        updateItems { emptyList() }
        return runCatching { api.clearInbox() }.fold(
            onSuccess = { counts ->
                applyCounts(o, counts)
                loadFirstPage()
                Result.success(Unit)
            },
            onFailure = { e ->
                if (e is CancellationException) throw e
                if (o == owner()) updateItems { list -> list + before.filter { old -> list.none { it.id == old.id } } }
                Result.failure(AppErrorException(e.toAppError()))
            },
        )
    }
```

17. Edits to `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/ui/inbox/InboxList.kt`. Line numbers are from the original file.
    - (a) Add these imports, each in alphabetical position within the import block:
```kotlin
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.key
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import com.app.rasifiters.core.theme.AppRed
```
    - (b) Between the imports and `/** The inbox's ONE reload …` (line 61), add:
```kotlin
// Remove one + Clear all (notifications §3.9 rule 11) — the shared copy (identical on web / iOS).
private const val REMOVE_LABEL = "Remove"
private const val CLEAR_ALL = "Clear all"
private const val CLEAR_CONFIRM_TITLE = "Clear all notifications?"
private const val CLEAR_CONFIRM_BODY = "They're removed from your Inbox on all your devices. Invitations stay until you answer them."
private const val REMOVE_FAILED = "Couldn't remove the notification."
private const val CLEAR_FAILED = "Couldn't clear your notifications."

```
    - (c) After line 96 (`var declineTarget by remember { mutableStateOf<PendingInviteDTO?>(null) }`), add:
```kotlin
    var confirmClear by remember { mutableStateOf(false) }
    /** The last remove / Clear all failure, under the Notifications heading (invite errors keep the top line). */
    var inboxError by remember { mutableStateOf<String?>(null) }
```
    - (d) After line 113 (`fun offlineOr(error: AppError) = …`), add:
```kotlin
    // §3.9 rule 11 (D-C32): offline fails at once with the kit's words (no request, no confirm); otherwise the row leaves
    // now and comes back if the server refuses. removeItem → false = refused here (the swipe springs back).
    fun offlineLine(lead: String) = "$lead ${AppError(AppErrorKind.OFFLINE).message}"
    fun removeItem(item: InboxItemDTO): Boolean {
        if (!online) { inboxError = offlineLine(REMOVE_FAILED); return false }
        inboxError = null
        scope.launch { inbox.remove(item.id).onFailure { inboxError = "$REMOVE_FAILED ${offlineOr(it.toAppError()).message}" } }
        return true
    }
    fun requestClearAll() {
        if (!online) { inboxError = offlineLine(CLEAR_FAILED); return }
        inboxError = null
        confirmClear = true
    }
    fun clearAll() {
        confirmClear = false
        if (!online) { inboxError = offlineLine(CLEAR_FAILED); return }
        scope.launch { inbox.clearAll().onFailure { inboxError = "$CLEAR_FAILED ${offlineOr(it.toAppError()).message}" } }
    }
```
    - (e) Replace line 152 (`SectionLabel("Notifications")`) with:
```kotlin
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    SectionLabel("Notifications")
                    Spacer(Modifier.weight(1f))
                    if (!items.isNullOrEmpty()) {
                        TextButton(onClick = { requestClearAll() }) {
                            Text(CLEAR_ALL, color = AppOrange, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
                inboxError?.let { FormErrorText(it) }
```
    - (f) Replace lines 159–165 (the `items.forEach { item -> InboxRow(…) }` block) with:
```kotlin
                        items.forEach { item ->
                            // Keyed by id: a removed row's swipe state goes with it (never onto the next row).
                            key(item.id) {
                                SwipeToRemove(onRemove = { removeItem(item) }) {
                                    InboxRow(
                                        item,
                                        unread = item.readAt == null || item.id in visitNew,
                                        onClick = if (item.opensSomewhere()) ({ onOpenItem(item) }) else null,
                                        onRemove = { removeItem(item) },
                                    )
                                }
                            }
                        }
```
    - (g) After the `declineTarget?.let { … }` block (ends line 186), still inside `InboxList`, add:
```kotlin

    if (confirmClear) {
        AlertDialog(
            onDismissRequest = { confirmClear = false },
            title = { Text(CLEAR_CONFIRM_TITLE) },
            text = { Text(CLEAR_CONFIRM_BODY) },
            confirmButton = { TextButton(onClick = { clearAll() }) { Text(CLEAR_ALL, color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = { confirmClear = false }) { Text("Cancel") } },
        )
    }
```
    - (h) Directly above `/** One notification: unread dot · title + time · body; a chevron when it opens something. */`, add:
```kotlin
/** Swipe a notification away, end → start (the Android idiom; web shows a ×, iOS reveals Remove). It dismisses past
 *  40 % of the row's width (not the 56-dp default) or on a deliberate horizontal fling — a sloppy diagonal scroll in the
 *  sheet must not delete. A refused swipe (offline) springs back; a removed row leaves, and its keyed state with it. */
@Composable
private fun SwipeToRemove(onRemove: () -> Boolean, content: @Composable () -> Unit) {
    val state = rememberSwipeToDismissBoxState(positionalThreshold = { totalDistance -> totalDistance * 0.4f })
    LaunchedEffect(state.currentValue) {
        if (state.currentValue == SwipeToDismissBoxValue.EndToStart && !onRemove()) state.reset()
    }
    SwipeToDismissBox(
        state = state,
        enableDismissFromStartToEnd = false,
        backgroundContent = {
            val swiping = state.dismissDirection == SwipeToDismissBoxValue.EndToStart
            Box(
                Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(16.dp))
                    .background(if (swiping) AppRed else Color.Transparent)
                    .padding(horizontal = 20.dp),
                contentAlignment = Alignment.CenterEnd,
            ) {
                if (swiping) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Icon(Icons.Filled.Delete, contentDescription = null, tint = Color.White)
                        Text(REMOVE_LABEL, color = Color.White, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        },
    ) { content() }
}

```
    - (i) Change `InboxRow`:
      - The signature becomes `private fun InboxRow(item: InboxItemDTO, unread: Boolean, onClick: (() -> Unit)?, onRemove: () -> Boolean) {`.
      - In its `Row` modifier chain, between `.then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)` and `.padding(14.dp),`, insert:
```kotlin
            // One TalkBack node per row, with a "Remove" action (the swipe's accessible twin).
            .semantics(mergeDescendants = true) {
                customActions = listOf(CustomAccessibilityAction(REMOVE_LABEL) { onRemove() })
            }
```

## Steps — docs (orchestrator, at landing, in commit C5)

18. Edits to `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/notifications/SPEC.md`:
   - **Header and §1:**
     - Line 3: change `**Version:** 0.6.1` to `**Version:** 0.7.0`.
     - After line 24, add `> **0.7.0 (Phase 4 touch-up):** remove one + Clear all — DELETE /inbox/:id + DELETE /inbox/all (self-only); phones swipe, web ×, Clear all behind a confirm — D-C32; §3.5, §3.9 rule 11.`
     - Line 32: append ` — 0.7.0 adds two more on the inbox router (item 6)`.
     - Line 42 (item 6) becomes `6. **Inbox** (0.6.0) — GET /inbox, GET /inbox/unread-count, POST /inbox/read; (0.7.0) DELETE /inbox/:id + DELETE /inbox/all — remove one / Clear all (routes/notificationInbox.js; §3.5).`
   - **§3 route table:** after row 16 (line 88), add:
     - `| 17 | DELETE /inbox/:id | net-new (0.7.0) | authenticateToken; 120 / 10 min per member, shared with 18 | Remove one of the member's own items (its recipient row) — §3.5, D-C32. |`
     - `| 18 | DELETE /inbox/all | net-new (0.7.0) | same | Clear all: every one of the member's own items — §3.5, D-C32. A literal /all: an empty-id /inbox/ matches no route. |`
   - **§3.5:**
     - Add 2 table rows after `POST /inbox/read`:
       - `| DELETE /inbox/:id | — | { "deleted": 1, "unread": 2, "pending_invites": 1, "badge": 2 } | 400 invalid_body (not a uuid) · 404 not_found (unknown, another member's, already removed) · 429 rate_limited |`
       - `| DELETE /inbox/all | — | { "deleted": 12, "unread": 0, "pending_invites": 1, "badge": 1 } — idempotent, 0 is still 200 | 429 rate_limited |`
     - Add this bullet after the Preferences bullet: `- **Remove / Clear all (0.7.0, D-C32):** hard-delete the member's own notification_recipients rows only; the notification row stays for its other recipients (orphans go with D-C28's retention, as do kudos rows orphaned by a later undo). Invitations (program_invites) are never touched. Nothing re-sends (send keys + push_deliveries never read recipient rows). No SSE event — other devices drop the item at their next catch-up / reload (F18).`
   - **§3.9:** after rule 10 (line 482), add: `11. **Remove + Clear all (0.7.0, D-C32):** every notification row is removable — iOS: a left swipe reveals Remove; Android: swipe the card away end→start (40 % threshold); web: an × per row (platform idiom); VoiceOver / TalkBack get a Remove action. Clear all sits on the Notifications heading line only while a notification is listed, behind a confirm. Optimistic: rows leave at once (a load already in flight is dropped) and come back on a refusal with the failure line under the heading (web: a refused Clear all shows inside its kept-open dialog); a 404 on remove counts as removed; offline fails at once with the kit's offline words — no request, and Clear all opens no confirm. The answer's counts update the "+" badge, the account rows' <n> new and the iOS app-icon badge; after Clear all the newest page is re-read. The Invitations section never changes.`
   - **Copy table:** after the `"+" sheet tabs / toast` row, add ``| Remove / Clear all (0.7.0) | `Clear all` · confirm `Clear all notifications?` / `They're removed from your Inbox on all your devices. Invitations stay until you answer them.` / `Clear all` · `Cancel` (web while running: `Clearing…`) · `Remove` (web ×: `Remove notification`) · failures `Couldn't remove the notification. <kit message>` · `Couldn't clear your notifications. <kit message>` |``.
   - **§5:** add `0.7.0: DELETE /inbox/:id + /inbox/all hard-delete notification_recipients rows (no schema change, no migration).`
   - **§9 (after the D-C31 row at line 713):** add a **D-C32** row:
     - Decision cell: `**Remove one + Clear all (0.7.0; Phase 4 touch-up, user decision 2026-10-13).** DELETE /inbox/:id + DELETE /inbox/all (routes/notificationInbox.js → notificationInboxService.removeItem / clearAll) hard-delete the token member's OWN notification_recipients rows (NotificationRecipient.destroy scoped by member_id); malformed id → 400 invalid_body; nothing deleted → 404 not_found; Clear all idempotent; both answer { deleted, unread, pending_invites, badge }. Clear all is the literal /all so an empty-id call can't reach it. One per-member limiter for both, 120 / 10 min. "Invites" = the Invitations section (program_invites), never touched — every notification row is removable, incl. the informational program.invite_received item. No migration; nothing re-sends; old binaries' /unacknowledged drops a removed item too (read = acknowledged parity). Clients: §3.9 rule 11 — iOS reveal-swipe (horizontal ScrollView + two-stop ScrollTargetBehavior; the Inbox isn't a List), Android M3 SwipeToDismissBox, web × (platform idiom only).`
     - Rests-on cell: `touch-up (a) brief + plan rev 2.`
   - **§10:** add **F18**: `Remove / Clear all aren't pushed to other open devices — they drop at the next catch-up / reload; Clear all also removes an item that arrived after the list loaded (server-side "all").`. Where: `routes/notificationInbox.js`. Follow-up: `Accepted.`
   - **§11 (above the 0.6.1 row at line 741):** add `| 0.7.0 | 2026-10-13 | Phase 4 touch-up (a): remove one + Clear all — DELETE /inbox/:id + DELETE /inbox/all (self-only hard delete of recipient rows, 120 / 10 min per member), §3.5, §3.9 rule 11, copy, D-C32, F18. MINOR (2 additive routes); no migration; no live binary calls them; dependents unaffected. Deploy order: backend, then web + iOS 1.5.2 (60) / Android 1.2.0 (7). |`
19. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/registry.json`: set the `notifications` `"version"` to `"0.7.0"`. In `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/REGISTRY.md`, the notifications Version cell becomes `0.7.0`.
20. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/pages/web/programs/SPEC.md`:
   - **Header:** `**Version:** 0.5.0` becomes `0.6.0`; every `notifications` 0.6.0 cite becomes 0.7.0.
   - **§4 Inbox tab row:** append `0.6.0: each notification row is a bordered card with two sibling buttons — open and a 44 px × (Remove notification); the Notifications heading carries Clear all while a notification is listed (ConfirmDialog kept open while it runs, Clearing…, a refusal inside it); offline / remove failures show under the heading (D-NP2).` Add `components/notifications/InboxItemRow.tsx` to its reference cell.
   - **§6:** add ``| `removeInboxItem` / `clearInbox` (0.6.0) | `DELETE /api/notifications/inbox/:id` · `/inbox/all` | Optimistic (`useRemoveInboxItem` / `useClearInbox`; snapshot → restore); 404 = removed; counts → badge; Clear all re-reads the inbox — notifications D-C32. |``.
   - **§8:** add a bullet: `Remove / Clear all offline → the failure line at once with the kit's offline words; no request, no dialog.`
   - **§9 (after D-NP1):** add **D-NP2**: `Remove one + Clear all (notifications 0.7.0 D-C32, §3.9 rule 11) — × per row (web idiom; phones swipe), Clear all + ConfirmDialog (closeOnConfirm=false), optimistic with rollback, 404 = removed, offline at once; invitations untouched.`
   - **§10:** add **F7**: `components/notifications/InboxList.tsx ~215 lines (> ~200) after 0.6.0 — the row + time label already moved to InboxItemRow.tsx; accepted.`
   - **§11:** add a 0.6.0 row.
21. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/pages/ios/inbox/SPEC.md`:
   - **Header:** version 0.1.0 becomes 0.2.0; `notifications` 0.6.0 becomes 0.7.0; the files list gains `InboxFeed.swift` and `InboxSwipeToDelete.swift`.
   - **§4 Notifications row:** append `0.2.0: a left swipe on a card reveals a red Remove (each card in a horizontal ScrollView settling closed / open — a swipe that starts on a card no longer pages the "+" sheet to Create; elsewhere it still does); the heading's Clear all (shown while notifications are listed) → confirmationDialog; failures inline under the heading.`
   - **§6:** add ``| `deleteInboxItem(id:)` / `clearInbox()` | `DELETE /inbox/:id` · `/inbox/all` | `ProgramContext.removeInboxItem` (404 = removed) / `clearInbox` → `applyInboxCounts`. |``.
   - **§8:** add `Remove / Clear all: optimistic (InboxFeed.remove / clearAll bump the generation, restore on a refusal); offline fails at once (Clear all: no confirm); Clear all re-reads page 1.`
   - **§9:** add **D-NP4**: `Reveal-swipe, not .swipeActions (the Inbox is a ScrollView of cards; no List conversion, no DragGesture); failures inline, never an alert racing the dialog — notifications D-C32.`
   - **§10 F2:** extend to `InboxView.swift (~285)`.
   - **§11:** add a 0.2.0 row.
22. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/pages/android/inbox/SPEC.md`:
   - **Header:** version 0.1.0 becomes 0.2.0; `notifications` becomes 0.7.0.
   - **Android realization:** add the bullet `**D-NP4 (remove + Clear all, notifications D-C32):** each row is an M3 SwipeToDismissBox (end→start, 40 % positional threshold, red Remove background; rows keyed by id), TalkBack Remove action on the merged row; Clear all (TextButton on the Notifications line, only while notifications are listed) → AlertDialog; NotificationInbox.remove / clearAll are optimistic (listEdits drops a first-page load in flight) with restore, 404 = removed, Clear all re-reads page 1; offline fails at once (no confirm); failures in a FormErrorText under the heading.`
   - **CREATE a new `## Flagged` section** between "Android realization" and "Changelog", as a table `| ID | Characteristic | Follow-up? |` with row `| **F1** | InboxList.kt (~330) / NotificationInbox.kt (~400) exceed ~200 lines (no new files allowed in touch-up (a); like iOS F2). | Accepted. |`
   - **Changelog:** add a 0.2.0 row.
23. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/pages/REGISTRY.md`:
   - Line 21: `v0.5.0` becomes `v0.6.0` and `notifications` 0.6.0 becomes 0.7.0; append `, remove × + Clear all` inside the notifications parenthesis.
   - Lines 96 and 152: `v0.1.0` becomes `v0.2.0` and `notifications` 0.6.0 becomes 0.7.0; append `, swipe-remove + Clear all`.

## Endgame

24. **Compile-check per surface:**
   - **backend:**
     ```
     cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend && node --check routes/notificationInbox.js && node --check services/notificationInboxService.js && node -e "require('./routes/notificationInbox'); console.log('inbox router ok'); process.exit(0)"
     ```
   - **web:** `cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web && npm run build` (includes the type-check).
     - Don't run `npm run lint`: there is no ESLint config, so it would start an interactive setup.
     - The local build also compiles the uncommitted SEO files. If it fails in `src/app/layout.tsx` or a `*/layout.tsx`, STOP and report it to the user; don't fix it (out of scope).
   - **android:** `cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android && ./gradlew :app:assembleDebug`
   - **ios:**
     - First run `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/tools/ios-typecheck.sh`.
     - Then the USER presses ⌘B in Xcode; that is the iOS gate. Claude never calls BuildProject.
     - The 1.5.2 (60) build also carries the uncommitted (d) `EdgeSwipeToReturn.swift`, which is intended.
   - **Afterwards:** delete `apps/web/.next` and the android build dirs, then report free disk space.
25. **Commits and deploys (git-version, multi-surface pattern). Isolated from the out-of-scope tree.**
   - **Staging rules:**
     - Stage ONLY the listed paths, never `-A` or `.`.
     - Run `git status --short` before each commit and `git show --stat HEAD` after it, confirming only the listed paths.
     - NEVER stage: `apps/web/src/app/layout.tsx`, `apps/web/src/app/{create-account,delete-account,forgot-password,login,privacy-policy,support}/layout.tsx`, `specs/initiatives/reliability-overhaul/plans/phase-4-seo.md`, `specs/initiatives/reliability-overhaul/HANDOFF.md`, `apps/ios/RaSi-Fiters-App/Shared/Components/EdgeSwipeToReturn.swift`.
     - Every commit body ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
   - **C1 (backend, pushed ALONE first):**
     - `git add apps/backend/routes/notificationInbox.js apps/backend/services/notificationInboxService.js`
     - Commit as `feat(backend): inbox remove one + Clear all — DELETE /api/notifications/inbox/:id + /inbox/all, self-only, 120/10 min per member (notifications D-C32)`.
     - `git push origin main`. Render autodeploys (buildFilter `apps/backend/**`).
     - Confirm with the render MCP `list_deploys` for rasifiters-api (pass workspaceId `tea-cv3u7a3tq21c73ald2ig`): C1's commit must be `live`, and the logs must show a clean boot.
     - If no deploy fires, trigger one through the render MCP. That is a prod mutation, so confirm with the user first.
   - **C2 (web):**
     - `git add apps/web/src/lib/api/notifications.ts apps/web/src/lib/notifications/queries.ts apps/web/src/components/notifications/InboxList.tsx apps/web/src/components/notifications/InboxItemRow.tsx`
     - Commit as `feat(web): inbox × remove + Clear all (notifications D-C32)`. No bump.
   - **C3 (ios):**
     - `git add apps/ios/RaSi-Fiters-App/Shared/Services/APIClient+Inbox.swift apps/ios/RaSi-Fiters-App/Shared/Models/ProgramContext+Inbox.swift apps/ios/RaSi-Fiters-App/Features/Home/Inbox/InboxRow.swift apps/ios/RaSi-Fiters-App/Features/Home/Inbox/InboxView.swift apps/ios/RaSi-Fiters-App/Features/Home/Inbox/InboxFeed.swift apps/ios/RaSi-Fiters-App/Features/Home/Inbox/InboxSwipeToDelete.swift`
     - Commit as `feat(ios): inbox swipe-remove + Clear all (notifications D-C32)`. No bump.
   - **C4 (android):**
     - `git add apps/android/app/src/main/java/com/app/rasifiters/net/ApiService.kt apps/android/app/src/main/java/com/app/rasifiters/net/InboxDtos.kt apps/android/app/src/main/java/com/app/rasifiters/core/NotificationInbox.kt apps/android/app/src/main/java/com/app/rasifiters/ui/inbox/InboxList.kt`
     - Commit as `feat(android): inbox swipe-remove + Clear all (notifications D-C32)`. No bump.
   - **C5 (docs + version):**
     - git-version hard-gate: the USER acknowledges the contract-change blast radius first (dependents [programs, program-memberships, invites, people] are unaffected because the change is additive).
     - `git add specs/features/notifications/SPEC.md specs/features/registry.json specs/features/REGISTRY.md specs/pages/REGISTRY.md specs/pages/web/programs/SPEC.md specs/pages/ios/inbox/SPEC.md specs/pages/android/inbox/SPEC.md`
     - Commit as `docs(notifications): v0.7.0 — remove one + Clear all (D-C32, F18); pages web/programs 0.6.0 · ios/inbox 0.2.0 · android/inbox 0.2.0`.
     - `git tag feature/notifications@v0.7.0`
   - **Push C2–C5, only after C1 is live:**
     - `git push origin main && git push origin feature/notifications@v0.7.0`. Push the tag by name, never `--tags`.
     - Vercel's git build uses committed files only, so the SEO work can't ride along.
   - **Web verify:**
     - Run `vercel ls rasifiters --scope personal-vinayak`. The newest Production deployment must be READY on the pushed HEAD.
     - **If it is Canceled or missing, deploy from a CLEAN worktree only, never from the main tree.** All 4 commands:
       ```
       git -C /Users/vinayaksankaranarayanan/Developer/rasifiters-master worktree add --detach /private/tmp/claude-501/-Users-vinayaksankaranarayanan-Developer-rasifiters-master/9597ef9d-f5c4-4a1f-91de-0ec959c8e048/scratchpad/web-deploy HEAD
       cp -R /Users/vinayaksankaranarayanan/Developer/rasifiters-master/.vercel /private/tmp/claude-501/-Users-vinayaksankaranarayanan-Developer-rasifiters-master/9597ef9d-f5c4-4a1f-91de-0ec959c8e048/scratchpad/web-deploy/.vercel
       cd /private/tmp/claude-501/-Users-vinayaksankaranarayanan-Developer-rasifiters-master/9597ef9d-f5c4-4a1f-91de-0ec959c8e048/scratchpad/web-deploy && vercel --prod --yes --scope personal-vinayak
       git -C /Users/vinayaksankaranarayanan/Developer/rasifiters-master worktree remove --force /private/tmp/claude-501/-Users-vinayaksankaranarayanan-Developer-rasifiters-master/9597ef9d-f5c4-4a1f-91de-0ec959c8e048/scratchpad/web-deploy
       ```
       If the running session's scratchpad differs, use it in place of that path.
     - Verify on the apex https://rasifiters.com.
   - **Testing: the USER's, on prod.** No staging (no migration, no auth change). Checklist:
     - **Web, desktop + mobile widths:** × removes; the Clear all confirm works; DevTools offline gives the line at once with no dialog; the dialog renders correctly inside the "+" modal on mobile Safari.
     - **iOS, all 3 hosts** ("+" sheet tab 0, account-row push, root Inbox sheet):
       - A swipe on a card reveals Remove; a swipe on the heading or empty space pages to Create.
       - Back-swipe: an edge pan from the pushed Inbox inside the program shell (ProgramCards.swift:319) pops, and no card stays half-open. (The (d) `EdgeSwipeToReturn` recognizer is simultaneous, so a brief rubber-band of the card is cosmetic.)
       - In airplane mode, Clear all shows the line under the heading with no confirm, and a swipe-remove shows its line.
     - **Android, "+" sheet + Inbox screen:** a slow diagonal scroll does not delete; a swipe past ~40 % does; TalkBack offers Remove; airplane mode shows the lines.
     - **All surfaces:**
       - Removing an unread item drops the badge / "N new".
       - The Invitations section is unchanged after Clear all.
       - Another device drops the item after a reload.
26. **Migration:** none. These are app-level deletes of the member's own rows, with no schema change.
27. **git-version:**
   - Feature: notifications v0.6.1 → v0.7.0, MINOR (pre-1.0 owned-interface change: 2 additive routes + client rule 11). Tag `feature/notifications@v0.7.0` on C5.
   - Page bumps get no tags: web/programs 0.6.0, ios/inbox 0.2.0, android/inbox 0.2.0.
   - C1–C4 are no-bump surface commits.
   - Marketing/build versions are unchanged: iOS 1.5.2 (60), Android 1.2.0 (7). RELEASES.md is updated only when the user announces an upload.

## (B) delta: apply ONLY if the user picks (B) at approval
- **Backend `notificationInboxService.js`:** replace the bodies of `removeItem` / `clearAll` with a raw delete that skips invite items. Keep the 404 when `deleted === 0` in `removeItem`. Add next to the other SQL constants:
```js
const deleteOwnSql = (one) => `
DELETE FROM notification_recipients nr USING notifications n
WHERE n.id = nr.notification_id AND nr.member_id = :memberId AND n.type <> :inviteType${one ? " AND nr.notification_id = :id" : ""}
RETURNING nr.notification_id`;
```
  Then `const deleted = (await sequelize.query(deleteOwnSql(true), { replacements: { memberId, inviteType: INVITE_TYPE, id: id.toLowerCase() }, type: QueryTypes.SELECT })).length;` for remove-one. Clear all uses `deleteOwnSql(false)` with no `id`.
- **Web:**
  - `InboxItemRow` gets `removable: boolean`; render the × only when it is true. InboxList passes `removable={item.type !== "program.invite_received"}`.
  - Clear all shows when `items.some((item) => item.type !== "program.invite_received")`.
  - `useClearInbox.onMutate` becomes `editInbox(queryClient, (data) => ({ ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.filter((item) => item.type === "program.invite_received") })) }))`.
- **iOS:**
  - In `ForEach`, wrap the row in `InboxSwipeToDelete` only when `item.type != "program.invite_received"`; otherwise render the bare `InboxRow`.
  - `canClear` becomes `(feed.state.value ?? []).contains { $0.type != "program.invite_received" }`.
  - `InboxFeed.clearAll` uses `replaceItems { $0.filter { $0.type == "program.invite_received" } }`, and its guard checks for a non-invite row.
- **Android:**
  - In (f), when `item.type == "program.invite_received"` render the bare `InboxRow` (no `SwipeToRemove`, `onRemove = { false }`).
  - Clear all shows when `items.orEmpty().any { it.type != "program.invite_received" }`.
  - `NotificationInbox.clearAll` uses `updateItems { list -> list.filter { it.type == INVITE_TYPE } }`, and its guard is `before.none { it.type != INVITE_TYPE }`.
- **Docs:** D-C32 / rule 11 say invite items are protected server-side and leave only via retention.

## Risks the implementer must watch
- **Isolation (blocking class).**
  - Never `git add -A` or `.`, and never run `vercel` from `/Users/vinayaksankaranarayanan/Developer/rasifiters-master`; the fallback runs ONLY from the clean worktree.
  - The SEO work, HANDOFF.md and EdgeSwipeToReturn.swift stay uncommitted and out of every commit.
- **Backend first.** C1 must be `live` on Render before C2–C5 are pushed or any phone build is tested. Otherwise a DELETE hits a missing route, and remove-one's "404 = removed" hides it until the next reload.
- **Express route order.** `/all` must be registered before `/:id`.
- **iOS swipe (highest risk; user device check).**
  - Inside the "+" sheet's paged TabView, a swipe that starts on a card reveals Remove instead of paging. This is intended (D-NP4).
  - `InboxRevealBehavior` must stay `nonisolated`, and the card border must use `strokeBorder`.
  - Failures are inline (no `.alert`), so there is no presentation race with `confirmationDialog`.
- **Generation bump (iOS).** If a remove lands during a visit's very first reload, that reload is dropped and the visit's mark-all waits for the next load (pull, live item or reopen). Rare, and accepted. A loadMore in flight is dropped the same way; it re-triggers when the last row reappears.
- **Android.**
  - Rows must stay wrapped in `key(item.id)`.
  - A fast deliberate horizontal fling still dismisses. That is standard M3 velocity behavior and can't be configured in M3 1.3.x; the 40 % positional threshold covers slow drags.
  - `listEdits` only drops first-page loads that started before an edit.
- **Web.**
  - The × must be a sibling of the open button, never inside it.
  - Snapshot rollback edge case: remove A then B, A fails, and B can reappear until the next refresh. A re-remove gets a 404, which counts as removed. Accepted.
- **Live binaries** (iOS 1.4.2/1.5.0/1.5.1, Android 1.0.0/1.1.0/1.2.0): none calls the new routes and every existing shape is unchanged. A removed item also leaves the old binaries' `/unacknowledged` feed (read = acknowledged parity).
- **Heading height.** The heading line grows to tap-target height (44 pt / 48 dp / 44 px) only while Clear all shows. It appears together with the rows, so nothing jumps. This is the one sanctioned visual change, because the user asked for a visible Clear all.
- **F18.** There is no SSE "deleted" event. Clear all deletes server-side "all", including an item that arrived after the list loaded.
- **Out of scope:**
  - Touch-ups (c) and (d) (only (d)'s device check rides along).
  - The SEO and Play Store work, which comes LAST, after both store submissions.
  - `program_invites`, retention/cron, People routes and marketing version bumps.