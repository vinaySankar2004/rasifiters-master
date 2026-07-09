# Page: `lifestyle/steps-timeline` (web) — daily-steps timeline detail

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.1.0 · **App:** `web` (Next.js App Router)
> **Route:** `/lifestyle/steps-timeline` — the **daily-steps** timeline detail, reached from the
> [`lifestyle`](../SPEC.md) landing's **Steps Timeline** chart card (a clone of the sibling
> [`lifestyle/timeline`](../timeline/SPEC.md) sleep/diet detail). A `PeriodSelector` (W/M/Y/P) over one
> `GlassCard`: a daily-average-steps header + a single-series teal `BarChart` of daily steps. **Read-only.**
> **Provenance:** cloned from `apps/web/src/app/lifestyle/timeline/page.tsx` (the steps-tracking run,
> 2026-07-09) — same shape, one `steps` series instead of the sleep-bars + diet-line pair.
> **Consumes (features):** [`analytics`](../../../../features/analytics/SPEC.md) **0.2.0**
> (`GET /analytics/health/timeline` — the additive `steps` per bucket + `daily_average_steps`; D-C5) via the
> already-ported `lib/api/lifestyle.ts` `fetchHealthTimeline`, and [`auth`](../../../../features/auth/SPEC.md)
> (`useAuthGuard` + the client role for `canViewAs`).
> **Cross-app:** the iOS + Android Steps Timeline detail render the same daily-steps chart natively; parity
> audited at each port.
> **Stance:** faithful clone of `lifestyle/timeline` + the DC-8 steps accent (teal `#14b8a6`). Oddities §10.

---

## 1. What it is + who uses it

The **daily-steps timeline** detail page for the active program. It charts a member's (or the program's)
**step count** over a selectable period (week / month / year / program), backed by `daily_health_logs.steps`.
It is a **read-only** analytics view — the drill-down behind the lifestyle landing's Steps Timeline preview
card. Every role can reach it; scope depends on who's asking and the URL `memberId` (see §7).

## 2. Why it exists

To give a fuller view of the steps trend than the landing's small preview card affords — a dedicated
period-selectable bar chart with a daily-average-steps summary stat. The steps twin of the sleep/diet
[`lifestyle/timeline`](../timeline/SPEC.md).

## 3. Route / location

- **App:** `web` (Next.js 14 App Router).
- **Path:** `/lifestyle/steps-timeline` (`apps/web/src/app/lifestyle/steps-timeline/page.tsx`).
  `export const dynamic = "force-dynamic"` (faithful — the page reads `useClientSearchParams` + a
  per-session token).
- **Reached from:** the [`lifestyle`](../SPEC.md) landing's `StepsTimelineCard` `onClick` →
  `router.push("/lifestyle/steps-timeline" + (memberId ? "?memberId=…" : ""))`.
- **Back:** `PageHeader backHref="/lifestyle"`.

## 4. Contents / sections

1. **`PageHeader`** — title "Steps Timeline", subtitle "Daily steps", `backHref="/lifestyle"`.
2. **`PeriodSelector`** — W/M/Y/P segmented control → `period` state (default `"week"`).
3. **Timeline `GlassCard`** (only when `timelineQuery.data`):
   - **Header row** — Range (`label`) on the left; **Daily avg steps** (`daily_average_steps.toLocaleString()`)
     on the right.
   - **Chart** — a single teal (`#14b8a6`) `<Bar name="Steps" dataKey="steps" radius={[8,8,0,0]} />` over a
     single left axis (`domain [0, stepsMax*1.1]`, label "steps"); tooltip formatter
     `[value.toLocaleString(), "Steps"]`; **no Legend / no Line / no second axis** (single-series). Empty
     `buckets` → "No data for this range yet." panel.
4. **`LoadingState`** ("Loading timeline...") / **`ErrorState`** (the query error message) states.

## 5. Components + which shared features it consumes

- **Chrome (all already ported):** `PageShell`, `PageHeader`, `GlassCard`, `LoadingState`, `ErrorState`,
  `PeriodSelector` (landed with the sibling `lifestyle/timeline`).
- **Charts:** Recharts `BarChart`/`Bar` + the foundation `lib/chart-theme.ts` tokens.
- **Hooks/api:** `useAuthGuard` (`auth`), `useClientSearchParams`, `fetchHealthTimeline`
  (`lib/api/lifestyle.ts` — reused; the `steps`/`daily_average_steps` fields are additive, analytics 0.2.0).
- **New dep:** the page file only (no new shared leaf — the steps series reuses `fetchHealthTimeline`).

## 6. Data / API

- **`GET /api/analytics/health/timeline?period=&programId=&memberId=`** → `HealthTimelineResponse`
  (`{ label, daily_average_sleep, daily_average_food, daily_average_steps, buckets: [{ label, sleep_hours,
  food_quality, steps }] }`). `authenticateToken`-only — **no per-program read authz** (analytics F2,
  inherited here as F1). Only the `steps` + `daily_average_steps` fields are read here.
