# Page: `summary/distribution` (web) — workout distribution by day (summary sub-route 2 of 6)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.1.0 · **App:** `web` (Next.js App Router)
> **Route:** `/summary/distribution` — the **workout distribution by day-of-week** detail, the **second** of the
> six deferred `/summary` sub-routes (reached from the [`summary`](../SPEC.md) landing's **Workout Distribution**
> chart card). One `GlassCard` with a single `BarChart` plotting the program's total workout count per weekday
> (Sun → Sat). **Read-only, program-wide** (no period selector, no view-as picker, no `memberId`, no state).
> **Reference impl (legacy):** `../../../../../../rasifiters-webapp/src/app/summary/distribution/page.tsx`.
> **Consumes (features):** [`analytics`](../../../../features/analytics/SPEC.md) (`GET /analytics/distribution/day`
> — `authenticateToken`-only, **no per-program read authz**; already mounted `routes/analytics.js:89`) via the
> already-ported `lib/api/summary.ts` `fetchDistributionByDay` (landed verbatim with the [`summary`](../SPEC.md)
> landing, run 21) and [`auth`](../../../../features/auth/SPEC.md) (`useAuthGuard`).
> **Cross-app:** the iOS Home/summary surface renders the same distribution chart natively; parity audited at the
> iOS port.
> **Stance:** faithful 1:1 port **+ one cleanup** (D-C1 all-zero empty-state guard). **No new dependency.** Oddities
> flagged §10.

---

## 1. What it is + who uses it

The **workout distribution by day-of-week** detail page for the active program. It charts the program's **total
workout count per weekday** (Sunday → Saturday, all-time), backed by `workout_logs`. It is a **read-only,
program-wide** analytics view — the drill-down behind the summary landing's distribution preview card. Every role
reaches the same program-wide view (see §7).

## 2. Why it exists

To show *when in the week* the program trains — which weekdays carry the most activity — at a larger size than the
landing's small preview card affords. A single, dedicated bar chart over the seven weekdays.

## 3. Route / location

- **App:** `web` (Next.js 14 App Router).
- **Path:** `/summary/distribution` (`apps/web/src/app/summary/distribution/page.tsx`). No `force-dynamic`
  (faithful — the page reads no search params; prerenders to a loading shell).
- **Reached from:** the [`summary`](../SPEC.md) landing's `DistributionCard` `onClick` →
  `router.push("/summary/distribution")` (`summary/page.tsx:260`).
- **Back:** `PageHeader backHref="/summary"`.

## 4. Contents / sections

1. **`PageHeader`** — title "Workout Distribution by Day", subtitle "Workouts", `backHref="/summary"`
   (`distribution/page.tsx:42`).
2. **Distribution `GlassCard`** (only when `distributionQuery.data`) (`distribution/page.tsx:52-70`):
   - **Chart** — `h-80` single `BarChart` of the seven weekday buckets (`{ day, value }`, Sun → Sat), one
     `value` bar (`CHART_COLORS[2]`). All-zero → "No workouts logged yet." panel (D-C1).
3. **`LoadingState`** ("Loading distribution...") / **`ErrorState`** (the query error message) states
   (`distribution/page.tsx:44-50`).

## 5. Components + which shared features it consumes

- **Chrome (all already ported):** `PageShell`, `PageHeader`, `GlassCard`, `LoadingState`, `ErrorState`.
- **New dep:** **none** — every import already ported (the purest shape; even purer than `activity` — no
  `PeriodSelector`, no `useState`).
- **Charts:** Recharts `BarChart`/`Bar` + the foundation `lib/chart-theme.ts` tokens (`CHART_COLORS`, tooltip/grid
  styles). Axis ticks kept inline-faithful (`fontSize` 11, `var(--rf-text-muted)`).
- **Hooks/api:** `useAuthGuard` (`auth`), `fetchDistributionByDay` (`lib/api/summary.ts`, already ported run 21).

## 6. Data / API

- **`GET /api/analytics/distribution/day?programId=`** → `DistributionByDay`
  (`{ Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday }` — each a count; **all 7 keys always
  present**, 0 when none). `authenticateToken`-only — **no per-program read authz** (analytics F2, inherited here
  as F1). **No `memberId`, no period** — program-wide, all-time only.
- **Query key:** `["summary", "distribution", programId]` (shared with the landing's distribution preview query —
  same cache entry); `enabled` gated on `token` + `programId`.
