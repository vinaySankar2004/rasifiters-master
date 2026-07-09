# Page: `lifestyle` (web) — the workout-analytics / health-timeline dashboard (third workspace tab)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.2.0 · **App:** `web` (Next.js App Router)
> **Route:** `/lifestyle` — **the third bottom-nav tab** of a program's workspace. NOT a sleep/diet *logging*
> screen: it is a **read-only** workout-type-analytics + health-timeline overview with the same role-gated
> **"view as"** picker as the Members tab. The workout-type CRUD (the write path) and the full timeline detail
> are **sub-routes, deferred** (see §3).
> **Provenance (legacy, archived):** `rasifiters-webapp/src/app/lifestyle/page.tsx`
> (+ ported deps `lib/api/lifestyle.ts`, `components/ui/EmptyState.tsx`).
> **Consumes (features):** [`analytics`](../../../features/analytics/SPEC.md) (`workouts/types` popularity +
> `health/timeline`), [`analytics-v2`](../../../features/analytics-v2/SPEC.md)
> (`workouts/types/{total,most-popular,longest-duration,highest-participation}`),
> [`program-memberships`](../../../features/program-memberships/SPEC.md)
> (`fetchProgramMembers` → the view-as picker list), [`auth`](../../../features/auth/SPEC.md)
> (`useAuthGuard` + the client role), and the active program from `lib/storage.ts`.
> **Cross-app:** the iOS home renders the same workout-type analytics + lifestyle timeline natively
> (`Features/Home/`); parity audited at the iOS port.
> **Stance:** faithful 1:1 port. The page-local `MemberPickerModal` is a near-duplicate of the one in
> `members/page.tsx`; left as-is and flagged (§10, F6) rather than extracted. Oddities flagged §10.

---

## 1. What it is + who uses it

The **lifestyle overview dashboard** for the active program. Despite the tab name it is a *read* surface
centered on **workout-type analytics** (which exercises are most done / longest / most participated-in) plus
a **sleep-and-diet timeline** preview. Like the Members tab it shows either the signed-in member's own
numbers or — for admins — a **"view as"** picker that swaps every card to a chosen member's data. The blocks
are: 4 workout-type stat cards (Total types / Most popular / Longest duration / Highest participation), a
clickable **Lifestyle Timeline** card (a sleep-bars + diet-quality-line `ComposedChart` over the recent
week), and a **Workout Type Popularity** card (a sortable horizontal-bar list with a count/total-minutes/avg
toggle and a top-10/show-all switch). Used by **every enrolled member**; the view-as picker and the
button *label* vary by role (§7). The page is **read-only** — every other control is forward-navigation to a
sub-route.

## 2. Why it exists

To be the workspace's lifestyle lens: a member checks which workout types they do most and how their
sleep/diet trend; an admin inspects any member's (or the whole program's) workout-type mix without leaving
the tab. It is the landing/hub for the lifestyle cluster — the entry point that fans out to the workout-type
**management** screen (`/lifestyle/workouts`, the write path) and the full **timeline detail**
(`/lifestyle/timeline`).

## 3. Route / location

- **App:** `web`. **Route:** `/lifestyle`. **Protected** — in the `middleware.ts` matcher; an unauthenticated
  edge request → `/login`, and the page's `useAuthGuard()` (default `requireProgram: true`) is a second client
  gate that **bounces to `/programs` if no active program** is selected.
- **Reached via:** the app-wide bottom nav (`apps/web/src/app/shell.tsx` — `showNav` includes `/lifestyle`,
  the **Lifestyle** tab already wired), once a program is active.
- **Chrome:** the bottom nav renders the 4 workspace tabs (Summary / Members / Lifestyle / Program). The
  **Program** tab is a forward dependency (F2).
