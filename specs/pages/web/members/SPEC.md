# Page: `members` (web) — the member-overview / "view-as" dashboard (second workspace tab)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.1.0 · **App:** `web` (Next.js App Router)
> **Route:** `/members` — **the second bottom-nav tab** of a program's workspace. NOT a roster-management
> screen: it is a per-member performance dashboard with a role-gated **"view as"** picker. The actual roster,
> invite form, full metrics table, and per-member detail/log views are **sub-routes, deferred** (see §3).
> **Reference impl (legacy):** `../../../../../rasifiters-webapp/src/app/members/page.tsx`
> (+ ported dep `lib/api/members.ts`).
> **Consumes (features):** [`member-analytics`](../../../features/member-analytics/SPEC.md)
> (member-metrics/history/streaks/recent), [`daily-health-logs`](../../../features/daily-health-logs/SPEC.md)
> (the health card's read), [`program-memberships`](../../../features/program-memberships/SPEC.md)
> (`fetchProgramMembers` → the view-as picker list), [`auth`](../../../features/auth/SPEC.md)
> (`useAuthGuard` + the client role), and the active program from `lib/storage.ts`.
> **Cross-app:** the iOS admin-home **Members tab** (`Features/Home/`) renders the same per-member overview
> natively; parity audited at the iOS port.
> **Stance:** faithful 1:1 port **+ two small cleanups** (D-C2 hoist `formatDuration`; D-C3 de-dup the two
> picker render blocks). Oddities flagged §10.

---

## 1. What it is + who uses it

The **member-overview dashboard** for the active program. Depending on role it shows either the signed-in
member's own performance cards or — for admins/loggers — a **"view as" picker** that swaps the cards to any
chosen member's data. The cards are: a Member Overview (PTD progress + total time + favorite + MTD workouts),
a workout-activity bar chart (week), streak stats, recent workouts, and recent daily-health logs. Program
admins additionally get a **Member Performance Metrics** preview card. Used by **every enrolled member**; what
appears (own-only vs view-as, the metrics preview, the invite button) varies by role (§7). The page is
**read-only** — every other control is forward-navigation to a sub-route.

## 2. Why it exists

To be the workspace's per-member lens: a member checks their own progress here; an admin/logger inspects any
member's progress without leaving the tab. It is the landing/hub for the members cluster — the entry point that
fans out to the roster (`/members/list`), the invite form (`/members/invite`), the full metrics table
(`/members/metrics`), and the per-member detail/log views (history/streaks/workouts/health).

## 3. Route / location

- **App:** `web`. **Route:** `/members`. **Protected** — in the `middleware.ts` matcher; an unauthenticated
  edge request → `/login`, and the page's `useAuthGuard()` (default `requireProgram: true`) is a second client
  gate that **bounces to `/programs` if no active program** is selected.
- **Reached via:** the app-wide bottom nav (`apps/web/src/app/shell.tsx` — `showNav` includes `/members`),
  the **Members** tab, once a program is active.
- **Chrome:** the bottom nav renders the 4 workspace tabs (Summary / Members / Lifestyle / Program). The
  Lifestyle / Program tabs are **forward dependencies** (F2).
- **Leaves to** (all `router.push`, all **not yet built** — F2): `/members/list` (roster) · `/members/invite`
  (send invite) · `/members/metrics` (full metrics table) · `/members/history` · `/members/streaks` ·
  `/members/workouts` · `/members/health` (per-member detail, `?memberId&name`), and `/members/detail`
  (reached from `/members/list`). **Eight sub-routes, deferred** as their own page-spec rows.

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Header | "Members" + active program name; a **View Members** pill (→ `/members/list`, shown only when `!canViewAs`) and an **Invite** mail button (→ `/members/invite`, shown when `canInvite`). | [members/page.tsx:225-251](../../../../../rasifiters-webapp/src/app/members/page.tsx#L225) |
| Metrics preview | `isProgramAdmin`-only card → `/members/metrics`; shows member count + the top member's `MemberMetricsPreview` (avatar, workouts, 6 metric pills, current-streak chip). | [members/page.tsx:253-282](../../../../../rasifiters-webapp/src/app/members/page.tsx#L253), 454-505 |
| View-as picker (admin) | `canViewAs`-only button → opens `MemberPickerModal`; shows `viewAsLabel` (selected member / "None"). | [members/page.tsx:284-294](../../../../../rasifiters-webapp/src/app/members/page.tsx#L284) |
| Empty hint | `canViewAs` + no selection → "Select a member to view their performance cards." | [members/page.tsx:296-300](../../../../../rasifiters-webapp/src/app/members/page.tsx#L296) |
| Member Overview card | PTD progress % (active_days / program total days), MTD workouts, total time, favorite workout, progress bar. | [members/page.tsx:304-308](../../../../../rasifiters-webapp/src/app/members/page.tsx#L304), 507-574 |
| Metrics single card | **Member-role only** — the signed-in member's own 6-metric pill grid + streak chip (`MemberMetricsSingleCard`). | [members/page.tsx:391](../../../../../rasifiters-webapp/src/app/members/page.tsx#L391), 576-623 |
| Workout Activity card | Clickable → `/members/history`; a Recharts `BarChart` of the member's workouts over the week + daily average. | [members/page.tsx:310-315](../../../../../rasifiters-webapp/src/app/members/page.tsx#L310), 625-669 |
| Streak Stats card | Clickable → `/members/streaks`; current + longest streak days. | [members/page.tsx:316-320](../../../../../rasifiters-webapp/src/app/members/page.tsx#L316), 671-697 |
| Recent Workouts card | Clickable → `/members/workouts`; top 3 recent workouts (`formatDuration`). | [members/page.tsx:323-326](../../../../../rasifiters-webapp/src/app/members/page.tsx#L323), 707-735 |
| Daily Health card | Clickable → `/members/health`; top 3 recent health logs (sleep / diet labels). | [members/page.tsx:327-330](../../../../../rasifiters-webapp/src/app/members/page.tsx#L327), 737-765 |
| View-as picker (logger) | `canViewAsLogger`-only second picker — scopes the **logs** cards (recent/health) to a chosen member while the overview/history/streak stay self. | [members/page.tsx:358-366](../../../../../rasifiters-webapp/src/app/members/page.tsx#L358) |
| Member Picker modal | `Modal` + search-filtered member list (+ optional "None"); single render driven by `activePicker` (D-C3). | [members/page.tsx:767-833](../../../../../rasifiters-webapp/src/app/members/page.tsx#L767) |

**Data flow.** `membersQuery` (`fetchProgramMembers`) feeds the view-as picker. The signed-in/selected member
drives six React-Query reads keyed under `["members", …]`: a metrics **preview** (admin only,
`fetchMemberMetrics` sorted), the selected member's **overview** (`fetchMemberMetrics` `memberId`), **history**
(`fetchMemberHistory` week), **streaks** (`fetchMemberStreaks`), **recent** (`fetchMemberRecentWorkouts`),
**health** (`fetchMemberHealthLogs`). `overviewMemberId` vs `logsMemberId` diverge only in the logger branch
(the logger's overview is self; the logs cards follow the logger's separate view-as pick). View-as selections
persist in `sessionStorage` under per-program/per-user keys (F3).

## 5. Components + features consumed

- **Ported-with-this-page (D-C1, verbatim):** `lib/api/members.ts` (the whole module — incl.
  `fetchMemberProfile` / `updateMemberProfile` / `sendProgramInvite`, which serve the deferred detail/invite
  sub-routes — F4). All transitive deps already in the foundation (`apiRequest`, `fetchProgramMembers`,
  `chart-theme`, the format helpers).
- **Already-ported, reused:** `useAuthGuard` (default `requireProgram:true`), `useActiveProgram` /
  `loadActiveProgram` (`lib/storage.ts`), `PageShell` / `GlassCard` / `Modal`, the `FlameIcon` / `IconMail`
  icons, the `chart-theme` tokens, `formatShortDate` / `initials` / `sleepLabel` / `dietLabel` (+ the hoisted
  `formatDuration`, D-C2) from `lib/format.ts`, Recharts, React Query.
- **Features:** [`member-analytics`](../../../features/member-analytics/SPEC.md),
  [`daily-health-logs`](../../../features/daily-health-logs/SPEC.md),
  [`program-memberships`](../../../features/program-memberships/SPEC.md),
  [`auth`](../../../features/auth/SPEC.md).

## 6. Data / API

All calls send the Supabase access JWT as `Authorization: Bearer` (via `apiRequest`); the backend
JWKS-verifies + maps `sub` → member and runs all authorization. Paths are relative to `API_BASE_URL` (which
ends in `/api`). **All endpoints are already ported + mounted** (`apps/backend/server.js`).

| Call | Endpoint | Notes |
|------|----------|-------|
| `fetchProgramMembers(token, programId)` | `GET /program-memberships/members?programId` | The active-member list for the view-as picker (id + member_name). |
| `fetchMemberMetrics(token, programId, {sort,direction})` | `GET /member-metrics?programId&sort&direction` | Admin **preview** — full list; only `.total` + `.members[0]` shown (F5 over-fetch). |
| `fetchMemberMetrics(token, programId, {memberId})` | `GET /member-metrics?programId&memberId` | The selected member's single overview (`members[0]`). |
| `fetchMemberHistory(token, programId, memberId, "week")` | `GET /member-history?programId&memberId&period=week` | `{label, daily_average, buckets[]}` for the activity chart. |
| `fetchMemberStreaks(token, programId, memberId)` | `GET /member-streaks?programId&memberId` | `{currentStreakDays, longestStreakDays, milestones[]}`. |
| `fetchMemberRecentWorkouts(token, programId, memberId, {limit:10,sortBy,sortDir})` | `GET /member-recent?programId&memberId&limit&sortBy&sortDir` | Top-10 fetched; top 3 shown on the card. |
| `fetchMemberHealthLogs(token, programId, memberId, {limit:10,sortBy,sortDir})` | `GET /daily-health-logs?programId&memberId&limit&sortBy&sortDir` | Top-10 fetched; top 3 shown on the card. |

## 7. Role-based view rules

Roles derive from `session.user.globalRole` (client JWT, F1) + the active program's `my_role`. The page
computes `isGlobalAdmin`, `isProgramAdmin = my_role=="admin" || isGlobalAdmin`, `isLogger = my_role=="logger"`,
and `canInvite = canViewAs = isProgramAdmin`, `canViewAsLogger = isLogger`
([members/page.tsx:45-51](../../../../../rasifiters-webapp/src/app/members/page.tsx#L45)).

| Role | Sees | Can do |
|------|------|--------|
| **global_admin** | Metrics preview · **View as** picker (with a **"None"** option) · the selected member's 5 cards (no "View Members" pill, no own Metrics-single card). Default selection = **none** (must pick). | View-as **any** member; invite (mail button). |
| **program admin** (`my_role=="admin"`) | Same as global_admin **but the picker has no "None"**, and it **auto-selects self** on first load. | View-as any member; invite. |
| **logger** (`my_role=="logger"`) | Own Overview + History + Streak cards; a **separate logger "View as" picker** that scopes only the **Recent Workouts + Health** cards; the **View Members** pill. No metrics preview, no invite. | View **own** progress; view-as another member's **logs** only. |
| **member** (active, non-admin/logger) | Own Overview + **Metrics-single** + History + Streak + Recent + Health cards; the **View Members** pill. No view-as, no metrics preview, no invite. | View **only their own** data. |

**`admin_only_data_entry`:** **N/A on this page** — `/members` performs **no data entry** (every card is a
read or a forward-nav link). The lock has no effect here; it governs the log forms on `/summary` and the
deferred `/members/{workouts,health}` edit sub-routes, not this landing.

## 8. States & edge cases

- **Loading:** the metrics preview shows "Loading metrics…"; cards render zeros / empty hints until their query
  resolves.
- **Empty:** Overview → "No workouts logged yet."; Recent → "No workouts logged yet."; Health → "No daily
  health logs yet."; admin with a member who has no data → metric zeros.
- **No selection (admin/global_admin):** the "Select a member…" hint shows until a member is picked.
- **No active program:** `useAuthGuard()` (default `requireProgram:true`) redirects to `/programs`.
- **Unauthenticated / expired:** edge `middleware.ts` → `/login` (or pass-through for client refresh), same
  posture as the other workspace tabs.
- **View-as persistence:** the picked member survives a reload via `sessionStorage` (per program + per user);
  global_admin's "None" persists as the literal `"none"` (F3).
- **Forward nav:** the header pills, the metrics preview, and every card click point at **not-yet-built**
  routes (F2) — they 404 until those specs land.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Reference impl = legacy `../../../../../rasifiters-webapp/src/app/members/page.tsx`. `consumed_by = [web]`.** Cross-app: the iOS admin-home Members tab renders the same per-member overview natively; parity audited at the iOS port. | `members/page.tsx`; user answer (faithful). |
| **D-SCOPE** | **This run owns the `/members` landing page only** (the view-as dashboard + the in-file `MemberPickerModal` + the 6 cards), pulling in `lib/api/members.ts`. **Deferred:** all 8 sub-routes (`/members/{list,detail,invite,metrics,history,streaks,workouts,health}`) — separate page-spec rows; links to them are forward-nav (F2). | inventory (`specs/pages/REGISTRY.md`); user answer ("Landing page only"). |
| **D-S1** | **Stance = faithful 1:1 port** — the page (3 role branches + the `sessionStorage` view-as persistence) ported verbatim from legacy; verbatim except D-C2 / D-C3. | `members/page.tsx:1-833`; user answer ("faithful + small cleanups"). |
| **D-C1** | **Port the whole `lib/api/members.ts` module verbatim** even though the landing uses only 5 of its functions — `fetchMemberProfile` / `updateMemberProfile` / `sendProgramInvite` serve the deferred detail/invite sub-routes (the run-20/21 "port whole shared api modules; later pages reuse them" pattern). | `lib/api/members.ts:1-211`; user answer ("Whole module verbatim"). |
| **D-C2** | **Hoist `formatDuration` into `lib/format.ts`** (from the page-local copy at legacy `page.tsx:699-705`) alongside `initials` / `sleepLabel` / `dietLabel`. Pure function, behavior-identical; single-sources it so the deferred `/members/workouts` + `/history` sub-routes reuse it. | `members/page.tsx:699-705`; `lib/format.ts`; user answer (pinned cleanup). |
| **D-C3** | **De-dup the two `MemberPickerModal` render blocks** (legacy `page.tsx:419-449`) into one render driven by an `activePicker` discriminant — preserving the exact per-picker differences (`allowNone` = `isGlobalAdmin` vs `false`; the admin path stores `member ? id : "none"`, the logger path stores only on a member; distinct `onClose` setters). The two pickers are mutually exclusive (admin vs logger branch), so a single render is behavior-identical. | `members/page.tsx:419-449`; user answer (pinned cleanup). |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Client-side role from an unverified JWT decode** (`session.user.globalRole`) + the active program's `my_role` drive `isProgramAdmin` / `canViewAs` / `canInvite` / `canViewAsLogger` — display/gating only; the backend re-verifies + re-authorizes (`ensureProgramAccess` on the member-analytics reads) on every call. Same posture as the summary tab's F1. | `members/page.tsx:45-51` | Kept (faithful) — not a security boundary. |
| **F2** | **Forward navigation to not-yet-built routes** — the header pills (`/members/list`, `/members/invite`), the metrics preview (`/members/metrics`), every card click (`/members/{history,streaks,workouts,health}`), and the sibling bottom-nav tabs (`/lifestyle`, `/program`). These 404 until their specs land. | `members/page.tsx:234`, 243, 256, 314-329 | Kept (faithful) — targets ported in later runs. |
| **F3** | **`sessionStorage` view-as persistence** — admin + logger selections are keyed `rf:members:view-as[-logger]:${programId}:${loggedInUserId}`, with the admin path storing the literal `"none"` for a cleared global-admin selection; restored + auto-selected via four parallel `useEffect`s. | `members/page.tsx:58-129`, 426-446 | Kept (faithful) — the 4 effects are structurally parallel but not consolidated (a structural rewrite; out of scope for a read-only page). |
| **F4** | **Vestigial-here api fns** — the whole `lib/api/members.ts` is ported (D-C1) but the landing uses only `fetchMember{Metrics,History,Streaks,RecentWorkouts,HealthLogs}`; `fetchMemberProfile` / `updateMemberProfile` (the `/members/detail` editor) and `sendProgramInvite` (the `/members/invite` form) light up on the deferred sub-routes. | `lib/api/members.ts:86-100`, 204-210 | Kept (faithful) — extra fns belong to later pages. |
| **F5** | **Over-fetched metrics preview** — the admin preview calls `fetchMemberMetrics` (the full program leaderboard) but renders only `.total` (a count) + `.members[0]` (the top member). The full table is the deferred `/members/metrics` page. | `members/page.tsx:147-155`, 274-275 | Kept (faithful) — the endpoint has no single-row count variant; cheap read. |
| **F6** | **Two near-duplicate metric renderers** — `MemberMetricsPreview` (admin preview) and `MemberMetricsSingleCard` (member-self) render overlapping 6-pill metric grids with small layout differences; not consolidated. | `members/page.tsx:454-505`, 576-623 | Candidate — a shared `MetricPills` component could merge them; left faithful (a structural change beyond the pinned cleanups). |
| **F7** | **No client-side rate limiting / no refetch throttle** on the six per-member reads (consistent with the other tabs' no-throttle posture). | `members/page.tsx:147-198` | Kept (faithful) — throttling belongs server-side. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker` (run 22) — the **eighth web page spec**, the program workspace **Members** tab (second bottom-nav tab). NOT a roster-management screen: a per-member overview dashboard with a role-gated **"view as"** picker (admin/global-admin view-as any member with optional "None"; logger own cards + a logs-scoped view-as; member own cards incl. a Metrics-single card). Read-only — every other control is forward-nav to a deferred sub-route, so `admin_only_data_entry` is **N/A** here. Consumes `member-analytics` (metrics/history/streaks/recent) + `daily-health-logs` (health card) + `program-memberships` (`fetchProgramMembers`) + `auth`; all endpoints already mounted. Decisions: **D-REF** (`consumed_by=[web]`; iOS Members tab mirrors later) · **D-SCOPE** (landing page only; the 8 sub-routes deferred) · **D-S1** (faithful 1:1) · **D-C1** (port whole `lib/api/members.ts` verbatim) · **D-C2** (hoist `formatDuration` → `lib/format.ts`) · **D-C3** (de-dup the two `MemberPickerModal` blocks via an `activePicker` discriminant, behavior-preserving). Flagged F1–F7 (client JWT-decode role; forward-nav to unbuilt routes; `sessionStorage` view-as + 4 parallel effects; vestigial-here api fns; over-fetched metrics preview; two near-duplicate metric renderers; no client throttle). Ported `apps/web/src/app/members/page.tsx` + `lib/api/members.ts`; added `formatDuration` to `lib/format.ts`. `npm run build` ✓ (`/members` prerendered, 7.78 kB — Recharts; Middleware 27.3 kB active). |
