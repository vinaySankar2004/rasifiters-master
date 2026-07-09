# Page: `summary/log-workout` (web) — standalone Log-workout form (summary sub-route 4 of 6)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.2.0 · **App:** `web` (Next.js App Router)
> **Route:** `/summary/log-workout` — the **mobile log fallback** for the Add-workout form: a full-page
> version of the desktop modal that lives on the [`summary`](../SPEC.md) landing. **4th** of the six deferred
> `/summary` sub-routes and the **1st of the 3 log fallbacks** (siblings `log-health` + `bulk-log-workout`
> still deferred — this does **not** close the group).
> **Provenance (legacy, archived):** `rasifiters-webapp/src/app/summary/log-workout/page.tsx` (66 lines).
> **Consumes (features):** [`workout-logs`](../../../../features/workout-logs/SPEC.md) (`POST /workout-logs` —
> `authenticateToken` + `requireDataEntryAllowed`; already mounted `routes/logs.js:38`) via the already-ported
> `lib/api/logs.ts` `addWorkoutLog`; [`program-memberships`](../../../../features/program-memberships/SPEC.md)
> (`GET /program-memberships/members`) + [`program-workouts`](../../../../features/program-workouts/SPEC.md)
> (`GET /program-workouts`) for the form's member/workout lookups; [`auth`](../../../../features/auth/SPEC.md)
> (`useAuthGuard`). All consumed via the already-built `LogWorkoutForm` component.
> **Cross-app:** `consumed_by = [web]` — iOS has its own native log screen; this page is the web mobile fallback.
> **Stance:** faithful 1:1 port **+ one nav cleanup** (D-C1 deterministic `router.push("/summary")` over the
> legacy `router.back()`). **No new dependency, zero backend work, no feature bump.** Oddities flagged §10.

---

## 1. What it is + who uses it

The standalone, full-page **Log-workout** form — the **mobile fallback** for the Add-workout action. On the
[`summary`](../SPEC.md) landing the Add-workout card opens a modal on desktop but **routes to this page on mobile**
(`summary/page.tsx:206` — `isMobile ? router.push("/summary/log-workout") : setShowWorkoutForm(true)`). It renders
the **same `LogWorkoutForm` component** the modal uses, switched to its `variant="page"` branch. Used by any role
that may log a workout (member for self; admin/global-admin/logger for any member — §7).

## 2. Why it exists

The desktop modal is awkward on a small screen, so mobile gets a dedicated full-page form with a back header. It
is a presentation alternative to the modal, **not** a different feature: identical fields, identical endpoint,
identical role logic — only the wrapper (`PageShell` + `PageHeader` vs `Modal`) and the post-submit navigation
differ.

## 3. Route / location

- **App:** `web` (Next.js 14 App Router).
- **Path:** `/summary/log-workout` (`apps/web/src/app/summary/log-workout/page.tsx`). No `force-dynamic` (faithful —
  reads no search params).
- **Reached from:** the [`summary`](../SPEC.md) landing's Add-workout action card on **mobile** only
  (`summary/page.tsx:206`); the bottom-nav still shows because the path is under `/summary` (`shell.tsx`).
- **Back:** `PageHeader backHref="/summary"` (the header BackButton hardcodes `/summary`); post-save + form-close
  also go to `/summary` (D-C1).

## 4. Contents / sections

1. **`PageHeader`** — title "Log workout", subtitle "Pick member, workout, date, and duration.",
   `backHref="/summary"` (`log-workout/page.tsx:46-50`).
2. **`LogWorkoutForm variant="page"`** (`log-workout/page.tsx:52-62`) — the form's bare-fields branch
   (`forms/LogWorkoutForm.tsx:146-148`):
   - **Member** — a searchable `Select` when `canSelectAnyMember` (admin/global-admin/logger); otherwise a static
     "You" panel and the member is forced to `userId` (`LogWorkoutForm.tsx:68-82`, 51-53).
   - **Workout type** — searchable `Select` over the program's non-hidden workout types
     (`LogWorkoutForm.tsx:84-91`; `fetchProgramWorkouts` filtered `!is_hidden`).
   - **Date** — `Input type="date"`, default today (`LogWorkoutForm.tsx:93-98`, 40).
   - **Duration** — hours + minutes number inputs combined to minutes (`LogWorkoutForm.tsx:100-123`).
   - **Error** line (mutation error) + **Save workout** / "Saving…" button, disabled until valid + not saving
     (`LogWorkoutForm.tsx:126-142`).

