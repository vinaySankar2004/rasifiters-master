# PLAN: Phase 4 touch-up (a), inbox management (remove one + Clear all; invites untouched)

**Brief accepted**: yes (files 17: 15 briefed + the 2 optional new files `apps/web/src/components/notifications/InboxItemRow.tsx` and the iOS `InboxSwipeToDelete.swift` + `InboxFeed.swift` the brief allowed; docs at landing).

**Feature/version prediction**: notifications v0.6.1 → v0.7.0. MINOR: the owned interface gains 2 routes plus client rule §3.9 #11, all additive. Page SPECs: web/programs 0.5.0 → 0.6.0, ios/inbox 0.1.0 → 0.2.0, android/inbox 0.1.0 → 0.2.0.

**Surfaces in scope**: [backend, web, ios, android]. The file sets don't overlap, so they can run in parallel. The backend deploys before everything else.

**Open questions resolved (the user can veto these at approval):**
1. **What counts as an "invite": option (A).** "Invites" means the Invitations section (`program_invites` rows with Accept/Decline). These routes never touch that table, so invites stay until answered, as the user asked.
   - Every row in the Notifications list can be removed, including the informational `program.invite_received` item. Clear all shows whenever at least one notification is listed.
   - Why not (B): under (B), invite items could never be removed, so they would stay for 90 days even after the invite was answered, and Clear all would look broken. (A) needs no type special-casing on any surface.
   - The (B) delta is listed under Risks in case the user picks it.
2. **iOS swipe mechanism.** Each card sits in its own horizontal `ScrollView`. A custom `ScrollTargetBehavior` settles the card either closed or open (a red Remove button showing). There is no `DragGesture`: UIKit's nested-scroll handling arbitrates against the vertical scroll, the "+" sheet's paged TabView and the root keyboard-dismiss tap. There is no List conversion, so the screen looks the same.
3. **After a successful Clear all, each client re-reads the newest page.** This resets the cursor and picks up anything that arrived meanwhile. Remove-one does not reload.
4. **Rate limit:** one shared per-member bucket for both DELETE routes, 120 per 10 min. These are self-only primary-key deletes and Clear all covers bulk, so a long swipe session should not hit a 429.

**Client rules for all three surfaces (§3.9 rule 11):**
- Removal is optimistic.
- A failed remove puts the row back and shows the failure line.
- A 404 on remove counts as removed: no error, and the counts are re-read.
- Offline fails at once with the kit's offline words; no request is sent and nothing changes.
- The counts in the server's answer update the "+" badge, the account rows' "N new" and the iOS app-icon badge.

**Copy (identical everywhere; casing per platform):**

| Element | Text |
|---|---|
| Heading button | `Clear all` |
| Confirm title | `Clear all notifications?` |
| Confirm body | `They're removed from your Inbox on all your devices. Invitations stay until you answer them.` |
| Confirm buttons | `Clear all` (destructive) / `Cancel`. Web only, while running: `Clearing…` |
| Remove control | iOS `Remove`; Android `Remove`; web × with aria-label `Remove notification` |
| Remove failure | `Couldn't remove the notification. <kit message>` |
| Clear all failure | `Couldn't clear your notifications. <kit message>` |

On iOS the failure's first sentence, without the period, is the alert title and the kit message is the alert text.

## Steps — backend

1. Replace all of `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/routes/notificationInbox.js` with:
```js
// /api/notifications/inbox — the notification inbox (D-N3 / D-N4 / D-N5) — notifications SPEC §3.5 (the inbox rule).
// Self-only: every route acts on the token's member. Read = the existing acknowledged flag (D-N5): an item read here
// leaves every live binary's /unacknowledged queue, and a live binary's acknowledge marks it read here. Each request also
// captures the caller's X-Time-Zone (the time-zone rule, fire-and-forget). Errors are { error, code } (frontend-kit §4).
// 0.7.0 (D-C32): DELETE /:id (remove one) and DELETE / (Clear all) hard-delete the member's OWN recipient rows.
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

// D-C32: ONE per-member bucket for both deletes — 120 / 10 min (process memory; a deploy resets it, observability F3).
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
router.delete("/", limitInboxDeletes, handle("clear inbox", "Failed to update notifications.",
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
   - (b) After the `markNotificationsRead` function (ends line 52), add:
```ts

