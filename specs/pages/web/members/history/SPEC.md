# Page: `members/history` (web) — per-member workout history timeline (members sub-route 5 of 8)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.1.0 · **App:** `web` (Next.js App Router)
> **Route:** `/members/history?memberId=&name=` — the **Workout History** timeline for one member, reached by the
> `/members` landing's "Workout History" card. A `PeriodSelector` (W/M/Y/P) over a single-series workouts
> `BarChart`. **5th** of the eight deferred `/members` sub-routes
> (`list`/`detail`/`invite`/`metrics`/`history`/`streaks`/`workouts`/`health`); does **not** close the group.
> **Reference impl (legacy):** `../../../../../../rasifiters-webapp/src/app/members/history/page.tsx` (93 lines).
> **Consumes (features):** [`member-analytics`](../../../../features/member-analytics/SPEC.md)
> (`GET /member-history` — `authenticateToken` route + service-level `ensureProgramAccess` + target-enrolled check;
> already mounted) via the already-ported `lib/api/members.ts` `fetchMemberHistory`;
> [`auth`](../../../../features/auth/SPEC.md) (`useAuthGuard`).
> **Cross-app:** `consumed_by = [web]` — iOS surfaces member history natively; parity audited at the iOS port.
> **Stance:** faithful 1:1 port **+ 1 cleanup** (D-C1 all-zero empty-state guard). **No new dependency, zero backend
> work, no feature bump.** Read-only — no write path. Oddities flagged §10.

---

## 1. What it is + who uses it

The **Workout History** detail for a single program member — a `PeriodSelector` (Week / Month / Year / Program) over
one `GlassCard` showing the selected range label, the daily-average workouts, and a single-series `BarChart` of
workout count per time bucket (over `workout_logs`). The target member comes from the URL (`memberId` + display
`name`). Reached by program staff (global_admin / program admin / logger) for any member via the `/members` landing,
or by a plain member for **their own** history (a non-staff user who navigates to someone else's `memberId` is
redirected away — see §7).

## 2. Why it exists

The drill-down behind the `/members` landing's per-member History card — staff review how often a given member has
trained over a chosen window (and the daily average), and a member can review their own training cadence.

## 3. Route / location

- **App:** `web` (Next.js 14 App Router).
- **Path:** `/members/history` (`apps/web/src/app/members/history/page.tsx`). `export const dynamic =
  "force-dynamic"` (faithful — the page reads URL search params).
- **URL params:** `memberId` (the target member, required — drives the query + the redirect gate) and `name` (display
  only, defaults to "Member") via `useClientSearchParams` (`page.tsx:28-30`).
- **Reached from:** the `/members` landing's "Workout History" card (`MemberHistoryCard`) — rendered inside the
  view-as / logger overview blocks, passing `memberId`+`name` (`members/page.tsx:314, 348, 398`).
- **Back:** `PageHeader backHref="/members"`.
- **Leaves to:** nowhere — the only navigation off the page is the back link, or the non-staff redirect to
  `/members` (§7).

## 4. Contents / sections

