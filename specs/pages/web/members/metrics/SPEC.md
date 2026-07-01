# Page: `members/metrics` (web) — program-wide member performance metrics + CSV export (members sub-route 4 of 8)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.1.0 · **App:** `web` (Next.js App Router)
> **Route:** `/members/metrics` — the **Member Performance Metrics** dashboard reached by the `/members` landing's
> metrics card (program-admin / global_admin only as an entry path). A searchable, sortable, filterable grid of
> per-member metric cards + a client-side **Export CSV**. **4th** of the eight deferred `/members` sub-routes
> (`list`/`detail`/`invite`/`metrics`/`history`/`streaks`/`workouts`/`health`); does **not** close the group.
> **Provenance (legacy, archived):** `rasifiters-webapp/src/app/members/metrics/page.tsx` (430 lines).
> **Consumes (features):** [`member-analytics`](../../../../features/member-analytics/SPEC.md)
> (`GET /member-metrics` — `authenticateToken` route + service-level `ensureProgramAccess`; already mounted) via the
> already-ported `lib/api/members.ts` `fetchMemberMetrics`; [`auth`](../../../../features/auth/SPEC.md)
> (`useAuthGuard`).
> **Cross-app:** `consumed_by = [web]` — iOS surfaces member metrics natively; parity audited at the iOS port.
> **Stance:** faithful 1:1 port **+ 1 cleanup** (D-C1 full-tokenize the amber flame badge). **No new dependency,
> zero backend work, no feature bump.** Read + client-side CSV export only — no write path. Oddities flagged §10.

---

## 1. What it is + who uses it

The **Member Performance Metrics** dashboard for the signed-in user's active program — a grid of per-member cards
(workouts · total/avg duration · avg sleep · avg diet · active days · workout types · current/longest streak), with
a free-text member search, a sort-field `Select`, a direction `Select`, a slide-up **Filters** modal (date range +
nine min/max ranges), and an **Export CSV** action. All filtering/sorting is server-driven (query params on
`GET /member-metrics`); the CSV is built client-side from the loaded rows. The page itself has **no role-conditional
UI** — every role that reaches it sees the same program-wide metrics (entry is program-admin-gated by the landing
card — see §7).

## 2. Why it exists

The leaderboard/comparison view of a whole program — a program admin reviews how every active member is performing
across workout, duration, sleep, diet, activity, and streak metrics over an optional date window, sorts/filters to
find outliers, and exports the table to CSV for offline reporting.

## 3. Route / location

- **App:** `web` (Next.js 14 App Router).
- **Path:** `/members/metrics` (`apps/web/src/app/members/metrics/page.tsx`). No `force-dynamic` (no URL search
  params — all state is local; faithful).
- **Reached from:** the `/members` landing's "Member Performance Metrics" card — wrapped `{isProgramAdmin && …}`
  (`members/page.tsx:281-284`), so the link is **program-admin / global_admin only** (entry-path asymmetry, F2).
- **Back:** `PageHeader backHref="/members"`.
- **Leaves to:** nowhere — stays on the page (search/sort/filter re-query in place; CSV downloads a file).

## 4. Contents / sections

1. **`PageHeader`** — title "Member Performance Metrics", subtitle `${filtered} members` (or "Loading metrics…"),
   `backHref="/members"`, plus an **Export CSV** action button (`disabled` when no data / zero members)
   (`metrics/page.tsx:163-180`).
2. **Search/controls `GlassCard`** (`relative z-30`, `:182-204`) — a `md:grid-cols-[1fr,200px,200px,140px]` row:
   - **Search** — a `metric-pill` input with a leading `SearchIcon`, bound to `search` (`:184-194`).
   - **Sort `Select`** — `SORT_OPTIONS` (9 fields: workouts · total/avg duration · avg sleep · active days ·
     workout types · current/longest streak · avg diet) (`:195`).
   - **Direction `Select`** — `DIR_OPTIONS` (desc/asc) (`:196`).
   - **Filters button** — opens the filter modal (`setShowFilters(true)`) (`:197-203`).
3. **States** — `LoadingState` / `ErrorState` / `EmptyState` ("No members to display.") (`:206-216`).
4. **Cards grid** — one `MemberMetricsCard` per member (`:218-225`):
   - avatar (`initials`) · name · "Active days N" · a **hero metric** whose value+label follow the current
     `sortField` (`MemberMetricsCard.heroValue`/`heroLabel`, `:240-268`).
   - a 6-cell mini-grid (workouts · total mins · types · avg sleep · avg diet · longest streak) (`:283-303`).
   - an amber **"Current streak Nd"** flame badge — **D-C1** tokenized `bg-rf-warning/20 text-rf-warning`
     (legacy `bg-amber-200/70 text-amber-900`) (`:304-308`).
