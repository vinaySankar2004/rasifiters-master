# Page: `program/announcements` (web) — the send-anytime announcement composer (global admins)

> **Status:** 🏗️ built (`apps/web/`, live since `b2ea09b`) · **Version:** 0.1.0 · **App:** `web` (Next.js App Router)
> **Route:** `/program/announcements` — **global admins only**: compose an announcement to a program, chosen members
> or everyone, preview it for one real recipient, send now or at each person's local time, and see / cancel recent
> sends. Reached from the account menus' `Announcements` row (global admins only).
> **Provenance:** **NET-NEW** (reliability-overhaul Phase 4 Pass A; DESIGN D-N16 — no legacy page; the vestigial
> `POST /broadcast` stays unused).
> **Consumes (features):** [`notifications`](../../../../features/notifications/SPEC.md) 0.6.0 (`/api/notifications/
> announcements*`, §3.8), [`programs`](../../../../features/programs/SPEC.md) (`fetchPrograms` → the program select),
> [`members`](../../../../features/members/SPEC.md) (`GET /members` → the member picker),
> [`observability`](../../../../features/observability/SPEC.md) (`X-Time-Zone`), [`frontend-kit`](../../../../features/frontend-kit/SPEC.md),
> [`auth`](../../../../features/auth/SPEC.md).
> **Cross-app:** **web-only** (the phones have no composer — a sanctioned divergence).

---

## 1. What it is + who uses it
`Announcements` · `Send a message to members`: a `New announcement` form (`components/announcements/ComposerForm.tsx`
+ `ComposerSections.tsx` + `MemberPicker.tsx`) above `Recent announcements` (`AnnouncementHistory.tsx`). Only global
admins; anyone else is redirected to `/programs` (the server answers 403 too).

## 2. Why it exists
The team needs to reach members any time (notifications vision; D-N16) — personalized, now or at a local time — with
an audit trail and a way to stop a scheduled send.

## 3. Route / location
- **Protected**; `useAuthGuard({ requireProgram: false })`; non-global-admins → `router.replace("/programs")`.
  `PageShell` (3xl), Back → `/program` or `/programs`.
- A **page-form route** for the web toast (no notification toast shows here — frontend-kit D-KIT-20).

## 4. Contents / sections
| Block | What |
|---|---|
| Send to | `Program` (a `Choose a program` select) · `Members` (the picker: `You (<name>)` pinned first, then active members, search `Search members`, `<n> selected`, `Clear`, max 200) · `Everyone` (`Every active member, including you.`). |
| Title / Message | `Title` (≤ 100, placeholder `e.g. Week 3, {first_name}!`) and `Message` (≤ 500), each with an n / max counter. |
| Personalize | `First name` · `Streak` · `Program name` chips insert merge fields; Program name is disabled unless the target is a program; hint `Each person sees their own first name and current workout streak. Program name works when you send to a program.` |
| When | `Now` · `Local time` (`Date` + `Time`; defaults to tomorrow 09:00; today … +30 days); `That time has already passed today for you, so it goes out within about 15 minutes.` when today's time has passed. |
| Preview | Runs 2 s after the last edit (`retry:false`): `Updating preview…`, `Reaches <n> members.`, `What <name> will see:` + the rendered title / body; an error line with Retry; `Choose who to send to and write a title and message to see a preview.` until complete. |
| Send | `Send now` / `Schedule` unlock **only** when a preview exists for exactly the request on screen and reaches ≥ 1 person; confirm `Send this announcement?` naming the audience and count (now: lands in their Inbox, can't be undone; local: at that date / time in each person's zone, cancellable under Recent announcements). |
| Recent announcements | The newest 50: status badge (`Scheduled` / `Sending` / `Sent` / `Cancelled`), target · delivery · `x/y sent`; `Cancel send` while scheduled / sending → confirm `Cancel this announcement?` / `People who haven't received it yet won't get it. Anyone who already got it keeps it.` (`Keep`). Empty `No announcements yet.` |

## 5. Components + consumed features
`components/announcements/{ComposerForm,ComposerSections,MemberPicker,AnnouncementHistory}.tsx` (`MemberPicker.tsx` also
exports `AudiencePicker`), `lib/api/announcements.ts` (`ANNOUNCEMENT_COPY`, preview / send / list / cancel), kit
`ErrorView` / `toAppError`, `ConfirmDialog`, native `<select>` (no glass-card containing block).

## 6. Data / API
| Call | Endpoint | Notes |
|---|---|---|
| preview | `POST /api/notifications/announcements/preview` | Debounced 2 s, cached per body; 30 / min per admin. |
| send | `POST /api/notifications/announcements` | 201 Summary; 10 / hour per admin. |
| list | `GET /api/notifications/announcements` | The history (newest 50). |
| cancel | `POST /api/notifications/announcements/:id/cancel` | 409 `invalid_state` once sent / cancelled. |
| `fetchPrograms` · `GET /members` | programs · members | The program select and the member picker (the directory is global-admin-wide). |

## 7. Role-based view rules
| Role | Access |
|---|---|
| **global_admin** | The whole page. |
| program admin · logger · member | Redirected to `/programs`; the account rows don't show the entry. |

## 8. States & edge cases
- A 400 shows the server's plain-language text (notifications §3.8 — e.g. `Pick a date within the next 30 days.`).
- 429: `You've reached the announcement limit. Try again later.`
- A timeout / unknown failure on send (the double-send guard): `Check Recent announcements before sending again.`
- "Everyone" includes the sender; recipients are snapshotted when sent; testable only on prod (use the `You` row).

## 9. Decisions made
| ID | Decision | Rests on |
|----|----------|----------|
| **D-NP1** | **Exact-preview send (web plan W15 + revision objection 2).** Preview 2 s after the last edit, cached per body, never auto-retried; Send unlocks only for a current preview of exactly the request on screen with ≥ 1 recipient; the confirm names the audience and count; local mode defaults to tomorrow 09:00 with the past-time warning. | notifications D-C25; web plan W15. |
| **D-NP2** | **History + Cancel (W11)** — the only way to stop a scheduled send; `You` pinned first in the picker (W19 — `GET /members` lists standard members only). | web plan W11, W19. |

## 10. Flagged characteristics
| ID | Characteristic | Follow-up? |
|----|----------------|-----------|
| **F1** | Composer limits are per server instance (notifications F16). | Accepted. |

## 11. Changelog
| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-10-13 | Initial SPEC — net-new global-admin composer (Phase 4 Pass A, `b2ea09b`, live): audience (program / members / everyone), title + message with merge fields, now / local time, exact-preview send + confirm, history + cancel, 400 / 429 / double-send copy. |