- **Leaves to** (both `router.push`, both **not yet built** — F2): `/lifestyle/workouts` (the workout-type
  CRUD / management write path — where `admin_only_data_entry` actually bites) and `/lifestyle/timeline`
  (`?memberId=` — the full sleep/diet timeline with a period selector). **Two sub-routes, deferred** as their
  own page-spec rows.

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Header | "Lifestyle" + active program name; a **Manage workouts** / **View workouts** pill (→ `/lifestyle/workouts`; label flips on `canAddWorkouts`, both nav to the same route). | lifestyle/page.tsx:169-185 |
| View-as picker (admin) | `canViewAs`-only button → opens `MemberPickerModal`; shows `viewAsLabel` (selected member / "Admin" / "Member"). | lifestyle/page.tsx:187-197 |
| Empty hint | `!canViewAs && !loggedInUserId` → `EmptyState` "Unable to identify the logged-in member." | lifestyle/page.tsx:199-201 |
| Stat: Total workout types | `WorkoutStatCard` (amber) — distinct exercise count, program-to-date. | lifestyle/page.tsx:205-223 |
| Stat: Most popular | `WorkoutStatCard` (violet) — top workout name + session count. | lifestyle/page.tsx:224-239 |
| Stat: Longest duration | `WorkoutStatCard` (red) — workout name + avg minutes. | lifestyle/page.tsx:242-258 |
| Stat: Highest participation | `WorkoutStatCard` (green) — workout name + `participation_pct`% of members. **Always program-wide** (ignores the view-as member). | lifestyle/page.tsx:259-274 |
| Steps analytics card | `StepsStatsCard` (teal `#14b8a6`, `IconSteps`) — inserted **after** the Longest/Highest row (DC-9); 2-col "Total steps" / "Avg steps/day" from `fetchStepsStats` (`GET /analytics/health/steps`, member-scoped via the view-as memberId). | lifestyle/page.tsx (after :275) |
| Lifestyle Timeline card | Clickable → `/lifestyle/timeline?memberId=…`; a Recharts `ComposedChart` (sleep-hours bars + diet-quality line) over the last 10 buckets of the week. | lifestyle/page.tsx:277-284, 350-412 |
| Steps Timeline card | `StepsTimelineCard` (clone of `LifestyleTimelineCard`, teal `steps` bar) — inserted **after** the Lifestyle Timeline card (DC-9; lands between Timeline and Popularity on web, faithful insertion only); click → `/lifestyle/steps-timeline`. | lifestyle/page.tsx (after :284) |
| Workout Type Popularity card | A sortable horizontal-bar list with a **count / total-minutes / avg-minutes** segmented toggle and a **top-10 / show-all** switch; bar colors are a hash of the workout name. | lifestyle/page.tsx:286-289, 414-508 |
| Member Picker modal | `Modal` + search-filtered member list with an optional "None"/"Admin" row; persists the pick to `sessionStorage`. | lifestyle/page.tsx:292-307, 510-580 |

**Data flow.** `membersQuery` (`fetchProgramMembers`, admin-only) feeds the view-as picker. The signed-in /
selected member (`memberIdForMetrics`) drives six React-Query reads keyed under `["lifestyle", …]`:
workout-type **total / most-popular / longest-duration**, **highest-participation** (program-wide, no
`memberId`), **popularity** (`limit:120`), and the **health timeline** (week). `hasMemberContext =
canViewAs || !!loggedInUserId` gates the member-scoped reads. View-as selections persist in `sessionStorage`
under per-program/per-user keys (F3).

## 5. Components + features consumed

- **Ported-with-this-page (verbatim):** `lib/api/lifestyle.ts` (D-C1 — the whole 6-fn module; all transitive
  deps already in the foundation: `apiRequest`) and `components/ui/EmptyState.tsx` (D-C2 — a 10-line neutral
  empty card, distinct from the already-ported `ErrorState`).
- **Already-ported, reused:** `fetchProgramMembers` / `Member` (`lib/api/programs.ts`), `useAuthGuard`
  (default `requireProgram:true`), `PageShell` / `GlassCard` / `Modal`, the `IconDumbbell` icon, the 5
  `chart-theme` tokens, Recharts, React Query.