5. **Filters `Modal`** (`MetricsFilterModal`, `:227-234`, `:312-396`) — a `Clear all` / `Done` header, a date-range
   `segmented-control` (All / Custom → start+end `<input type=date>`), and nine `FilterRange` min/max pairs (workouts,
   total/avg duration, avg sleep, active days, workout types, current streak [min only], longest streak [min only],
   avg diet). `FilterRange` is a min/max input pair (`:400-430`).

## 5. Components + which shared features it consumes

- **Chrome (all already ported):** `PageShell`, `PageHeader` (→ `BackButton`), `GlassCard`, `Modal`, `LoadingState`,
  `EmptyState`, `ErrorState`, `Select` — landed with earlier runs; `FlameIcon`/`SearchIcon`
  (`components/icons/index.tsx`); `initials`/`escapeCsv`/`downloadCsv` (`lib/format.ts`). `MemberMetricsCard`,
  `MetricsFilterModal`, `FilterRange` are page-local components.
- **New dep:** **none** — `fetchMemberMetrics`/`MemberMetrics`/`MemberMetricsResponse` already live in
  `lib/api/members.ts:102` (ported "vestigial-here" with the `/members` landing run 22; byte-identical to legacy,
  lines 1–130 verified). This page is its belated consumer. The sweep ports only the page file. (Sized per-function:
  the fn is in this page's **own** members family — cf. run-39's cross-family draw of `fetchMembershipDetails` from
  `programs.ts`; the import path is the source of truth either way.)
- **Hooks/api:** `useAuthGuard` (`auth`), `fetchMemberMetrics` (`lib/api/members.ts`) — all already ported.

## 6. Data / API

- **`GET /api/member-metrics?…`** ← `fetchMemberMetrics(token, programId, { search, sort, direction, filters })`
  (`members.ts:102-124`). React Query key
  `["members","metrics",programId, search, sortField, direction, JSON.stringify(filterParams)]`, `enabled: !!token
  && !!programId` (`metrics/page.tsx:114-124`) — every control change is a new server fetch (server-driven
  sort/filter/search). Response: `{ total, filtered, date_range, members[] }`.
- **CSV export** — `handleExport` (`:126-160`) builds the CSV string **client-side** from `metricsQuery.data.members`
  (filename `MemberPerformanceMetrics_<Program>_<rangeStart>_to_<rangeEnd>.csv`), `escapeCsv`-escapes only the
  member name (numbers passed raw), and `downloadCsv`s it. No server round-trip.
- **Zero backend work, NO feature bump** — `GET /api/member-metrics` already mounted (`server.js:77`,
  `metricsRouter.get("/", authenticateToken)`), and the service `getMemberMetrics` enforces
  `ensureProgramAccess(user.id, user.global_role, programId)` → 403 for non-members
  (`memberAnalyticsService.js:64-75`), shipped with [`member-analytics`](../../../../features/member-analytics/SPEC.md).
  The api fn already ported.

## 7. Role-based view rules

`useAuthGuard()` default (`requireProgram: true`) — no token → `/login`, no active program → `/programs`. **No
admin redirect and no role-conditional UI on the page** — every role that reaches it sees the same program-wide
metrics grid + CSV export (`metrics/page.tsx:79`; the absence of any `isProgramAdmin`/`isGlobalAdmin` branch is the
finding). The **backend** allows any **active member** of the program (`ensureProgramAccess` — membership, not
admin).

| Role | What they see / can do |
|------|------------------------|
| **global_admin** | The full metrics grid + search/sort/filter + Export CSV. Entry: the landing's metrics card. |
| **program admin** (`my_role==="admin"`) | Same — full grid + export. Entry: the landing's metrics card. |
| **logger** | Same full grid **if reached directly** — but the landing surfaces **no link** (F2). Backend permits it (active member). |
| **member** | Same full grid **if reached directly** — but the landing surfaces **no link** (F2). Backend permits it (active member). |

**`admin_only_data_entry`: N/A** — this page **reads** metrics and exports a CSV; it performs **no workout/health
logging** and no write of any kind. The lock gates the `/summary` log forms, not this dashboard (run-31/36/40
read-vs-write-lock axis: the lock follows whether the page does *logging*).

**Entry-path asymmetry (F2):** the only link to `/members/metrics` is the landing's metrics card, gated
`{isProgramAdmin && …}` (`members/page.tsx:281`). Yet the page has no role gate and the backend allows any active
member — so the page is **de-facto admin-only by entry path, not by gate**. A non-admin who navigates directly gets
the full program-wide leaderboard (the backend permits it). Faithful; the run-39 `members/list` asymmetry inverted
(there the pill was *laxer* than the action; here the link is *stricter* than the page/backend).

## 8. States & edge cases

- **Loading** — `metricsQuery.isLoading` → `LoadingState "Loading metrics…"`; the header subtitle reads
  "Loading metrics…" and Export is `disabled`.