- **Group-view semantics (analytics D-C5 / amendment A-4):** with no `memberId`, the group buckets average
  over steps-bearing **member-day rows** (per-member-day average, mirroring Avg Sleep) — NOT total steps per
  calendar day summed across the group.
- **Query key:** `["lifestyle", "steps-timeline", programId, resolvedMemberId ?? "program", period]`;
  `enabled` gated on `token`, `programId`, and `(resolvedMemberId || canViewAs)`.
- **Zero backend work beyond analytics 0.2.0** — the route + `fetchHealthTimeline` already shipped; only the
  `steps` field is new (additive).

## 7. Role-based view rules

There is **no view-as picker on this page** — it relies on the URL `memberId` the landing passes.
`resolvedMemberId`: URL `memberId` if present, else `undefined` (program-wide) for admins, else the
requester's own id. No admin redirect; `useAuthGuard()` default (`requireProgram: true`) — a missing active
program bounces to `/programs`.

| Role | What they see |
|------|----------------|
| **global_admin** | `canViewAs=true`. No `memberId` → **program-wide** steps timeline; `?memberId=X` → that member's. |
| **program admin** (`my_role==="admin"`) | Same as global_admin (program-wide default, or the passed `memberId`). |
| **logger / member** | `canViewAs=false` → `resolvedMemberId` = **own id** (own timeline). |

**`admin_only_data_entry`: N/A** — read-only analytics, not a log-entry surface.

## 8. States & edge cases

- **Loading** — `LoadingState` "Loading timeline...".
- **Error** — `ErrorState` with the query error message.
- **Empty** — `buckets.length === 0` → "No data for this range yet." panel inside the card (the daily average
  shows 0).
- **No active program** — `useAuthGuard` redirects to `/programs`.
- **Query disabled** — until `token` + `programId` resolve (and, for admins with no `memberId`, `canViewAs`).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-SCOPE** | This page only — the steps twin of `lifestyle/timeline`, added by the steps-tracking run. | steps-tracking plan step 25 |
| **D-REF** | `consumed_by = [web]` — the web steps timeline detail; iOS + Android render their own native versions. Cloned from `lifestyle/timeline/page.tsx`. | sibling SPEC; cross-app sweep |
| **D-DEPS** | **No new dependency** — `fetchHealthTimeline` (steps field additive, analytics 0.2.0), `PeriodSelector`, chrome, chart-theme all already ported; the sweep adds only the page file. | `lifestyle/timeline` run |
| **D-C1** | **Single teal `steps` series** — one left axis `[0, stepsMax*1.1]` labelled "steps", tooltip `[value.toLocaleString(),"Steps"]`, no Legend/Line/second-axis (unlike the sleep/diet twin's dual-axis composed chart). Accent teal `#14b8a6` (DC-8). | steps-tracking plan DC-8/step 25 |
| **D-S1** | Faithful clone otherwise — same `resolvedMemberId` logic, query key shape, `enabled` gate, header, empty-state, `force-dynamic`; already `rf-*` tokenized. | sibling `lifestyle/timeline/page.tsx` |

## 10. Flagged characteristics kept as-is

- **F1** — `GET /analytics/health/timeline` is `authenticateToken`-only with **no per-program read authz**
  (inherited analytics F2); any authenticated user could fetch another program's timeline by crafting
  `programId`/`memberId`. Kept faithful; a backend authz hardening is a cross-feature rebuild candidate.
- **F2** — **No view-as picker on this page** — scope comes purely from the URL `memberId` the landing passes
  (the landing owns member selection). Faithful; deliberate (same as the sleep/diet twin F2).
- **F3** — Client JWT-decode role gate (`session.user.globalRole` / `program.my_role` drive `canViewAs`);
  shapes the default scope only, not security (F1).
- **F4** — `admin_only_data_entry` N/A (read-only page) — see §7.
- **F5** — Group buckets are a per-member-day average, not a per-calendar-day total (analytics D-C5 /
  amendment A-4) — deliberate, mirroring Avg Sleep; not to be "fixed".

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-07-09 | Initial SPEC + build (steps-tracking run) — the **daily-steps** timeline detail, cloned from the sibling `lifestyle/timeline`: a `PageShell` + `PageHeader` + `PeriodSelector` over one `GlassCard` with a daily-average-steps header and a single teal (`#14b8a6`) `steps` `BarChart` (single left axis "steps", `toLocaleString()` tooltip, no Legend/Line/second-axis). Reuses `fetchHealthTimeline` (the `steps`/`daily_average_steps` fields are additive — analytics 0.2.0 D-C5, per-member-day group semantics per amendment A-4). `consumed_by=[web]`. **No new dependency, no backend work beyond analytics 0.2.0.** Ported `apps/web/src/app/lifestyle/steps-timeline/page.tsx`. `npm run build` ✓. |