- **Features:** [`analytics`](../../../features/analytics/SPEC.md),
  [`analytics-v2`](../../../features/analytics-v2/SPEC.md),
  [`program-memberships`](../../../features/program-memberships/SPEC.md),
  [`auth`](../../../features/auth/SPEC.md).

## 6. Data / API

All calls send the Supabase access JWT as `Authorization: Bearer` (via `apiRequest`); the backend
JWKS-verifies + maps `sub` → member and runs all authorization. Paths are relative to `API_BASE_URL` (which
ends in `/api`). **All endpoints are already ported + mounted** (`apps/backend/server.js:74-76`).

| Call | Endpoint | Notes |
|------|----------|-------|
| `fetchProgramMembers(token, programId)` | `GET /program-memberships/members?programId` | The active-member list for the view-as picker (admin-only query). |
| `fetchWorkoutTypesTotal(token, programId, memberId?)` | `GET /analytics-v2/workouts/types/total?programId[&memberId]` | `{total_types}`. |
| `fetchWorkoutTypeMostPopular(token, programId, memberId?)` | `GET /analytics-v2/workouts/types/most-popular?programId[&memberId]` | `{workout_name, sessions}`. |
| `fetchWorkoutTypeLongestDuration(token, programId, memberId?)` | `GET /analytics-v2/workouts/types/longest-duration?programId[&memberId]` | `{workout_name, avg_minutes}`. |
| `fetchWorkoutTypeHighestParticipation(token, programId)` | `GET /analytics-v2/workouts/types/highest-participation?programId` | `{workout_name, participation_pct, …}` — **program-wide**, `memberId` never sent (F4). |
| `fetchWorkoutTypePopularity(token, programId, {memberId?, limit:120})` | `GET /analytics/workouts/types?programId&limit[&memberId]` | `WorkoutTypePopularity[]` — sorted/sliced client-side (F5). |
| `fetchHealthTimeline(token, "week", programId, memberId?)` | `GET /analytics/health/timeline?period=week&programId[&memberId]` | `{buckets[], …}` — now incl. `steps` per bucket + `daily_average_steps`; the last 10 buckets feed both the Lifestyle Timeline + the Steps Timeline cards. |
| `fetchStepsStats(token, programId, memberId?)` | `GET /analytics/health/steps?programId[&memberId]` | `{total_steps, avg_steps_per_day, days}` for the Steps analytics card (analytics 0.2.0 D-C5). |

## 7. Role-based view rules

Roles derive from `session.user.globalRole` (client JWT, F1) + the active program's `my_role`. The page
computes `isGlobalAdmin`, `isProgramAdmin = my_role=="admin" || isGlobalAdmin`,
`canViewAs = isProgramAdmin`, and `canAddWorkouts = isGlobalAdmin || (globalRole=="standard" &&
my_role=="admin")`
(lifestyle/page.tsx:51-56).

| Role | Sees | Can do |
|------|------|--------|
| **global_admin** | **View as** picker (with a **"None"** option); the cards show the selected member's data, or **program-wide** when "None". The header pill reads **"Manage workouts"**. Default selection = **none / program-wide**. | View-as **any** member (or none); enter `/lifestyle/workouts` to manage workout types. |
| **program admin** (`my_role=="admin"`) | Same picker **but the "None" row is labelled "Admin"**, and it **auto-selects self** on first load. Header pill **"Manage workouts"**. | View-as any member; manage workout types. |
| **logger** (`my_role=="logger"`) | **No** picker — own data only (cards keyed to `loggedInUserId`). Header pill **"View workouts"**. | View **own** lifestyle analytics; view (not manage) workout types. |
| **member** (active, non-admin/logger) | **No** picker — own data only. Header pill **"View workouts"**. | View **only their own** data; view workout types. |

**`admin_only_data_entry`:** **N/A on this page** — `/lifestyle` performs **no data entry** (every card is a
read or a forward-nav link). The lock has no effect here; it governs the workout-type CRUD on the deferred
`/lifestyle/workouts` sub-route (and the log forms on `/summary`), not this landing.

## 8. States & edge cases

