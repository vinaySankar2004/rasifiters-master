# Page: `summary/log-health` (web) — standalone Log-daily-health form (summary sub-route 5 of 6)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.1.0 · **App:** `web` (Next.js App Router)
> **Route:** `/summary/log-health` — the **mobile log fallback** for the Log-daily-health form: a full-page
> version of the desktop modal that lives on the [`summary`](../SPEC.md) landing. **5th** of the six deferred
> `/summary` sub-routes and the **2nd of the 3 log fallbacks** (sibling `log-workout` done run 36;
> `bulk-log-workout` still deferred — this does **not** close the group).
> **Reference impl (legacy):** `../../../../../../rasifiters-webapp/src/app/summary/log-health/page.tsx` (65 lines).
> **Consumes (features):** [`workout-logs`](../../../../features/workout-logs/SPEC.md) (`POST /daily-health-logs` —
> `authenticateToken` + `requireDataEntryAllowed`; already mounted `routes/logs.js:91`) via the already-ported
> `lib/api/logs.ts` `addDailyHealthLog`; [`program-memberships`](../../../../features/program-memberships/SPEC.md)
> (`GET /program-memberships/members`) for the form's member lookup; [`auth`](../../../../features/auth/SPEC.md)
> (`useAuthGuard`). All consumed via the already-built `LogDailyHealthForm` component.
> **Cross-app:** `consumed_by = [web]` — iOS has its own native log screen; this page is the web mobile fallback.
> **Stance:** faithful 1:1 port **+ one nav cleanup** (D-C1 deterministic `router.push("/summary")` over the
> legacy `router.back()`). **No new dependency, zero backend work, no feature bump.** Oddities flagged §10.

---

## 1. What it is + who uses it

The standalone, full-page **Log-daily-health** form — the **mobile fallback** for the Log-daily-health action. On
the [`summary`](../SPEC.md) landing the Log-health card opens a modal on desktop but **routes to this page on
mobile** (`summary/page.tsx:216` — `isMobile ? router.push("/summary/log-health") : setShowHealthForm(true)`). It
renders the **same `LogDailyHealthForm` component** the modal uses, switched to its `variant="page"` branch. Used by
any role that may log health data (member for self; admin/global-admin/logger for any member — §7).

## 2. Why it exists

The desktop modal is awkward on a small screen, so mobile gets a dedicated full-page form with a back header. It
is a presentation alternative to the modal, **not** a different feature: identical fields, identical endpoint,
identical role logic — only the wrapper (`PageShell` + `PageHeader` vs `Modal`) and the post-submit navigation
differ. Twin of the just-built [`log-workout`](../log-workout/SPEC.md) (run 36), with the health form instead of
the workout form.

## 3. Route / location

- **App:** `web` (Next.js 14 App Router).
- **Path:** `/summary/log-health` (`apps/web/src/app/summary/log-health/page.tsx`). No `force-dynamic` (faithful —
  reads no search params).
- **Reached from:** the [`summary`](../SPEC.md) landing's Log-health action card on **mobile** only
  (`summary/page.tsx:216`); the bottom-nav still shows because the path is under `/summary` (`shell.tsx`).
- **Back:** `PageHeader backHref="/summary"` (the header BackButton hardcodes `/summary`); post-save + form-close
  also go to `/summary` (D-C1).

## 4. Contents / sections

1. **`PageHeader`** — title "Log daily health", subtitle "Track sleep hours and diet quality for the day.",
   `backHref="/summary"` (`log-health/page.tsx:45-49`).
2. **`LogDailyHealthForm variant="page"`** (`log-health/page.tsx:51-61`) — the form's bare-fields branch
   (`forms/LogDailyHealthForm.tsx:162-164`):
   - **Member** — a searchable `Select` when `canSelectAnyMember` (admin/global-admin/logger); otherwise a static
     "You" panel and the member is forced to `userId` (`LogDailyHealthForm.tsx:81-95`, 46-48).
   - **Date** — `Input type="date"`, default today (`LogDailyHealthForm.tsx:97-102`, 36).
   - **Sleep time** — hours + minutes number inputs (digit-stripped, ≤2 chars each) combined to fractional hours;
     0:00–24:00 validity message (`LogDailyHealthForm.tsx:104-131`).
   - **Diet quality** — `Select` of ratings 1–5 (`LogDailyHealthForm.tsx:133-139`).
   - **Error** line (mutation error) + **Save daily log** / "Saving…" button, disabled until valid + not saving
     (`LogDailyHealthForm.tsx:142-158`). Submit requires **at least one metric** (sleep or diet) — `hasMetric`
     (`LogDailyHealthForm.tsx:73, 76`).

