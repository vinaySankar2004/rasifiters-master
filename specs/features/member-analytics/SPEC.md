# Feature: `member-analytics` — per-member analytics (metrics · history · streaks · recent)

> **Status:** 🏗️ built (ported to `apps/backend/`) · **Version:** 0.2.0 · **Apps (`consumed_by`):** `web`, `ios`, `android`
> **Provenance (legacy, archived):** `backend` — `routes/memberAnalytics.js` (the 4 routers),
> `services/memberAnalyticsService.js` (the 4 fns + helpers), `services/analyticsService.js` (re-export the 3
> shared timeline helpers it imports — D-C2), `server.js` (the 4 `/api/member-*` mounts).
> **Depends on:** [`auth`](../auth/SPEC.md) (`authenticateToken` on every route) ·
> [`analytics`](../analytics/SPEC.md) (imports `resolveTimelineWindow`/`buildBuckets`/`bucketKey` from
> `analyticsService.js`) · [`workout-logs`](../workout-logs/SPEC.md) + [`daily-health-logs`](../daily-health-logs/SPEC.md)
> (the `workout_logs` + `daily_health_logs` fact tables it aggregates) ·
> [`program-memberships`](../program-memberships/SPEC.md) (`ensureProgramAccess` + the active-membership roster) ·
> [`programs`](../programs/SPEC.md) (`start_date` window anchor) ·
> [`program-workouts`](../program-workouts/SPEC.md) (`ProgramWorkout.workout_name` for type rollups) ·
> [`members`](../members/SPEC.md) (member names/usernames).
> **Deliberate changes (2 cleanups + 1 additive field, the rest faithful 1:1):** **D-C3** extract the
> repeated requester-access + target-enrolled prelude shared by history/streaks/recent into one helper
> (statuses preserved 1:1); **D-C4** guard a null `program.start_date` in `getMemberStreaks` (mirrors
> `getMemberMetrics`' existing guard); **D-C5** (0.2.0) the metrics rollup gains `avg_steps` (average over a
> member's steps-bearing days, rounded int — mirrors `avg_sleep_hours`).

---

## 1. What it is

The **per-member analytics read API** — four independent `GET` routers (`/api/member-metrics`,
`/api/member-history`, `/api/member-streaks`, `/api/member-recent`) that power the **members dashboard / member
detail** surfaces on both clients. Pure read: each route aggregates the `workout_logs` (+ `daily_health_logs`)
fact tables for a program, scoped either **program-wide** (the metrics leaderboard) or to a **single member**
(history, streaks, recent). This is a **separate file pair** from [`analytics`](../analytics/SPEC.md) /
[`analytics-v2`](../analytics-v2/SPEC.md) (the program-level dashboards) — it owns `routes/memberAnalytics.js`
+ `services/memberAnalyticsService.js` outright; it only **imports** three timeline helpers from
`analyticsService.js`.

The 4 endpoints:

1. **Member metrics** — `GET /api/member-metrics?programId=&…`. The per-program **member leaderboard**: for
   every active member, an in-memory rollup (workouts, total/avg duration, active days, distinct workout types,
   current/longest streak, MTD workouts, total hours, favorite workout, avg sleep, avg food quality, **avg
   steps** — D-C5), then server-side **search / 16 range filters / sort**. Optional `memberId` narrows to one
   member (the member-card variant). The richest route.
2. **Member history** — `GET /api/member-history?programId=&memberId=&period=`. A single member's workout
   **activity timeline** bucketed by `period` (week/month/quarter/year/all) + a daily average. Uses the shared
   `resolveTimelineWindow`/`buildBuckets`/`bucketKey` (same machinery as analytics v1 timelines).
3. **Member streaks** — `GET /api/member-streaks?programId=&memberId=`. A single member's current + longest
   logging streak (consecutive days) + milestone badges (3/7/14/30/60/90).
4. **Member recent** — `GET /api/member-recent?programId=&memberId=&…`. A single member's workout list
   (date/duration/type), filterable by date range / workout type / duration, sortable by date/duration/type,
   `limit`-capped (`0` = all). **The workout-history read both clients use** — it's why
   [`workout-logs`](../workout-logs/SPEC.md) dropped its 2 dead GET routes (D-C1 there).

## 2. Why it exists

The program dashboards ([`analytics`](../analytics/SPEC.md)) answer *"how is the program doing?"*;
`member-analytics` answers *"how is **this member** doing?"* — the leaderboard that ranks/filters members and
the per-member detail cards (timeline, streaks, recent workouts). Both clients render the same four surfaces
(members tab + member detail), so `consumed_by = [web, ios]`, all 4 routes 1:1. Unlike the program analytics
(v1/v2), **this feature enforces per-program read authz** (`ensureProgramAccess`: global-admin OR an active
membership in the program) on every route (§10 F1) — it's the gated read surface. Numbers must match legacy
1:1 → the port is verbatim apart from the two pinned cleanups.

## 3. Functionality (the routes)

Four **separate routers** (legacy `routes/memberAnalytics.js` exports `{ metricsRouter, historyRouter,
streaksRouter, recentRouter }`), each mounted at its own base path. Handlers are thin try/catch wrappers; logic
lives in `services/memberAnalyticsService.js`. Every route is `GET /` + `authenticateToken`.

| # | Route | Legacy handler | Purpose |
|---|-------|----------------|---------|
| 1 | `GET /api/member-metrics` | `memberAnalytics.js:13-22` → `getMemberMetrics(req.query, req.user)` (`memberAnalyticsService.js:51-259`) | Per-program member leaderboard: aggregate → search/filter/sort. |
| 2 | `GET /api/member-history` | `memberAnalytics.js:26-35` → `getMemberHistory(req.query, req.user)` (`:261-301`) | Single-member workout timeline + daily average. |
| 3 | `GET /api/member-streaks` | `memberAnalytics.js:39-48` → `getMemberStreaks(req.query, req.user)` (`:303-337`) | Single-member current/longest streak + milestones. |
| 4 | `GET /api/member-recent` | `memberAnalytics.js:52-61` → `getMemberRecentWorkouts(req.query, req.user)` (`:339-420`) | Single-member recent workout list (filter/sort/limit). |

### Error contract (faithful — `routes/memberAnalytics.js` + `utils/response.AppError`)

`AppError(statusCode, message)` → `res.status(code).json({ error: message })`; any other throw → `500` with a
route-specific generic (one of "Failed to fetch member metrics/workout history/streaks/recent workouts.").
The `AppError`s thrown: `400` (missing required query param — `programId`, or `programId`+`memberId`), `403`
("Access denied…" from `ensureProgramAccess`), `404` ("Member is not enrolled in this program." /
"Program not found."), and metrics' `400 "Invalid date range."`. Status codes preserved 1:1.

## 4. Feature list (behaviors to port — verbatim aggregation)

- **`getMemberMetrics(query, user)`** (`:51-259`) — `400` if no `programId`; `ensureProgramAccess` → `403`;
  `Program.findOne({is_deleted:false})` → `404`. Clamp the `[startDate,endDate]` window to
  `[program.start_date, today]` (UTC; `400 "Invalid date range."` if end < start). Load active memberships
  (optionally one `memberId`) + their `workout_logs` (with `ProgramWorkout.workout_name`) + `daily_health_logs`
  within the window. **In-memory rollup per member**: workouts, total/avg duration, total hours, active days
  (distinct `log_date`), distinct workout types, current/longest streak (`computeStreaks`), MTD workouts
  (`isInCurrentMonth`), favorite workout (max session count), avg sleep, avg food quality, **avg steps**
  (rounded average over the member's steps-bearing days, `null` when none — D-C5, mirrors avg sleep). Then
  **search** (name/username substring), **16 range filters** (`within` min/max; null sleep/food treated as
  `0`, §10 F5 — `avg_steps` is **not** added to `SORTABLE_FIELDS` or the filter set this run, §10 F8),
  **sort** (one of `SORTABLE_FIELDS`, default `workouts`; dir default `desc`). Returns `{ program_id, total,
  filtered, sort, direction, date_range:{start,end}, members:[…] }` (each member gains `avg_steps`).
- **`getMemberHistory(query, user)`** (`:261-301`) — `400` if no `programId`+`memberId`; access prelude
  (`ensureProgramAccess` `403` + target-membership `404 "not enrolled"`). `resolveTimelineWindow(period, programId)`
  → `buildBuckets` → fill from the member's `workout_logs` via `bucketKey`. Returns `{ period, label,
  daily_average, buckets:[{date,label,workouts}], start, end }`.
- **`getMemberStreaks(query, user)`** (`:303-337`) — `400` if no `programId`+`memberId`; access prelude;
  `Program.findOne` `404`. Load the member's `workout_logs` from `program.start_date`→today, `computeStreaks`
  over distinct dates. Returns `{ currentStreakDays, longestStreakDays, milestones:[{dayValue,achieved}] }`
  (milestones `[3,7,14,30,60,90]`, `achieved = longest>=m || current>=m`).
- **`getMemberRecentWorkouts(query, user)`** (`:339-420`) — `400` if no `programId`+`memberId`; access prelude.
  Build a `WorkoutLog.findAll` where-clause from optional `startDate`/`endDate` (`Op.gte`/`Op.lte`) +
  `minDuration`/`maxDuration`; order by `log_date`/`duration`/`ProgramWorkout.workout_name`; optional
  `workoutType` filter (inner `where` on the include); `limit` only when `> 0` (`0`/absent → all, default 1000).
  Returns `{ items:[{id,workoutType,workoutDate,durationMinutes}], total, filters:{…} }` (synthetic `id`, §10 F6).

### Local helpers (owned by this service)

- **`ensureProgramAccess(userId, globalRole, programId)`** (`:6-13`) — `global_admin` OR an active
  `ProgramMembership` for the requester → boolean. The per-program read gate (§10 F1).
- **`computeStreaks(dateStrings)`** (`:15-35`) — longest + current run of consecutive UTC days. **`current`
  counts back from the most-recent logged day, not anchored to today** (§10 F2).
- **`isInCurrentMonth(dateString)`** (`:37-41`) — UTC year+month equality vs the server clock (`new Date()`).
- **`SORTABLE_FIELDS`** (`:43-47`) / **`milestonesList`** (`:49`) — the sort allowlist + milestone day values.

### Shared timeline helpers (imported from `analyticsService.js` — D-C2)

`getMemberHistory` imports **`resolveTimelineWindow`, `buildBuckets`, `bucketKey`** from `./analyticsService`
(`memberAnalyticsService.js:4`). Legacy `analyticsService.js` exports all three; our v1/v2 port left them
**un-exported** (no consumer existed yet). This port **re-adds them to `analyticsService.js`'s `module.exports`**
(faithful restoration of the legacy export surface) — single-sourced, no duplication (D-C2).

## 5. Data / schema touchpoints

Faithful names (R5); all 6 models already ported (with associations in `models/index.js`). **No migration
delta** (read-only; no schema change; no new tables). Read-only — no writes.

- **`workout_logs`** (read, owned by [`workout-logs`](../workout-logs/SPEC.md)) — the primary fact table (all 4
  routes). `member_id`/`program_id`/`log_date`/`duration`/`program_workout_id`.
- **`daily_health_logs`** (read, owned by [`daily-health-logs`](../daily-health-logs/SPEC.md)) — `sleep_hours` +
  `food_quality` + (0.2.0) `steps` for the metrics rollup only.
- **`program_memberships`** (read, owned by [`program-memberships`](../program-memberships/SPEC.md)) — the
  active roster (metrics) + `ensureProgramAccess` + target-enrolled `404` checks.
- **`program_workouts`** (read, owned by [`program-workouts`](../program-workouts/SPEC.md)) — `workout_name`
  (favorite/type rollups, recent list, recent sort/filter by type).
- **`programs`** (read, owned by [`programs`](../programs/SPEC.md)) — `start_date` (window anchor) + `is_deleted`.
- **`members`** (read, owned by [`members`](../members/SPEC.md)) — `first_name`/`last_name`/`username` (metrics).

## 6. Flags / env

No feature-specific env. DB access via the shared `DATABASE_URL`. No feature flags; no rate limiting; no
caching (every request re-aggregates). `member-recent`'s `limit` defaults to 1000 and `0` means "all"; the
metrics route has no pagination (returns every matching member, §10 F3).

## 7. The migration delta + the deliberate changes

**No auth-table / stack migration delta.** Read-only aggregation, no SSE/push, no schema change; all models +
the timeline helpers pre-ported (the helpers just need re-exporting). The 0.2.0 `avg_steps` field reads the
`daily_health_logs.steps` column that daily-health-logs 0.2.0 (migration `006`) added — no migration owned
here. So this is a **faithful 1:1 verbatim port with one dependency-driven change (D-C2) + two pinned
cleanups (D-C3/D-C4) + one additive rollup field (D-C5, 0.2.0)**:

- **D-C1 — scope (its own file pair).** This SPEC owns `routes/memberAnalytics.js` (the 4 routers) +
  `services/memberAnalyticsService.js` (the 4 fns + helpers) outright — a **separate** pair from the
  analytics/analytics-v2 file pair (one COVERAGE row). Mount all 4 routers in `server.js`.
- **D-C2 — re-export the 3 timeline helpers from `analyticsService.js`.** `memberAnalyticsService` imports
  `resolveTimelineWindow`/`buildBuckets`/`bucketKey` from `analyticsService` (legacy `:17-19` of its exports).
  Our v1/v2 port correctly omitted them (no consumer). The faithful fix is to **re-add the three names to
  `analyticsService.js`'s `module.exports`** (single-sourced; the alternative — duplicating the helper bodies —
  was rejected as a byte-dup / drift risk). Touches the already-built [`analytics`](../analytics/SPEC.md)
  feature (a tiny, additive, non-behavioral export change → patch bump on `analytics`).
- **D-C3 — extract the shared access prelude (cleanup C1).** `getMemberHistory`/`getMemberStreaks`/
  `getMemberRecentWorkouts` repeat the *identical* prelude: validate `programId`+`memberId` (`400`) →
  `ensureProgramAccess` (`403`) → target-membership `findOne` (`404 "not enrolled"`). Factor into one helper
  `assertMemberAccess(programId, memberId, user)`. **Pure refactor — every 400/403/404 status + message
  preserved 1:1**; `getMemberStreaks` keeps its additional `Program.findOne` `404` after. Not applied to
  `getMemberMetrics` (different shape: program-wide, optional `memberId`, its own `Program.findOne`).
- **D-C5 — `avg_steps` in the metrics rollup (0.2.0, additive).** The in-memory per-member rollup gains
  `avg_steps` — `Math.round(Σ steps / count)` over the member's **steps-bearing** days (rows where `steps`
  is non-null), `null` when the member has no such days — exactly mirroring the existing `avg_sleep_hours`
  accumulation (`memberAnalyticsService.js:170-206`). The `steps` attribute is added to the
  `daily_health_logs` fetch (`:122`) and each member entry echoes `avg_steps`. **Out of scope this run:**
  `SORTABLE_FIELDS` and the 16 range filters are **not** extended for steps (the steps task covered only the
  members-tab overview grid, not the metrics leaderboard's sort/filter/CSV — §10 F8). Additive → the
  response only gains a field; no existing consumer breaks.
- **D-C4 — guard null `program.start_date` in `getMemberStreaks` (cleanup C2).** `getMemberMetrics` already
  guards it (`program.start_date ? new Date(...) : null`, `:70`); `getMemberStreaks` does
  `new Date(`${program.start_date}T00:00:00Z`)` unguarded (`:317`) → a program with no `start_date` yields an
  Invalid Date → `.toISOString()` throws → `500`. Guard it (fall back to epoch `1970-01-01` lower bound so the
  `[Op.between]` stays valid and the streak window simply spans all of the member's logs). **Only the
  null-`start_date` edge changes (500 → works); happy-path streak numbers are identical.**

**What stays (faithful 1:1):** every aggregation + the in-memory rollup/search/filter/sort, `computeStreaks`
(incl. the not-anchored-to-today `current`, §10 F2), `isInCurrentMonth`/MTD, the synthetic recent-`id`, the
window clamping, all response shapes + field names, and the error contract. **No UTC cleanup** — the dates here
are already UTC-correct (`T00:00:00Z` parsing + `getUTC*`), unlike analytics v1.

> **Scope note (D-C1/D-C2).** No migration delta — models + schema pre-ported. `member-analytics` is its own
> file pair; it depends on `analytics` only for the 3 re-exported timeline helpers.

## 8. Dependencies

- **Upstream:** [`auth`](../auth/SPEC.md) (`authenticateToken`) · [`analytics`](../analytics/SPEC.md) (the 3
  re-exported timeline helpers) · [`workout-logs`](../workout-logs/SPEC.md) + [`daily-health-logs`](../daily-health-logs/SPEC.md)
  (fact tables) · [`program-memberships`](../program-memberships/SPEC.md) (access gate + roster) ·
  [`programs`](../programs/SPEC.md) (`start_date`) · [`program-workouts`](../program-workouts/SPEC.md) (type names) ·
  [`members`](../members/SPEC.md) (names).
- **Downstream / referenced (not owned here):** the members tab + member-detail cards (web pages / iOS tabs)
  render this data.
- **Consumers:** **`web` + `ios`** — all 4 routes used 1:1 by both clients, **no divergence** (the cleanest
  consumption picture, like `daily-health-logs`).
  - **web:** `members/page.tsx` (dashboard cards — metrics :150/:160, history :168, streaks :174, recent :181) ·
    `members/metrics/page.tsx:117` (full leaderboard: search/sort/direction/16 filters) ·
    `members/history/page.tsx:46` (period picker) · `members/streaks/page.tsx:36` ·
    `members/workouts/page.tsx:125` (full history table: limit=0/all + date/type/duration filters). All
    sort/filter delegated to the backend (no client-side filtering).
  - **ios:** `APIClient+Members.swift:225-320` (`fetchMemberMetrics`/`fetchMemberHistory`/`fetchMemberStreaks`/
    `fetchMemberRecentWorkouts`) → `ProgramContext+Members.swift:62-199` →
    `StandardMembersTab.swift:157,175,187-190` (logged-in user cards) · `AdminOtherTabs.swift:131-134` (admin/
    logger "View as" member) · `MemberMetricsViews.swift:206,367,522` (leaderboard) ·
    `WorkoutSortFilterSheets.swift:360` (full recent history). camelCase query params; same param set as web.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-C1** | **Scope = its own file pair** — `routes/memberAnalytics.js` (4 routers) + `services/memberAnalyticsService.js` (4 fns + helpers), ported outright; mount the 4 `/api/member-*` routes in `server.js`. Separate from the analytics/analytics-v2 pair (one COVERAGE row). | `memberAnalytics.js:1-63`; `memberAnalyticsService.js:1-427`; legacy `server.js:19,57-60`; COVERAGE L25. |
| **D-C2** | **Re-export the 3 timeline helpers** (`resolveTimelineWindow`/`buildBuckets`/`bucketKey`) from `analyticsService.js` and import them here, exactly as legacy did (faithful restoration of the legacy export surface; single-sourced, not duplicated). Records a `depends_on: analytics` edge; tiny additive change to the built `analytics` feature (patch bump). | `memberAnalyticsService.js:4`; legacy `analyticsService.js` exports `:17-19`; ported `analyticsService.js` `module.exports:583-597` (helpers present as consts, un-exported). User answer (faithful re-export). |
| **D-C3** | **Cleanup C1 — extract the shared access prelude** (validate→`ensureProgramAccess`→target-enrolled `404`) shared by history/streaks/recent into `assertMemberAccess`. Pure refactor; all 400/403/404 statuses + messages preserved 1:1; streaks keeps its extra `Program.findOne`. Not applied to `getMemberMetrics`. | `memberAnalyticsService.js:261-270` / `:303-312` / `:343-352` (identical preludes). User pinned C1. |
| **D-C4** | **Cleanup C2 — guard null `program.start_date` in `getMemberStreaks`** (mirror `getMemberMetrics`' `:70` guard; fall back to epoch lower bound). Only the null-`start_date` edge changes (was a 500 via Invalid-Date `.toISOString()`); happy-path numbers identical. | `memberAnalyticsService.js:317` (unguarded) vs `:70` (guarded). User pinned C2. |
| **D-C5** | **Additive `avg_steps` in the metrics rollup (0.2.0).** Round the average `steps` over each member's steps-bearing days (`null` when none), mirroring `avg_sleep_hours`; adds the `steps` attribute to the `daily_health_logs` fetch. **Not** added to `SORTABLE_FIELDS` / the filter set (out of the steps-task scope — overview grid only; §10 F8). Additive response field; live binaries unaffected. | User approval 2026-07-09 (steps-tracking plan, DC-1 + brief item 4); `memberAnalyticsService.js:122,138,170-206`; daily-health-logs 0.2.0 D-C4. |
| **D-REF** | **Reference impl = legacy `backend`. `consumed_by = [web, ios, android]`** — all 4 routes used 1:1 by all clients, **no divergence**, no dead routes (`member-recent` is the shared workout-history read). `avg_steps` (D-C5) feeds the members-tab overview grid on all three. | Web sweep (`members/{page,metrics,history,streaks,workouts}.tsx`) + iOS sweep (`APIClient+Members.swift` + `ProgramContext+Members.swift` + the member tabs) + Android port; Explore agents. |
| **D-S1** | **Stance = faithful 1:1 verbatim except D-C2/D-C3/D-C4 + the additive D-C5.** Every aggregation, the in-memory rollup/search/filter/sort, `computeStreaks`, the MTD/streak math, the synthetic recent-`id`, and the error contract ported exactly; D-C5 only ADDS `avg_steps` to the rollup (no sort/filter change); no UTC cleanup (dates already UTC-correct). Remaining oddities flagged (§10). | Whole-service review; §7. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Per-program read authz IS enforced here** (`ensureProgramAccess`: global-admin OR active membership) — unlike analytics v1/v2, which are `authenticateToken`-only (their F2). Noted as the *secure* characteristic; kept as-is. | `memberAnalyticsService.js:6-13` (called by all 4 fns) | Kept (faithful) — already the stricter behavior; no change needed. |
| **F2** | **`computeStreaks` `current` is not anchored to today** — it counts the most recent consecutive run from the latest *logged* day, so a member with a gap to today still reports their last run as "current" (it doesn't reset to 0 for the gap). | `memberAnalyticsService.js:29-33` | Kept (faithful) — changing it would alter every member's current-streak number. |
| **F3** | **`getMemberMetrics` aggregates + filters/sorts/searches ALL active members in-memory (JS), not SQL**, with no pagination (returns every matching member). Faithful; fine for program-sized rosters. | `memberAnalyticsService.js:198-258` | Kept (faithful) — a rebuild could push filter/sort/paginate into SQL. |
| **F4** | **The metrics rollup computes rich fields some clients may not render** (`mtd_workouts`, `total_hours`, `favorite_workout`) — ported verbatim regardless of consumption. | `memberAnalyticsService.js:123-124,190` | Kept (faithful) — trim only if a parity audit confirms both clients ignore them. |
| **F5** | **Range filters coerce null `avg_sleep_hours`/`avg_food_quality` to `0`** (`r.avg_sleep_hours ?? 0`) — a member with no health logs is treated as `0` for those range filters (so a `min` filter excludes them). | `memberAnalyticsService.js:231,236` | Kept (faithful) — a rebuild could distinguish "no data" from `0`. |
| **F6** | **`getMemberRecentWorkouts` returns a synthetic `id`** (`${member_id}-${program_workout_id}-${log_date}-${idx}`) — `workout_logs` has no surrogate PK, so the row id is composed for the client list key. Same pattern as the logs feature. | `memberAnalyticsService.js:401` | Kept (faithful) — a rebuild with a surrogate PK could return the real id. |
| **F7** | **`mtd_workouts` is "month-to-date *within the requested range*"** — `isInCurrentMonth` runs on the already range-filtered logs, and "current month" is the server-clock month in UTC (`new Date()` + `getUTC*`). On Render (UTC) correct; intent is current-calendar-month. | `memberAnalyticsService.js:37-41,142` | Kept (faithful) — a full TZ audit could make the month boundary explicit. |
| **F8** | **~~`avg_steps` is rollup-only — NOT sortable/filterable (0.2.0).~~ RESOLVED in 0.3.0 (D-C6)** — `avg_steps` is now in `SORTABLE_FIELDS` and accepts `avgStepsMin`/`avgStepsMax` range params on all three clients' Member Performance Metrics sort/filter, mirroring `avg_food_quality`. The 0.2.0 out-of-scope note below is kept for history. | `memberAnalyticsService.js` `SORTABLE_FIELDS`; D-C6 | Resolved (D-C6). CSV export still omits the Avg-Steps column — a remaining follow-up. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.3.0 | 2026-07-09 | **D-C6 — promote `avg_steps` into the metrics sort + filter set (resolves the F8 follow-up).** `getMemberMetrics` now accepts `sort=avg_steps` (added to `SORTABLE_FIELDS`) and `avgStepsMin`/`avgStepsMax` range params (added to the filter map + the in-memory `within` check, with the F5-style `?? 0` null-coercion), mirroring `avg_food_quality`. All three clients gain the matching sort option + filter range row on the Member Performance Metrics screen (web `SORT_OPTIONS`/`MetricsFilters`/filter modal; iOS `SortField` + both `heroValue` switches + `MetricsFilters`/FilterSheet; Android `MetricSortField`/`heroValue` + `MetricsFilters`/FilterSheet). **Purely additive + backward-compatible** (new accepted input tokens only; response shape unchanged — `avg_steps` already shipped in 0.2.0) → live iOS/Android binaries unaffected; older clients simply don't send the new params. F8 resolved. Backend `services/memberAnalyticsService.js`; web `apps/web/src/app/members/metrics/page.tsx`; iOS `MemberOverviewPicker.swift` + `MemberMetricsDetailView.swift`; Android `MemberCards.kt` + `MemberMetricsDetailScreen.kt`. |
| 0.2.0 | 2026-07-09 | **D-C5 — `avg_steps` in the member-metrics rollup (additive, user-approved steps-tracking plan).** `getMemberMetrics` now computes `avg_steps` = rounded average of `steps` over each member's steps-bearing days (`null` when none), mirroring the existing `avg_sleep_hours` accumulation; the `steps` attribute is added to the `daily_health_logs` fetch (`:122`) and each member entry echoes `avg_steps`. Reads the `daily_health_logs.steps` column from daily-health-logs 0.2.0 (D-C4, migration `006`). **Deliberately NOT added to `SORTABLE_FIELDS` / the range filters** (F8) — the steps task scoped the client work to the members-tab overview grid (one Avg-Steps tile), not the metrics leaderboard's sort/filter/CSV. Purely additive → response only gains a field; live binaries unaffected. `consumed_by` → `[web, ios, android]` (header reconciled). Consumed by the members-tab overview grid on all three clients. Backend: `services/memberAnalyticsService.js`. Updated §1/§3/§4/§5/§7, D-REF, D-S1; added D-C5 + F8. |
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker`. Documents the per-member analytics read API — the 4 routers of `routes/memberAnalytics.js` (`/api/member-metrics` · `/api/member-history` · `/api/member-streaks` · `/api/member-recent`) + `services/memberAnalyticsService.js`, its **own file pair** (separate from analytics/analytics-v2). Decisions: **D-C1** (scope = its own pair) · **D-C2** (re-export the 3 timeline helpers `resolveTimelineWindow`/`buildBuckets`/`bucketKey` from `analyticsService.js` — faithful restoration of the legacy export surface; `depends_on: analytics`) · **D-C3** (cleanup C1 — extract the shared requester-access + target-enrolled prelude shared by history/streaks/recent; statuses preserved 1:1) · **D-C4** (cleanup C2 — guard null `program.start_date` in `getMemberStreaks`) · **D-REF** (`consumed_by = [web, ios]`, all 4 routes 1:1, no divergence) · **D-S1** (faithful verbatim otherwise; no UTC cleanup — dates already UTC-correct). Flagged F1–F7 (per-program read authz enforced; `current` streak not anchored to today; in-memory metrics filter/sort/no-pagination; possibly-unused rich fields; null sleep/food coerced to 0; synthetic recent id; MTD-within-range/UTC). No auth/stack migration delta (read-only; models + helpers pre-ported). |
