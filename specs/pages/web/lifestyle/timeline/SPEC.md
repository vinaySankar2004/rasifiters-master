# Page: `lifestyle/timeline` (web) — health timeline (lifestyle sub-route 2 of 2, CLOSES the group)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.1.0 · **App:** `web` (Next.js App Router)
> **Route:** `/lifestyle/timeline` — the **sleep + diet-quality health timeline** detail, the **last** of the two
> deferred `/lifestyle` sub-routes (reached from the [`lifestyle`](../SPEC.md) landing's **Lifestyle Timeline**
> chart card). A `PeriodSelector` (W/M/Y/P) over one `GlassCard`: a range/daily-average header + a `ComposedChart`
> plotting sleep hours (bars) and diet quality 1–5 (line). **Read-only.** Porting it **closes the `/lifestyle`
> group (2 of 2).**
> **Reference impl (legacy):** `../../../../../../rasifiters-webapp/src/app/lifestyle/timeline/page.tsx`.
> **Consumes (features):** [`analytics`](../../../../features/analytics/SPEC.md) (`GET /analytics/health/timeline`
> — `authenticateToken`-only, **no per-program read authz**; already mounted `routes/analytics.js:74`) via the
> already-ported `lib/api/lifestyle.ts` `fetchHealthTimeline` (landed verbatim with the
> [`lifestyle`](../SPEC.md) landing, run 23) and [`auth`](../../../../features/auth/SPEC.md) (`useAuthGuard` + the
> client role for `canViewAs`).
> **Cross-app:** the iOS Home/lifestyle surface renders the same sleep/diet timeline natively; parity audited at
> the iOS port.
> **Stance:** faithful 1:1 port **+ one verbatim dep + three chart cleanups** (D-C1 port `ui/PeriodSelector.tsx`;
> D-C2 dual Y-axis; D-C3 chart `<Legend>`; D-C4 axis unit labels). Oddities flagged §10.

---

## 1. What it is + who uses it

The **health timeline** detail page for the active program. It charts a member's (or the program's) **sleep
hours** and **diet quality (1–5)** over a selectable period (week / month / year / program), backed by
`daily_health_logs`. It is a **read-only** analytics view — the drill-down behind the lifestyle landing's
timeline preview card. Every role can reach it; what data it shows depends on who's asking and the URL
`memberId` (see §7).

## 2. Why it exists

To give a fuller view of the sleep/diet trend than the landing's small preview card affords — a dedicated
period-selectable chart with daily-average summary stats. It pairs the two daily-health metrics on one chart so
sleep and diet trends can be read together over time.

## 3. Route / location

- **App:** `web` (Next.js 14 App Router).
- **Path:** `/lifestyle/timeline` (`apps/web/src/app/lifestyle/timeline/page.tsx`). `export const dynamic =
  "force-dynamic"` (faithful — the page reads `useClientSearchParams` + a per-session token).
- **Reached from:** the [`lifestyle`](../SPEC.md) landing's `LifestyleTimelineCard` `onClick` →
  `router.push("/lifestyle/timeline" + (memberId ? "?memberId=…" : ""))` (`lifestyle/page.tsx:280-283`).
- **Back:** `PageHeader backHref="/lifestyle"`.

## 4. Contents / sections

1. **`PageHeader`** — title "Lifestyle Timeline", subtitle "Sleep · Diet quality", `backHref="/lifestyle"`
   (`timeline/page.tsx:54-58`).
2. **`PeriodSelector`** — W/M/Y/P segmented control → `period` state (`timeline/page.tsx:60`; default `"week"`).
3. **Timeline `GlassCard`** (only when `timelineQuery.data`) (`timeline/page.tsx:68-115`):
   - **Header row** — Range (`label`) on the left; Daily avg sleep (`daily_average_sleep.toFixed(1)` hrs) +
     Daily avg diet (`daily_average_food.toFixed(1)` / 5) on the right.
   - **Chart** — `h-72` `ComposedChart` of `buckets`: a **Sleep** bar series + a **Diet** line series. Empty
     `buckets` → "No data for this range yet." panel (`timeline/page.tsx:91-94`).
4. **`LoadingState`** ("Loading timeline...") / **`ErrorState`** (the query error message) states
   (`timeline/page.tsx:61-65`).

## 5. Components + which shared features it consumes

- **Chrome (all already ported):** `PageShell`, `PageHeader`, `GlassCard`, `LoadingState`, `ErrorState`.
- **New dep (D-C1, ported verbatim this run):** `components/ui/PeriodSelector.tsx` (the `segmented-control`
  styled W/M/Y/P control; the `.segmented-control` CSS class was already in `globals.css:257`).
- **Charts:** Recharts `ComposedChart`/`Bar`/`Line`/`Legend` + the foundation `lib/chart-theme.ts` tokens
  (`CHART_COLORS`, tooltip/axis/grid styles).
- **Hooks/api:** `useAuthGuard` (`auth`), `useClientSearchParams`, `fetchHealthTimeline` (`lib/api/lifestyle.ts`,
  already ported run 23).

## 6. Data / API

