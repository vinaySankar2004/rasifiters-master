# Page: `summary/workout-types` (web) — top workout types (summary sub-route 3 of 6)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.1.0 · **App:** `web` (Next.js App Router)
> **Route:** `/summary/workout-types` — the **top workout types** detail, the **third** (and **last** of the three
> chart drill-downs) of the six deferred `/summary` sub-routes (reached from the [`summary`](../SPEC.md) landing's
> **Workout Types** card). One `GlassCard` with a single-series `BarChart` of sessions per workout type **plus a
> ranked `<ul>` detail list** below (name · sessions · avg minutes). **Read-only, program-wide, program-to-date**
> (no period selector, no view-as picker, no `memberId`, no state).
> **Reference impl (legacy):** `../../../../../../rasifiters-webapp/src/app/summary/workout-types/page.tsx`.
> **Consumes (features):** [`analytics`](../../../../features/analytics/SPEC.md) (`GET /analytics/workouts/types`
> — `authenticateToken`-only, **no per-program read authz**; already mounted `routes/analytics.js:100`) via the
> already-ported `lib/api/summary.ts` `fetchWorkoutTypes` (landed verbatim with the [`summary`](../SPEC.md)
> landing, run 21) and [`auth`](../../../../features/auth/SPEC.md) (`useAuthGuard`).
> **Cross-app:** the iOS Home/summary surface renders the same workout-types breakdown natively; parity audited at
> the iOS port.
> **Stance:** faithful 1:1 port **+ one cleanup** (D-C1 styled empty-state panel matching the `distribution`
> sibling). **No new dependency.** Oddities flagged §10.

---

## 1. What it is + who uses it

The **top workout types** detail page for the active program. It charts the program's **session count per workout
type** (program-to-date) as a single-series bar chart, with a ranked list below showing each type's session count
and average duration. It is a **read-only, program-wide** analytics view — the drill-down behind the summary
landing's workout-types preview card. Every role reaches the same program-wide view (see §7).

## 2. Why it exists

To show *which workouts the program does most* — the full ranked breakdown of workout types by popularity — at a
larger size than the landing's small preview card affords (the landing shows only the top few; this page requests
up to 100 and lists them all).

## 3. Route / location

- **App:** `web` (Next.js 14 App Router).
- **Path:** `/summary/workout-types` (`apps/web/src/app/summary/workout-types/page.tsx`). No `force-dynamic`
  (faithful — the page reads no search params; prerenders to a loading shell).
- **Reached from:** the [`summary`](../SPEC.md) landing's `WorkoutTypesCard` `onClick` →
  `router.push("/summary/workout-types")` (`summary/page.tsx:261`).
- **Back:** `PageHeader backHref="/summary"`.

## 4. Contents / sections

1. **`PageHeader`** — title "Workout Types", subtitle "Program to date", `backHref="/summary"`
   (`workout-types/page.tsx:32`).
2. **Workout-types `GlassCard`** (only when `typesQuery.data`) (`workout-types/page.tsx:42-76`):
   - **Chart** — `h-80` single `BarChart` of the returned types (`{ workout_name, sessions, … }`), one `sessions`
     bar (`CHART_COLORS[0]`). X-axis labels **hidden** (`tick={false}` — workout names are long; identity is in
     the list + tooltip). Tooltip formats `[value, "Sessions"]`.
   - **Ranked list** — a `<ul>` below the chart, one row per type: `workout_name` (bold) + "`{sessions}` sessions ·
     avg `{avg_duration_minutes}` min". Server already orders by sessions DESC.
   - Empty (`data.length === 0`) → styled "No workouts logged yet." panel (D-C1).
3. **`LoadingState`** ("Loading workout types...") / **`ErrorState`** (the query error message) states
   (`workout-types/page.tsx:34-40`).

## 5. Components + which shared features it consumes

- **Chrome (all already ported):** `PageShell`, `PageHeader`, `GlassCard`, `LoadingState`, `ErrorState`.
- **New dep:** **none** — every import already ported (same purest shape as `distribution` — no `PeriodSelector`,
  no `useState`).
- **Charts:** Recharts `BarChart`/`Bar` + the foundation `lib/chart-theme.ts` tokens (`CHART_COLORS`, tooltip/grid
  styles). Axis ticks kept inline-faithful (`fontSize` 11, `var(--rf-text-muted)`); X-axis ticks hidden.
- **Hooks/api:** `useAuthGuard` (`auth`), `fetchWorkoutTypes` (`lib/api/summary.ts`, already ported run 21).

## 6. Data / API

- **`GET /api/analytics/workouts/types?programId=&limit=100`** → `WorkoutType[]`
  (`{ workout_name, sessions, total_duration, avg_duration_minutes }[]`, ordered by `sessions` DESC, capped at
  `limit`). **Variable-length array** — `[]` when no workouts logged. `authenticateToken`-only — **no per-program
  read authz** (analytics F2, inherited here as F1). The route also accepts a `memberId` (member-scoped branch),
  but this client never sends it — **program-wide only** (F4).
- **Query key:** `["summary", "workoutTypes", programId]` — **shared with the landing's preview query**, which
  passes `limit=50` while this page passes `limit=100`. React Query dedupes by key (not by `queryFn` args), so the
  two share one cache entry; whichever mounts first wins until refetch (F5).
- **Zero backend work, NO feature bump** — the route + service (`getWorkoutTypes`) + the `fetchWorkoutTypes` client
  fn all already shipped (`analytics` port; the `summary` landing ported the client fn, run 21).