- **Zero backend work, NO feature bump** — the route + service + the `fetchDistributionByDay` client fn all already
  shipped (`analytics` D-C3 ported the weekday-bucketing in explicit UTC; the `summary` landing ported the client
  fn, run 21).

## 7. Role-based view rules

There is **no view-as picker, no `memberId`, and no period selector** on this page — every role sees the **same
program-wide, all-time** distribution. No admin redirect, no role-conditional UI at all; `useAuthGuard()` default
(`requireProgram: true`) — a missing active program bounces to `/programs`. The ABSENCE of role logic is the
finding (F2).

| Role | What they see |
|------|----------------|
| **global_admin** | Program-wide workout distribution by weekday. |
| **program admin** (`my_role==="admin"`) | Same — program-wide. |
| **logger / member** | Same — program-wide (no per-member scoping on this page). |

**`admin_only_data_entry`: N/A** — this is a read-only analytics view, not a log-entry surface (the lock gates
logging on the `/summary` forms, not reads here).

## 8. States & edge cases

- **Loading** — `LoadingState` "Loading distribution...".
- **Error** — `ErrorState` with the query error message.
- **Empty (all-zero)** — when all seven weekday counts are 0 → "No workouts logged yet." panel inside the card
  instead of a chart of seven flat zero-height bars (D-C1). *Legacy rendered the all-zero `BarChart` — this is the
  cleanup.* (Note: the backend always returns all 7 keys, so there is no `data.length === 0` case — the guard keys
  off the **sum** being 0, not bucket count.)
- **No active program** — `useAuthGuard` redirects to `/programs`.
- **Query disabled** — until `token` + `programId` resolve.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-SCOPE** | This page only — the **second** of the six deferred `/summary` sub-routes (does NOT close the group; sibling `workout-types` + the 3 log fallbacks `log-workout`/`log-health`/`bulk-log-workout` still deferred). | COVERAGE summary row |
| **D-DEPS** | **No new dependency** — every import (chrome, chart-theme, `useAuthGuard`, `fetchDistributionByDay`) already ported. The sweep ported nothing but the page itself. Purer than `activity` (no `PeriodSelector`, no `useState`). | `distribution/page.tsx:1-17` |
| **D-S1** | Faithful 1:1 otherwise — same query key, `enabled` gate, fixed Sun→Sat weekday mapping, single `value` bar (`CHART_COLORS[2]`), inline axis ticks, `h-80`. Already fully `rf-*` tokenized → **no tokenize cleanup**. No `memberId`/view-as/period (program-wide, all-time). | legacy `distribution/page.tsx` |
| **D-C1** | **All-zero empty-state guard** (change-now) — when the seven weekday counts sum to 0, render a "No workouts logged yet." panel instead of seven flat zero-height bars. Adapts `activity`'s empty-state intent (run 33 D-C2) to this page's always-7-buckets shape (keys off the **sum**, not `data.length`). | user decision; legacy `distribution/page.tsx:52-70` |

> **Not applied (run-33 lesson — subtract twin cleanups that don't fit):** `activity`'s `<Legend>` + series-names
> cleanup (D-C1 there) — this chart has a **single** series, so there is nothing to disambiguate (the header
> subtitle already says "Workouts"); and the dual-Y-axis cleanup (`lifestyle/timeline`) — a single counts series
> has one natural axis. Both deliberately omitted.

## 10. Flagged characteristics kept as-is

- **F1** — `GET /analytics/distribution/day` is `authenticateToken`-only with **no per-program read authz**
  (inherited analytics F2): any authenticated user could fetch another program's distribution by crafting
  `programId`. Kept faithful; a backend authz hardening is a cross-feature rebuild candidate.
- **F2** — **No view-as picker, no `memberId`, no period, no role logic at all** — every role sees the same
  program-wide, all-time view. The ABSENCE of role-conditional UI (and even of a period selector, unlike the
  `activity` sibling) is the finding; faithful and deliberate (this is the program-overview drill-down).
- **F3** — `admin_only_data_entry` N/A (read-only page) — see §7.
- **F4** — The window is **all-time** (the service has no date filter) — distribution accumulates every
  `workout_log` since program start, unlike `activity` (period-scoped). Faithful; a period filter would be a
  rebuild feature.
- **F5** — The seven weekday labels are **hardcoded client-side** (`Sun`/`Mon`/…) mapping the server's full-name
  keys (`Sunday`/…); the server already bucketed weekdays in explicit UTC (`analytics` D-C3). No client date math.
