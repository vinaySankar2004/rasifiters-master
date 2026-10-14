# Feature: `analytics` (v1) — program-level read aggregations

> **Status:** 🚀 deployed (ported to `apps/backend/`) · **Version:** 0.6.1 · **Apps (`consumed_by`):** `web`, `ios`, `android`
> **Provenance (legacy, archived):** `backend` — `routes/analytics.js` (the **`v1Router`** half only — the
> file is shared with `analytics-v2`, §7/D-C1), `services/analyticsService.js` (the **v1** functions + the
> shared date/bucket helpers), `utils/dateRange.js` + `utils/queryHelpers.js` (analytics-only helpers),
> `server.js` (`/api/analytics` mount).
> **Depends on:** [`auth`](../auth/SPEC.md) (`authenticateToken` on every route) ·
> [`workout-logs`](../workout-logs/SPEC.md) + [`daily-health-logs`](../daily-health-logs/SPEC.md) (the
> `workout_logs` / `daily_health_logs` fact tables it aggregates) · [`program-memberships`](../program-memberships/SPEC.md)
> (the `activeMembershipInclude` inner-join gate) · [`programs`](../programs/SPEC.md) (program window +
> progress) · [`program-workouts`](../program-workouts/SPEC.md) (`ProgramWorkout.workout_name` for type
> rollups) · [`members`](../members/SPEC.md) (name join for top performers).
> **Deliberate changes (8, the rest faithful 1:1):** **D-C2** drop the dead `participation/mtd` v1 route
> (both clients use the v2 variant) · **D-C3** UTC-fix the distribution weekday bucketing · **D-C4** UTC-fix
> the timeline chart labels (`bucketLabel`) · **D-C5** (0.2.0) steps analytics — the health timeline gains
> per-bucket `steps` + `daily_average_steps`, and a new `GET /health/steps` totals endpoint (net-new; no
> legacy provenance) · **D-C6** (0.3.0) Top Workout Types ranked by total time (client-side) · **D-C7**
> (0.3.1) web workout-type color-coding (client-side) · **D-C8** (0.4.0) every route requires an ACTIVE
> membership in `programId` or global admin (reliability-overhaul D-3) · **D-C9** (0.5.0) another member's health timeline / steps only for staff or a global admin (Phase 4 S0). Read-only aggregation — every query + response shape is ported verbatim otherwise.

---

## 1. What it is

The **program-level analytics read API (v1)** — the aggregation endpoints behind the summary dashboard and
the lifestyle/activity charts. Pure read: every route is a `GET` that runs `COUNT`/`SUM`/`GROUP BY` over the
`workout_logs` + `daily_health_logs` fact tables (always inner-joined to **active** memberships) and returns
shaped JSON for charts + stat cards. This SPEC owns the **`v1Router`** routes (mounted at `/api/analytics`)
and the v1 functions of `services/analyticsService.js` (`getSummary` / `getTotalWorkoutsMTD` /
`getTotalDurationMTD` / `getAvgDurationMTD` / `getActivityTimeline` / `getHealthTimeline` /
`getDistributionByDay` / `getWorkoutTypes`) plus the shared date/bucket helpers (`toUTCDate` / `diffDays` /
`toISODate` / `bucketKey` / `bucketLabel` / `buildBuckets` / `resolveTimelineWindow` / `dayDiff`) and the two
analytics-only utils (`dateRange.js`: `getPeriodRange`; `queryHelpers.js`: `activeMembershipInclude` /
`percentChange` / `buildMTDDateRanges`).

The 9 live v1 endpoints (8 ported + 1 net-new, D-C5):

1. **Summary** — `GET /summary?period=&programId=`. The big composite payload: period totals (+ % change),
   program progress, member counts, timeline, day distribution, top performers, top workout types.
2. **Total workouts (MTD)** — `GET /workouts/total?programId=`. Month-to-date workout count + % change.
3. **Total duration (MTD)** — `GET /duration/total?programId=`. MTD minutes + % change.
4. **Avg duration (MTD)** — `GET /duration/average?programId=`. MTD avg minutes/session + % change.
5. **Activity timeline** — `GET /timeline?period=&programId=`. Bucketed workouts + active-member counts.
6. **Health timeline** — `GET /health/timeline?period=&programId=&memberId=`. Bucketed avg sleep + diet +
   (0.2.0) avg steps.
7. **Distribution by day** — `GET /distribution/day?programId=`. All-time workout counts by weekday.
8. **Workout types** — `GET /workouts/types?programId=&memberId=&limit=`. Per-type session/duration rollup.
9. **Health steps** (0.2.0, D-C5) — `GET /health/steps?programId=&memberId=`. Steps totals:
   `{ total_steps, avg_steps_per_day, days }` over steps-bearing member-day rows.

The 9th legacy v1 route, `GET /participation/mtd`, is **dropped** (D-C2) — both clients call the v2 variant.

## 2. Why it exists

The summary + lifestyle dashboards are read-only reporting surfaces; this module is their query layer. Two
windowing schemes coexist (faithful, §10 F1): the **stat cards** + participation use **month-to-date**
ranges (`buildMTDDateRanges` / `getParticipationMTDV2`), while **`getSummary`** and the **timelines** use a
rolling **`period`** (`week`/`month`/`year`/`program`) via `getPeriodRange` / `resolveTimelineWindow`. Every
aggregation inner-joins `activeMembershipInclude` so only **active** members' logs count. Numbers must match
legacy 1:1 — so the port is verbatim except the three explicit changes in §7. Authorization (0.4.0,
D-C8): `authenticateToken` + `requireProgramAccess` — only an ACTIVE member of `programId` (any role) or a
global admin may read a program's analytics (was: any signed-in member, §10 F2).

