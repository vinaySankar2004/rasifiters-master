# Page: `summary/activity` (web) — workout activity timeline (summary sub-route 1 of 6)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.1.0 · **App:** `web` (Next.js App Router)
> **Route:** `/summary/activity` — the **workout activity timeline** detail, the **first** of the six deferred
> `/summary` sub-routes (reached from the [`summary`](../SPEC.md) landing's **Activity** chart card). A
> `PeriodSelector` (W/M/Y/P) over one `GlassCard`: a range/daily-average header + a `BarChart` plotting workouts
> and active members per bucket. **Read-only, program-wide** (no view-as picker, no `memberId`).
> **Provenance (legacy, archived):** `rasifiters-webapp/src/app/summary/activity/page.tsx`.
> **Consumes (features):** [`analytics`](../../../../features/analytics/SPEC.md) (`GET /analytics/timeline` —
> `authenticateToken`-only, **no per-program read authz**; already mounted `routes/analytics.js:60`) via the
> already-ported `lib/api/summary.ts` `fetchActivityTimeline` (landed verbatim with the [`summary`](../SPEC.md)
> landing, run 21) and [`auth`](../../../../features/auth/SPEC.md) (`useAuthGuard`).
> **Cross-app:** the iOS Home/summary surface renders the same activity timeline natively; parity audited at the
> iOS port.
> **Stance:** faithful 1:1 port **+ two chart cleanups** (D-C1 chart `<Legend>` + series names; D-C2 empty-state
> guard). **No new dependency.** Oddities flagged §10.

---

## 1. What it is + who uses it

The **workout activity timeline** detail page for the active program. It charts the program's **workouts** and
**active members** per time bucket over a selectable period (week / month / year / program), backed by
`workout_logs`. It is a **read-only, program-wide** analytics view — the drill-down behind the summary landing's
activity preview card. Every role reaches the same program-wide view (see §7).

## 2. Why it exists

To give a fuller view of activity over time than the landing's small preview card affords — a dedicated
period-selectable bar chart with a daily-average summary stat. It pairs workouts and active-member counts on one
chart so volume and breadth of participation can be read together.

## 3. Route / location

- **App:** `web` (Next.js 14 App Router).
- **Path:** `/summary/activity` (`apps/web/src/app/summary/activity/page.tsx`). No `force-dynamic` (faithful — the
  page reads no search params; prerenders to a loading shell).
- **Reached from:** the [`summary`](../SPEC.md) landing's `ActivityTimelineCard` `onClick` →
  `router.push("/summary/activity")` (`summary/page.tsx:192`).
- **Back:** `PageHeader backHref="/summary"`.

## 4. Contents / sections

1. **`PageHeader`** — title "Workout Activity Timeline", subtitle "Workouts · Active members",
   `backHref="/summary"` (`activity/page.tsx:33`).
2. **`PeriodSelector`** — W/M/Y/P segmented control → `period` state (`activity/page.tsx:35`; default `"week"`).
3. **Activity `GlassCard`** (only when `timelineQuery.data`) (`activity/page.tsx:45-80`):
   - **Header row** — Range (`label`) on the left; Daily avg (`daily_average.toFixed(1)`) on the right.
   - **Chart** — `h-72` `BarChart` of `buckets`: a **Workouts** bar + an **Active members** bar (both counts, one
     shared Y-axis). Empty `buckets` → "No data for this range yet." panel (D-C2).
4. **`LoadingState`** ("Loading timeline...") / **`ErrorState`** (the query error message) states
   (`activity/page.tsx:37-43`).

## 5. Components + which shared features it consumes

- **Chrome (all already ported):** `PageShell`, `PageHeader`, `GlassCard`, `LoadingState`, `ErrorState`,
  `PeriodSelector` (the last landed with the `lifestyle/timeline` run 32).
- **New dep:** **none** — every import already ported.
- **Charts:** Recharts `BarChart`/`Bar`/`Legend` + the foundation `lib/chart-theme.ts` tokens (`CHART_COLORS`,
  tooltip/grid styles). Axis ticks kept inline-faithful (`fontSize` 10 / 11, `var(--rf-text-muted)`).
- **Hooks/api:** `useAuthGuard` (`auth`), `fetchActivityTimeline` (`lib/api/summary.ts`, already ported run 21).

## 6. Data / API

- **`GET /api/analytics/timeline?period=&programId=`** → `ActivityTimelineResponse`
  (`{ mode, label, daily_average, buckets: [{ date, label, workouts, active_members }] }`). `authenticateToken`-only
  — **no per-program read authz** (analytics F2, inherited here as F1). **No `memberId`** — program-wide only.
- **Query key:** `["summary", "timeline", programId, period]`; `enabled` gated on `token` + `programId`.
- **Zero backend work, NO feature bump** — the route + service + the `fetchActivityTimeline` client fn all already
  shipped (`analytics` + the `summary` landing).

## 7. Role-based view rules

There is **no view-as picker and no `memberId`** on this page — every role sees the **same program-wide** activity
timeline. No admin redirect, no role-conditional UI at all; `useAuthGuard()` default (`requireProgram: true`) — a
missing active program bounces to `/programs`. The ABSENCE of role logic is the finding (F2).

| Role | What they see |
|------|----------------|
| **global_admin** | Program-wide activity timeline. |
| **program admin** (`my_role==="admin"`) | Same — program-wide. |
| **logger / member** | Same — program-wide (no per-member scoping on this page). |

**`admin_only_data_entry`: N/A** — this is a read-only analytics view, not a log-entry surface (the lock gates
logging on the `/summary` forms, not reads here).

## 8. States & edge cases

- **Loading** — `LoadingState` "Loading timeline...".
- **Error** — `ErrorState` with the query error message.
- **Empty** — `buckets.length === 0` → "No data for this range yet." panel inside the card (D-C2; the card +
  header still render; the daily average shows 0.0). *Legacy rendered the empty `BarChart` — this is the cleanup.*
- **No active program** — `useAuthGuard` redirects to `/programs`.
- **Query disabled** — until `token` + `programId` resolve.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-SCOPE** | This page only — the **first** of the six deferred `/summary` sub-routes (does NOT close the group; siblings `distribution`/`workout-types` + the 3 log fallbacks still deferred). | COVERAGE summary row |
| **D-DEPS** | **No new dependency** — every import (chrome incl. `PeriodSelector`, chart-theme, `useAuthGuard`, `fetchActivityTimeline`) already ported. The sweep ported nothing but the page itself. | `activity/page.tsx:6-19` |
| **D-S1** | Faithful 1:1 otherwise — same query key, `enabled` gate, header/daily-average, two same-axis bars, inline axis ticks. Already fully `rf-*` tokenized → **no tokenize cleanup**. No `memberId`/view-as (program-wide). | legacy `activity/page.tsx` |
| **D-C1** | **Chart `<Legend>` + series names** (change-now) — labels the Workouts + Active members bars (legacy had only the tooltip; the two bars were distinguished by color alone). Series carry explicit `name="Workouts"`/`name="Active members"`; the tooltip formatter keys off the `name`. Mirrors `lifestyle/timeline` D-C3 (run 32). | user decision; legacy `activity/page.tsx:69-75` |
| **D-C2** | **Empty-state guard** (change-now) — `buckets.length === 0` → "No data for this range yet." panel instead of rendering an empty chart. Mirrors `lifestyle/timeline`'s empty-state (run 32). | user decision; legacy `activity/page.tsx:60-78` |

> **Not applied:** the `lifestyle/timeline` dual-Y-axis cleanup (D-C2 there) — both series here are **counts**, so
> a single shared Y-axis is correct; a second axis would be misleading. Deliberately omitted.

## 10. Flagged characteristics kept as-is

- **F1** — `GET /analytics/timeline` is `authenticateToken`-only with **no per-program read authz** (inherited
  analytics F2): any authenticated user could fetch another program's activity timeline by crafting `programId`.
  Kept faithful; a backend authz hardening is a cross-feature rebuild candidate.
- **F2** — **No view-as picker, no `memberId`, no role logic at all** — every role sees the same program-wide
  view (unlike the `/lifestyle`/`/members` landings). The ABSENCE of role-conditional UI is the finding; faithful
  and deliberate (this is the program-overview drill-down).
- **F3** — `admin_only_data_entry` N/A (read-only page) — see §7.
- **F4** — `daily_average` is server-derived (analytics service); the page only formats it (`.toFixed(1)`). No
  client recomputation.
