# Screen: `inbox` (ios) — the Inbox (invitations + notifications) and the notification toast

> **Status:** 🏗️ built (`apps/ios/`, `198407c` — for the Phase 4 store release) · **Version:** 0.1.0 · **App:** `ios` (SwiftUI)
> **Location:** `InboxView` hosted in three places — the "+" sheet's tab 0 ([program-actions](../program-actions/SPEC.md)),
> pushed from both account rows (`AccountMenuSheet` in [program-picker](../program-picker/SPEC.md) and
> `ProgramMyAccountSection` in [admin-program](../admin-program/SPEC.md)), and the **root Inbox sheet** (a `Done`
> button) that a notification opens over whatever is on screen. Plus the top **toast** (`Shared/Views/NotificationToast.swift`).
> **Provenance:** **NET-NEW** (reliability-overhaul Phase 4 Track C; replaces the blocking `NotificationModalView` queue).
> **Web parity reference:** [`web programs`](../../web/programs/SPEC.md) (the Inbox tab + `InboxList`); Android
> [`inbox`](../../android/inbox/SPEC.md).
> **Consumes (features):** [`notifications`](../../../features/notifications/SPEC.md) 0.6.0 (`GET /inbox`,
> `/inbox/unread-count`, `POST /inbox/read`, the `?inbox=1` stream — §3.5, §3.9, D-C31), [`invites`](../../../features/invites/SPEC.md)
> 0.3.0 (the Invitations section, D-C10), [`frontend-kit`](../../../features/frontend-kit/SPEC.md) 0.5.0 (D-KIT-20 toast,
> D-KIT-17 offline band).

---

## 1. What it is + who uses it
Every signed-in role: `Inbox` · `Invites and notifications` — the `Invitations` section first (global admins `All
invitations`, grouped by program, with Revoke; the `InvitesTabView` content), then `Notifications` (`InboxRow`s with an
unread dot, title, body and a relative time). Files: `Features/Home/Inbox/{InboxView,InboxRow}.swift`,
`Shared/Models/ProgramContext+Inbox.swift`, `Shared/Services/APIClient+Inbox.swift`, `Shared/Views/NotificationToast.swift`.

## 2. Why it exists
Phase 4 replaces the one-at-a-time pop-up queue with an Inbox + a non-blocking toast (notifications D-C30/D-C31):
every notification type (kudos, reminders, digest, announcements, program changes) lands somewhere the member can come
back to, read state syncs across devices, and the app-icon badge means something.

## 3. Route / location
- **Hosts:** the "+" sheet tab 0 (`reservesOfflineBand: true` — the 116-pt offline spacer); the account rows (push); the
  root Inbox sheet (`.offlineBanner()`), opened by an `inbox` / `invites` target when nothing is presented, so an open
  program stays open.
- **Leaves to:** a row tap → mark read, then route by `target` (`ProgramContext.openTarget` — see notifications D-C31);
  an invite's accept / decline (the host closes first on accept).

## 4. Contents / sections
| Block | What |
|---|---|
| Invitations | `Invitations` / `All invitations` + Revoke (global admins); accept / decline per invites §3.1; a failed action → alert `Unable to update invitation` + the kit message. |
| Notifications | Rows newest first; **load-on-scroll** (the next page with `before=next_cursor`, 30 per page); a page-1 refresh merges into the loaded rows. |
| Empty | `No notifications yet` · `Program updates, kudos, reminders and announcements show up here.` (`tray` icon). |
| Times | `Just now` · `5m ago` · `3h ago` (today) · `Yesterday` · `Oct 12` · `Oct 12, 2025`. |
| Toast | Top overlay (width ≤ `formMaxWidth`): `<title>` (blank → `New notification`) · `View` · × (`Dismiss`); 5 s; × or a swipe up only hides it. |

## 5. Components + features consumed
`InboxView`, `InboxRow` / `InboxFeed`, `InvitesTabView`, `NotificationToast` (+ the root Inbox sheet), kit
`ErrorStateView` / `FloatingBanner` / `.offlineBanner()`; `ProgramContext` (`inboxCounts`, `inboxBadgeCount`,
`inboxRevision`, `visibleInboxCount`, `openTarget`, `setAppBadge`).

## 6. Data / API
| Call | Endpoint | Notes |
|---|---|---|
| `fetchInbox` | `GET /api/notifications/inbox?limit=30&before=` | |
| `fetchUnreadCounts` | `GET /inbox/unread-count` | The "+" badge, account rows, app-icon badge. |
| `markAllInboxRead` / `markInboxRead(ids:)` | `POST /inbox/read` `{all:true}` / `{ids}` | See §8 rules. |
| stream | `GET /notifications/stream?inbox=1` | Items → toast / live reload. |

## 7. Role-based view rules
| Role | Sees |
|---|---|
| **global_admin** | `All invitations` (every pending invite, Revoke) + their own notifications; the badge counts only their own invites. |
| program admin · logger · member | `Invitations` (own) + own notifications. |

## 8. States & edge cases
- **Reading (TC2 / R1):** the first load that lands while the Inbox is on screen (`isActive && isVisible`) sends
  `{all:true}` — only if an item is unread or `inboxCounts.unread > 0`; later live reloads mark the new unread items by
  id; nothing is marked while the Inbox isn't visible. Dots stay for the visit (`visitStart − 120 s`).
- **Errors (R12):** the list failed → one `ErrorStateView` + Retry (the invitations error is hidden); kept data + a
  failed refresh → the floating `Couldn't refresh` · Retry banner; reload on reconnect.
- **App-icon badge (NP-U4):** set from every counts answer (`setBadgeCount` only) for this inbox-capable install; drops
  when the Inbox marks all read (to the pending-invite count); 0 at sign-out.
- **Toast suppression:** none while an `InboxView` is visible or anything is presented (dropped, not queued); an Inbox
  coming on screen dismisses a toast.

## 9. Decisions made
| ID | Decision | Rests on |
|----|----------|----------|
| **D-NP1** | **Hosts + the root Inbox sheet (TC10).** `inbox` / `invites` targets reload a visible Inbox, else open the root sheet when nothing is presented (the program stays open), else fall back to the picker's "+" sheet. | notifications D-C31; NP amendments R5. |
| **D-NP2** | **Mark read only what was seen (TC2 / R1)** — a loaded, visible visit; dots per visit; load-on-scroll (an iOS idiom vs web / Android `Load more`). | NP amendments R1, R7. |
| **D-NP3** | **Top toast (D-KIT-20) + one notice presenter** that yields to the covers (widget form, forced update, Health review) and returns. | frontend-kit D-KIT-20; NP amendments R3. |

## 10. Flagged characteristics
| ID | Characteristic | Follow-up? |
|----|----------------|-----------|
| **F1** | More than one `ProgramPickerView` can be mounted ("Select Program" pushes a second); both observe `inboxRoute`, the first consumer clears it (pre-existing, as with U2). | Accepted. |
| **F2** | `InboxView.swift` / `ProgramContext+Inbox.swift` exceed ~200 lines (accepted in the plan, TC14). | Accepted. |

## 11. Changelog
| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-10-13 | Initial SPEC — net-new Inbox + toast (Phase 4, `198407c`): three hosts incl. the root Inbox sheet, invitations then notifications, mark-all after a loaded visible visit, per-visit dots, load-on-scroll, kit states, app-icon badge, top toast; `NotificationModalView` retired. |
