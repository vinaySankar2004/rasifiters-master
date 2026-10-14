# Screen: `inbox` (android) — the Inbox (invitations + notifications)

> **Status:** 🏗️ built (`apps/android/`, `d528f75` — for the Phase 4 store release) · **Version:** 0.2.0 · **App:**
> `android` (Compose) · **Thin port-note.** Full behavior = [`notifications`](../../../features/notifications/SPEC.md)
> 0.7.0 §3.5 / §3.9 (D-C31, D-C32) + [`invites`](../../../features/invites/SPEC.md) D-C10; iOS sibling [`inbox`](../../ios/inbox/SPEC.md),
> web [`programs`](../../web/programs/SPEC.md) Inbox tab.
> **Location:** `InboxList` hosted twice — the "+" sheet's **Inbox** tab ([program-picker](../program-picker/SPEC.md),
> `ProgramActionsSheet.kt`) and the **`Routes.INBOX`** screen (`InboxScreen`, registered in both the root graph
> (`RootScreen.kt`) and the shell (`AppScaffold.kt`, `inShell = true`)), opened by the account rows and an `inbox` target.
> **Files:** `ui/inbox/{InboxList,InboxScreen,NotificationToast}.kt`, `core/NotificationInbox.kt`, `net/InboxDtos.kt`.

## Parity (web + iOS)
- Header `Inbox` · `Invites and notifications`; `Invitations` (global admins `All invitations`, sorted by program, with
  **Revoke**; join-request rows `Request pending approval` + `Cancel Request`) then `Notifications`; empty `No
  notifications yet` / `Program updates, kudos, reminders and announcements show up here.`; `Load more` / `Loading…`
  (30 per page; a failed page keeps what's shown); times `Just now` · `5m ago` · `3h ago` · `Yesterday` · `MMM d` ·
  `MMM d, yyyy`; a blank title shows `New notification`; dotted rows read `Unread` to TalkBack.
- **One error view (R12):** notifications failed with no invitation showing → one `ErrorView` + Retry; otherwise each
  section shows its own; offline → the offline copy. On the Inbox screen a stale list shows the stale banner; back
  online, a failed / stale list reloads.

## Android realization
- **D-NP1 (reading, TC-1 / R1):** `DisposableEffect` reports the list as shown (`inboxShown` / `inboxHidden` — the
  `inboxVisible` count); the first show clears the visit's new-id set and the toast. Every load of the newest page
  while on screen (open, pull, Retry, reconnect — one `reloadInbox` path: invites + `loadAndMarkRead`) is followed by
  `POST /inbox/read {"all":true}` unless the page has no unread item and the cached `unread` is 0; an item that arrives
  while it is on screen is marked by id; `markRead(ids)` is optimistic (≤ 100 ids) and restores the dots on failure.
  Dots: `readAt == null || id in visitNew`. Accepted race: an item arriving between the GET and the mark-all is read
  without a dot.
- **D-NP2 (tray):** a successful mark-all cancels every posted push except the Health Connect notification.
- **D-NP3 (row tap):** mark read, then route by `target` (`RootScreen` — see [notifications-alerts](../notifications-alerts/SPEC.md)
  D-NP3); in the shell copy, a row for the program already open just goes back.
- **D-NP4 (remove + Clear all, notifications D-C32):** each row is an M3 SwipeToDismissBox (end→start, red Remove
  background; rows keyed by id), TalkBack Remove action on the merged row; Clear all (TextButton on the Notifications
  line, only while notifications are listed) → AlertDialog.
  - **The swipe must pass ~40 % of the card width**, slow or fast: a 40 % positional threshold plus a
    `confirmValueChange` veto that rejects end→start unless the card has moved ≥ 40 % of its measured width. M3 1.3.x's
    fixed 125 dp/s fling would otherwise turn almost any leftward brush into a hard delete with no undo, so a short
    brush or flick springs back.
  - NotificationInbox.remove / clearAll run on the hub's long-lived scope (leaving the Inbox mid-request never cancels
    the write, its rollback or its counts) and are optimistic with restore; 404 = removed; Clear all re-reads page 1.
  - A newest-page load that lands after an edit began is dropped (`listEdits`) and reported as a failure, so no
    mark-all runs off the stale list (D-NP1); it is re-read, and marked as usual, once no edit waits on the server.
  - A row still listed once its remove finishes (a refusal that landed before the row left the composition) resets its
    swipe state, so no row is left swiped away. With every loaded row removed and older pages left, the empty state
    shows with `Load more` under it.
  - Offline fails at once (no confirm); failures show in a FormErrorText under the heading.
  - Device check (the user's): a slow diagonal scroll doesn't delete · a short quick flick springs back · a swipe past
    ~40 % deletes · TalkBack offers Remove · airplane mode shows the lines.

## Flagged
| ID | Characteristic | Follow-up? |
|----|----------------|------------|
| **F1** | InboxList.kt (~400) / NotificationInbox.kt (~440) exceed ~200 lines (no new files allowed in touch-up (a); like iOS F2). | Accepted. |

## Changelog
| Version | Date | Change |
|---------|------|--------|
| 0.2.0 | 2026-10-13 | **D-NP4 — touch-up (a), notifications 0.7.0 D-C32:** swipe-remove (M3 SwipeToDismissBox end→start; the card must pass ~40 % of its width, slow or fast — a short flick springs back; TalkBack Remove action) + Clear all on the Notifications line → AlertDialog; writes on the hub's scope, optimistic with restore (a refused row springs back), 404 = removed, a load dropped by an edit marks nothing and is re-read once the edits settle, `Load more` stays under an emptied list, offline at once, failures under the heading; Invitations untouched. F1 (file length) flagged. |
| 0.1.0 | 2026-10-13 | Initial thin port-note — net-new Inbox (Phase 4, `d528f75`): two hosts, invitations then notifications, mark-all on every on-screen load, per-visit dots, `Load more`, one ErrorView, tray clear on mark-all. |
