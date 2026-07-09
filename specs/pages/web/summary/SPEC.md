# Page: `summary` (web) — the program workspace overview (first tab)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.3.0 · **App:** `web` (Next.js App Router)
> **Route:** `/summary` — **the first bottom-nav tab** of a program's workspace; the screen you land on
> after selecting a program on the hub (`saveActiveProgram` → `router.push("/summary")`). Sibling tabs
> (`/members`, `/lifestyle`, `/program`) and the 6 summary sub-routes are **not** in this run (deferred).
> **Provenance (legacy, archived):** `rasifiters-webapp/src/app/summary/page.tsx`
> (+ ported deps `lib/api/{summary,logs,program-workouts}.ts`, `components/ui/{ErrorState,Input,Button}.tsx`,
> `components/forms/{LogWorkoutsForm,LogDailyHealthForm}.tsx`).
> **Consumes (features):** [`analytics`](../../../features/analytics/SPEC.md) (7 of the 8 reads),
> [`analytics-v2`](../../../features/analytics-v2/SPEC.md) (MTD participation),
> [`workout-logs`](../../../features/workout-logs/SPEC.md) + [`daily-health-logs`](../../../features/daily-health-logs/SPEC.md)
> (the 3 writes), [`program-workouts`](../../../features/program-workouts/SPEC.md) +
> [`program-memberships`](../../../features/program-memberships/SPEC.md) (the form lookups),
> [`auth`](../../../features/auth/SPEC.md) (`useAuthGuard` + the client role), and the active program from
> `lib/storage.ts`.
> **Cross-app:** the iOS admin-home **Summary tab** (`Features/Home/`) renders the same overview natively;
> parity audited at the iOS port.
> **Stance:** faithful 1:1 port **+ one typed cleanup** (D-C1). Oddities flagged §10.

---

## 1. What it is + who uses it

The **program workspace overview** — the dashboard for the active program. It shows program progress, an
activity-timeline chart, four month-to-date stat cards (participation, total workouts, total duration, avg
duration), a workout-by-day distribution chart, and the top workout types; and it is the **primary data-entry
surface** — **two** action cards open modal forms: **Add workouts** (a unified multi-row form — log one or
many sessions at once) and **Log daily health**. Used by **every enrolled member** of the active program;
the member picker inside "Add workouts" + whether the cards are enabled varies by role and the
`admin_only_data_entry` lock (§7). (Prior to 2026-07-01 there were three cards — a single "Add workout" + an
admin-only "Bulk add"; these merged into the one multi-row "Add workouts", `workout-logs` D-C8.)

## 2. Why it exists

To be the home tab of a program's workspace: a glanceable health-of-the-program dashboard plus the fastest
path to logging activity. It is where the analytics features (read) and the log features (write) first meet a
real screen — the first web surface to consume the analytics + logging backend.

## 3. Route / location

- **App:** `web`. **Route:** `/summary`. **Protected** — in the `middleware.ts` matcher (`/summary/:path*`);
  an unauthenticated edge request → `/login?from=/summary`, and the page's `useAuthGuard()` (default
  `requireProgram: true`) is a second client gate that **bounces to `/programs` if no active program** is
  selected.