## 3. Functionality (the routes)

All mounted at **`/api/analytics`** (legacy `routes/analytics.js` `v1Router`). Handlers are thin
try/catch wrappers (`routes/analytics.js`); logic in the v1 half of `services/analyticsService.js`. Every
route is `authenticateToken` → `requireProgramAccess` (D-C8); `/health/timeline` + `/health/steps` then run the
`"health"` guard and `/workouts/types` the `"workouts"` guard (D-C9).

| # | Route | Legacy handler | Purpose |
|---|-------|----------------|---------|
| 1 | `GET /summary` | `analytics.js:11-23` → `getSummary(period, programId)` (`analyticsService.js:116-253`) | Composite dashboard payload (see §4). |
| 2 | `GET /workouts/total` | `analytics.js:36-45` → `getTotalWorkoutsMTD(programId)` (`:284-296`) | MTD workout count + % change. |
| 3 | `GET /duration/total` | `analytics.js:47-56` → `getTotalDurationMTD(programId)` (`:298-310`) | MTD minutes + % change. |
| 4 | `GET /duration/average` | `analytics.js:58-67` → `getAvgDurationMTD(programId)` (`:312-329`) | MTD avg min/session + % change. |
| 5 | `GET /timeline` | `analytics.js:69-81` → `getActivityTimeline(period, programId)` (`:331-361`) | Bucketed workouts + active members; daily average. |
| 6 | `GET /health/timeline` | `analytics.js:83-96` → `getHealthTimeline(period, programId, memberId)` (`:363-417`) | Bucketed avg sleep + diet; optional `memberId` (another member's id needs staff or a global admin, D-C9). |
| 7 | `GET /distribution/day` | `analytics.js:98-107` → `getDistributionByDay(programId)` (`:419-438`) | All-time workout counts by weekday. |
| 8 | `GET /workouts/types` | `analytics.js:109-122` → `getWorkoutTypes(programId, memberId, limit)` (`:440-469`) | Per-`ProgramWorkout.workout_name` session/duration/avg; optional `memberId`, `limit` (default 50). |
| 9 | `GET /health/steps` | net-new (D-C5) → `getHealthSteps(programId, memberId)` | `{ total_steps, avg_steps_per_day, days }` — `SUM(steps)`/`COUNT` over non-NULL-steps rows (active-join); optional `memberId` (another member's id needs staff or a global admin, D-C9). 500 text `"Failed to compute steps analytics."`. |

> **Dropped (D-C2):** `GET /participation/mtd` (`analytics.js:25-34` → `getParticipationMTD`,
> `:255-282`) — called by **neither** client (both use `GET /api/analytics-v2/participation/mtd`). Its
> function is not ported; the v2 variant ships with `analytics-v2`. (§10 F3.)

### Error contract (faithful — `routes/analytics.js` + `utils/response.AppError`)

`AppError(statusCode, message)` → `{ error: message }`; any other throw → `500` with a route-specific
generic. `400` (missing `programId` — the D-C8 gate passes a missing id through), `403 { error: "Access
denied. Program membership required." }` (D-C8: not an ACTIVE member of `programId` and not a global admin,
or `programId` is not a single string), `403 { error: "You can only view your own health data." }` (D-C9: `/health/timeline` or `/health/steps` with another member's `memberId` from a viewer who is not staff or a global admin), `404` (program not found, `getSummary` only — reached only by
members/global admins, so a non-member asking for a nonexistent program gets `403`). A DB error inside the
gate (e.g. a non-UUID `programId` from a non-admin) → the shared `errorHandler`'s `500 { error: "Internal
server error." }`. `resolveTimelineWindow`
throws plain `Error` (not `AppError`) on a bad `period` or a `program`-period program lacking start/end dates
→ surfaces as the route's `500` (§10 F5). Status codes preserved 1:1.

## 4. Feature list (behaviors to port — verbatim aggregation)

- **`getSummary`** (`:116-253`) — 400 if no `programId`; resolve `current`/`previous` ranges via
  `getPeriodRange(period)`; 404 if program missing/deleted. One `Promise.all` of 9 aggregations (total
  members; current/previous log counts + duration sums; distinct active members; top-5 performers; top-8
  workout types; per-day timeline) — each inner-joined via `activeMembershipInclude`. Derive avg durations,
  at-risk count, a `distribution_by_day` reduced **from the timeline series** (D-C3 UTC fix), program-progress
  days/percent (`toUTCDate` + `diffDays`). Returns the composite `{ period, range, totals, program_progress,
  members, timeline, distribution_by_day, top_performers, top_workout_types }`.
- **MTD stat cards** (`getTotalWorkoutsMTD` / `getTotalDurationMTD` / `getAvgDurationMTD`, `:284-329`) — each
  builds MTD ranges (`buildMTDDateRanges`), runs current+previous `COUNT`/`SUM` (active-join), returns the
  value + `percentChange`.
- **`getActivityTimeline`** (`:331-361`) — `resolveTimelineWindow(period, programId)` → window + granularity
  + `labelMode`; fetch logs in window (active-join); `buildBuckets` then tally workouts + a `Set` of
  member_ids per bucket; emit `{ date, label, workouts, active_members }` + a `daily_average`. (Labels via
  `bucketLabel` — D-C4 UTC fix.)
- **`getHealthTimeline`** (`:363-417`) — same windowing over `daily_health_logs`; per-bucket sum/count of
  sleep + food + (D-C5) steps; emit per-bucket averages (`steps` = the rounded per-bucket average over
  steps-bearing rows, `0` when none) + overall `daily_average_sleep`/`daily_average_food`/
  `daily_average_steps` + `start`/`end`. Optional `memberId` filter. (Labels via `bucketLabel` — D-C4 UTC
  fix.) Steps mirrors the sleep accumulation exactly — see D-C5 for the pinned group-view semantics.
- **`getHealthSteps(programId, memberId)`** (net-new, D-C5) — 400 if no `programId`; `where = { program_id,
  steps: { [Op.ne]: null } }` (+ `member_id` when passed), active-membership inner join;
  `Promise.all([SUM(steps), COUNT(*)])` → `{ total_steps, days, avg_steps_per_day: round(total/days) | 0 }`.
  Same D-C8 gate as the rest of v1.
- **`getDistributionByDay`** (`:419-438`) — all-time per-`log_date` counts (active-join) bucketed into the 7
  weekday names (D-C3 UTC fix). Returns `{ Sunday..Saturday: count }`.
- **`getWorkoutTypes`** (`:440-469`) — group `workout_logs` by `ProgramWorkout.workout_name` (active-join),
  `COUNT`+`SUM(duration)`, order by sessions desc, `limit` (default 50); optional `memberId`. Returns
  `[{ workout_name, sessions, total_duration, avg_duration_minutes }]`.

### Shared helpers + utils (ported with this half)

- **`analyticsService.js` local helpers** (`:7-112`) — `toUTCDate`, `diffDays`, `toISODate`, `bucketKey`,
  `bucketLabel` (D-C4), `buildBuckets`, `resolveTimelineWindow`, `dayDiff`. Shared with `analytics-v2` (which
  appends to the same file); they live once here.
- **`utils/dateRange.js`** — `toISO`, `addDays`, `getPeriodRange` (rolling current/previous windows by
  `week`/`month`/`year`/`day`). Analytics-only (no other service imports it).
- **`utils/queryHelpers.js`** — `activeMembershipInclude(programId)` (the `required:true` inner join on
  `ProgramMembership` `{program_id, status:"active"}`), `percentChange`, `buildMTDDateRanges`. Analytics-only.

## 5. Data / schema touchpoints

Faithful names (R5); all models already ported (with associations in `models/index.js`). **No migration
delta** (read-only; no schema change; the two utils are new files but faithful ports). Read-only — no writes.

- **`workout_logs`** (read, owned by [`workout-logs`](../workout-logs/SPEC.md)) — the workout fact table.
- **`daily_health_logs`** (read, owned by [`daily-health-logs`](../daily-health-logs/SPEC.md)) — health fact
  (incl. the 0.2.0 `steps` column, read by `getHealthTimeline` + `getHealthSteps`).
- **`program_memberships`** (read, owned by [`program-memberships`](../program-memberships/SPEC.md)) — the
  `activeMembershipInclude` inner join (joins on `member_id` only; the route `where` scopes `program_id`).
- **`programs`** (read, owned by [`programs`](../programs/SPEC.md)) — `getSummary` progress + the `program`
  timeline window (`start_date`/`end_date`/`status`).
- **`program_workouts`** (read, owned by [`program-workouts`](../program-workouts/SPEC.md)) —
  `workout_name` for the type rollups.
- **`members`** (read, owned by [`members`](../members/SPEC.md)) — `first_name`/`last_name` for top performers.

## 6. Flags / env

No feature-specific env. DB access via the shared `DATABASE_URL`. No feature flags; no rate limiting. No
caching (every request re-aggregates). `getWorkoutTypes` default `limit = 50`.

## 7. The migration delta + the deliberate changes

**No auth-table / stack migration delta.** Read-only aggregation, no SSE/push, no schema change; all models
pre-ported. So this is a **faithful 1:1 verbatim port with three deliberate changes**:

- **D-C1 — scope cut (the v1 half).** `routes/analytics.js` (`v1Router`/`v2Router`) and
  `analyticsService.js` (v1 fns / v2 fns / shared helpers) are **one file pair holding two features**: this
  SPEC owns the v1 routes + v1 functions + the shared date/bucket helpers + the two analytics-only utils;
  `analytics-v2` (the `v2Router` 6 routes + the 6 `*V2` functions) **appends to the same files later**
  (reusing the helpers + utils — exactly the logs.js split). `member-analytics` (`routes/memberAnalytics.js`)
  is a **separate** feature. The port creates `routes/analytics.js` exporting `{ v1Router }` for now.
- **D-C2 — drop the dead `participation/mtd` v1 route + `getParticipationMTD`.** Called by neither client —
  both use `GET /api/analytics-v2/participation/mtd` (the v2 variant ships with `analytics-v2`). Distinct
  from a byte-dup; dropped because it is superseded + unused (same call as `workout-logs` dropping its dead
  GETs). (§10 F3.)
- **D-C3 — UTC-fix the distribution weekday bucketing** (numeric correctness). `getDistributionByDay`
  (`:434`) and `getSummary`'s `distribution_by_day` (`:188`) bucket a log into a weekday via
  `new Date(date + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long" })` — **no `timeZone`**, so it
  formats the UTC instant in the **server's local** timezone and can land a log on the wrong weekday on a
  non-UTC server. The port adds `{ timeZone: "UTC" }`, pinning it to the UTC bucketing used everywhere else.
  **On Render (UTC) the output is unchanged** — the fix is determinism/robustness, matching the surrounding
  UTC intent. (Legacy behavior = §10 F6.)
- **D-C4 — UTC-fix the timeline chart labels** (display). `bucketLabel` (`:22-30`) formats weekday/month
  labels with `Intl.DateTimeFormat` and **no `timeZone`**. The port formats with `{ timeZone: "UTC" }` (and
  constructs the month-branch date as `Date.UTC(...)`) so labels are TZ-stable. Display-only; no count
  impact. **On Render (UTC) unchanged.** (Legacy = §10 F6.)

**What stays (faithful 1:1):** every aggregation query (the `Promise.all` fan-outs, the `activeMembershipInclude`
inner joins, the `fn("COUNT","*")`/`SUM` group-bys, the literal-ordered limits), the bucketing/windowing
algorithm, all response shapes + field names, the two-window scheme (MTD vs `period`), the `percentChange`
contract, and the error contract (incl. the plain-`Error`→500 paths). The numbers match legacy exactly
(modulo the now-UTC-deterministic weekday bucketing, which only differed on a non-UTC server).

> **Scope note (D-C1).** No migration delta — models + schema pre-ported; the two util files are new but
> verbatim. `analytics-v2` owns the `*V2` half; `member-analytics` is its own feature.

## 8. Dependencies

- **Upstream:** [`auth`](../auth/SPEC.md) (`authenticateToken`) · [`workout-logs`](../workout-logs/SPEC.md) +
  [`daily-health-logs`](../daily-health-logs/SPEC.md) (fact tables) ·
  [`program-memberships`](../program-memberships/SPEC.md) (active-join) · [`programs`](../programs/SPEC.md)
  (window/progress) · [`program-workouts`](../program-workouts/SPEC.md) (type names) ·
  [`members`](../members/SPEC.md) (performer names).
- **Downstream / referenced (not owned here):** `analytics-v2` shares the file pair + the helpers/utils;
  the summary + lifestyle dashboards (web pages / iOS tabs) render this data.
- **Consumers:** **`web` + `ios`** — the 8 live routes used 1:1 by both clients, **no divergence**.
  - **web:** `summary/page.tsx` bulk-loads summary (:59) + workouts/total (:71) + duration/total (:77) +
    duration/average (:83) + timeline (:89) + distribution/day (:95) + workouts/types (:101); full-page
    drilldowns at `summary/{activity,distribution,workout-types}/page.tsx`; `lifestyle/page.tsx` +
    `lifestyle/timeline/page.tsx` use health/timeline (:153/:44) + workouts/types (:147). Wrappers in
    `lib/api/{summary,lifestyle}.ts`. (participation/mtd → the v2 wrapper.)
  - **ios:** `AdminSummaryTab` bulk-loads the same 7 via `ProgramContext+Analytics.swift` (summary :17,
    workouts/total :85, duration/total :101, duration/average :118, timeline :134, distribution :47,
    types :174); `health/timeline` (:152) drives `LifestyleTimelineDetailView` +
    `StandardWorkoutTypesTab`; `timeline` also drives `ActivityTimelineDetailView`. iOS additionally uses v2
    for the *fancier* workout-type stats (most-popular/longest/highest-participation) but v1 for the base
    list + everything else. (participation/mtd → the v2 method.)

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-C1** | **Scope = the v1 half** — `v1Router` (8 routes after D-C2) + the v1 functions + the shared date/bucket helpers of `analyticsService.js` + the two analytics-only utils (`dateRange.js`, `queryHelpers.js`). `analytics-v2` (the `v2Router` + `*V2` fns) appends to the same files later; `member-analytics` is separate. | `analytics.js:6-7` (two routers); `analyticsService.js:7-112` (helpers) / `:116-469` (v1) / `:473-693` (v2); `grep` shows the utils are analytics-only; COVERAGE L23/L24/L25. |
| **D-C2** | **Drop the dead `participation/mtd` v1 route + `getParticipationMTD`** — called by neither client (both use the v2 variant). | `analytics.js:25-34`, `analyticsService.js:255-282`; web + iOS sweeps (both → `analytics-v2/participation/mtd`). |
| **D-C3** | **UTC-fix the distribution weekday bucketing** — add `{ timeZone: "UTC" }` to `getDistributionByDay` + `getSummary.distribution_by_day` (numeric correctness; unchanged on a UTC server). | `analyticsService.js:188, 434`; user cleanup choice. |
| **D-C4** | **UTC-fix the timeline chart labels** — `bucketLabel` formats with `{ timeZone: "UTC" }` (+ UTC-construct the month-branch date); display-only. | `analyticsService.js:22-30`; user cleanup choice. |
| **D-C5** | **Deliberate change (0.2.0) — steps analytics.** (a) `getHealthTimeline` additively gains a per-bucket `steps` field (rounded average over the bucket's steps-bearing rows, `0` when none) + a top-level `daily_average_steps` (rounded average of the per-bucket averages over buckets with data), cloning the sleep accumulation. (b) Net-new `getHealthSteps(programId, memberId)` + `GET /health/steps` → `{ total_steps, avg_steps_per_day, days }`, role-scoped via the existing optional-`memberId` idiom (client-side only until **D-C9**, 0.5.0, enforced it on the server). **Pinned group-view semantics (deliberate — do NOT "fix" later):** with no `memberId`, `days` counts steps-bearing **MEMBER-DAY rows** across the whole program, so `avg_steps_per_day` (and the group timeline buckets) are **per-member-day averages** — mirroring how Avg Sleep behaves — NOT the total steps per calendar day summed across the group. A calendar day where 3 members logged steps contributes 3 rows, and the group average answers "how many steps does a member take per logged day", not "how many steps does the group take per day". | User approval 2026-07-09 (steps-tracking plan, DC-1/DC-7 + orchestrator amendment A-4); `analyticsService.js getHealthTimeline`/`getHealthSteps`; `routes/analytics.js`; daily-health-logs 0.2.0 D-C4. |
| **D-C6** | **Deliberate change (0.3.0) — "Top Workout Types" ranked by total time spent, not session count (client-side, all 3 clients).** User-driven UX fix: a member who does many short walks was out-ranking longer sessions of other workouts, misrepresenting effort. The backend `getWorkoutTypes` is **unchanged** (still `COUNT`+`SUM(duration)`, `ORDER BY sessions DESC LIMIT 50/100`, same `{ workout_name, sessions, total_duration, avg_duration_minutes }` shape) — every client already receives `total_duration`, so the change is **presentation-only**: the summary card + its drill-down (list + bar/%-share chart) re-sort by `total_duration` and display total time (days-aware `Xh Ym`/`Xd Yh`), keeping the session count as a secondary line in the drill-down. Backend order left as-is on purpose (programs have far fewer than the 50-type fetch limit, so client re-rank sees every type; keeps this off the live-iOS-binary contract). No schema/DTO/route delta. | User approval 2026-07-09; web `summary/page.tsx` + `summary/workout-types/page.tsx` + `lib/format.ts` (`formatTotalDuration`); iOS `SummaryChartCards.swift` + `WorkoutTypesDetailView.swift` + `WorkoutPopularityLogic.swift` (`formatWorkoutMinutes`); Android `SummaryCharts.kt` + `WorkoutTypesDetailScreen.kt` (`formatWorkoutDuration`). |
| **D-C7** | **Deliberate change (0.3.1) — "Workout Types" color-coding on web (parity catch-up, web-only, presentation).** iOS + Android already color each workout type with a djb2-hash → 12-color palette (`"Others"` → grey); the web card + drill-down rendered plain text with one uniform bar color. Web now derives the same per-type color client-side and shows a colored bullet dot beside each type (summary card + detail list) + per-bar colors in the detail chart (Recharts `<Cell>`). **iOS is the source of truth** (the reference screenshots): iOS hashes in 64-bit `Int`, Android in 32-bit — they disagree on most names, so web reproduces the **64-bit** result via `BigInt` to match iOS, not Android (the 32-bit divergence is a pre-existing cross-platform inconsistency, left as-is). Backend + data model **unchanged** (no color field; color is derived from `workout_name`, exactly as the clients do). No schema/DTO/route delta → live binaries unaffected. | User approval 2026-07-09 (iOS chosen as color source); web new helper `lib/workout-colors.ts` (`workoutTypeColor`) + `summary/page.tsx` + `summary/workout-types/page.tsx`; iOS palette/rule `AppTheme.swift` (`chartPalette`) + `WorkoutPopularityLogic.swift` (`workoutTypePaletteColor`). |
| **D-C8** | **Deliberate change (0.4.0) — program-membership read gate (reliability-overhaul D-3; closes §10 F2).** Every v1 route (and every v2 route — analytics-v2 D-C3) runs `requireProgramAccess` after `authenticateToken` (local to `routes/analytics.js`, mirroring `routes/programWorkouts.js`' guard and member-analytics' `ensureProgramAccess` rule): `global_admin` passes; otherwise an `active` `program_memberships` row (any role — admin / logger / member) for `req.query.programId`, else `403 { error: "Access denied. Program membership required." }`. One indexed lookup per request. Missing `programId` passes through (native `400` kept); a non-string `programId` (repeated param → array) → the same 403 (the services would aggregate every listed program); DB errors → `next(err)`. `services/analyticsService.js` untouched. **Why:** these routes return member first/last names; any signed-in account could read any program by id. **Live-binary safe:** every client opens a program only when `my_status` is `active` or the caller is a global admin (web `programs/page.tsx`, iOS `ProgramPickerView.swift`, Android `ProgramPickerScreen.kt` `canOpen`), and standard users' program lists contain only active/invited/requested programs. | reliability-overhaul DESIGN_BOARD D-3; `routes/analytics.js` `requireProgramAccess`; `services/memberAnalyticsService.js` `ensureProgramAccess`; `routes/programWorkouts.js`. |
| **D-C9** | **Deliberate change (0.5.0) — per-member health reads are self-or-staff (reliability-overhaul Phase 4 S0 / People D-P8 a).** `/health/timeline` and `/health/steps` with a `memberId` other than the viewer's own answer **`403 { error: "You can only view your own health data." }`** unless the viewer is staff (an ACTIVE program admin or logger) or a global admin. Without `memberId` (the program aggregate) nothing changes. Until now the "role scoping" in row 9 / D-C5 existed only in the clients. `requireProgramAccess` delegates to the shared `utils/memberVisibility.js` (`loadViewer` + `hasProgramAccess`; same 403 / pass-through / `next(err)`, still one lookup, none for a global admin) and keeps `req.viewer`; the guard is the module's `requireMemberView("health", …)`. `/workouts/types` routes `memberId` through `requireMemberView("workouts", …)`, which always passes in S0 (People S1 hook) *(superseded at 0.6.0 by D-C10)*. **Live-binary safe:** plain members and loggers always send their own id or none (web `lifestyle/page.tsx` view-as is program-admin/global-admin only; iOS `StandardWorkoutTypesTab` sends `userId`; Android `LifestyleScreen` sends `loggedInMemberId` unless program admin; same in iOS 1.4.2 and Android 1.0.0). | Phase 4 DECISIONS D-P8; DISCOVERY P-4; `routes/analytics.js`; caller audit. |
| **D-C10** | **Hide my activity (0.6.0, [people](../people/SPEC.md) 0.1.0; deliberate).** `getSummary(period, programId, viewer)` — the route passes `req.viewer` (set by `requireProgramAccess`); `top_performers` drops entries `canView(viewer, member_id, "workouts")` refuses (may hold fewer than 5; no client renders it); every other field counts everyone; no viewer → empty list (fails closed). `/workouts/types` with `memberId`: `requireMemberView("workouts", "This member keeps their activity private.", "activity_hidden")` → `403 { error, code: "activity_hidden" }` for a hidden member viewed by a plain co-member. Both member guards (also `/health/timeline`, `/health/steps`) now answer `400 { error: "memberId must be a valid id.", code: "invalid_request" }` for a memberId that isn't one well-formed id (was a 500, or a pass for a repeated param); ids compare case-insensitively. The rule: program-memberships D-C6. | Phase 4 NP amendments S1-1; people D-C2. |
| **D-C11** | **Honest Summary + Lifestyle states on the clients (0.6.1; reliability-overhaul Phase 4 polish #30 / #31 — client-only presentation).** The reads behind the Summary and Lifestyle cards are presented with the [frontend-kit](../frontend-kit/SPEC.md) recipe: while a part is in flight it shows the surface's in-flight idiom (web `…`, iOS a spinner per card, Android a spinner per section — D-KIT-11), and **`—` only after that part's load has settled as failed** — never `0%`, `0 days`, `0`, `N/A`, "No workouts yet" or "No data" while loading or under an error; ErrorView + Retry when nothing loaded, kept data + `Couldn't refresh` · Retry on a failed refresh. **Summary (#30, web + iOS; Android already did this):** a program switch never shows the previous program's totals (D-KIT-23). **Lifestyle (#31, all three):** the tab's reads run in parallel, keyed by program + View-as member (D-KIT-23), with Retry, pull-to-refresh on the phones, a reload on every visit (the admin view refreshes too); iOS keeps the tab's data in its own keyed state (`ProgramContext+Lifestyle.swift`) — it no longer overwrites Summary's program-wide `workoutTypes`; the 8 shared `ProgramContext` loaders that wrote shared fields (`loadActivityTimeline`, `loadHealthTimeline`, `loadStepsStats`, `loadWorkoutTypes`, `loadWorkoutTypesTotal`, `loadWorkoutTypeMostPopular` / `…LongestDuration` / `…HighestParticipation`) are deleted — the detail screens own their reads (frontend-kit D-KIT-21). No route or shape change. | polish amendments U3; parity report #6 / #11; iOS plan P-5 / P-6. |
| **D-REF** | **Reference impl = legacy `backend`. `consumed_by = [web, ios, android]`** — the live routes used 1:1 by all clients, no divergence (`limit` value + optional `memberId` vary per call site, but the route is identical). `/health/steps` (D-C5) is consumed by the Lifestyle Steps card on all three clients. | Web sweep (`summary/lifestyle` pages + `lib/api/{summary,lifestyle}.ts`) + iOS sweep (`ProgramContext+Analytics.swift` + tabs) + Android port; Explore agents. |
| **D-S1** | **Stance = faithful 1:1 verbatim except D-C2–D-C4, the 0.2.0 additive steps work (D-C5), the client-side presentation changes (D-C6/D-C7), the 0.4.0 program-membership read gate (D-C8), and the 0.5.0 per-member health gate (D-C9).** Every ported aggregation query, the bucketing/windowing, all response shapes, the MTD-vs-`period` split, and the error contract are exact, except that D-C8 adds `403 { error: "Access denied. Program membership required." }` ahead of every handler and D-C9 adds `403 { error: "You can only view your own health data." }` on `/health/timeline` + `/health/steps` for another member's `memberId`; D-C5 only ADDS a timeline field + one net-new endpoint (no existing shape changes); D-C6/D-C7 change no backend contract. Remaining oddities flagged (§10). | Whole v1-half review; §7; D-C8 (0.4.0). |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Two coexisting window schemes** — stat cards + participation use **month-to-date** (`buildMTDDateRanges`); `getSummary` + timelines use a rolling **`period`** (`getPeriodRange`/`resolveTimelineWindow`). A summary card and the matching stat card can therefore cover different ranges. Intentional. | `queryHelpers.js:20`; `dateRange.js:9`; `analyticsService.js:57` | Kept (faithful). |
| **F2** | **No per-program authorization on reads (legacy)** — every route was `authenticateToken`-only; any authenticated member could read any program's analytics by `programId`. | legacy `analytics.js:11-122` | **Changed (D-C8, 0.4.0)** — active membership or global admin required. |
| **F3** | **`participation/mtd` v1 was dead** — superseded by the v2 variant on both clients. Dropped (D-C2); distinct (not a byte-dup); recorded for the parity audit. Its v2 successor ships with `analytics-v2`. | `analytics.js:25-34`; `analyticsService.js:255-282` | Changed (dropped). |
| **F4** | **`buildMTDDateRanges` + `getPeriodRange` compute boundaries in server-LOCAL time** (`new Date(y, m, 1)` / `new Date()`), unlike the explicit-UTC bucketing. NOT in the pinned D-C3/D-C4 cleanup scope, so kept as-is — on Render (UTC) it's correct; on a non-UTC server the month/period boundaries could shift. | `queryHelpers.js:20-25`; `dateRange.js:10` | Kept (faithful, out of cleanup scope) — a full TZ audit would normalize these too. |
| **F5** | **`resolveTimelineWindow` throws plain `Error`, not `AppError`** — a bad `period`, or a `program`-period program lacking start/end dates, surfaces as the route's generic `500` (not a `400`/`404`). | `analyticsService.js:87-97` | Kept (faithful) — clients only send valid periods. |
| **F6** | **Legacy date formatting used the server's local timezone** (no `timeZone` option) for distribution bucketing + timeline labels — TZ-dependent output. Fixed by **D-C3**/**D-C4** to explicit UTC; recorded as the legacy shape. `resolveTimelineWindow`'s period `label` (Intl on UTC dates, no `timeZone`) is the same class but stays per F4's scope note. | `analyticsService.js:26, 29, 188, 434` (fixed); `:78, 94` (kept) | Changed (D-C3/D-C4) for the two pinned sites; the period label kept (F4). |
| **F7** | **`fn("COUNT", "*")`** passes `"*"` as a string literal (`COUNT('*')`), which Postgres treats as `COUNT(*)` (a non-null constant) — works, but is an idiom worth noting. Ported verbatim. | `analyticsService.js:146, 158, 168, 426, 450` | Kept (faithful) — correct behavior; a cleanup would use `col("*")` or `fn("COUNT", literal("*"))`. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.6.1 | 2026-10-13 | **D-C11 — honest Summary + Lifestyle states on the clients** (reliability-overhaul Phase 4 polish #30 / #31 — web `ec13107` live; iOS `05e185a` / Android `0b0a0a3` built): in-flight idiom per surface, `—` only after a settled failure, no fake zeros; Summary never shows the previous program's totals; Lifestyle parallel + keyed by program / View-as + Retry + pull-to-refresh, iOS's tab state no longer overwrites Summary's. Client-only; no backend change. **PATCH.** |
| 0.6.0 | 2026-10-13 | **D-C10 — Hide my activity (People S1).** /summary `top_performers` filtered by the viewer; /workouts/types?memberId → 403 `activity_hidden` for a hidden member; malformed memberId → 400 `invalid_request` on the member-guarded routes. **MINOR**; backend-only. |
| 0.5.0 | 2026-10-13 | **D-C9 — another member's health timeline/steps only for staff or a global admin (reliability-overhaul Phase 4 S0 / People D-P8 a).** New `403 { error: "You can only view your own health data." }` on `/health/timeline` + `/health/steps` when `memberId` ≠ the viewer and the viewer is not an ACTIVE program admin/logger or global admin; program aggregates unchanged. `requireProgramAccess` delegates to the shared `utils/memberVisibility.js` (program-memberships 0.3.0), behavior unchanged; `/workouts/types` gains the no-op S0 `"workouts"` guard (People S1 hook). Fixes the row-9 / D-C5 "role-scoped" wording (it was client-side only) and the §3 "every route is" line. No live caller hits the new 403. **MINOR**; backend-only. |
| 0.4.0 | 2026-10-11 | **D-C8 — program-membership read gate (reliability-overhaul Phase 1b, H3 / board D-3).** `routes/analytics.js` gains a local `requireProgramAccess` (global admin, or an ACTIVE `program_memberships` row for `?programId`; missing id → native 400; non-string id → 403; try/catch → `next(err)`) after `authenticateToken` on all 9 v1 routes (+ the 5 v2 routes — analytics-v2 0.2.0). New `403 { error: "Access denied. Program membership required." }`; a non-member asking for a nonexistent program now gets 403 instead of `/summary`'s 404. `services/analyticsService.js` unchanged. Closes F2. No legitimate client call gets a 403 (clients open only active-membership programs; global admins bypass). **MINOR**; dependents analytics-v2 (bumped) + member-analytics (unaffected). Backend-only. |
| 0.3.2 | 2026-07-09 | **Dark-mode fix for the "Workout Types" chart tooltip (follow-up to D-C7).** The per-`<Cell>` colored bars leave the Recharts `<Bar>` with no `fill`, so the tooltip's value line ("Total time : …") defaulted to near-black — readable on the light card but invisible on the dark surface. Pinned the tooltip `itemStyle` color to `var(--rf-text)` so it reads in both light + dark. Web-only, presentation-only; no contract/behavior/schema delta. File: web `summary/workout-types/page.tsx`. |
| 0.3.1 | 2026-07-09 | **D-C7 — "Workout Types" color-coding on web (parity catch-up, web-only, presentation-only).** iOS/Android already color each type via a djb2-hash → 12-color palette (`"Others"` → grey); web rendered plain text + one uniform bar color. Web now shows a colored bullet dot beside each type (summary card + detail list) and per-bar colors in the detail chart (Recharts `<Cell>`), deriving the color from `workout_name` client-side. **iOS is the color source of truth** (the reference screenshots) — iOS hashes in 64-bit, Android in 32-bit and they disagree, so web reproduces the 64-bit result via `BigInt` (`lib/workout-colors.ts` `workoutTypeColor`) to match iOS; the Android 32-bit divergence is a pre-existing inconsistency left as-is. Backend + data model unchanged (no color field). Files: web new `lib/workout-colors.ts` + `summary/page.tsx` + `summary/workout-types/page.tsx`. No schema/DTO/route delta → live binaries unaffected. Web build clean. Added D-C7 (§9). |
| 0.3.0 | 2026-07-09 | **D-C6 — "Top Workout Types" ranked by total time spent, not session count (client-side, all 3 clients).** User-driven UX fix (short frequent workouts were out-ranking longer sessions). Backend **unchanged** — `getWorkoutTypes` still returns `{ workout_name, sessions, total_duration, avg_duration_minutes }` ordered by sessions desc; the change is presentation-only: the summary card + drill-down (list + bar/%-share chart) re-sort by `total_duration` and display total time via a days-aware formatter (`Xh Ym` → `Xd Yh`), keeping the session count as a secondary drill-down line. New helpers `formatTotalDuration` (web `lib/format.ts`), `formatWorkoutMinutes` (iOS `WorkoutPopularityLogic.swift`), `formatWorkoutDuration` (Android `SummaryCharts.kt`). Files: web `summary/page.tsx` + `summary/workout-types/page.tsx`; iOS `SummaryChartCards.swift` + `WorkoutTypesDetailView.swift`; Android `SummaryCharts.kt` + `WorkoutTypesDetailScreen.kt`. No schema/DTO/route delta → live binaries unaffected (backend order deliberately left as-is). All 3 surfaces compile clean. Added D-C6 (§9). |
| 0.2.0 | 2026-07-09 | **D-C5 — steps analytics (additive, user-approved steps-tracking plan).** `getHealthTimeline` gains a per-bucket `steps` field (rounded average over the bucket's steps-bearing rows, `0` when empty) + a top-level `daily_average_steps`, cloning the sleep accumulation; net-new `getHealthSteps(programId, memberId)` + `GET /health/steps` → `{ total_steps, avg_steps_per_day, days }` (`SUM(steps)`/`COUNT` over non-NULL-steps active-join rows; optional `memberId` role-scoping; 500 `"Failed to compute steps analytics."`). **Group-view semantics pinned (amendment A-4):** `avg_steps_per_day` + the group timeline buckets average over steps-bearing **member-day rows** (per-member-day average, mirroring Avg Sleep) — NOT total steps per calendar day summed across the group; deliberate, not to be "fixed" later. Reads the new `daily_health_logs.steps` (daily-health-logs 0.2.0 D-C4, migration `006`). Backend: `services/analyticsService.js` + `routes/analytics.js`. Purely additive → all existing response shapes byte-compatible; live binaries unaffected. `consumed_by` → `[web, ios, android]` (header reconciled). Consumed by the Lifestyle Steps analytics card + Steps Timeline on all three clients. Updated §1/§3/§4/§5, D-REF, D-S1. |
| 0.1.1 | 2026-06-29 | **Re-export the 3 shared timeline helpers** (`resolveTimelineWindow`, `buildBuckets`, `bucketKey`) from `services/analyticsService.js`'s `module.exports` — restores the legacy export surface (legacy exported all three) that the v1 port had trimmed because no consumer existed yet. Required by the new [`member-analytics`](../member-analytics/SPEC.md) feature (its D-C2), which imports them from this service. **Additive + backward-compatible + non-behavioral** — the 8 v1 fns, their aggregations, and all response shapes are unchanged; only the module's export list grows. PATCH bump. New reverse-dependency: `member-analytics` (`depends_on: analytics`). (`analytics-v2` shares the file but owns only the v2 fns — unchanged, no bump.) |
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker`. Documents the program-level analytics v1 read API (`/api/analytics`) — the `v1Router` half of the shared `routes/analytics.js` + the v1 functions + shared date/bucket helpers of `analyticsService.js` + the two analytics-only utils (`dateRange.js`/`queryHelpers.js`). Decisions: **D-C1** (scope = v1 half; `analytics-v2` → next feature, same file pair; `member-analytics` separate) · **D-C2** (drop the dead `participation/mtd` v1 route — both clients use the v2 variant) · **D-C3** (UTC-fix distribution weekday bucketing — numeric) · **D-C4** (UTC-fix timeline labels — display) · **D-REF** (`consumed_by = [web, ios]`, 8 routes 1:1, no divergence) · **D-S1** (faithful verbatim otherwise — every aggregation + shape ported exactly). Flagged F1–F7. No auth/stack migration delta (read-only; models + schema pre-ported; utils are faithful new files). |
| 0.1.0 (built) | 2026-06-29 | **Ported to `apps/backend/`** — `utils/dateRange.js` + `utils/queryHelpers.js` (verbatim), `services/analyticsService.js` (the shared date/bucket helpers + the 8 v1 fns; `getParticipationMTD` + the v2 fns omitted — v2 appended later per D-C1; the 2 UTC cleanups applied: `bucketLabel` D-C4, `getDistributionByDay`/`getSummary.distribution_by_day` D-C3), `routes/analytics.js` (`v1Router` 8 routes, `participation/mtd` dropped per D-C2, exports `{ v1Router }` only), mounted `/api/analytics` in `server.js`. All models pre-ported. Boot check passes: 8-route stack (no `participation/mtd`), all `authenticateToken`, 8 service fns export (`getParticipationMTD` absent), both utils export, the 4 `timeZone:"UTC"` fixes present, server loads. Status 📄→🏗️ (no semver bump — the port matches the SPEC). **Pending:** runtime smoke-test vs live Supabase (Render auto-deploy on push). |