- **`GET /api/analytics/health/timeline?period=&programId=&memberId=`** → `HealthTimelineResponse`
  (`{ label, daily_average_sleep, daily_average_food, buckets: [{ label, sleep_hours, food_quality }] }`).
  `authenticateToken`-only — **no per-program read authz** (analytics F2, inherited here as F1).
- **Query key:** `["lifestyle", "timeline", programId, resolvedMemberId ?? "program", period]`; `enabled` gated
  on `token`, `programId`, and `(resolvedMemberId || canViewAs)`.
- **Zero backend work, NO feature bump** — the route + service + the `fetchHealthTimeline` client fn all already
  shipped (`analytics` + the `lifestyle` landing).

## 7. Role-based view rules

There is **no view-as picker on this page** (unlike the `/lifestyle`, `/members` landings) — it relies on the
URL `memberId` the landing passes. `resolvedMemberId` (`timeline/page.tsx:36-40`): URL `memberId` if present,
else `undefined` (program-wide) for admins, else the requester's own id. No admin redirect; `useAuthGuard()`
default (`requireProgram: true`) — a missing active program bounces to `/programs`.

| Role | What they see |
|------|----------------|
| **global_admin** | `canViewAs=true`. No `memberId` → **program-wide** timeline; `?memberId=X` → that member's timeline. |
| **program admin** (`my_role==="admin"`) | Same as global_admin (program-wide default, or the passed `memberId`). |
| **logger / member** | `canViewAs=false` → `resolvedMemberId` = **own id** (own timeline). A `?memberId` in the URL would override, but the landing only ever passes their own. |

**`admin_only_data_entry`: N/A** — this is a read-only analytics view, not a log-entry surface (the lock gates
logging on `/summary`, not reads here).

## 8. States & edge cases

- **Loading** — `LoadingState` "Loading timeline...".
- **Error** — `ErrorState` with the query error message.
- **Empty** — `buckets.length === 0` → "No data for this range yet." panel inside the card (the card + header
  still render; the daily averages show 0.0).
- **No active program** — `useAuthGuard` redirects to `/programs`.
- **Query disabled** — until `token` + `programId` resolve (and, for admins with no `memberId`, `canViewAs`).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-SCOPE** | This page only — and it **CLOSES the `/lifestyle` group** (2nd & last sub-route; the sibling `workouts` landed run 31, the landing run 23). | COVERAGE lifestyle row |
| **D-DEPS** | One new chrome leaf — `components/ui/PeriodSelector.tsx` — ported **verbatim** (D-C1). Every other import (chrome, chart-theme, `useAuthGuard`, `useClientSearchParams`, `fetchHealthTimeline`) already ported. | `timeline/page.tsx:11-23` |
| **D-S1** | Faithful 1:1 otherwise — same `resolvedMemberId` logic, query key, `enabled` gate, header/averages, empty-state, and `force-dynamic`. Already fully `rf-*` tokenized → **no tokenize cleanup**. | legacy `timeline/page.tsx` |
| **D-C1** | Port `ui/PeriodSelector.tsx` verbatim (the one missing chrome leaf; `.segmented-control` CSS already present). | `globals.css:257`; legacy `PeriodSelector.tsx` |
| **D-C2** | **Dual Y-axis** (change-now) — sleep-hours bars on a left axis `[0, sleepMax*1.1]`; diet-quality line on a right axis `[0, 5]` (ticks 0–5). Replaces the legacy single shared `[0, yMax*1.1]` axis (the F3 scale-mixing where the 1–5 diet line sat nearly flat under the sleep bars). | user decision; legacy `timeline/page.tsx:49,100` |
| **D-C3** | **Chart `<Legend>`** (change-now) — labels the Sleep bar + Diet line series (legacy had only the tooltip). Series carry explicit `name="Sleep"`/`name="Diet"`; the tooltip formatter keys off the `name`. | user decision |
| **D-C4** | **Axis unit labels** (change-now) — left axis "hrs", right axis "/ 5" so the two scales are self-explanatory. Pure additive. | user decision |

## 10. Flagged characteristics kept as-is

- **F1** — `GET /analytics/health/timeline` is `authenticateToken`-only with **no per-program read authz**
  (inherited analytics F2): any authenticated user could fetch another program's timeline by crafting
  `programId`/`memberId`. Kept faithful; a backend authz hardening is a cross-feature rebuild candidate.
- **F2** — **No view-as picker on this page** — data scope comes purely from the URL `memberId` the landing
  passes (vs the `/lifestyle` landing's own picker). An admin who lands here directly (no `memberId`) sees the
  program-wide timeline. Faithful; deliberate (the landing owns member selection).
- **F3** — Client JWT-decode role gate (`session.user.globalRole` / `program.my_role` drive `canViewAs`);
  recurring across the rebuild. The backend doesn't gate reads (F1), so this only shapes the default scope, not
  security.
- **F4** — `admin_only_data_entry` N/A (read-only page) — see §7.
- **F5** — Diet `food_quality`'s right axis is hard-pinned to `[0, 5]` (D-C2). If the API ever returned a value
  >5 it would clip; faithful to the 1–5 daily-health diet scale (`daily-health-logs` validates 1–5).