- **Reached via:** selecting an openable `ProgramCard` on the hub — `saveActiveProgram({...})` then
  `router.push("/summary")` ([programs hub page.tsx:151-163](../../../../apps/web/src/app/programs/page.tsx#L151)).
- **Chrome:** the app-wide bottom nav (`apps/web/src/app/shell.tsx` — `showNav` includes `/summary`) renders
  the 4 workspace tabs (Summary / Members / Lifestyle / Program). The Members / Lifestyle / Program tabs +
  the 6 summary sub-routes are **forward dependencies** (F2).
- **Leaves to:** `/summary/activity` · `/summary/distribution` · `/summary/workout-types` (detail cards), and
  on **mobile** `/summary/log-workout` (the unified "Add workouts" form) · `/summary/log-health` (the action
  cards route to pages instead of opening modals). The 3 detail cards are **not yet built** (F2);
  `/summary/log-workout` + `/summary/log-health` are built. (`/summary/bulk-log-workout` was removed in the
  2026-07-01 merge.)

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Header | "Summary" + active program name + the user's initials avatar. | summary/page.tsx:178, 313-335 |
| Error banner | `ErrorState` rendered when the summary analytics query errors. | summary/page.tsx:180-182 |
| Program Progress | `GlassCard` with an SVG circular gauge (`progress_percent`), elapsed/total days, a `StatusBadge`, and elapsed/remaining day counts. | summary/page.tsx:186, 337-396 |
| Activity Timeline | Clickable card → `/summary/activity`; a Recharts `BarChart` of workouts + active members over the **week** (label + daily average). | summary/page.tsx:187-192, 489-536 |
| Data-lock banner | Shown when `dataEntryLocked` — 🔒 + `DATA_LOCK_MESSAGE`. | summary/page.tsx:195-200 |
| Action cards | **Add workouts** + **Log daily health** (two cards, both always shown to every role). Each `disabled={dataEntryLocked}`; on desktop opens a modal, on mobile routes to a sub-page. | summary/page.tsx (cards region + `AddWorkoutCard`/`AddHealthCard`) |
| Stat cards (4) | `StatCard` ×4: MTD Participation (`participation_pct`, `active/total`), Total Workouts, Total Duration (hrs), Avg Duration (min) — each with a `change_pct` delta. | summary/page.tsx:219-256, 461-487 |
| Distribution | Clickable card → `/summary/distribution`; a `BarChart` of workouts by day of week (Sun–Sat). | summary/page.tsx:259, 538-576 |
| Workout Types | Clickable card → `/summary/workout-types`; top 6 types by sessions, or an empty hint. | summary/page.tsx:260, 578-604 |
| Add Workouts modal | `Modal` + `LogWorkoutsForm` (unified multi-row table/cards, ≤200 rows, per-row errors → `addWorkoutLogsBatch`). Admin/logger get a per-row member picker; a plain member has the member column hidden and each row seeded to self (`canSelectAnyMember` / `selfMemberId`). A **program multi-select** (`ProgramMultiSelect`, current program pre-checked+locked; `admin_only_data_entry`-locked programs disabled; hidden when the user is in only one program) sends `program_ids[]` = the full selection (workout-logs D-C10). | summary/page.tsx (Add-workouts modal) |
| Log Health modal | `Modal` + `LogDailyHealthForm` (**rebuilt batched multi-row** clone of `LogWorkoutsForm` — member/date/sleep/**diet**/**steps** per row, ≤200 rows, per-row errors → `addDailyHealthLogsBatch`; the same `ProgramMultiSelect` + member-lock; at-least-one of sleep/diet/steps per row, R-1). | summary/page.tsx (Log-health modal) |

**Data flow.** Eight read queries fire on mount (`enabled: !!token && !!programId`), keyed under
`["summary", …]`. The two write mutations (`workoutsMutation` batch + `dailyHealthMutation`) each
`invalidateQueries(["summary"])` on success and close their modal. The
period is a fixed `"week"` const on the landing — the period selector lives on the deferred
`/summary/activity` detail page (F4).

## 5. Components + features consumed

- **Ported-with-this-page (D-S1, verbatim):** `lib/api/{summary, logs, program-workouts}.ts` (whole modules)
  + `components/ui/{ErrorState, Input, Button}.tsx` + `components/forms/{LogWorkoutsForm,
  LogDailyHealthForm}.tsx`. All transitive deps already in the foundation (`cn`, `useIsMobile`, `Select`,
  `apiRequest`, `fetchProgramMembers`, `chart-theme`).
- **Already-ported, reused:** `useAuthGuard` (default `requireProgram:true`), `useActiveProgram` /
  `loadActiveProgram` (`lib/storage.ts`), `isDataEntryLocked` + `DATA_LOCK_MESSAGE` (`lib/permissions.ts`),
  `PageShell` / `GlassCard` / `Modal` / `StatusBadge`, `Select`, the `chart-theme` tokens, Recharts, React Query.
- **Features:** [`analytics`](../../../features/analytics/SPEC.md), [`analytics-v2`](../../../features/analytics-v2/SPEC.md),
  [`workout-logs`](../../../features/workout-logs/SPEC.md), [`daily-health-logs`](../../../features/daily-health-logs/SPEC.md),
  [`program-workouts`](../../../features/program-workouts/SPEC.md), [`program-memberships`](../../../features/program-memberships/SPEC.md),
  [`auth`](../../../features/auth/SPEC.md).

## 6. Data / API

All calls send the Supabase access JWT as `Authorization: Bearer` (via `apiRequest`); the backend
JWKS-verifies + maps `sub` → member and runs all authorization. Paths are relative to `API_BASE_URL` (which
ends in `/api`).

| Call | Endpoint | Notes |
|------|----------|-------|
| `fetchAnalyticsSummary(token, "week", programId)` | `GET /analytics/summary?period&programId` | Only `program_progress` is used on the landing (the rest of `AnalyticsSummary` feeds the deferred detail pages — F5). |
| `fetchMTDParticipation` | `GET /analytics-v2/participation/mtd?programId` | The **v2** participation card (the v1 variant was dropped backend-side). |
| `fetchTotalWorkoutsMTD` / `fetchTotalDurationMTD` / `fetchAvgDurationMTD` | `GET /analytics/workouts/total` · `/duration/total` · `/duration/average` `?programId` | Each `{value, change_pct}`. |
| `fetchActivityTimeline(token, "week", programId)` | `GET /analytics/timeline?period&programId` | `{label, daily_average, buckets[]}` for the bar chart. |
| `fetchDistributionByDay` | `GET /analytics/distribution/day?programId` | `{Sunday…Saturday}` workout counts. |
| `fetchWorkoutTypes(token, programId, 50)` | `GET /analytics/workouts/types?programId&limit` | Sorted client-side, top 6 shown. |
| `addWorkoutLog` | `POST /workout-logs` | Lock-gated (`requireDataEntryAllowed`); member resolved from the form. |
| `addWorkoutLogsBatch` | `POST /workout-logs/batch` | Lock-gated; ≤200 rows; optional `program_ids[]` (≤20, D-C10); 400/409 → per-row `rowErrors` mapped back into the form. |
| `addDailyHealthLogsBatch` | `POST /daily-health-logs/batch` | Lock-gated; ≤200 rows; optional `program_ids[]` (≤20); in-batch dup 409, existing rows upsert (D-C5); rows carry sleep/diet/**steps**. |
| `fetchProgramMembers` / `fetchProgramWorkouts` | `GET /program-memberships/members` · `/program-workouts?programId` | Form lookups (member + workout dropdowns); workouts filtered `!is_hidden` client-side. |

## 7. Role-based view rules

Roles derive from `session.user.globalRole` (client JWT, F1) + the active program's `my_role` (from
`saveActiveProgram`). The page computes
`canLogForAny = globalRole=="global_admin" || my_role=="admin" || my_role=="logger"`
(summary/page.tsx:51-54) and
`dataEntryLocked = isDataEntryLocked(session, program)` (line 55).

| Role | Sees | Can do |
|------|------|--------|
| **global_admin / program admin / logger** | The full overview + **both** action cards (**Add workouts** + **Log daily health**). | In "Add workouts", a **per-row member picker** (`canSelectAnyMember=true`) — log for **any** active member; multiple rows per submit. |
| **member** (active, non-admin/logger) | The full overview + the same **two** cards. | Log **only for themselves** — in "Add workouts" the member column is **hidden** and each row is seeded to `selfMemberId` (backend enforces own-rows-only, `workout-logs` D-C8). |
| **any enrolled role, read** | All charts + stats are visible to every enrolled member regardless of role. | — |

**`admin_only_data_entry`:** when **on** and the user is **not** a program/global admin
(`dataEntryLocked`), the 🔒 lock banner shows and **both action cards are disabled** — reads stay fully
visible. The backend `requireDataEntryAllowed` middleware is the real guard (403); this only drives the
disabled UI + messaging.

## 8. States & edge cases

- **Loading:** stat values render `—` / "Loading…"; charts render empty until their query resolves.
- **Empty:** Workout Types shows "No workouts logged yet."; charts render with zero bars.
- **Error:** the summary query error renders the inline `ErrorState`; a mutation error renders inside its
  modal and keeps it open (with `rowErrors` per-row for bulk).
- **No active program:** `useAuthGuard()` (default `requireProgram:true`) redirects to `/programs`.
- **Unauthenticated / expired:** edge `middleware.ts` → `/login` (or pass-through for client refresh), same
  posture as the hub.
- **Mobile vs desktop:** `useIsMobile()` switches the action cards between opening a modal (desktop) and
  routing to a sub-page (mobile, F2 — those pages aren't built yet).
- **Forward nav:** the activity / distribution / workout-types cards + the mobile log routes all point at
  **not-yet-built** pages (F2) — they 404 until those specs land.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Reference impl = legacy `rasifiters-webapp/src/app/summary/page.tsx`. `consumed_by = [web]`.** Cross-app: the iOS admin-home Summary tab renders the same overview natively; parity audited at the iOS port. | `summary/page.tsx`; user answer (faithful). |
| **D-SCOPE** | **This run owns the `/summary` landing page + its 3 embedded log-form modals** (the desktop write path works end-to-end), pulling in `lib/api/{summary,logs,program-workouts}.ts`, `ui/{ErrorState,Input,Button}`, and the 3 `forms/*`. **Deferred:** all 6 sibling sub-route pages (`/summary/{activity,distribution,workout-types,log-workout,log-health,bulk-log-workout}`) — separate page-spec rows; links to them are forward-nav (F2). | inventory (`specs/pages/REGISTRY.md`); user answer ("Landing + 3 log forms"). |
| **D-S1** | **Stance = faithful 1:1 port** — the page + all 3 forms + the 3 api modules + the 3 UI components ported verbatim from legacy; whole api modules kept even where this page uses a subset (later pages reuse the rest — F3). Verbatim except D-C1. | `summary/page.tsx:1-606` + the ported deps; user answer. |
| **D-C1** | **One typed cleanup:** `ProgramProgressCard`'s prop typed `summary?: AnalyticsSummary` instead of `summary?: any` (the `AnalyticsSummary` type already exists in `lib/api/summary.ts`). Non-behavioral — the same `program_progress` fields are read. No other cleanup (the `summaryPeriod="week"` const stays faithful — F4). | `summary/page.tsx:337`; `lib/api/summary.ts:3-49`; user answer ("faithful + minor typed cleanups"). |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Client-side role from an unverified JWT decode** (`session.user.globalRole`) drives `canLogForAny` (→ the per-row member picker / `canSelectAnyMember`) — display/gating only; the backend re-verifies + re-authorizes (and `requireDataEntryAllowed` enforces the lock, `addWorkoutLogsBatch` enforces own-rows-only per D-C8) on every call. Same posture as the hub's F1. | `summary/page.tsx:51-54` | Kept (faithful) — not a security boundary. |
| **F2** | **Forward navigation to not-yet-built routes** — the detail cards → `/summary/{activity,distribution,workout-types}` and the sibling bottom-nav tabs (`/members`, `/lifestyle`, `/program`). These 404 until their specs land. (The mobile `/summary/log-workout` + `/summary/log-health` action routes ARE built.) | `summary/page.tsx` (detail cards + `shell.tsx`) | Kept (faithful) — targets ported in later runs. |
| **F3** | **Vestigial-here api fns** — the whole `logs.ts` (single `addWorkoutLog` + `update/delete` workout + health log fns) and `program-workouts.ts` (toggle/add/edit/delete management fns) modules are ported (D-S1) but `/summary` now uses only `addWorkoutLogsBatch` / `addDailyHealthLog` / `fetchProgramWorkouts` (the single `addWorkoutLog` is no longer wired into any web UI — the widget-less web app leaves it dead). The rest light up on the deferred member-detail / workout-types pages. | `lib/api/logs.ts`, `lib/api/program-workouts.ts` | Kept (faithful) — extra fns belong to later pages / the retired single-add path. |
| **F4** | **No period selector on the landing** — `summaryPeriod` is a fixed `"week"` const; the activity timeline always shows the week view. The week/month/year/program selector lives on the deferred `/summary/activity` detail page. | `summary/page.tsx:47` | Kept (faithful) — by design; the selector is on the detail page. |
| **F5** | **Over-fetched-but-unused summary fields** — `fetchAnalyticsSummary` returns the full `AnalyticsSummary` (timeline, distribution, members, totals, top_performers, top_workout_types) but the landing reads only `program_progress`; the other top-line numbers come from the dedicated endpoints. | `summary/page.tsx:186`, `lib/api/summary.ts:104-107` | Kept (faithful) — the extra fields feed the deferred detail pages. |
| **F6** | **The forms' `variant="page"` branch** — `LogWorkoutsForm` / `LogDailyHealthForm` each support a `"page"` variant for the mobile sub-route pages; `/summary` renders them as `"modal"`, while `/summary/log-workout` (+ log-health) render the `"page"` variant. | `forms/LogWorkoutsForm.tsx`, `LogDailyHealthForm.tsx` | Kept (faithful) — both variants now in use (modal on desktop, page on mobile). |
| **F7** | **No client-side rate limiting** on the log/bulk-log/health mutations (consistent with the auth pages' + hub's no-throttle posture). | `summary/page.tsx:105-144` | Kept (faithful) — throttling belongs server-side. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.3.0 | 2026-07-09 | **Steps + batched multi-program logging.** The **Log daily health** modal's `LogDailyHealthForm` is rebuilt as a **batched multi-row** clone of `LogWorkoutsForm` (member/date/sleep/diet/**steps** per row, ≤200 rows, per-row `rowErrors`) posting to the net-new `addDailyHealthLogsBatch` (`POST /daily-health-logs/batch`, daily-health-logs 0.2.0 D-C5) — replacing the single `addDailyHealthLog`; at-least-one of sleep/diet/steps per row (R-1). Both forms gain a **`ProgramMultiSelect`** (exported from `LogWorkoutsForm`; current program pre-checked+locked, `admin_only_data_entry`-locked programs disabled "Admin-only — can't log", hidden for single-program users) sending `program_ids[]` = the full selection (workout-logs D-C10 / daily-health-logs D-C5); when any selected program is non-privileged the member column locks to self. Both `onSubmit` lambdas take `(entries, programIds)`; `isGlobalAdmin` passed to both. `AddHealthCard` copy → "Track sleep, diet quality, and steps for the day." `npm run build` ✓. |
| 0.2.0 | 2026-07-01 | **Merged the single "Add workout" + admin-only "Bulk add" cards into one multi-row "Add workouts" card/form** (`components/forms/LogWorkoutsForm.tsx`, replacing `LogWorkoutForm` + `BulkLogWorkoutForm`, both deleted). The unified form always posts to `addWorkoutLogsBatch`; admin/logger get a per-row member picker, a plain member has the member column hidden with each row seeded to `selfMemberId` (backed by `workout-logs` D-C8 — members may batch-log their own rows). Summary now shows **two** action cards (Add workouts + Log daily health), both to every role. Removed the `/summary/bulk-log-workout` mobile route; `/summary/log-workout` now renders the unified form. Updated §1/§3/§4/§5/§7/§10 (F1/F2/F3/F6). `npx tsc --noEmit` ✓. |
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker` (run 21) — the **seventh web page spec**, the program workspace **Summary** overview (first bottom-nav tab; where a selected program lands). Documents the read overview (program-progress gauge, activity-timeline chart, 4 MTD stat cards, distribution chart, workout-types list) + the **desktop write path** (3 modal forms: log workout / bulk-log / log daily health). Consumes `analytics` + `analytics-v2` (8 reads) + `workout-logs` + `daily-health-logs` (3 writes) + `program-workouts`/`program-memberships` (form lookups) + `auth`. Decisions: **D-REF** (`consumed_by=[web]`; iOS Summary tab mirrors later) · **D-SCOPE** (landing + 3 forms this run; the 6 sub-route pages deferred) · **D-S1** (faithful 1:1) · **D-C1** (one typed cleanup — `ProgramProgressCard` `any`→`AnalyticsSummary`). Flagged F1–F7 (client JWT-decode role; forward-nav to unbuilt routes; vestigial-here api fns; week-only landing period; over-fetched summary fields; dead `variant="page"` form branch; no client rate-limit). Ported `apps/web/src/app/summary/page.tsx` + `lib/api/{summary,logs,program-workouts}.ts` + `components/ui/{ErrorState,Input,Button}.tsx` + `components/forms/{LogWorkoutsForm,LogDailyHealthForm}.tsx`. `npm run build` ✓ (`/summary` prerendered, 107 kB — Recharts; Middleware 27.2 kB active). |
