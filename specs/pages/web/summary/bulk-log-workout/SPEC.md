# Page: `summary/bulk-log-workout` (web) — standalone Bulk-log-workouts form (summary sub-route 6 of 6 — CLOSES the group)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.1.0 · **App:** `web` (Next.js App Router)
> **Route:** `/summary/bulk-log-workout` — the **mobile log fallback** for the Bulk-log-workouts form: a full-page
> version of the desktop modal that lives on the [`summary`](../SPEC.md) landing. **6th & LAST** of the six deferred
> `/summary` sub-routes and the **3rd & final of the 3 log fallbacks** — **this CLOSES the `/summary` sub-route group**
> (all 3 chart drill-downs `activity`/`distribution`/`workout-types` + all 3 log fallbacks `log-workout`/`log-health`/this).
> **Provenance (legacy, archived):** `rasifiters-webapp/src/app/summary/bulk-log-workout/page.tsx` (68 lines).
> **Consumes (features):** [`workout-logs`](../../../../features/workout-logs/SPEC.md) (`POST /workout-logs/batch` —
> `authenticateToken` + `requireDataEntryAllowed`; already mounted `routes/logs.js:49`) via the already-ported
> `lib/api/logs.ts` `addWorkoutLogsBatch`; [`program-memberships`](../../../../features/program-memberships/SPEC.md)
> (`GET /program-memberships/members`) **and** [`program-workouts`](../../../../features/program-workouts/SPEC.md)
> (`GET /program-workouts`) for the form's per-row member + workout-type lookups; [`auth`](../../../../features/auth/SPEC.md)
> (`useAuthGuard`). All consumed via the already-built `BulkLogWorkoutForm` component.
> **Cross-app:** `consumed_by = [web]` — iOS has its own native log screen; this page is the web mobile fallback.
> **Stance:** faithful 1:1 port **+ one nav cleanup** (D-C1 deterministic `router.push("/summary")` over the
> legacy `router.back()`). **No new dependency, zero backend work, no feature bump.** Oddities flagged §10.

---

## 1. What it is + who uses it

The standalone, full-page **Bulk-log-workouts** form — the **mobile fallback** for the Bulk-add action. On the
[`summary`](../SPEC.md) landing the Bulk-add card opens a modal on desktop but **routes to this page on mobile**
(`summary/page.tsx:211` — `isMobile ? router.push("/summary/bulk-log-workout") : setShowBulkForm(true)`). It renders
the **same `BulkLogWorkoutForm` component** the modal uses, switched to its `variant="page"` branch. **Bulk logging
is admin/logger-only** — used by global_admin, program admin, or logger (who can log for any member); a plain member
who reaches the URL is **redirected to the single-log page** `/summary/log-workout` (§7).

## 2. Why it exists

The desktop bulk-entry modal (a multi-row table) is awkward on a small screen, so mobile gets a dedicated full-page
form with a back header. It is a presentation alternative to the modal, **not** a different feature: identical rows,
identical endpoint, identical role logic — only the wrapper (`PageShell` + `PageHeader` vs `Modal`) and the
post-submit navigation differ. Near-twin of the just-built [`log-workout`](../log-workout/SPEC.md) (run 36) and
[`log-health`](../log-health/SPEC.md) (run 37), with the heavier `BulkLogWorkoutForm` instead of a single-entry form,
plus a **second redirect** (the bulk-only member-bounce, F1).

## 3. Route / location

- **App:** `web` (Next.js 14 App Router).
- **Path:** `/summary/bulk-log-workout` (`apps/web/src/app/summary/bulk-log-workout/page.tsx`). No `force-dynamic`
  (faithful — reads no search params).
- **Reached from:** the [`summary`](../SPEC.md) landing's Bulk-add action card on **mobile** only
  (`summary/page.tsx:211`); the bottom-nav still shows because the path is under `/summary` (`shell.tsx`).
- **Back:** `PageHeader backHref="/summary"` (the header BackButton hardcodes `/summary`); post-save + form-close
  also go to `/summary` (D-C1).

## 4. Contents / sections

1. **`PageHeader`** — title "Bulk log workouts", subtitle "Add multiple sessions at once.", `backHref="/summary"`
   (`bulk-log-workout/page.tsx:45-49`).