## 5. Components + which shared features it consumes

- **Chrome (all already ported):** `PageShell`, `PageHeader` (→ `BackButton`), and the whole `LogWorkoutForm`
  (which pulls `Select` + `ui/Input`) — every one landed with the [`summary`](../SPEC.md) landing (run 21) and the
  `/program/*` sub-routes.
- **New dep:** **none** — the sweep ports nothing but the page file itself.
- **Hooks/api:** `useAuthGuard` (`auth`), `isDataEntryLocked` (`lib/permissions`), `addWorkoutLog`
  (`lib/api/logs.ts`), and (inside the form) `fetchProgramMembers` (`lib/api/programs.ts`) +
  `fetchProgramWorkouts` (`lib/api/program-workouts.ts`) — all already ported.

## 6. Data / API

- **`POST /api/workout-logs`** ← `addWorkoutLog(token, { program_id, workout_name, date, duration, member_id? })`.
  Middleware: `authenticateToken` + **`requireDataEntryAllowed`** (the `admin_only_data_entry` 403 lock,
  `routes/logs.js:17-34`). The service resolves the target member, enforcing **403 "You can only log your own
  workouts."** when a non-admin/logger passes someone else's id and **404** when the target isn't an active member
  (`logService.js:118-153`).
- **Lookups (form mount):** `GET /program-memberships/members?programId` + `GET /program-workouts?programId`.
- **Success:** `invalidateQueries({ queryKey: ["summary"] })` then **`router.push("/summary")`** (D-C1; legacy
  `router.back()`).
- **0.2.0 (multi-program):** `LogWorkoutsForm` gains the shared `ProgramMultiSelect`; the submit sends
  `program_ids[]` = the full selection to `addWorkoutLogsBatch` (workout-logs 0.5.0 D-C10). When any
  selected program is non-privileged the member column locks to self.

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
history). The backend `requireDataEntryAllowed` is the real guard (403); the client redirect is UX only. This is
the **first** `/summary` sub-route where the lock actually bites (the chart drill-downs were read-only → N/A).

## 8. States & edge cases

- **Loading lookups** — the form's member/workout `Select`s populate after `fetchProgramMembers` +
  `fetchProgramWorkouts` resolve (no page-level spinner; faithful).
- **Saving** — the Save button shows "Saving…" and is disabled (`workoutLogMutation.isPending`).
- **Error** — the mutation error message renders as a red line above the button (`LogWorkoutForm.tsx:126`).
- **Locked (non-admin + `admin_only_data_entry`)** — `router.replace("/summary")` on mount.
- **No token / no active program** — `useAuthGuard` redirects to `/login` / `/programs`.
- **Empty** — N/A (the form always renders).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-SCOPE** | This page only — **4th** of the six deferred `/summary` sub-routes and **1st of the 3 log fallbacks**; does **not** close the group (`log-health` + `bulk-log-workout` deferred). | COVERAGE summary row; `specs/pages/REGISTRY.md` |
| **D-REF** | `consumed_by = [web]` — the web mobile fallback for the Add-workout modal; iOS has its own native log screen. | legacy `summary/log-workout/page.tsx`; cross-app sweep |
| **D-DEPS** | **No new dependency** — `LogWorkoutForm` (incl. its `variant="page"` branch), `PageShell`/`PageHeader`, `addWorkoutLog`, `useAuthGuard`, `isDataEntryLocked`, the two lookup fns all already ported (summary landing run 21 + `/program/*` chrome). The sweep ports only the page file. | `page.tsx:3-11`; summary SPEC F6 |
| **D-S1** | Faithful 1:1 otherwise — same `canLogForAny` derivation, the `admin_only_data_entry` `router.replace` lock guard, the mutation injecting `program_id`, `invalidateQueries(["summary"])`, the `variant="page"` form. Already fully `rf-*` tokenized → **no tokenize cleanup**. | legacy `summary/log-workout/page.tsx` |
| **D-C1** | **Deterministic-nav cleanup** (change-now) — swap the two legacy `router.back()` calls (post-save success **and** the form `onClose`) for `router.push("/summary")`, so all navigation off the page is deterministic and matches the header BackButton (which already hardcodes `/summary`). Guards the direct-navigation/refresh case where `router.back()` could leave the app. The lock-guard `router.replace("/summary")` is unchanged (faithful — replace deliberately drops the locked page from history). | user decision; legacy `page.tsx:40`, 58 |

