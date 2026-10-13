# Page: `program/notifications` (web) — notification settings (account sub-route)

> **Status:** 🏗️ built (`apps/web/`, live since `b2ea09b`) · **Version:** 0.1.0 · **App:** `web` (Next.js App Router)
> **Route:** `/program/notifications` — the signed-in member's **own** notification settings: five category switches,
> the daily-reminder time and the time-zone line. Reached from the account menus' `Notifications` row (the
> [`programs`](../../programs/SPEC.md) Account modal and the [`program`](../SPEC.md) hub's My Account section).
> **Provenance:** **NET-NEW** (reliability-overhaul Phase 4 Pass A — no legacy page).
> **Consumes (features):** [`notifications`](../../../../features/notifications/SPEC.md) 0.6.0 (`GET` / `PUT
> /api/notifications/preferences`, §3.5; copy R7, §3.9), [`observability`](../../../../features/observability/SPEC.md)
> (`X-Time-Zone`, D-C13), [`frontend-kit`](../../../../features/frontend-kit/SPEC.md) (ErrorView, stale banner),
> [`auth`](../../../../features/auth/SPEC.md) (`useAuthGuard`).
> **Cross-app:** iOS [`notifications`](../../../ios/notifications/SPEC.md) and Android
> [`notifications`](../../../android/notifications/SPEC.md) show the same five switches + reminder time (plus their OS
> permission rows); web shows a no-push note instead.

---

## 1. What it is + who uses it
A settings page for **every role**: `Notifications` · `Choose what RaSi Fiters notifies you about.`, a `Notify me
about` card with five labelled switches (`components/ui/Switch.tsx`), the reminder time (only while Reminders is on),
the time-zone line, the opt-in note and the web note. Each change saves at once.

## 2. Why it exists
Phase 4 adds per-category notifications (notifications D-C19/D-C21) — reminders and the digest are opt-in — so each
member needs one place to choose, on every surface.

## 3. Route / location
- **Protected** (edge middleware matcher); `useAuthGuard({ requireProgram: false })` — no active program needed, no
  role redirect. `PageShell` (3xl) + `PageHeader` with Back → `/program` (a program is active) or `/programs`.
- **Leaves to:** Back only.

## 4. Contents / sections
| Block | What |
|---|---|
| Header | `Notifications` / `Choose what RaSi Fiters notifies you about.` |
| Switches (`Notify me about`) | `Program & invites` — `Invites, role changes and updates to your programs.` · `Activity` — `Kudos from people in your programs.` · `Reminders` — `One reminder a day around your chosen time, only if you haven't logged a workout that day.` · `Weekly digest` — `A recap of your past week, every Monday morning.` · `Announcements` — `News and messages from the RaSi Fiters team.` |
| Reminder time | Shown only while Reminders is on: `Reminder time` (an `<input type="time">`, default 19:00), saved on blur when it is a changed `HH:MM`; under it `Uses your time zone: <zone>.` — the server's `time_zone`, else the browser's, else `UTC`. |
| Opt-in note | `Reminders and the weekly digest are off until you turn them on. With Program & invites or Announcements off, you get no alert, but they still appear in your Inbox.` |
| Web note | `The web app doesn't send push alerts: here, notifications appear in your Inbox. For alerts on your phone, use the RaSi Fiters app.` |

## 5. Components + consumed features
`components/ui/Switch.tsx` (net-new, accessible switch), `lib/api/notifications.ts` (`fetchPreferences`,
`savePreferences`, `NOTIFICATION_COPY`), `lib/notifications/queries.ts`, `lib/api/client.ts` (`browserTimeZone`), kit
`ErrorView` / `FloatingBanner` / `fromQuery`.

## 6. Data / API
| Call | Endpoint | Notes |
|---|---|---|
| `fetchPreferences` | `GET /api/notifications/preferences` | `{ categories, reminder_time, time_zone }`; storing the caller's `X-Time-Zone` first. |
| `savePreferences` | `PUT /api/notifications/preferences` | Partial body — one switch `{ categories: { <key>: bool } }` or `{ reminder_time }`. Optimistic flip, reverted on error with the kit message inline. |

## 7. Role-based view rules
| Role | Sees / can do |
|---|---|
| global_admin · program admin · logger · member | The same page; sets **their own** preferences. No role-conditional UI. |

## 8. States & edge cases
- Loading `Loading notification settings…`; failed with nothing loaded → kit `ErrorView` + Retry (offline copy while
  offline); a failed refresh over shown data → the stale `FloatingBanner`.
- A save error reverts the switch / time and shows the kit message.
- Web has no push: reminders and the digest arrive in the Inbox only (notifications §3.6).

## 9. Decisions made
| ID | Decision | Rests on |
|----|----------|----------|
| **D-NP1** | **One settings page per surface, same copy (R7).** Five switches + the reminder time (shown only while Reminders is on) + the time-zone line + the opt-in note; web adds its no-push note in place of the phones' OS permission rows. Saves per change (partial PUT), optimistic with revert. | notifications D-C21, D-C30; NP amendments R7; web plan "Shared client contract — Settings". |

## 10. Flagged characteristics
| ID | Characteristic | Follow-up? |
|----|----------------|-----------|
| **F1** | The zone shown falls back to the browser's when the server has none yet (the next request stores it). | Accepted. |

## 11. Changelog
| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-10-13 | Initial SPEC — net-new page (Phase 4 Pass A, `b2ea09b`, live): five category switches, reminder time, time-zone line, opt-in + web notes; kit states; partial optimistic saves. |