## 5. Components + which shared features it consumes

- **Chrome (all already ported):** `PageShell`, `PageHeader` (→ `BackButton`), and the whole `LogDailyHealthForm`
  (which pulls `Select` + `ui/Input`) — every one landed with the [`summary`](../SPEC.md) landing (run 21) and the
  `/program/*` sub-routes.
- **New dep:** **none** — the sweep ports nothing but the page file itself.
- **Hooks/api:** `useAuthGuard` (`auth`), `isDataEntryLocked` (`lib/permissions`), `addDailyHealthLog`
  (`lib/api/logs.ts`), and (inside the form) `fetchProgramMembers` (`lib/api/programs.ts`) — all already ported.
  Note: unlike `log-workout`, the health form needs **no workout-types lookup** (only the member list).

## 6. Data / API

- **`POST /api/daily-health-logs`** ← `addDailyHealthLog(token, { program_id, log_date, sleep_hours?, food_quality?, member_id? })`.
  Middleware: `authenticateToken` + **`requireDataEntryAllowed`** (the `admin_only_data_entry` 403 lock,
  `routes/logs.js:17-34`; the daily-health write route at `routes/logs.js:91`). The service resolves the target
  member, enforcing the **own-logs-only 403** when a non-admin/logger passes someone else's id and **404** when the
  target isn't an active member.
- **Lookups (form mount):** `GET /program-memberships/members?programId` only.
- **Success:** `invalidateQueries({ queryKey: ["summary"] })` then **`router.push("/summary")`** (D-C1; legacy
  `router.back()`).
- **Zero backend work, NO feature bump** — the route + service + `addDailyHealthLog` all already shipped with
  [`workout-logs`](../../../../features/workout-logs/SPEC.md) and the `summary` landing.

## 7. Role-based view rules

This is a **write** page, so — unlike the read-only `/summary` chart drill-downs — role logic and
`admin_only_data_entry` are **live** here. `useAuthGuard()` default (`requireProgram: true`) — no token → `/login`,
no active program → `/programs`.

| Role | What they see / can do |
|------|------------------------|
| **global_admin** | `canSelectAnyMember` — member `Select` shown; may log for **any** member. |
| **program admin** (`my_role==="admin"`) | Same — member picker, log for any member. |
| **logger** (`my_role==="logger"`) | Same — member picker, log for any member. |
| **member** (none of the above) | No picker — a static **"You"** panel; member forced to own `userId`; may log **only for self** (backend 403s otherwise). |

**`admin_only_data_entry`: LIVE (not N/A).** When the lock is **on** and the user is **not** a program admin,
the page **redirects to `/summary`** on mount (`page.tsx:24-28`, `router.replace` — keeps the locked page out of
history). The backend `requireDataEntryAllowed` is the real guard (403); the client redirect is UX only. The 2nd
`/summary` sub-route where the lock bites (after `log-workout`; the chart drill-downs were read-only → N/A).

## 8. States & edge cases

- **Loading lookups** — the form's member `Select` populates after `fetchProgramMembers` resolves (no page-level
  spinner; faithful).
- **Saving** — the Save button shows "Saving…" and is disabled (`dailyHealthMutation.isPending`).
- **Error** — the mutation error message renders as a red line above the button (`LogDailyHealthForm.tsx:142`).
- **Invalid sleep** — a red "Sleep time must be between 0:00 and 24:00." line; submit blocked until valid
  (`LogDailyHealthForm.tsx:74, 76, 128`).