## 7. Role-based view rules

There is **no view-as picker, no `memberId`, and no period selector** on this page — every role sees the **same
program-wide, program-to-date** workout-types breakdown. No admin redirect, no role-conditional UI at all;
`useAuthGuard()` default (`requireProgram: true`) — a missing active program bounces to `/programs`. The ABSENCE of
role logic is the finding (F2).

| Role | What they see |
|------|----------------|
| **global_admin** | Program-wide top workout types (chart + ranked list). |
| **program admin** (`my_role==="admin"`) | Same — program-wide. |
| **logger / member** | Same — program-wide (no per-member scoping on this page). |

**`admin_only_data_entry`: N/A** — this is a read-only analytics view, not a log-entry surface (the lock gates
logging on the `/summary` forms, not reads here).

## 8. States & edge cases

- **Loading** — `LoadingState` "Loading workout types...".
- **Error** — `ErrorState` with the query error message.
- **Empty** — when the returned array is empty (`data.length === 0`) → styled "No workouts logged yet." panel inside
  the card instead of an empty chart (D-C1). *Unlike `distribution`, the predicate is `data.length === 0` — the
  endpoint returns a variable-length array, not a fixed 7 keys, so an empty array IS the empty case (run-34
  predicate re-check: the intent transfers, but here the legacy `data.length` predicate is already correct — only
  the panel STYLING is the cleanup).*
- **No active program** — `useAuthGuard` redirects to `/programs`.
- **Query disabled** — until `token` + `programId` resolve.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-SCOPE** | This page only — the **third** of the six deferred `/summary` sub-routes (the **last** chart drill-down; does NOT close the group — the 3 log fallbacks `log-workout`/`log-health`/`bulk-log-workout` still deferred). | COVERAGE summary row |
| **D-DEPS** | **No new dependency** — every import (chrome, chart-theme, `useAuthGuard`, `fetchWorkoutTypes`) already ported. The sweep ported nothing but the page itself. Same purest shape as `distribution` (no `PeriodSelector`, no `useState`). | `workout-types/page.tsx:1-17` |
| **D-S1** | Faithful 1:1 otherwise — same query key, `enabled` gate, single `sessions` bar (`CHART_COLORS[0]`), hidden X-axis ticks, the ranked `<ul>` list, `h-80`. Already fully `rf-*` tokenized → **no tokenize cleanup**. No `memberId`/view-as/period (program-wide, program-to-date). | legacy `workout-types/page.tsx` |
| **D-C1** | **Styled empty-state panel** (change-now) — upgrade the legacy plain `<p>`"No workouts logged yet." to `distribution`'s styled `rf-surface-muted` panel, so all three `/summary` chart drill-downs share one empty-state look. Predicate kept `data.length === 0` (faithful — already correct for a variable-length array; this is STYLING only, not the run-34 predicate fix). | user decision; legacy `workout-types/page.tsx:44-45`; sibling `distribution/page.tsx:58-61` |

> **Not applied (run-33/34 lesson — subtract twin cleanups that don't fit):** the `<Legend>` + series-names cleanup
> (`activity` D-C1) — this chart has a **single** series, nothing to disambiguate (the subtitle says "Program to
> date", the tooltip says "Sessions"); and the dual-Y-axis cleanup (`lifestyle/timeline`) — a single counts series
> has one natural axis. Both deliberately omitted, as on `distribution`. The empty-state PREDICATE fix (run-34) is
> also not needed — the legacy `data.length === 0` is already correct for this endpoint's array shape.

## 10. Flagged characteristics kept as-is

- **F1** — `GET /analytics/workouts/types` is `authenticateToken`-only with **no per-program read authz**
  (inherited analytics F2): any authenticated user could fetch another program's workout types by crafting
  `programId`. Kept faithful; a backend authz hardening is a cross-feature rebuild candidate.
- **F2** — **No view-as picker, no `memberId`, no period, no role logic at all** — every role sees the same
  program-wide, program-to-date view. The ABSENCE of role-conditional UI (and of a period selector, unlike the
  `activity` sibling) is the finding; faithful and deliberate (this is the program-overview drill-down).
- **F3** — `admin_only_data_entry` N/A (read-only page) — see §7.
- **F4** — The route's `memberId` member-scoped branch is **dead from this client** — the page always calls
  `fetchWorkoutTypes(token, programId, 100)` with no `memberId`, so the breakdown is always program-wide. Faithful;
  the param is kept for parity (inherited from the shared analytics route).
- **F5** — The detail page passes **`limit=100`** while the landing preview passes **`limit=50`** under the **same**
  query key `["summary","workoutTypes",programId]`. React Query dedupes by key (not by `queryFn` args), so the two
  share one cache entry — whichever mounts first populates it until a refetch. A latent inconsistency (the detail
  page may briefly show the landing's 50-row slice); faithful, harmless in practice (50 ≤ 100, and real programs
  rarely exceed 50 workout types). A distinct cache key per limit would be a rebuild cleanup.
- **F6** — The X-axis tick labels are **hidden** (`tick={false}`) — workout-type names are long and would overlap;
  identity is conveyed by the ranked list below + the hover tooltip. Faithful.
- **F7** — The window is **program-to-date** (the service has no date filter) — accumulates every `workout_log`
  since program start, like `distribution` and unlike `activity` (period-scoped). Faithful.