/** DELETE /notifications/inbox/:id — this member's own item, gone on every device; answers fresh counts (404 = gone). */
export function removeInboxItem(token: string, id: string) {
  return apiRequest<InboxDeleteResult>(`/notifications/inbox/${encodeURIComponent(id)}`, { method: "DELETE", token });
}

/** DELETE /notifications/inbox — every notification (the invitations are separate and stay); answers fresh counts. */
export function clearInbox(token: string) {
  return apiRequest<InboxDeleteResult>("/notifications/inbox", { method: "DELETE", token });
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
   - (b) In `applyReadResult`, replace lines 64–68 (the `queryClient.setQueryData<UnreadCounts>(NOTIFICATION_KEYS.unread, {…});` statement) with:
```ts
  setUnreadCounts(queryClient, result);
```
   - (c) Directly above `/** A mark-read answer: …` (line 62), insert:
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

6. Create `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web/src/components/notifications/InboxItemRow.tsx`:
```tsx
"use client";

import { NOTIFICATION_COPY, type InboxItem } from "@/lib/api/notifications";

// One inbox row (notifications §3.9 rules 8 + 11): the card opens the item; the × removes it (web's idiom — the phones
// swipe). Two SIBLING buttons in one bordered card (a button inside a button is invalid HTML). The × is a 44 px target
// (frontend-kit D-KIT-22), the same × as the toast's.
export function InboxItemRow({
  item,
  unread,
  timeLabel,
  onOpen,
  onRemove
}: {
  item: InboxItem;
  unread: boolean;
  timeLabel: string;
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
          <span className="mt-1 block text-xs text-rf-text-muted">{timeLabel}</span>
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
// Remove one + Clear all (§3.9 rule 11, D-C32): an × per row (web's idiom — the phones swipe) and "Clear all" on the
// heading line while a notification is listed (a ConfirmDialog kept open while it runs). Both are optimistic (the rows
// leave at once and come back on a refusal, with the failure line); offline fails at once with the kit's offline words.
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
  const [removeError, setRemoveError] = useState<string | null>(null);
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
      setRemoveError(`${NOTIFICATION_COPY.removeFailed} ${KIT_COPY.errors.offline}`);
      return;
    }
    setRemoveError(null);
    try {
      await removeMutation.mutateAsync(item.id);
    } catch (error) {
      setRemoveError(`${NOTIFICATION_COPY.removeFailed} ${toAppError(error).message}`);
    }
  };

  const clearAll = async () => {
    if (!online) {
      setClearError(`${NOTIFICATION_COPY.clearFailed} ${KIT_COPY.errors.offline}`);
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
            onClick={() => {
              setClearError(null);
              setConfirmingClear(true);
            }}
            className="inline-flex min-h-[44px] shrink-0 items-center rounded-full px-3 text-sm font-semibold text-rf-accent transition hover:text-rf-accent-strong"
          >
            {NOTIFICATION_COPY.clearAll}
          </button>
        )}
      </div>
      {removeError && (
        <p role="alert" className="text-sm font-semibold text-rf-danger">
          {removeError}
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
          timeLabel={inboxTimeLabel(item.created_at)}
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

8. Edits to `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Shared/Services/APIClient+Inbox.swift`. After `markAllInboxRead()` (ends line 69), insert:
```swift

    /// DELETE /notifications/inbox/:id — this member's own item, gone on every device → fresh counts (the extra
    /// `deleted` key is ignored). 404 = unknown / not this member's / already gone.
    func deleteInboxItem(id: String) async throws -> InboxCountsDTO {
        let data = try await data(for: authorizedRequest("notifications/inbox/\(id)", method: "DELETE"))
        return try JSONDecoder().decode(InboxCountsDTO.self, from: data)
    }

    /// DELETE /notifications/inbox — every notification (the invitations are separate and stay) → fresh counts.
    func clearInbox() async throws -> InboxCountsDTO {
        let data = try await data(for: authorizedRequest("notifications/inbox", method: "DELETE"))
        return try JSONDecoder().decode(InboxCountsDTO.self, from: data)
    }
```

9. Edits to `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Shared/Models/ProgramContext+Inbox.swift`. After `markAllInboxRead()` (ends line 100), insert:
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

    /// DELETE /inbox (§3.9 rule 11) → fresh counts. The invitations (program_invites) are never touched.
    func clearInbox() async throws {
        applyInboxCounts(try await APIClient.shared.clearInbox())
    }
```

10. Edits to `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Features/Home/Inbox/InboxRow.swift`:
    - (a) Delete line 1 (`import Combine`).
    - (b) Line 67: change `.overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color(.systemGray4).opacity(0.6), lineWidth: 1))` to `.overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color(.systemGray4).opacity(0.6), lineWidth: 1))`. The border is drawn inside the card, so the swipe ScrollView's clip never shaves it.
    - (c) Delete lines 96–166: from `/// The inbox list's paging state (GET /notifications/inbox — C4): …` through the closing `}` of `final class InboxFeed`. It moves to step 11.
    - (d) In `enum InboxCopy`, after `static let toastFallbackTitle = "New notification"`, add:
```swift
    static let clearAll = "Clear all"
    static let clearConfirmTitle = "Clear all notifications?"
    static let clearConfirmMessage = "They're removed from your Inbox on all your devices. Invitations stay until you answer them."
    static let remove = "Remove"
    static let removeFailedTitle = "Couldn't remove the notification"
    static let clearFailedTitle = "Couldn't clear your notifications"
```

11. Create `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Features/Home/Inbox/InboxFeed.swift`. The code down to `inviteItemIds` is the old InboxRow.swift lines 96–166, moved verbatim; the new members come after it. Synchronized group, so no pbxproj edit.
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

    // MARK: Remove + Clear all (§3.9 rule 11) — optimistic; InboxView hands the result back on a refusal.

    /// Takes one row out at once; nil when it isn't loaded.
    func remove(id: String) -> (item: APIClient.NotificationDTO, index: Int)? {
        guard let items = state.value, let index = items.firstIndex(where: { $0.id == id }) else { return nil }
        let item = items[index]
        replaceItems { $0.filter { $0.id != id } }
        return (item, index)
    }

    /// Puts a refused removal back where it was (unless a reload already brought it back).
    func putBack(_ item: APIClient.NotificationDTO, at index: Int) {
        replaceItems { items in
            guard !items.contains(where: { $0.id == item.id }) else { return items }
            var restored = items
            restored.insert(item, at: min(index, restored.count))
            return restored
        }
    }

    /// Clear all: every loaded row leaves at once; returns them for a refusal (nil = nothing loaded).
    func removeAll() -> [APIClient.NotificationDTO]? {
        guard let items = state.value, !items.isEmpty else { return nil }
        replaceItems { _ in [] }
        return items
    }

    /// A refused Clear all: the rows come back under anything that arrived meanwhile.
    func putBack(all items: [APIClient.NotificationDTO]) {
        replaceItems { current in
            let shown = Set(current.map(\.id))
            return current + items.filter { !shown.contains($0.id) }
        }
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
nonisolated struct InboxRevealBehavior: ScrollTargetBehavior {
    static let buttonWidth: CGFloat = 76
    static let gap: CGFloat = 8

    func updateTarget(_ target: inout ScrollTarget, context: TargetContext) {
        let open = Self.buttonWidth + Self.gap
        target.rect.origin.x = target.rect.minX > open / 2 ? open : 0
    }
}

/// The Notifications section heading with "Clear all" (§3.9 rule 11) — in the content (never a custom header), shown
/// only while notifications are listed, confirmed with a dialog (iOS idiom).
struct InboxNotificationsHeader: View {
    let canClear: Bool
    let onClearAll: () -> Void
    @State private var isConfirming = false

    var body: some View {
        HStack(spacing: 8) {
            Text(InboxCopy.notificationsHeader)
                .font(.headline.weight(.semibold))
                .foregroundColor(Color(.label))
            Spacer(minLength: 8)
            if canClear {
                Button { isConfirming = true } label: {
                    Text(InboxCopy.clearAll)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(Color.appOrange)
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
    }
}
```

13. Edits to `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/Features/Home/Inbox/InboxView.swift`:
    - (a) After line 33 (`@State private var blockFutureInvites = false`), add:
```swift
    /// A failed remove / Clear all → an alert: the title says what failed, the message is the kit's words.
    @State private var actionFailureTitle: String?
    @State private var actionFailureMessage = ""
```
    - (b) Replace the whole `notificationsSection` property (lines 118–150) with:
```swift
    private var notificationsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            InboxNotificationsHeader(canClear: !(feed.state.value ?? []).isEmpty,
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
        .alert(actionFailureTitle ?? "", isPresented: Binding(
            get: { actionFailureTitle != nil },
            set: { if !$0 { actionFailureTitle = nil } }
        )) {
            Button("OK") { actionFailureTitle = nil }
        } message: {
            Text(actionFailureMessage)
        }
    }
```
    - (c) After `open(_:)` (ends line 213), insert:
```swift

    /// §3.9 rule 11 — swipe-remove: offline fails at once (the kit's words, no request); otherwise the row leaves now and
    /// comes back where it was if the server refuses (a 404 — already gone elsewhere — counts as removed).
    private func remove(_ item: APIClient.NotificationDTO) {
        guard programContext.isOnline else {
            showActionFailure(InboxCopy.removeFailedTitle, AppError(kind: .offline))
            return
        }
        guard let removed = feed.remove(id: item.id) else { return }
        let context = programContext
        Task {
            do {
                try await context.removeInboxItem(id: item.id)
            } catch {
                guard let appError = AppError(error) else { return }     // cancelled — the next load reconciles
                feed.putBack(removed.item, at: removed.index)
                showActionFailure(InboxCopy.removeFailedTitle, appError.labeled(online: context.isOnline))
            }
        }
    }

    /// §3.9 rule 11 — Clear all (confirmed): every notification leaves now; the invitations above are never touched.
    /// Success re-reads the newest page (anything that arrived meanwhile); a refusal puts the rows back.
    private func clearAll() async {
        guard programContext.isOnline else {
            showActionFailure(InboxCopy.clearFailedTitle, AppError(kind: .offline))
            return
        }
        guard let removed = feed.removeAll() else { return }
        do {
            try await programContext.clearInbox()
            await feed.refreshHead(online: programContext.isOnline)
        } catch {
            guard let appError = AppError(error) else { return }
            feed.putBack(all: removed)
            showActionFailure(InboxCopy.clearFailedTitle, appError.labeled(online: programContext.isOnline))
        }
    }

    private func showActionFailure(_ title: String, _ error: AppError) {
        actionFailureMessage = error.message
        actionFailureTitle = title
    }
```

## Steps — android

14. Edits to `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/net/ApiService.kt`. After line 291 (`suspend fun markInboxRead(@Body body: InboxReadRequest): UnreadCountsDTO`), insert:
```kotlin

    /** Remove one of this member's own items (404 = unknown / already gone) → fresh counts. */
    @DELETE("notifications/inbox/{id}")
    suspend fun removeInboxItem(@Path("id") id: String): UnreadCountsDTO

    /** Clear all — every notification (the invitations are separate and stay) → fresh counts. */
    @DELETE("notifications/inbox")
    suspend fun clearInbox(): UnreadCountsDTO
```

15. Edits to `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/net/InboxDtos.kt`. After line 40 (`val updated: Int? = null,`), insert:
```kotlin
    /** Only on `DELETE /inbox[/:id]`: how many items this call removed. */
    val deleted: Int? = null,
```
Also change the KDoc on line 32 to read `` /** `GET /inbox/unread-count` and the `POST /inbox/read` / `DELETE /inbox[/:id]` answer. [badge] = … `` (the rest of the line is unchanged).

16. Edits to `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/core/NotificationInbox.kt`:
    - (a) After line 3 (`import com.app.rasifiters.core.kit.UiState`), add:
```kotlin
import com.app.rasifiters.core.kit.AppErrorException
import com.app.rasifiters.core.kit.AppErrorKind
```
    - (b) After `markInviteItemsRead` (ends line 227), insert:
```kotlin

    // ---- remove one + Clear all (§3.9 rule 11) ----

    /** Swipe-remove one item: it leaves the list at once and comes back where it was if the server refuses; a 404
     *  (already gone on another device) counts as removed. The answer's counts move the "+" badge. */
    suspend fun remove(id: String): Result<Unit> {
        val o = owner() ?: return Result.success(Unit)
        val before = _items.value.dataOrNull ?: return Result.success(Unit)
        val index = before.indexOfFirst { it.id == id }
        if (index < 0) return Result.success(Unit)
        val removed = before[index]
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

17. Edits to `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters/ui/inbox/InboxList.kt`:
    - (a) Add these imports in alphabetical position within the existing import block:
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
    - (b) After the imports (before `/** The inbox's ONE reload …` on line 61), add:
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
```
    - (d) After line 113 (`fun offlineOr(error: AppError) = …`), add:
```kotlin
    // §3.9 rule 11: offline fails at once (the kit's words, no request); otherwise the row leaves now and comes back if
    // the server refuses. false = refused here (the swipe springs back).
    fun removeItem(item: InboxItemDTO): Boolean {
        if (!online) { errorMessage = "$REMOVE_FAILED ${AppError(AppErrorKind.OFFLINE).message}"; return false }
        errorMessage = null
        scope.launch { inbox.remove(item.id).onFailure { errorMessage = "$REMOVE_FAILED ${offlineOr(it.toAppError()).message}" } }
        return true
    }
    fun clearAll() {
        confirmClear = false
        if (!online) { errorMessage = "$CLEAR_FAILED ${AppError(AppErrorKind.OFFLINE).message}"; return }
        errorMessage = null
        scope.launch { inbox.clearAll().onFailure { errorMessage = "$CLEAR_FAILED ${offlineOr(it.toAppError()).message}" } }
    }
```
    - (e) Replace line 152 (`SectionLabel("Notifications")`) with:
```kotlin
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    SectionLabel("Notifications")
                    Spacer(Modifier.weight(1f))
                    if (!items.isNullOrEmpty()) {
                        TextButton(onClick = { confirmClear = true }) {
                            Text(CLEAR_ALL, color = AppOrange, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
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
/** Swipe a notification away, end → start (the Android idiom; web shows a ×, iOS reveals Remove). A refused swipe
 *  (offline) springs back; a removed row leaves the list, and its keyed state goes with it. */
@Composable
private fun SwipeToRemove(onRemove: () -> Boolean, content: @Composable () -> Unit) {
    val state = rememberSwipeToDismissBoxState()
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
      - Signature becomes `private fun InboxRow(item: InboxItemDTO, unread: Boolean, onClick: (() -> Unit)?, onRemove: () -> Boolean) {`.
      - In its `Row` modifier chain, between `.then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)` and `.padding(14.dp),`, insert:
```kotlin
            // One TalkBack node per row, with a "Remove" action (the swipe's accessible twin).
            .semantics(mergeDescendants = true) {
                customActions = listOf(CustomAccessibilityAction(REMOVE_LABEL) { onRemove() })
            }
```

## Steps — docs (orchestrator, at landing, with git-version)

18. Edits to `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/notifications/SPEC.md`:
   - **Header and §1:**
     - Line 3: `**Version:** 0.6.1` becomes `**Version:** 0.7.0`.
     - After line 24, add `> **0.7.0 (Phase 4 touch-up):** remove one + Clear all — two self-only DELETE routes on the inbox router; phones swipe, web ×, Clear all behind a confirm — D-C32; §3.5, §3.9 rule 11.`
     - Line 32: append ` — 0.7.0 adds two more on the inbox router (item 6)`.
     - Item 6 (line 42) becomes `6. **Inbox** (0.6.0) — GET /inbox, GET /inbox/unread-count, POST /inbox/read; (0.7.0) DELETE /inbox/:id + DELETE /inbox — remove one / Clear all (routes/notificationInbox.js; §3.5).`
   - **§3 route table:** after row 16, add:
     - `| 17 | DELETE /inbox/:id | net-new (0.7.0) | authenticateToken; 120 / 10 min per member, shared with 18 | Remove one of the member's own items (its recipient row) — §3.5, D-C32. |`
     - `| 18 | DELETE /inbox | net-new (0.7.0) | same | Clear all: every one of the member's own items — §3.5, D-C32. |`
   - **§3.5:**
     - Add to the table after the `POST /inbox/read` row:
       - `| DELETE /inbox/:id | — (the notification id) | { "deleted": 1, "unread": 2, "pending_invites": 1, "badge": 2 } | 400 invalid_body (not a uuid) · 404 not_found (unknown, another member's, already removed) · 429 rate_limited |`
       - `| DELETE /inbox | — | { "deleted": 12, "unread": 0, "pending_invites": 1, "badge": 1 } — idempotent, 0 is still 200 | 429 rate_limited |`
     - Add a bullet after the Preferences bullet: `- **Remove / Clear all (0.7.0, D-C32):** hard-delete the member's own notification_recipients rows only; the notification row stays for its other recipients (one left with none goes with the D-C28 retention). Invitations (program_invites) are never touched. Nothing re-sends (send keys + push_deliveries never read recipient rows). No SSE event — other devices drop the item at their next catch-up / reload (F18).`
   - **§3.9:** add rule `11. **Remove + Clear all (0.7.0, D-C32):** every notification row is removable — iOS: a left swipe reveals Remove; Android: swipe the card away end→start; web: an × per row (platform idiom); VoiceOver / TalkBack get a Remove action. Clear all sits on the Notifications heading line only while a notification is listed, behind a confirm. Optimistic: the rows leave at once and come back on a refusal with the failure copy; a 404 on remove counts as removed; offline fails at once with the kit's offline words (no request). The answer's counts update the "+" badge, the account rows' <n> new and the iOS app-icon badge; after Clear all the newest page is re-read. The Invitations section never changes.`
   - **Copy table:** after the `"+" sheet tabs / toast` row, add: ``| Remove / Clear all (0.7.0) | `Clear all` · confirm `Clear all notifications?` / `They're removed from your Inbox on all your devices. Invitations stay until you answer them.` / `Clear all` · `Cancel` (web while running: `Clearing…`) · `Remove` (web ×: `Remove notification`) · failures `Couldn't remove the notification. <kit message>` · `Couldn't clear your notifications. <kit message>` (iOS: first sentence = alert title, kit message = text) |``
   - **§5:** add `0.7.0: DELETE /inbox[/:id] hard-delete notification_recipients rows (no schema change, no migration).`
   - **§9:** add a **D-C32** row:
     - Decision cell: `**Remove one + Clear all (0.7.0; Phase 4 touch-up, user decision 2026-10-13).** DELETE /inbox/:id + DELETE /inbox (routes/notificationInbox.js → notificationInboxService.removeItem / clearAll) hard-delete the token member's OWN notification_recipients rows (NotificationRecipient.destroy scoped by member_id); malformed id → 400 invalid_body; nothing deleted → 404 not_found; Clear all idempotent; both answer { deleted, unread, pending_invites, badge }. One per-member limiter for both, 120 / 10 min (process memory, the F16 shape). "Invites" = the Invitations section (program_invites), which these routes never touch — every notification row is removable, including the informational program.invite_received item (its invite stays until answered). No migration; the notifications row stays for other recipients (orphans go with D-C28); nothing re-sends; a later undoKudos on a removed unread kudos leaves an orphan for retention; old binaries' /unacknowledged drops a removed item too (read = acknowledged parity). Clients: §3.9 rule 11 — iOS reveal-swipe (each card in a horizontal ScrollView with a two-stop ScrollTargetBehavior; the Inbox isn't a List), Android M3 SwipeToDismissBox (end→start), web × (platform idiom only).`
     - Rests-on cell: `touch-up (a) brief + plan.`
   - **§10:** add an **F18** row:
     - Characteristic: `Remove / Clear all aren't pushed to other open devices — they drop at the next catch-up / reload; Clear all also removes an item that arrived after the list loaded (server-side "all").`
     - Where: `routes/notificationInbox.js`.
     - Follow-up: `Accepted.`
   - **§11:** prepend a 0.7.0 row: `| 0.7.0 | 2026-10-13 | Phase 4 touch-up (a): remove one + Clear all — DELETE /inbox/:id + DELETE /inbox (self-only hard delete of recipient rows, 120 / 10 min per member), §3.5 rows, §3.9 rule 11, copy, D-C32, F18. Clients: web × + ConfirmDialog, iOS reveal-swipe + confirmationDialog, Android SwipeToDismissBox + AlertDialog. MINOR (owned interface: 2 additive routes); no migration; every live binary unaffected (none calls them); dependents unaffected. Deploy order: backend, then web, then iOS 1.5.2 (60) / Android 1.2.0 (7). |`

19. Edits to `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/registry.json`: set `"notifications"` `"version": "0.7.0"`. In `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/REGISTRY.md`, line 17's version cell becomes `0.7.0`.

20. Edits to `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/pages/web/programs/SPEC.md`:
   - **Header:** `Version: 0.5.0` becomes `0.6.0`, and `notifications` 0.6.0 becomes 0.7.0.
   - **§4 `Inbox tab (0.4.0)` row:** append `0.6.0: each notification row is a bordered card with two sibling buttons — open and a 44 px × (Remove notification); the Notifications heading carries Clear all while a notification is listed (ConfirmDialog kept open while it runs, Clearing…, failure inside it); a failed remove shows Couldn't remove the notification. <kit message> under the heading (D-NP2).` Then add `components/notifications/InboxItemRow.tsx` to its reference cell.
   - **§6:** add a row ``| `removeInboxItem` / `clearInbox` (0.6.0) | `DELETE /api/notifications/inbox/:id` · `DELETE /inbox` | Optimistic (`useRemoveInboxItem` / `useClearInbox`, snapshot → restore); 404 = removed; counts → badge; Clear all re-reads the inbox — notifications D-C32. |``
   - **§8:** add a bullet `Remove / Clear all offline → the failure line at once with the kit's offline words; no request.`
   - **§9:** add **D-NP2**: `Remove one + Clear all (notifications 0.7.0 D-C32, §3.9 rule 11) — × per row (web idiom; phones swipe), Clear all + ConfirmDialog (closeOnConfirm=false), optimistic with rollback, 404 = removed, offline fails at once; invitations untouched.`
   - **§11:** add a 0.6.0 row.

21. Edits to `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/pages/ios/inbox/SPEC.md`:
   - **Header:** version 0.1.0 becomes 0.2.0, `notifications` 0.6.0 becomes 0.7.0, and the files list gains `InboxFeed.swift` and `InboxSwipeToDelete.swift`.
   - **§4 Notifications row:** append `0.2.0: a left swipe on a card reveals a red Remove (each card in a horizontal ScrollView, settling closed / open — a swipe that starts on a card no longer pages the "+" sheet to Create; elsewhere it still does); the heading's Clear all (44-pt target, shown while notifications are listed) → confirmationDialog; failures → alert (title = what failed, text = kit message).`
   - **§6:** add a row ``| `deleteInboxItem(id:)` / `clearInbox()` | `DELETE /inbox/:id` · `DELETE /inbox` | `ProgramContext.removeInboxItem` (404 = removed) / `clearInbox` → `applyInboxCounts` (badge, rows, app-icon badge). |``
   - **§8:** add `Remove / Clear all: optimistic (InboxFeed.remove / removeAll → putBack on a refusal); offline fails at once; Clear all re-reads page 1.`
   - **§9:** add **D-NP4**: `Reveal-swipe, not .swipeActions (the Inbox is a ScrollView of cards; no List conversion, no DragGesture) — notifications D-C32.`
   - **§10 F2:** extend to `InboxView.swift (~280)`.
   - **§11:** add a 0.2.0 row.

22. Edits to `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/pages/android/inbox/SPEC.md`:
   - **Header:** version 0.1.0 becomes 0.2.0 and `notifications` becomes 0.7.0.
   - **Android realization:** add the bullet `**D-NP4 (remove + Clear all, notifications D-C32):** each row is an M3 SwipeToDismissBox (end→start, red Remove background; rows keyed by id), TalkBack Remove action on the merged row; Clear all (TextButton on the Notifications line, only while notifications are listed) → AlertDialog; NotificationInbox.remove / clearAll are optimistic with restore, 404 = removed, Clear all re-reads page 1; offline fails at once; failures in the list's FormErrorText.`
   - **Flagged:** add `F1: InboxList.kt (~310) / NotificationInbox.kt (~395) exceed ~200 lines (accepted, like iOS F2).`
   - **Changelog:** add a 0.2.0 row.

23. Edits to `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/pages/REGISTRY.md`:
    - Line 21: `v0.5.0` becomes `v0.6.0`, and `notifications` 0.6.0 becomes 0.7.0, appending `, remove × + Clear all` inside its parenthesis.
    - Line 96: `v0.1.0` becomes `v0.2.0`, and `notifications` 0.6.0 becomes 0.7.0, appending `, swipe-remove + Clear all`.
    - Line 152: `v0.1.0` becomes `v0.2.0`, and `notifications` 0.6.0 becomes 0.7.0, appending `, swipe-remove + Clear all`.

## Endgame

24. **Compile-check** per surface:
   - **backend:** `cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend && node --check routes/notificationInbox.js && node --check services/notificationInboxService.js && node -e "require('./routes/notificationInbox'); console.log('inbox router ok'); process.exit(0)"`
   - **web:** `cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/web && npm run build`. This includes the type-check. `apps/web` has no ESLint config, so `npm run lint` would open Next's interactive setup; do not run it.
   - **android:** `cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android && ./gradlew :app:assembleDebug`
   - **ios:** run `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/tools/ios-typecheck.sh` first. Then the user presses ⌘B in Xcode; that is the iOS compile gate. Claude never calls BuildProject.
   - **Afterwards:** clean regenerable intermediates (`apps/web/.next`, the android build dirs) and report free disk space.
   - **Deploy order:**
     1. Backend: Render deploy of `rasifiters-api`. Confirm in the Render logs that it booted.
     2. Web: Vercel. Check `vercel ls`, fall back to `vercel --prod --yes --scope personal-vinayak`, and verify on the apex rasifiters.com.
     3. The user's iOS 1.5.2 (60) and Android 1.2.0 (7) builds, which hit prod.
   - **Testing:** all visual and live testing is the user's, on prod. Staging is not needed: no migration, no auth change. Checklist:
     - Web desktop + mobile widths: ×, Clear all, offline.
     - iOS swipe in all hosts: "+" sheet tab 0, account-row push, root Inbox sheet.
     - Android swipe in the "+" sheet and the Inbox screen.
     - The badge drops after removing an unread item.
     - The Invitations section is unchanged after Clear all.
25. **Migration:** none. These are app-level deletes of the member's own rows; no schema change.
26. **git-version:**
   - Feature: notifications v0.6.1 → v0.7.0, MINOR (pre-1.0 owned-interface change: 2 additive routes + client rule 11). This is a contract change, so git-version stops for the user's blast-radius acknowledgement. Dependents [programs, program-memberships, invites, people] are unaffected because the change is additive.
   - Tag: `feature/notifications@v0.7.0`.
   - Page bumps, which get no tags: web/programs 0.6.0, ios/inbox 0.2.0, android/inbox 0.2.0.
   - Marketing/build versions are unchanged (iOS 1.5.2 (60) / Android 1.2.0 (7)). RELEASES.md is updated only when the user announces the upload.

## Risks the implementer must watch

- **Open question 1 was decided as (A).** If the user picks (B) at approval, the changes are:
  - Server: `removeItem` / `clearAll` switch to raw SQL `DELETE FROM notification_recipients nr USING notifications n WHERE n.id = nr.notification_id AND nr.member_id = :memberId AND n.type <> 'program.invite_received' [AND nr.notification_id = :id]`.
  - Clients: no swipe/× on `type === "program.invite_received"`; Clear all shows only when a non-invite item is listed; the optimistic clear keeps invite items.
- **The iOS swipe needs a device check by the user** (highest risk).
  - In the "+" sheet's paged TabView, a left swipe that starts on a card reveals Remove instead of paging to Create. Paging still works from the heading, invitations and empty space, and the segmented control always works. This is a deliberate iOS idiom, called out in D-NP4.
  - `InboxRevealBehavior` must stay `nonisolated`, because of InferIsolatedConformances under default MainActor isolation.
  - Card borders must use `strokeBorder` (step 10b), or the horizontal ScrollView's clip thins them.
- **Android rows must be wrapped in `key(item.id)`.** Without it, a dismissed swipe state moves onto the next row after a removal.
- **Web:** the × must be a sibling of the open button, never nested inside it.
  - The ConfirmDialog renders inside the "+" sheet's Modal panel. That is fine because there is no transform or backdrop-filter on any ancestor and Escape only closes the topmost dialog. Still, check it visually on mobile Safari.
  - Snapshot rollback edge case: if the user removes A then B quickly and A fails, B can reappear until the next refresh. A 404 on a re-remove counts as removed. Accepted.
- **Live binaries** (iOS 1.4.2/1.5.0/1.5.1, Android 1.0.0/1.1.0/1.2.0) never call the new routes and every existing shape is unchanged.
  - A removed item also leaves the old binaries' `/unacknowledged` feed, consistent with read = acknowledged.
  - The backend must be live before web deploys or the phone builds are tested; otherwise the DELETE calls 404 and the rows bounce back.
- **The heading line becomes tap-target height** (44 pt / 48 dp / 44 px) only while Clear all is visible. It appears together with the rows (spinner → list), so nothing visibly jumps.
- **No SSE "deleted" event** (F18). Other open devices drop removed items at their next catch-up or reload, and iOS `refreshHead` already drops rows that are gone from the server.
- **Clear all deletes everything server-side**, including an item that arrived after the list loaded. Accepted (F18).
- **File sizes:** Android InboxList.kt (~310 lines) and NotificationInbox.kt (~395) and iOS InboxView.swift (~280) exceed ~200 lines. Recorded as accepted F-entries; no new files were allowed for Android.
- **Out of scope; don't touch:** touch-ups (c)/(d), the SEO and Play Store work (last, after both store submissions), `program_invites`, retention/cron, People routes, version bumps.