- **No metric entered** — submit disabled until at least sleep or diet is provided (`hasMetric`).
- **Locked (non-admin + `admin_only_data_entry`)** — `router.replace("/summary")` on mount.
- **No token / no active program** — `useAuthGuard` redirects to `/login` / `/programs`.
- **Empty** — N/A (the form always renders).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-SCOPE** | This page only — **5th** of the six deferred `/summary` sub-routes and **2nd of the 3 log fallbacks**; does **not** close the group (`bulk-log-workout` still deferred). | COVERAGE summary row; `specs/pages/REGISTRY.md` |
| **D-REF** | `consumed_by = [web]` — the web mobile fallback for the Log-health modal; iOS has its own native log screen. | legacy `summary/log-health/page.tsx`; cross-app sweep |
| **D-DEPS** | **No new dependency** — `LogDailyHealthForm` (incl. its `variant="page"` branch), `PageShell`/`PageHeader`, `addDailyHealthLog`, `useAuthGuard`, `isDataEntryLocked`, the member lookup fn all already ported (summary landing run 21 + `/program/*` chrome). The sweep ports only the page file. | `page.tsx:3-11`; summary SPEC F6 |
| **D-S1** | Faithful 1:1 otherwise — same `canLogForAny` derivation, the `admin_only_data_entry` `router.replace` lock guard, the mutation injecting `program_id`, `invalidateQueries(["summary"])`, the `variant="page"` form. Already fully `rf-*` tokenized → **no tokenize cleanup**. | legacy `summary/log-health/page.tsx` |
| **D-C1** | **Deterministic-nav cleanup** (change-now, matches run 36) — swap the two legacy `router.back()` calls (post-save success **and** the form `onClose`) for `router.push("/summary")`, so all navigation off the page is deterministic and matches the header BackButton (which already hardcodes `/summary`). Guards the direct-navigation/refresh case where `router.back()` could leave the app. The lock-guard `router.replace("/summary")` is unchanged (faithful — replace deliberately drops the locked page from history). | user decision; legacy `page.tsx:39`, 57 |

> **Not a cleanup:** "reuse `refreshSummaryQueries`" was considered and rejected (same as run 36) — that helper is a
> module-private one-liner inside `summary/page.tsx:310` (`invalidateQueries(["summary"])`), byte-identical to the
> legacy inline call and not importable; there is nothing shared to reuse.

## 10. Flagged characteristics kept as-is

- **F1** — **Client-side role from an unverified JWT decode** (`session.user.globalRole` / `program.my_role`)
  drives `canLogForAny` (member picker vs "You") and the lock redirect — display/gating only; the backend
  re-verifies + re-authorizes on every `POST /daily-health-logs` (`requireDataEntryAllowed` + the per-member
  403/404). Same posture as `log-workout` F1. Kept (faithful) — not a security boundary.
- **F2** — **`admin_only_data_entry` enforced in two places** — the client mount redirect (UX) **and** the backend
  middleware (the real 403). The client redirect can race the program load (`program?.id && dataEntryLocked`), but
  the backend is authoritative. Kept (faithful).
- **F3** — **No view-as / sessionStorage** — member selection is purely the form's role-driven picker (no
  cross-page "view as" state like `/members` / `/lifestyle`); a non-admin's member is forced to `userId`. Kept
  (faithful, deliberate — this is a write form, not a per-member dashboard).
- **F4** — **No client throttle / double-submit guard beyond `isPending`** — rapid taps are gated only by the
  disabled-while-saving button. Kept (faithful).
- **F5** — **The shared `LogDailyHealthForm` is single-sourced across modal + page** — the same component renders
  here (`variant="page"`) and in the landing modal (`variant="modal"`); a change to the fields affects both. This is
  the intended design (summary SPEC F6 — the `"page"` branch lights up exactly here). Kept (faithful).
- **F6** — **At-least-one-metric submit gate is client-only** (`hasMetric` — sleep **or** diet). The backend
  accepts a partial payload; the gate is UX. Kept (faithful).

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker` (run 37) — the **23rd web page spec**, the standalone **Log-daily-health** mobile fallback (`/summary` sub-route 5 of 6, **2nd of the 3 log fallbacks**). Faithful 1:1 port of the legacy 65-line page: a `PageShell` + `PageHeader` wrapping `LogDailyHealthForm variant="page"`, with `canLogForAny` role logic, the `admin_only_data_entry` `router.replace("/summary")` lock guard, and an `addDailyHealthLog` mutation invalidating `["summary"]`. **2nd `/summary` sub-route where `admin_only_data_entry` is live** (after `log-workout`). Decisions: **D-SCOPE** (this page; does not close the group) · **D-REF** (`consumed_by=[web]`) · **D-DEPS** (no new dependency — the form + api + chrome all already ported) · **D-S1** (faithful 1:1) · **D-C1** (deterministic-nav cleanup — the two `router.back()` → `router.push("/summary")`; lock `router.replace` unchanged). Flagged F1–F6 (client JWT-decode role/lock; dual lock enforcement; no view-as; no throttle; shared single-sourced form; client-only at-least-one-metric gate). **Zero backend work, NO feature bump** — `POST /daily-health-logs` already mounted (`routes/logs.js:91`). Ported `apps/web/src/app/summary/log-health/page.tsx`. `npm run build` ✓. |