2. **`BulkLogWorkoutForm variant="page"`** (`bulk-log-workout/page.tsx:51-64`) — the form's bare-content branch
   (`forms/BulkLogWorkoutForm.tsx:416-418`):
   - **Rows** (≤ `MAX_ROWS` = 200, `BulkLogWorkoutForm.tsx:11`) — each row = a searchable member `Select`, a
     searchable workout-type `Select`, a date `Input` (defaults to the previous row's date or today), and hours+minutes
     duration inputs (`BulkLogWorkoutForm.tsx:250-378`). Desktop renders a **table** (`hidden md:block`,
     `:232-311`); mobile renders **stacked cards** (`md:hidden`, `:314-379`).
   - **Add-row controls** — "+ Add row" / "+ Add 5 rows" (disabled at max), with a "Max 200 rows" hint
     (`BulkLogWorkoutForm.tsx:382-390`).
   - **Live per-field validation** — `clientRowErrors` flags missing member/workout/date/duration on non-empty rows;
     an "N rows need attention" banner blocks save (`BulkLogWorkoutForm.tsx:59-71, 392-396`).
   - **Backend per-row errors** — `rowErrors` (indexed by submit order) are mapped back onto current rows by `uid`
     and shown under the offending field; live client errors win over stale backend ones
     (`BulkLogWorkoutForm.tsx:168-188`).
   - **Summary footer + Save all** — "N rows • M members • T min total" and a "Save all" / "Saving…" button, disabled
     until ≥1 valid row, 0 invalid rows, and not saving (`BulkLogWorkoutForm.tsx:399-412`).
   - **Empty state** — "No rows yet." + "Add first row" when `rows.length === 0` (`BulkLogWorkoutForm.tsx:487-499`);
     a lookup-empty hint when no members or workout types exist (`:223-229`).

## 5. Components + which shared features it consumes

- **Chrome (all already ported):** `PageShell`, `PageHeader` (→ `BackButton`), and the whole `BulkLogWorkoutForm`
  (which pulls `Select` + `ui/Input` + `ui/Button`) — every one landed with the [`summary`](../SPEC.md) landing
  (run 21) and the `/program/*` sub-routes.
- **New dep:** **none** — the sweep ports nothing but the page file itself.
- **Hooks/api:** `useAuthGuard` (`auth`), `isDataEntryLocked` (`lib/permissions`), `addWorkoutLogsBatch` +
  `BulkWorkoutEntry` + `BulkRowError` (`lib/api/logs.ts`), `ApiError` (`lib/api/client.ts`), and (inside the form)
  `fetchProgramMembers` (`lib/api/programs.ts`) + `fetchProgramWorkouts` (`lib/api/program-workouts.ts`) — all already
  ported. Like `log-workout` (and unlike `log-health`), the bulk form needs **both** the member **and** the
  workout-type lookups.

## 6. Data / API

- **`POST /api/workout-logs/batch`** ← `addWorkoutLogsBatch(token, { program_id, entries })` where each entry is
  `{ member_id, workout_name, date, duration }`. Middleware: `authenticateToken` + **`requireDataEntryAllowed`** (the
  `admin_only_data_entry` 403 lock, `routes/logs.js:49`). The batch service `addWorkoutLogsBatch`
  (`services/logService.js:180`) independently enforces **`canLogForAny`** — a non-admin/logger gets **403 "You do not
  have permission to bulk-log workouts."** (`:191-192`) — and validates each entry, returning **per-row `rowErrors`**
  (`{ index, field, message }`) as `400` with `{ error, rowErrors }` when any row is invalid (`:195-216`).
- **Per-row error transport:** the client `apiRequest` reads `data?.rowErrors` into `ApiError.details`
  (`lib/api/client.ts:71, 92`); the page passes `error.details as BulkRowError[]` to the form, which maps them onto
  rows by submit order (§4).
- **Lookups (form mount):** `GET /program-memberships/members?programId` **and** `GET /program-workouts?programId`
  (hidden workout types filtered out, `BulkLogWorkoutForm.tsx:125`).
- **Success:** `invalidateQueries({ queryKey: ["summary"] })` then **`router.push("/summary")`** (D-C1; legacy
  `router.back()`).
- **Zero backend work, NO feature bump** — the route + the batch service + `addWorkoutLogsBatch` all already shipped
  with [`workout-logs`](../../../../features/workout-logs/SPEC.md) and the `summary` landing.

## 7. Role-based view rules

This is a **write** page, so — unlike the read-only `/summary` chart drill-downs — role logic and
`admin_only_data_entry` are **live** here. `useAuthGuard()` default (`requireProgram: true`) — no token → `/login`,
no active program → `/programs`.

| Role | What they see / can do |
|------|------------------------|
| **global_admin** | `canLogForAny` — full bulk table; may log for **any** member across all rows. |
| **program admin** (`my_role==="admin"`) | Same — full bulk table, log for any member. |
| **logger** (`my_role==="logger"`) | Same — full bulk table, log for any member. |
| **member** (none of the above) | **Redirected to `/summary/log-workout`** on mount (`page.tsx:29-31`, `router.replace`) — bulk logging is admin/logger-only; the single-log page lets them log for themselves. Backend is the real guard (403 "You do not have permission to bulk-log workouts."). |

**`admin_only_data_entry`: LIVE (not N/A).** A **two-way mount redirect** (`page.tsx:25-32`, both `router.replace`):
(1) when the lock is **on** and the user is **not** a program admin → **`/summary`**; (2) else when the user is not
`canLogForAny` (a plain member) → **`/summary/log-workout`**. The backend `requireDataEntryAllowed` (lock) and the
batch service's `canLogForAny` check (bulk role) are the real guards; the client redirects are UX only. The **3rd &
last** `/summary` sub-route where the lock bites (after `log-workout`, `log-health`).

## 8. States & edge cases

- **Loading lookups** — the per-row member + workout `Select`s populate after `fetchProgramMembers` +
  `fetchProgramWorkouts` resolve (no page-level spinner; faithful). A lookup-empty hint shows when either list is empty.
- **Empty (no rows)** — "No rows yet." + an "Add first row" button (`BulkLogWorkoutForm.tsx:487`).
- **Validation** — non-empty invalid rows surface per-field messages + an "N rows need attention" banner; "Save all"
  is disabled until ≥1 valid row and 0 invalid rows.
- **Saving** — the "Save all" button shows "Saving…" and is disabled (`bulkWorkoutMutation.isPending`).
- **Backend per-row errors** — a 400 with `rowErrors` maps each error back onto its row by submit order
  (`BulkLogWorkoutForm.tsx:168-188`); a top-level `errorMessage` shows the overall message.
- **Locked (non-admin + `admin_only_data_entry`) / member** — the two-way `router.replace` (§7) on mount.
- **No token / no active program** — `useAuthGuard` redirects to `/login` / `/programs`.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-SCOPE** | This page only — **6th & LAST** of the six deferred `/summary` sub-routes and the **3rd & final of the 3 log fallbacks**; **CLOSES the `/summary` sub-route group** (all 3 chart drill-downs + all 3 log fallbacks now done). | COVERAGE summary row; `specs/pages/REGISTRY.md` |
| **D-REF** | `consumed_by = [web]` — the web mobile fallback for the Bulk-add modal; iOS has its own native log screen. | legacy `summary/bulk-log-workout/page.tsx`; cross-app sweep |
| **D-DEPS** | **No new dependency** — `BulkLogWorkoutForm` (incl. its `variant="page"` branch), `PageShell`/`PageHeader`, `addWorkoutLogsBatch`/`BulkWorkoutEntry`/`BulkRowError`, `ApiError`, `useAuthGuard`, `isDataEntryLocked`, both lookup fns all already ported (summary landing run 21 + `/program/*` chrome). The sweep ports only the page file. | `page.tsx:3-12`; summary SPEC F6 |
| **D-S1** | Faithful 1:1 otherwise — same `canLogForAny` derivation, the **two-way** `router.replace` redirect (lock → `/summary`; non-admin → `/summary/log-workout`), the mutation injecting `program_id`, `invalidateQueries(["summary"])`, the `variant="page"` form, and the `ApiError.details → rowErrors` plumbing. Already fully `rf-*` tokenized → **no tokenize cleanup**. | legacy `summary/bulk-log-workout/page.tsx` |
| **D-C1** | **Deterministic-nav cleanup** (change-now, matches runs 36/37) — swap the two legacy `router.back()` calls (post-save success **and** the form `onClose`) for `router.push("/summary")`, so all navigation off the page is deterministic and matches the header BackButton (which already hardcodes `/summary`). Guards the direct-navigation/refresh case where `router.back()` could leave the app. The **two** lock/role `router.replace` redirects are unchanged (faithful — replace deliberately drops the bounced page from history). | user decision; legacy `page.tsx:39`, 55 |

> **Not a cleanup:** "reuse `refreshSummaryQueries`" was considered and rejected (same as runs 36/37) — that helper is a
> module-private one-liner inside `summary/page.tsx:310` (`invalidateQueries(["summary"])`), byte-identical to the
> legacy inline call and not importable; there is nothing shared to reuse.

## 10. Flagged characteristics kept as-is

- **F1** — **Two-way mount redirect (the bulk-only member-bounce)** — unlike the single-redirect `log-workout` /
  `log-health` (lock → `/summary` only), bulk also bounces a non-admin/logger (`!canLogForAny`) to
  `/summary/log-workout` (`page.tsx:29-31`). Bulk logging is admin/logger-only; the single-log page is where a member
  logs for themselves. The backend batch service is the real guard (403 "You do not have permission to bulk-log
  workouts.", `services/logService.js:191-192`). Kept (faithful) — the distinctive bulk-page shape.
- **F2** — **Client-side role from an unverified JWT decode** (`session.user.globalRole` / `program.my_role`) drives
  `canLogForAny` and both redirects — display/gating only; the backend re-verifies + re-authorizes on every
  `POST /workout-logs/batch` (`requireDataEntryAllowed` + the `canLogForAny` 403). Same posture as `log-workout` /
  `log-health` F1. Kept (faithful) — not a security boundary.
- **F3** — **`admin_only_data_entry` enforced in two places** — the client mount redirect (UX) **and** the backend
  middleware (the real 403). The client redirect can race the program load (`program?.id` guard), but the backend is
  authoritative. Kept (faithful).
- **F4** — **No `canSelectAnyMember` / `userId` props on the bulk form** — every row always shows a member `Select`
  (no "You" panel), because only `canLogForAny` roles ever render this page; a plain member is redirected before the
  form mounts. Kept (faithful) — the consequence of F1.
- **F5** — **Per-row backend errors are matched by submit order** (`submittedOrder[err.index] → uid`,
  `BulkLogWorkoutForm.tsx:169-182`) — if a row is removed/reordered between submit and the error response, the mapping
  could mis-target; live client errors win on the same field. Kept (faithful) — a tolerable edge in practice.
- **F6** — **No client throttle / double-submit guard beyond `isSaving`** — rapid taps are gated only by the
  disabled-while-saving "Save all" button. Kept (faithful).
- **F7** — **The shared `BulkLogWorkoutForm` is single-sourced across modal + page** — the same component renders here
  (`variant="page"`) and in the landing modal (`variant="modal"`); a change to the rows affects both. This is the
  intended design (summary SPEC F6 — the `"page"` branch lights up exactly here). Kept (faithful).
- **F8** — **Client-side `MAX_ROWS` = 200 cap** (`BulkLogWorkoutForm.tsx:11`) — the add-row controls disable at 200; the
  backend does not independently cap the entry count. Kept (faithful) — a UX guard, not a security boundary.

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker` (run 38) — the **24th web page spec**, the standalone **Bulk-log-workouts** mobile fallback (`/summary` sub-route 6 of 6, the **3rd & final log fallback** — **CLOSES the `/summary` group**). Faithful 1:1 port of the legacy 68-line page: a `PageShell` + `PageHeader` wrapping `BulkLogWorkoutForm variant="page"`, with `canLogForAny` role logic, a **two-way** `router.replace` redirect (`admin_only_data_entry` lock → `/summary`; non-admin/logger → `/summary/log-workout`), an `addWorkoutLogsBatch` mutation invalidating `["summary"]`, and per-row `ApiError.details → BulkRowError[]` plumbing. **3rd & last `/summary` sub-route where `admin_only_data_entry` is live** (after `log-workout`, `log-health`). Decisions: **D-SCOPE** (this page; CLOSES the group) · **D-REF** (`consumed_by=[web]`) · **D-DEPS** (no new dependency — the form + api + chrome all already ported) · **D-S1** (faithful 1:1, incl. the two-way redirect + rowErrors plumbing) · **D-C1** (deterministic-nav cleanup — the two `router.back()` → `router.push("/summary")`; both lock/role `router.replace` unchanged). Flagged F1–F8 (two-way redirect/member-bounce; client JWT-decode role; dual lock enforcement; no `canSelectAnyMember`/`userId` on the bulk form; per-row errors matched by submit order; no throttle; shared single-sourced form; client-only 200-row cap). **Zero backend work, NO feature bump** — `POST /workout-logs/batch` already mounted + gated (`routes/logs.js:49`). Ported `apps/web/src/app/summary/bulk-log-workout/page.tsx`. `npm run build` ✓. |