- **Loading:** stat cards show "…" then "—"/"N/A"; the timeline card shows "Loading timeline…"; the popularity
  card shows "Loading workout types…".
- **Empty:** stat cards → "No data"; timeline → "No data yet."; popularity → "No workouts logged yet."
- **No member context (logger/member with no `loggedInUserId`):** the `EmptyState` "Unable to identify the
  logged-in member." renders and the member-scoped reads stay disabled.
- **No active program:** `useAuthGuard()` (default `requireProgram:true`) redirects to `/programs`.
- **Unauthenticated / expired:** edge `middleware.ts` → `/login` (or pass-through for client refresh), same
  posture as the other workspace tabs.
- **View-as persistence:** the picked member survives a reload via `sessionStorage` (key
  `rf:lifestyle:view-as:${programId}:${loggedInUserId}`); a cleared global-admin selection persists as the
  literal `"none"` (F3).
- **Forward nav:** the header pill and the timeline card point at **not-yet-built** routes
  (`/lifestyle/workouts`, `/lifestyle/timeline`) — they 404 until those specs land (F2).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Reference impl = legacy `rasifiters-webapp/src/app/lifestyle/page.tsx`. `consumed_by = [web]`.** Cross-app: the iOS home renders the same workout-type analytics + lifestyle timeline natively; parity audited at the iOS port. | `lifestyle/page.tsx`; user answer (faithful). |