> **Not a cleanup:** "reuse `refreshSummaryQueries`" was considered and rejected — that helper is a module-private
> one-liner inside `summary/page.tsx:310` (`invalidateQueries(["summary"])`), byte-identical to the legacy inline
> call and not importable; there is nothing shared to reuse.

## 10. Flagged characteristics kept as-is

- **F1** — **Client-side role from an unverified JWT decode** (`session.user.globalRole` / `program.my_role`)
  drives `canLogForAny` (member picker vs "You") and the lock redirect — display/gating only; the backend
  re-verifies + re-authorizes on every `POST /workout-logs` (`requireDataEntryAllowed` + the per-member 403/404).
  Same posture as the summary landing's F1. Kept (faithful) — not a security boundary.
- **F2** — **`admin_only_data_entry` enforced in two places** — the client mount redirect (UX) **and** the backend
  middleware (the real 403). The client redirect can race the program load (`program?.id && dataEntryLocked`), but
  the backend is authoritative. Kept (faithful).
- **F3** — **No view-as / sessionStorage** — member selection is purely the form's role-driven picker (no
  cross-page "view as" state like `/members` / `/lifestyle`); a non-admin's member is forced to `userId`. Kept
  (faithful, deliberate — this is a write form, not a per-member dashboard).
- **F4** — **No client throttle / double-submit guard beyond `isPending`** — rapid taps are gated only by the
  disabled-while-saving button. Kept (faithful).
- **F5** — **The shared `LogWorkoutForm` is single-sourced across modal + page** — the same component renders here
  (`variant="page"`) and in the landing modal (`variant="modal"`); a change to the fields affects both. This is the
  intended design (summary SPEC F6 — the `"page"` branch lights up exactly here). Kept (faithful).

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.0 | 2026-07-09 | **Multi-program logging** — `LogWorkoutsForm` (variant="page") gains the shared `ProgramMultiSelect` and sends `program_ids[]` = the full selection to `addWorkoutLogsBatch` (workout-logs 0.5.0 D-C10); when any selected program is non-privileged the member column locks to self. Same submit wiring as the summary landing (2-arg `onSubmit`). `npm run build` ✓. |
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker` (run 36) — the **22nd web page spec**, the standalone **Log-workout** mobile fallback (`/summary` sub-route 4 of 6, **1st of the 3 log fallbacks**). Faithful 1:1 port of the legacy 66-line page: a `PageShell` + `PageHeader` wrapping `LogWorkoutForm variant="page"`, with `canLogForAny` role logic, the `admin_only_data_entry` `router.replace("/summary")` lock guard, and an `addWorkoutLog` mutation invalidating `["summary"]`. **First `/summary` sub-route where `admin_only_data_entry` is live** (the chart drill-downs were read-only → N/A). Decisions: **D-SCOPE** (this page; does not close the group) · **D-REF** (`consumed_by=[web]`) · **D-DEPS** (no new dependency — the form + api + chrome all already ported) · **D-S1** (faithful 1:1) · **D-C1** (deterministic-nav cleanup — the two `router.back()` → `router.push("/summary")`; lock `router.replace` unchanged). Flagged F1–F5 (client JWT-decode role/lock; dual lock enforcement; no view-as; no throttle; shared single-sourced form). **Zero backend work, NO feature bump** — `POST /workout-logs` already mounted (`routes/logs.js:38`). Ported `apps/web/src/app/summary/log-workout/page.tsx`. `npm run build` ✓. |