1. **`PageHeader`** — title "Workout History", subtitle = the `name` URL param (the member's display name),
   `backHref="/members"` (`page.tsx:52`).
2. **`PeriodSelector`** — the W/M/Y/P `segmented-control`, bound to local `period` state (default `"week"`)
   (`page.tsx:54`).
3. **States** — `LoadingState "Loading timeline..."` / `ErrorState` (the query error message) (`page.tsx:56-58`).
4. **Timeline `GlassCard`** (`padding="lg"`, rendered when `historyQuery.data`) (`page.tsx:60-90`):
   - **Range header** — "Range" label + `data.label`; on the right, "Daily avg" + `data.daily_average.toFixed(1)`.
   - **`BarChart`** (`h-72`) — `data.buckets`, X-axis `label`, single `workouts` bar (`CHART_COLORS[0]`, radius
     `[8,8,0,0]`), shared chart-theme grid/axis/tooltip; tooltip formatter `(value) => [value, "Workouts"]`.
   - **D-C1 all-zero empty-state** — when every bucket's `workouts` sums to 0, render "No workouts logged in this
     range." in place of the flat-zero chart (see §8, §9).

## 5. Components + which shared features it consumes

- **Chrome (all already ported):** `PageShell`, `PageHeader` (→ `BackButton`), `GlassCard`, `PeriodSelector`,
  `LoadingState`, `ErrorState` — landed with earlier runs (`PeriodSelector` ported verbatim with `lifestyle/timeline`
  run 32); chart-theme tokens (`CHART_COLORS`/`CHART_TOOLTIP_*`/`CHART_GRID_PROPS`/`CHART_AXIS_TICK`,
  `lib/chart-theme.ts`); `useClientSearchParams` (`lib/use-client-search-params.ts`).
- **New dep:** **none** — `fetchMemberHistory`/`MemberHistoryPoint`/`MemberHistoryResponse` already live in
  `lib/api/members.ts:126` (ported "vestigial-here" with the `/members` landing run 22; byte-identical to legacy,
  lines 20–130 verified). This page is its belated consumer. The sweep ports only the page file. (Sized per-function:
  the fn is in this page's **own** members family — run-41's own-family case.)
- **Hooks/api:** `useAuthGuard` (`auth`), `fetchMemberHistory` (`lib/api/members.ts`) — all already ported.

## 6. Data / API

- **`GET /api/member-history?programId=&memberId=&period=`** ←
  `fetchMemberHistory(token, programId, memberId, period)` (`members.ts:126-129`). React Query key
  `["members","history",programId, memberId, period]`, `enabled: !!token && !!programId && !!memberId`
  (`page.tsx:44-48`). Response: `{ period, label, daily_average, buckets: [{ date, label, workouts }], start, end }`.
- **Zero backend work, NO feature bump** — `GET /api/member-history` already mounted (`server.js:78`,
  `historyRouter.get("/", authenticateToken)`), and the service `getMemberHistory` enforces
  `ensureProgramAccess(user.id, user.global_role, programId)` → 403 for non-members (`memberAnalyticsService.js:264`)
  **plus** a target-enrolled check → 404 if the `memberId` is not an active member of the program
  (`memberAnalyticsService.js:267-270`), shipped with
  [`member-analytics`](../../../../features/member-analytics/SPEC.md). The api fn already ported.

## 7. Role-based view rules

`useAuthGuard()` default (`requireProgram: true`) — no token → `/login`, no active program → `/programs`. The page
carries a **client-side per-member redirect**: `canViewAny = isGlobalAdmin || my_role==="admin" || my_role==="logger"`
(`page.tsx:32-33`); a non-`canViewAny` user whose URL `memberId` is **not their own** id is `router.push("/members")`'d
on mount (`page.tsx:37-42`). So staff may view **any** member's history; a plain member may view **only their own**.

| Role | What they see / can do |
|------|------------------------|
| **global_admin** | The history timeline for **any** `memberId` (`canViewAny`). Entry: the landing's History card. |
| **program admin** (`my_role==="admin"`) | Same — any member's timeline. Entry: the landing's History card. |
| **logger** (`my_role==="logger"`) | Same — any member's timeline (`canViewAny`). Entry: the landing's overview History card. |
| **member** | **Only their own** timeline — viewing another member's `memberId` redirects to `/members` on mount. |

**`admin_only_data_entry`: N/A** — this page **reads** a workout timeline; it performs **no logging** and no write
of any kind. The lock gates the `/summary` log forms, not this read view (run-31/36/40 read-vs-write-lock axis: the
lock follows whether the page does *logging*).

**Role-gate asymmetry (F2):** the page's client redirect is **stricter** than the backend. `getMemberHistory` only
checks `ensureProgramAccess` (requester is an active member of the program) + the target is enrolled — it does **not**
restrict which member a non-staff requester may view. So any active member could fetch any enrolled member's history
directly via the API; only the client UI enforces "members see only their own." Faithful — the client gate is the UX
layer, the (looser) backend is the real boundary (the run-40 `members/detail` mirror: client stricter than backend).

## 8. States & edge cases

- **No `memberId`** — the redirect `useEffect` early-returns (`if (!memberId) return`) and the query is disabled
  (`enabled` requires `memberId`); the page renders header + period selector with no card. Faithful (a degenerate
  direct-nav case; the landing always passes `memberId`).
- **Loading** — `historyQuery.isLoading` → `LoadingState "Loading timeline..."`.
- **Error** — `historyQuery.isError` → `ErrorState` with `(error as Error).message` (e.g. a 403/404 from the service).
- **Loaded, has workouts** — the Range/Daily-avg header + the workouts `BarChart`.
- **Loaded, all-zero (D-C1 cleanup)** — when `data.buckets` every `workouts === 0` (a member with no logged workouts
  in the range; the backend always returns a full window of buckets, so `buckets.length` is never 0), render
  "No workouts logged in this range." in the card instead of a row of flat zero-height bars. Keyed off the **sum**,
  not `buckets.length` (run-34 predicate-vs-shape lesson). The Range/Daily-avg header still shows (daily avg 0.0).
- **Non-staff viewing another member** — `router.push("/members")` on mount before any data renders (§7).
- **Period change** — updates local `period` → new query key → fresh server fetch (server-driven window; no client
  re-bucketing).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | Faithful 1:1 port of legacy `members/history/page.tsx` (93 lines). `consumed_by = [web]` — iOS surfaces member history natively. | `rasifiters-webapp/src/app/members/history/page.tsx` |
| **D-SCOPE** | This page only — **5th of the 8 deferred `/members` sub-routes**; does **not** close the group (`streaks`/`workouts`/`health` still deferred). | `COVERAGE.md` `/members` row |
| **D-DEPS** | **No new dependency** — `fetchMemberHistory` (`lib/api/members.ts:126`, byte-identical) + `PeriodSelector` (ported run 32) + every chrome leaf / chart-theme token already ported; the sweep ports only the page file. Sized per-function: the fn is in this page's own members family (run-41). | `apps/web/src/lib/api/members.ts:126` |
| **D-S1** | **Faithful otherwise** — same `force-dynamic` + `useClientSearchParams` (`memberId`/`name`), same `useAuthGuard()` + `canViewAny` redirect, same React Query key `["members","history",programId,memberId,period]` + `enabled` gate, same `PeriodSelector` default `"week"`, same Range/Daily-avg header + single-series `BarChart` markup. Already fully `rf-*` tokenized → no tokenize cleanup; single counts series → no `<Legend>`/dual-axis (run-33 subtraction). | `members/history/page.tsx:26-92` |
| **D-C1** | **All-zero empty-state guard** — when `data.buckets` all sum to 0, render "No workouts logged in this range." instead of flat zero bars. Matches `summary/activity`'s empty-state (run-33 D-C2) but keyed off the **sum**, not `buckets.length` (the backend always returns a full window of buckets → `length` is never 0; run-34 predicate-vs-shape lesson). | `members/history/page.tsx:60-90`; `memberAnalyticsService.js:279-290` |
| **D-STANCE** | Faithful 1:1 **+ D-C1**. No backend work, no feature bump (route + api fn already shipped). | user, this run |

## 10. Open questions / flagged characteristics (kept as-is)

- **F1 — server-driven window, not client re-bucketing.** Each `period` change re-fetches `GET /member-history` with
  the new `period` query param (the query key embeds `period`); the page does not re-bucket loaded rows client-side.
  Faithful (the canonical server copy; cf. the sibling `summary/activity` F-rows).
- **F2 — role-gate asymmetry (client redirect stricter than backend).** The page redirects a non-staff user away from
  another member's `memberId` (`page.tsx:37-42`), but `getMemberHistory` only enforces `ensureProgramAccess` +
  target-enrolled — any active member could fetch any enrolled member's history via the API directly. Faithful; the
  run-40 `members/detail` mirror (client stricter than backend). Rebuild-cleanup candidate only if the per-member
  read restriction should be enforced server-side.
- **F3 — per-program read authz IS enforced (the secure characteristic).** Unlike the `/summary` analytics routes
  (their F2 — `authenticateToken`-only), `getMemberHistory` calls `ensureProgramAccess` (403 non-member) **and**
  verifies the target `memberId` is an active member of the program (404 otherwise) — two distinct lookups gating two
  distinct members (run-13: requester vs target). Kept faithful.
- **F4 — `name` is display-only, defaults to "Member".** The subtitle is whatever `name` the landing passed
  (`encodeURIComponent`'d at the call site); a direct-nav without `name` shows "Member". The actual member identity is
  driven entirely by `memberId`. Faithful.
- **F5 — no `memberId` is a degenerate no-op.** Direct-nav to `/members/history` with no `memberId` disables the query
  and short-circuits the redirect `useEffect` → header + period selector with no card (no error, no empty-state). The
  landing always supplies `memberId`, so this is unreachable in normal flow. Faithful, flagged.

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-29 | Initial faithful port of `members/history` (members sub-route 5 of 8) — per-member Workout History timeline (`PeriodSelector` + single-series workouts `BarChart`, URL `memberId`/`name`, non-staff own-only redirect); D-C1 all-zero empty-state guard. No new dependency, zero backend work, no feature bump. |
