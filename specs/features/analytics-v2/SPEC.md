# Feature: `analytics-v2` — the v2 analytics aggregates (participation + workout-type stats)

> **Status:** 🏗️ built (ported to `apps/backend/`) · **Version:** 0.1.0 · **Apps (`consumed_by`):** `web`, `ios`
> **Provenance (legacy, archived):** `backend` — `routes/analytics.js` (the **`v2Router`** half only — the
> file is shared with [`analytics`](../analytics/SPEC.md) v1, §7/D-C1), `services/analyticsService.js` (the
> **v2** functions; the shared date/bucket helpers + the two utils `dateRange.js`/`queryHelpers.js` already
> landed with v1), `server.js` (`/api/analytics-v2` mount).
> **Depends on:** [`auth`](../auth/SPEC.md) (`authenticateToken` on every route) ·
> [`analytics`](../analytics/SPEC.md) v1 (the shared file pair + the date/bucket helpers + the two utils) ·
> [`workout-logs`](../workout-logs/SPEC.md) (the `workout_logs` fact table it aggregates) ·
> [`program-memberships`](../program-memberships/SPEC.md) (the `activeMembershipInclude` inner-join gate +
> the active-member count) · [`program-workouts`](../program-workouts/SPEC.md) (`ProgramWorkout.workout_name`
> for the type rollups).
> **Deliberate changes (1, the rest faithful 1:1):** **D-C2** drop the dead `GET /summary` (v2) route +
> `getSummaryV2` (both clients use the v1 summary — the mirror of v1's D-C2). The 5 live routes' aggregations
> + response shapes are ported verbatim.

---

## 1. What it is

The **v2 analytics read API** — a second `/api/analytics-v2` router that ships the *newer* aggregation
endpoints the dashboards adopted after v1: the live **MTD participation** card and the four **per-workout-type
"superlative" stats** (total types, most-popular, longest-duration, highest-participation). Pure read: every
route is a `GET` running `COUNT`/`SUM`/`AVG`/`GROUP BY` over the `workout_logs` fact table (always inner-joined
to **active** memberships) and returns small shaped JSON for stat cards. This SPEC owns the **`v2Router`**
routes (mounted at `/api/analytics-v2`) and the v2 functions of `services/analyticsService.js`
(`getParticipationMTDV2` / `getWorkoutTypesTotal` / `getMostPopularWorkoutType` /
`getLongestDurationWorkoutType` / `getHighestParticipationWorkoutType`). The shared date/bucket helpers and
the two analytics-only utils (`dateRange.js`, `queryHelpers.js`) **already landed with v1** — this half reuses
them, adding no new files.

The 5 live v2 endpoints:

1. **MTD participation** — `GET /participation/mtd?programId=`. Active-member participation % this
   month-to-date + % change vs last MTD. **The live participation card on both clients** (v1's variant dropped).
2. **Total workout types** — `GET /workouts/types/total?programId=&memberId=`. Count of distinct workout
   types logged (program-wide or per-member).
3. **Most-popular type** — `GET /workouts/types/most-popular?programId=&memberId=`. The single workout type
   with the most sessions.
4. **Longest-duration type** — `GET /workouts/types/longest-duration?programId=&memberId=`. The single
   workout type with the highest average duration.
5. **Highest-participation type** — `GET /workouts/types/highest-participation?programId=&memberId=`. The
   workout type the most distinct members logged + that participation %.

The 6th legacy v2 route, `GET /summary`, is **dropped** (D-C2) — both clients call the v1 summary
(`/api/analytics/summary`); `getSummaryV2` is a distinct-but-unused implementation.

## 2. Why it exists

v2 is the *additive* analytics layer: rather than replace v1, the clients adopted a handful of v2 endpoints
for the cards v1 didn't serve well. **Two of v1's surfaces moved to v2 wholesale** — the **participation
card** (every client calls `GET /api/analytics-v2/participation/mtd`, never the v1 route) and the **workout-
types "superlative" tiles** on the Lifestyle / Workout-Types screens. Everything else (the composite summary,
the timelines, the base workout-types list, the MTD stat cards) stays on v1. So v1 and v2 **coexist**, split
by card, not by version cutover — and the one v2 endpoint that *did* duplicate a v1 surface (`/summary`)
ended up dead because the clients kept the v1 summary. Numbers must match legacy 1:1 → the port is verbatim.
Authorization is just `authenticateToken` (any authenticated member may read a program's analytics — no
per-program gate, §10 F2, inherited from v1).

## 3. Functionality (the routes)

All mounted at **`/api/analytics-v2`** (legacy `routes/analytics.js` `v2Router`). Handlers are thin
try/catch wrappers (`routes/analytics.js`); logic in the v2 functions of `services/analyticsService.js`.
Every route is `authenticateToken`-only.

| # | Route | Legacy handler | Purpose |
|---|-------|----------------|---------|
| 1 | `GET /participation/mtd` | `analytics.js:140-149` → `getParticipationMTDV2(programId)` (`analyticsService.js:563-590`) | MTD active-member participation % + % change. |
| 2 | `GET /workouts/types/total` | `analytics.js:151-160` → `getWorkoutTypesTotal(programId, memberId)` (`:592-604`) | Count of distinct workout types logged. |
| 3 | `GET /workouts/types/most-popular` | `analytics.js:162-171` → `getMostPopularWorkoutType(programId, memberId)` (`:606-621`) | Top type by session count. |
| 4 | `GET /workouts/types/longest-duration` | `analytics.js:173-182` → `getLongestDurationWorkoutType(programId, memberId)` (`:623-638`) | Top type by avg duration. |
| 5 | `GET /workouts/types/highest-participation` | `analytics.js:184-193` → `getHighestParticipationWorkoutType(programId, memberId)` (`:640-692`) | Type the most distinct members logged + participation %. |

> **Dropped (D-C2):** `GET /summary` (`analytics.js:126-138` → `getSummaryV2`, `:473-561`) — called by
> **neither** client (both use the v1 summary, `GET /api/analytics/summary`). Its function is not ported.
> (§10 F3.)

### Error contract (faithful — `routes/analytics.js` + `utils/response.AppError`)

`AppError(statusCode, message)` → `{ error: message }`; any other throw → `500` with a route-specific
generic. The only `AppError` thrown by the 5 live fns is `400` (missing `programId`) — every v2 fn requires
`programId`. There is no `404` path (no program lookup in the v2 half). Status codes preserved 1:1.

## 4. Feature list (behaviors to port — verbatim aggregation)

- **`getParticipationMTDV2`** (`:563-590`) — 400 if no `programId`. `buildMTDDateRanges()` → current/previous
  MTD windows. One `Promise.all`: active-membership `COUNT` (`status:"active"`) + distinct active *loggers*
  current + previous (`WorkoutLog.count{ distinct, col:"member_id", include:[activeMembershipInclude] }`).
  `participation_pct = round1(active/total*100)`; returns `{ total_members, active_members, participation_pct,
  change_pct }`. **Byte-identical to the v1 `getParticipationMTD` that was dropped** (§10 F1) — reinstated
  live here under the v2 name/route.
- **`getWorkoutTypesTotal`** (`:592-604`) — 400 if no `programId`. Group `workout_logs` by
  `ProgramWorkout.workout_name` (active-join; `where` = `{program_id}` + optional `{member_id}`). Returns
  `{ total_types: rows.length }` (the GROUP-BY row count = distinct type count).
- **`getMostPopularWorkoutType`** (`:606-621`) — 400 if no `programId`. Group by `workout_name`,
  `COUNT('*')` sessions, order sessions desc, `limit 1`. Returns `{ workout_name, sessions }` (null/0 when no
  rows).
- **`getLongestDurationWorkoutType`** (`:623-638`) — 400 if no `programId`. Group by `workout_name`,
  `AVG(duration)`, order desc, `limit 1`. Returns `{ workout_name, avg_minutes }` (`round(avg)`; null/0 when
  no rows).
- **`getHighestParticipationWorkoutType`** (`:640-692`) — 400 if no `programId`. **Two branches:**
  - **member-scoped** (`memberId` present, `:644-666`) — top type by sessions for that member; `participants
    = sessions>0 ? 1 : 0`; `participation_pct = round1(sessions/memberTotalWorkouts*100)`; `total_members: 1`.
    **Dead via these routes** (both clients always call this endpoint program-wide — §10 F4) but ported faithfully.
  - **program-wide** (`:669-691`) — `Promise.all`: active-membership count + group by `workout_name` with
    `COUNT(DISTINCT "WorkoutLog"."member_id")` participants, order desc, `limit 1`. Returns
    `{ workout_name, participants, participation_pct: round1(participants/totalMembers*100), total_members }`.

### Shared helpers + utils (already ported with v1 — reused, not re-created)

- **`analyticsService.js` local helpers** (`toUTCDate`/`diffDays`/`toISODate`/`bucketKey`/`bucketLabel`/
  `buildBuckets`/`resolveTimelineWindow`/`dayDiff`) — landed with v1; the v2 fns reuse none of the
  bucket/timeline helpers (v2 has no timeline/charting). The v2 fns import the same module-top
  `Op`/`fn`/`col`/`literal`, the models, `AppError`, and `activeMembershipInclude`/`percentChange`/
  `buildMTDDateRanges` — all already required at the file top by the v1 port.
- **`utils/dateRange.js`** (`getPeriodRange`) — used by v2 only via `getSummaryV2`, which is **dropped**; the
  live v2 fns don't touch it (they use `buildMTDDateRanges`). Already present (v1).
- **`utils/queryHelpers.js`** (`activeMembershipInclude`, `percentChange`, `buildMTDDateRanges`) — used by all
  5 live v2 fns. Already present (v1).

## 5. Data / schema touchpoints

Faithful names (R5); all models already ported (with associations in `models/index.js`). **No migration
delta** (read-only; no schema change; no new files — the helpers/utils landed with v1). Read-only — no writes.

- **`workout_logs`** (read, owned by [`workout-logs`](../workout-logs/SPEC.md)) — the only fact table the v2
  half aggregates (v2 has no health-timeline path).
- **`program_memberships`** (read, owned by [`program-memberships`](../program-memberships/SPEC.md)) — the
  `activeMembershipInclude` inner join + the `status:"active"` member counts.
- **`program_workouts`** (read, owned by [`program-workouts`](../program-workouts/SPEC.md)) — `workout_name`
  for the type rollups.

(No `programs`/`members`/`daily_health_logs` touch in the v2 half — those were `getSummaryV2`/v1-only.)

## 6. Flags / env

No feature-specific env. DB access via the shared `DATABASE_URL`. No feature flags; no rate limiting. No
caching (every request re-aggregates). No `limit` query param (the superlative routes hardcode `limit 1`; the
total route is unlimited).

## 7. The migration delta + the deliberate change

**No auth-table / stack migration delta.** Read-only aggregation, no SSE/push, no schema change; all models
pre-ported; the helpers + the two utils already landed with v1. So this is a **faithful 1:1 verbatim port
with one deliberate change**:

- **D-C1 — scope cut (the v2 half).** `routes/analytics.js` (`v1Router`/`v2Router`) and `analyticsService.js`
  (v1 fns / v2 fns / shared helpers) are **one file pair holding two features**: v1 owns the v1 routes +
  functions + the shared helpers + the two utils; **this SPEC appends** the `v2Router` routes + the v2
  functions to those same files (reusing the helpers + utils — exactly the `logs.js` split). The port changes
  `routes/analytics.js`'s export to `{ v1Router, v2Router }` and adds the `v2Router` mount in `server.js`.
  `member-analytics` (`routes/memberAnalytics.js`) is a **separate** feature.
- **D-C2 — drop the dead `GET /summary` (v2) route + `getSummaryV2`.** Called by neither client — both use
  the **v1** summary (`GET /api/analytics/summary`; web `lib/api/summary.ts`, iOS `AdminSummaryTab` →
  `APIClient+Analytics.swift`). The **mirror of v1's D-C2** (which dropped the dead v1 `participation/mtd`
  because both clients used the v2 variant): each version dropped the half-route its clients abandoned. The
  behavior isn't lost — the live v1 summary serves it. `getSummaryV2` is **distinct** from v1's `getSummary`
  (optional `programId` → global/cross-program aggregation; `Member.member_name` instead of
  `first_name`/`last_name`; no `program_progress` block), so this is a drop-because-unused-and-superseded
  (not a byte-dup). It also carried the only server-local-TZ `distribution_by_day` bug in the v2 half (the
  site v1 fixed as its D-C3); dropping it means **the v2 half needs no UTC cleanup**. (§10 F3.)

**What stays (faithful 1:1):** every aggregation query for the 5 live fns (the `Promise.all` fan-outs, the
`activeMembershipInclude` inner joins, the `fn("COUNT","*")`/`AVG`/`COUNT(DISTINCT …)` group-bys, the
`literal`-ordered `limit 1`s), all response shapes + field names, the MTD window scheme (`buildMTDDateRanges`),
the `percentChange` contract, and the error contract (the `400`-only paths). The numbers match legacy exactly.

> **Scope note (D-C1).** No migration delta — models + schema pre-ported; the helpers + utils landed with
> v1. v1 owns the shared helpers; `member-analytics` is its own feature.

## 8. Dependencies

- **Upstream:** [`auth`](../auth/SPEC.md) (`authenticateToken`) · [`analytics`](../analytics/SPEC.md) v1 (the
  shared file pair + helpers + the two utils) · [`workout-logs`](../workout-logs/SPEC.md) (fact table) ·
  [`program-memberships`](../program-memberships/SPEC.md) (active-join + counts) ·
  [`program-workouts`](../program-workouts/SPEC.md) (type names).
- **Downstream / referenced (not owned here):** v1 shares the file pair; the summary + lifestyle/workout-types
  dashboards (web pages / iOS tabs) render this data.
- **Consumers:** **`web` + `ios`** — the 5 live routes used 1:1 by both clients, **no divergence**.
  - **web:** `summary/page.tsx:63-67` calls `participation/mtd` (MTD card) via `lib/api/summary.ts:109-112`;
    `lifestyle/page.tsx:121-143` calls the 4 workout-type aggregates (total :123, most-popular :129,
    longest-duration :135, highest-participation :141) via `lib/api/lifestyle.ts:48-79` — `total`/
    `most-popular`/`longest-duration` pass an optional `memberId`; `highest-participation` passes `programId`
    only. (`/summary` v2 → unused; web uses v1 `lib/api/summary.ts:104-107`.)
  - **ios:** `AdminSummaryTab.swift:81` calls `participation/mtd` via `ProgramContext+Analytics.swift:70`;
    `StandardWorkoutTypesTab.swift:111-114` / `:241-244` call the 4 workout-type aggregates via
    `ProgramContext+Analytics.swift:189-234` — `total`/`most-popular`/`longest-duration` pass an optional
    `memberId`; `highest-participation` always passes `memberId: nil`. (`/summary` v2 → unused; iOS uses v1
    `/api/analytics/summary` from `AdminSummaryTab.swift:80`.)

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-C1** | **Scope = the v2 half** — `v2Router` (5 routes after D-C2) + the 5 v2 functions, **appended** to the shared `routes/analytics.js` + `services/analyticsService.js` (reusing the date/bucket helpers + the two utils, both landed with v1). Change the route export to `{ v1Router, v2Router }`; mount `/api/analytics-v2`. `member-analytics` is separate. | `analytics.js:6-7,124-195` (v2Router); `analyticsService.js:473-692` (v2 fns) / `:5` (shared util imports); v1 SPEC D-C1; COVERAGE L24/L25. |
| **D-C2** | **Drop the dead `GET /summary` (v2) route + `getSummaryV2`** — called by neither client (both use the v1 summary). The mirror of v1's D-C2; distinct (not a byte-dup) but superseded-and-unused. Removes the only UTC-bucketing site in the v2 half. | `analytics.js:126-138`, `analyticsService.js:473-561`; web sweep (`summary.ts:104-107` → v1) + iOS sweep (`AdminSummaryTab.swift:80` → v1). |
| **D-REF** | **Reference impl = legacy `backend`. `consumed_by = [web, ios]`** — the 5 live routes used 1:1 by both clients, no divergence (optional `memberId` varies per call site, but the route is identical; `highest-participation` is program-wide on both). | Web sweep (`summary/page.tsx` + `lifestyle/page.tsx` + `lib/api/{summary,lifestyle}.ts`) + iOS sweep (`AdminSummaryTab` + `StandardWorkoutTypesTab` + `ProgramContext+Analytics.swift`); Explore agents. |
| **D-S1** | **Stance = faithful 1:1 verbatim except D-C2.** Every aggregation query, the MTD window scheme, all response shapes, and the error contract are ported exactly for the 5 live fns; remaining oddities flagged (§10). | Whole v2-half review; §7. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **`getParticipationMTDV2` is byte-identical to the v1 `getParticipationMTD` that v1 dropped** (D-C2 there) — the same function existed under two routes; the clients standardized on the v2 one, so v1's copy was dropped and this copy is the live participation card. Two names, one body. | `analyticsService.js:563-590` ≡ legacy `:255-282` | Kept (faithful) — a rebuild could collapse the participation card to a single canonical endpoint. |
| **F2** | **No per-program authorization on reads** — every route is `authenticateToken`-only; any authenticated member can read any program's v2 analytics by `programId` (no membership/admin gate). Inherited from v1 (its F2). | `analytics.js:140-193` | Kept (faithful) — a stricter rebuild could scope reads to program members. |
| **F3** | **`getSummaryV2` / `GET /summary` (v2) was dead** — superseded by the v1 summary on both clients. Dropped (D-C2); distinct (optional `programId`/global agg, `member_name`, no `program_progress`), not a byte-dup. Recorded for the parity audit. | `analytics.js:126-138`; `analyticsService.js:473-561` | Changed (dropped). |
| **F4** | **`getHighestParticipationWorkoutType`'s member-scoped branch is dead via the route** — both clients always call `highest-participation` program-wide (web omits `memberId`; iOS passes `memberId: nil`), so the `if (memberId)` branch is never exercised. Ported faithfully. | `analyticsService.js:644-666`; web `lifestyle/page.tsx:141` / iOS `StandardWorkoutTypesTab.swift:114,244` | Kept (faithful) — a rebuild could drop the unreachable branch. |
| **F5** | **`buildMTDDateRanges` computes MTD boundaries in server-LOCAL time** (`new Date(y, m, 1)` / `new Date()`). On Render (UTC) correct; on a non-UTC server the month boundary could shift. Same class as v1's F4 (out of any pinned cleanup scope; v2 has no UTC-bucketing site left after D-C2). | `queryHelpers.js:20-25` | Kept (faithful, out of scope) — a full TZ audit would normalize it. |
| **F6** | **`fn("COUNT", "*")`** passes `"*"` as a string literal (`COUNT('*')`), which Postgres treats as `COUNT(*)`. Idiom inherited from v1 (its F7). Ported verbatim. `getHighestParticipationWorkoutType` also uses a **raw `literal('DISTINCT "WorkoutLog"."member_id"')`** with a hardcoded table name (correct given the model's default alias). | `analyticsService.js:612, 675` | Kept (faithful) — a cleanup would use `col`/`literal` helpers + avoid the hardcoded alias. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker`. Documents the v2 analytics read API (`/api/analytics-v2`) — the `v2Router` half of the shared `routes/analytics.js` + the v2 functions of `services/analyticsService.js` (the shared date/bucket helpers + the two utils `dateRange.js`/`queryHelpers.js` landed with v1). Decisions: **D-C1** (scope = v2 half appended to the shared file pair; reuse helpers/utils; `member-analytics` separate) · **D-C2** (drop the dead `GET /summary` v2 route + `getSummaryV2` — both clients use the v1 summary; the mirror of v1's D-C2) · **D-REF** (`consumed_by = [web, ios]`, 5 routes 1:1, no divergence) · **D-S1** (faithful verbatim otherwise — every aggregation + shape ported exactly). Flagged F1–F6 (the participation-fn byte-dup; no per-program authz; the dead summary; the dead member-scoped highest-participation branch; the MTD server-local boundary; the COUNT idioms). No auth/stack migration delta (read-only; models + schema + helpers + utils pre-ported). |