- **Error** — `metricsQuery.isError` → `ErrorState` with the error message.
- **Empty** — `data.members.length === 0` → `EmptyState "No members to display."`; Export `disabled` (and
  `handleExport` early-returns).
- **Loaded** — header subtitle `${filtered} members`; one card per member; the hero metric follows `sortField`.
- **Search / sort / direction / filters** — each updates local state → a new query key → a fresh server fetch
  (server-driven; no client filtering of loaded rows).
- **Filters modal** — `Clear all` resets to `defaultFilters`; `Done`/backdrop closes; custom date range only applies
  when `dateMode === "custom"` and a bound is set (`filterParams` memo, `:87-112`).
- **CSV** — built from the currently-loaded (already filtered/sorted) rows; `null` avg sleep/diet → empty cell.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | Faithful 1:1 port of legacy `members/metrics/page.tsx` (430 lines). `consumed_by = [web]` — iOS surfaces member metrics natively. | `rasifiters-webapp/src/app/members/metrics/page.tsx` |
| **D-SCOPE** | This page only — **4th of the 8 deferred `/members` sub-routes**; does **not** close the group (`history`/`streaks`/`workouts`/`health` still deferred). | `COVERAGE.md` `/members` row |
| **D-DEPS** | **No new dependency** — `fetchMemberMetrics` (`lib/api/members.ts:102`, byte-identical) + every chrome leaf / icon / format helper already ported; the sweep ports only the page file. Sized per-function: the fn is in this page's own members family. | `apps/web/src/lib/api/members.ts:102` |
| **D-S1** | **Faithful otherwise** — same `useAuthGuard()` default (no role gate), same React Query key + `enabled` gate, same server-driven search/sort/direction/filters, same `MemberMetricsCard` hero-metric switch, same `MetricsFilterModal`/`FilterRange` markup, same client-side `handleExport` CSV. | `members/metrics/page.tsx:78-430` |
| **D-C1** | **Full-tokenize the amber flame badge** — `bg-amber-200/70 text-amber-900` → `bg-rf-warning/20 text-rf-warning` (the lone non-`rf` color; `rf-warning` exists, `#f59e0b` light / `#fbbf24` dark). Theme-aware; the run-27/39 selective-tokenize taken to full tokenize per user pick. | `members/metrics/page.tsx:305`; `tailwind.config.ts:23`, `globals.css:20,44` |
| **D-STANCE** | Faithful 1:1 **+ D-C1**. No backend work, no feature bump (route + api fn already shipped). | user, this run |

## 10. Open questions / flagged characteristics (kept as-is)

- **F1 — server-driven sort/filter/search, not client.** Every control change re-fetches `GET /member-metrics` with
  new query params (the query key embeds `search`/`sort`/`direction`/`JSON.stringify(filterParams)`) — the page does
  **not** filter/sort loaded rows client-side. Faithful (the canonical server copy; cf. the run-13 read posture).
- **F2 — entry-path asymmetry (link stricter than page/backend).** The landing links to `/members/metrics` only for
  `isProgramAdmin` (`members/page.tsx:281`), but the page has no role gate and the backend `ensureProgramAccess`
  allows any **active member** — so a non-admin who navigates directly sees the full program-wide leaderboard.
  Faithful; the inverse of run-39's pill-laxer-than-action asymmetry. Rebuild-cleanup candidate only if metrics
  should be formally admin-gated.
- **F3 — per-program read authz IS enforced (the secure characteristic).** Unlike the `/summary` analytics routes
  (their F2 — `authenticateToken`-only, no per-program gate), `getMemberMetrics` calls `ensureProgramAccess` and
  403s a non-member (`memberAnalyticsService.js:74-75`). The route carries only `authenticateToken`; the gate lives
  in the service. Kept faithful.
- **F4 — client-side CSV export.** `handleExport` builds the CSV from the loaded rows (no server endpoint);
  `escapeCsv` escapes only `member_name` (numeric fields are emitted raw — safe, they contain no commas/quotes).
  `null` avg sleep/diet → empty cells. Faithful.
- **F5 — hero metric is sort-coupled.** The big number on each card (`heroValue`/`heroLabel`) is whatever the current
  `sortField` selects (`current_streak` → "Current Streak", default → "Workouts"). A display nicety, not a separate
  control. Faithful.
- **F6 — `current_streak` / `longest_streak` filters are min-only.** `FilterRange` for both streaks passes `maxValue=""`
  and a one-arg `onChange` (`:391-392`) — no upper bound by design. Faithful.
- **F7 — no `force-dynamic`, all state local.** No URL search params; search/sort/filter live in component state, so
  a refresh resets to defaults (`workouts`/`desc`/all). Faithful.

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-29 | Initial faithful port of `members/metrics` (members sub-route 4 of 8) — program-wide member performance dashboard (search/sort/filter + per-member cards + client-side CSV export); D-C1 full-tokenize the amber flame badge → `rf-warning`. No new dependency, zero backend work, no feature bump. |