| **D-SCOPE** | **This run owns the `/lifestyle` landing page only** (the read dashboard + the in-file `MemberPickerModal`), pulling in `lib/api/lifestyle.ts` + `components/ui/EmptyState.tsx`. **Deferred:** the 2 sub-routes `/lifestyle/workouts` (workout-type CRUD write path) + `/lifestyle/timeline` (timeline detail) — separate page-spec rows; links to them are forward-nav (F2). | inventory (`specs/pages/REGISTRY.md`); user answer ("Landing page only"). |
| **D-S1** | **Stance = faithful 1:1 port** — the page (role branches + the `sessionStorage` view-as persistence + the inline Recharts timeline + the popularity sorter) ported verbatim from legacy. | `lifestyle/page.tsx:1-625`; user answer ("Faithful — port local copy, flag dup"). |
| **D-C1** | **Port the whole `lib/api/lifestyle.ts` module verbatim** (6 fns) — wraps already-mounted `analytics`/`analytics-v2` routes (the run-20/21/22 "port whole shared api modules" pattern). No backend work, **no feature bump**. | `lib/api/lifestyle.ts:1-103`; backend mounted `server.js:74-76`; user answer ("Faithful"). |
| **D-C2** | **Port `components/ui/EmptyState.tsx` verbatim** — a new 10-line neutral empty-card primitive (distinct from the already-ported `ErrorState`), the page's only no-member-context fallback. | legacy `components/ui/EmptyState.tsx:1-10`; user answer (faithful). |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Client-side role from an unverified JWT decode** (`session.user.globalRole`) + the active program's `my_role` drive `isProgramAdmin` / `canViewAs` / `canAddWorkouts` — display/gating only; the backend re-verifies + re-authorizes on every analytics call. Same posture as the Summary/Members tabs' F1. | `lifestyle/page.tsx:51-56` | Kept (faithful) — not a security boundary. |
| **F2** | **Forward navigation to not-yet-built routes** — the header pill (`/lifestyle/workouts`), the timeline card (`/lifestyle/timeline?memberId`), and the sibling bottom-nav `/program` tab. These 404 until their specs land. | `lifestyle/page.tsx:177`, 282 | Kept (faithful) — targets ported in later runs. |
| **F3** | **`sessionStorage` view-as persistence** — admin selections are keyed `rf:lifestyle:view-as:${programId}:${loggedInUserId}`, storing the literal `"none"` for a cleared global-admin selection; restored + auto-selected (program-admin → self) via two parallel `useEffect`s. | `lifestyle/page.tsx:58-116`, 300-306 | Kept (faithful) — same pattern as the Members tab (members F3). |
| **F4** | **Highest-participation always program-wide** — `fetchWorkoutTypeHighestParticipation` never receives `memberId` even under view-as, so that one card ignores the selected member (matches legacy + the `analytics-v2` F4 dead member-branch). | `lifestyle/page.tsx:139-143`; `lib/api/lifestyle.ts:72-79` | Kept (faithful) — intentional program-level metric. |
| **F5** | **Over-fetched + client-sorted popularity** — `fetchWorkoutTypePopularity` pulls `limit:120` rows then sorts/slices client-side (top-10 or show-all) across 3 metrics; no server-side sort/paging. | `lifestyle/page.tsx:145-149`, 426-433 | Kept (faithful) — small payload; sorting is interactive. |
| **F6** | **Duplicated `MemberPickerModal`** — the page-local picker (search + optional "None" row) is a near-duplicate of `members/page.tsx`'s picker; **not** extracted to a shared component (the Members one was de-dup'd into a 2-variant `activePicker` form, so a shared component would add branches, not remove them). | `lifestyle/page.tsx:510-580` vs `members/page.tsx` `MemberPickerModal` | Candidate — a single shared `MemberPickerModal` could serve both tabs; left faithful (user chose "port local copy, flag dup"). |
| **F7** | **No client-side rate limiting / no refetch throttle** on the six per-member reads (consistent with the other tabs' no-throttle posture). | `lifestyle/page.tsx:121-155` | Kept (faithful) — throttling belongs server-side. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.0 | 2026-07-09 | **Two new steps cards** (analytics 0.2.0 D-C5). A **`StepsStatsCard`** (teal `#14b8a6`, new `IconSteps`; Total steps / Avg steps/day from the new `fetchStepsStats` → `GET /analytics/health/steps`, member-scoped) inserted after the Longest/Highest stat row, and a **`StepsTimelineCard`** (clone of `LifestyleTimelineCard`, single teal `steps` bar; → `/lifestyle/steps-timeline`) inserted after the Lifestyle Timeline card — both minimal faithful insertions, no reorder of existing cards (DC-9). `lib/api/lifestyle.ts` gains `StepsStats` + `fetchStepsStats` and `steps`/`daily_average_steps` on the timeline types; `lib/format.ts` gains `stepsLabel`; `components/icons` gains `IconSteps`. `npm run build` ✓. |
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker` (run 23) — the **ninth web page spec**, the program workspace **Lifestyle** tab (third bottom-nav tab). NOT a sleep/diet logging screen: a **read-only** workout-type-analytics + health-timeline overview with the same role-gated **"view as"** picker as the Members tab (4 workout-type stat cards + a sleep/diet `ComposedChart` timeline card + a sortable workout-type popularity list). Read-only — every other control is forward-nav to a deferred sub-route, so `admin_only_data_entry` is **N/A** here. Consumes `analytics` (popularity + health timeline) + `analytics-v2` (4 workout-type stats) + `program-memberships` (`fetchProgramMembers`) + `auth`; all endpoints already mounted (`server.js:74-76`), **no feature bump**. Decisions: **D-REF** (`consumed_by=[web]`; iOS home mirrors later) · **D-SCOPE** (landing page only; the 2 sub-routes `/lifestyle/{workouts,timeline}` deferred) · **D-S1** (faithful 1:1) · **D-C1** (port whole `lib/api/lifestyle.ts` verbatim) · **D-C2** (port `EmptyState.tsx` verbatim). Flagged F1–F7 (client JWT-decode role; forward-nav to unbuilt routes; `sessionStorage` view-as + 2 parallel effects; highest-participation always program-wide; over-fetched client-sorted popularity; duplicated `MemberPickerModal`; no client throttle). Ported `apps/web/src/app/lifestyle/page.tsx` + `lib/api/lifestyle.ts` + `components/ui/EmptyState.tsx`. `npm run build` ✓ (`/lifestyle` prerendered, 13.6 kB — Recharts; Middleware 27.3 kB active). |
