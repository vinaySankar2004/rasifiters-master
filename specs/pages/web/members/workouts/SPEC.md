# Page: `members/workouts` (web) — per-member workout log manager (members sub-route 7 of 8)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.1.0 · **App:** `web` (Next.js App Router)
> **Route:** `/members/workouts?memberId=&name=` — the **View Workouts** manager for one member, reached by the
> `/members` landing's "Recent Workouts" card. Sort + filter modal + CSV export over the member's workout-log list,
> each row **editable** (duration modal) and **deletable**. **7th** of the eight deferred `/members` sub-routes
> (`list`/`detail`/`invite`/`metrics`/`history`/`streaks`/`workouts`/`health`); does **not** close the group (`health`
> remains 8/8).
> **Reference impl (legacy):** `../../../../../../rasifiters-webapp/src/app/members/workouts/page.tsx` (≈470 lines).
> **Consumes (features):** [`member-analytics`](../../../../features/member-analytics/SPEC.md)
> (`GET /member-recent`) via the already-ported `lib/api/members.ts` `fetchMemberRecentWorkouts`;
> [`program-workouts`](../../../../features/program-workouts/SPEC.md) (`GET /program-workouts`, lazy — only the filter
> modal's type dropdown) via `lib/api/program-workouts.ts`; [`workout-logs`](../../../../features/workout-logs/SPEC.md)
> (`PUT`+`DELETE /workout-logs`, both gated by `requireDataEntryAllowed`) via `lib/api/logs.ts`;
> [`auth`](../../../../features/auth/SPEC.md) (`useAuthGuard`).
> **Cross-app:** `consumed_by = [web]` — iOS surfaces per-member workout management natively; parity audited at the iOS port.
> **Stance:** faithful 1:1 port **+ 3 cleanups** (D-C1 `window.confirm`→`ConfirmDialog`, D-C2 reuse hoisted
> `formatDuration`, D-C3 tokenize the Delete button). **No new dependency, zero backend work, no feature bump.**
> This is the **write path** — `admin_only_data_entry` is LIVE here. Oddities flagged §10.

---

## 1. What it is + who uses it

The **View Workouts** manager for a single program member — a sorted, filterable list of the member's workout logs,
each rendered as a `GlassCard` row (workout type · date · duration). Reachable controls: a **sort** field + direction,
a **Filter** modal (date range, workout type, min/max duration), an **Export CSV** action, and — for permitted users
— per-row **Edit** (a duration-only modal) and **Delete** (a confirm dialog). The target member comes from the URL
(`memberId` + display `name`). Reached by program staff (global_admin / program admin / logger) for any member via the
`/members` landing, or by a plain member for **their own** workouts (a non-staff user navigating to someone else's
`memberId` is redirected away — see §7).

## 2. Why it exists

The drill-down behind the `/members` landing's per-member Recent Workouts card. Staff (and a member, for themselves)
review the member's full workout history with sort/filter/export, and **correct the record** in place — fix a logged
duration (Edit) or remove a mistaken entry (Delete) — without leaving the member's context. It is the only per-member
**write** surface in the `/members` group.

## 3. Route / location

- **App:** `web` (Next.js 14 App Router).
- **Path:** `/members/workouts` (`apps/web/src/app/members/workouts/page.tsx`). `export const dynamic =
  "force-dynamic"` (faithful — the page reads URL search params).
- **URL params:** `memberId` (the target member, required — drives the query + the redirect gate + the delete/update
  payloads) and `name` (display only, defaults to "Member") via `useClientSearchParams` (`page.tsx:36-38`).
- **Reached from:** the `/members` landing's "Recent Workouts" card (`MemberRecentCard`) — rendered inside the view-as
  / logger / member overview blocks, passing `memberId`+`name` (`members/page.tsx:353, 400, 437`).
- **Back:** `PageHeader backHref="/members"`.
- **Leaves to:** nowhere — the only navigation off the page is the back link, or the non-staff redirect to `/members`
  (§7). Edit/Delete mutate in place (invalidate the query); the page stays put.

## 4. Contents / sections

1. **`PageHeader`** — title "View Workouts", subtitle = the `name` URL param, `backHref="/members"`, and an **Export
   CSV** action button (`pill-button`, disabled when the list is empty) (`page.tsx:215-231`).
2. **Controls `GlassCard`** (`relative z-30`) (`page.tsx:233-250`):
   - Two `Select`s — **sort field** (Date / Duration / Workout Type) and **direction** (Descending / Ascending).
   - **Filter** button — opens the filter modal; highlighted (`bg-rf-accent/20`) when any filter is active.
   - A `formattedFilters` summary chip (range · type · "At least/At most {duration}") when filters are set.
3. **Error line** — `errorMessage` (mutation failures) rendered as a `text-rf-danger` `<p>` (`page.tsx:252`).
4. **List states** (`page.tsx:254-302`): `LoadingState "Loading workouts..."` / `EmptyState "No workouts found."` /
   the row list — one `GlassCard padding="sm"` per item (type + date on the left, `formatDuration` on the right), with
   **Edit** + **Delete** buttons below when `canEdit`/`canDelete`.
5. **Filter `Modal`** (`page.tsx:304-...`) — start/end date inputs, a searchable workout-type `Select` (lazy-loaded
   from `program-workouts`), min/max duration (hr+min pairs), and a "Clear all filters" button.
6. **Edit `Modal`** — disabled Workout + Date fields, an editable Duration (hr+min) pair, Cancel/Save; `submitEdit`
   guards `duration > 0`.
7. **`ConfirmDialog`** (D-C1) — the danger delete confirm (`open={!!deleteTarget}`, `loading=deleteMutation.isPending`,
   confirm → `deleteMutation.mutate(deleteTarget)`).

## 5. Components + which shared features it consumes

- **Chrome (all already ported):** `PageShell`, `PageHeader` (→ `BackButton`), `GlassCard`, `Modal`, `ConfirmDialog`,
  `LoadingState`, `EmptyState`, `Select` — landed with earlier runs; `useClientSearchParams`
  (`lib/use-client-search-params.ts`); the `rf-*` tokens.
- **New dep:** **none** — every import is already ported. `fetchMemberRecentWorkouts`/`MemberRecentItem`
  (`lib/api/members.ts:52, 136`, ported "vestigial-here" with the `/members` landing run 22); `fetchProgramWorkouts`
  (`lib/api/program-workouts.ts`, with the `program-workouts` feature); `deleteWorkoutLog`/`updateWorkoutLog`
  (`lib/api/logs.ts:94, 105`, with `/summary` run 21); `formatDuration`/`escapeCsv`/`downloadCsv` (`lib/format.ts:48,
  56, 60` — `formatDuration` hoisted there in run 22); `isDataEntryLocked` (`lib/permissions.ts:21`). The sweep ports
  only the page file. (Sized per-function — the api fns split across **three** families' modules; cf. run 39/40/41.)
- **Hooks/api:** `useAuthGuard` (`auth`), `useMutation`/`useQuery`/`useQueryClient`, `isDataEntryLocked` — all ported.

## 6. Data / API

- **`GET /api/member-recent?programId=&memberId=&sortBy=&sortDir=&startDate=&endDate=&workoutType=&minDuration=&maxDuration=&limit=`**
  ← `fetchMemberRecentWorkouts(token, programId, memberId, {...})` (`members.ts:136`). React Query key
  `["members","workouts",programId,memberId,sortField,sortDir,startDate,endDate,workoutType,minDurationNum,maxDurationNum]`,
  `enabled: !!token && !!programId && !!memberId`. Response `{ items: MemberRecentItem[], total }`.
- **`GET /api/program-workouts?programId=`** ← `fetchProgramWorkouts(token, programId)`, key `["program-workouts",
  programId]`, **`enabled` only when `showFilter`** (lazy — the filter modal's type dropdown). Visible
  (`!is_hidden`) names become the options.
- **`PUT /api/workout-logs`** ← `updateWorkoutLog(token, { program_id, workout_name, date, duration, member_name? })`
  (`logs.ts:105`) — the Edit mutation. **`member_name` is sent only when editing someone else's log**
  (`memberId === loggedInUserId ? undefined : memberName`).
- **`DELETE /api/workout-logs`** ← `deleteWorkoutLog(token, { program_id, member_id, workout_name, date })`
  (`logs.ts:94`) — the Delete mutation. Both mutations `invalidateQueries(["members","workouts",programId,memberId])`
  on success.
- **Zero backend work, NO feature bump** — all three routes already mounted (`server.js:72, 73, 80`) and the two
  writes gated by `requireDataEntryAllowed` (`routes/logs.js:64, 75`); the milestone of this run is the page file only.

## 7. Role-based view rules

`useAuthGuard()` default (`requireProgram: true`) — no token → `/login`, no active program → `/programs`. A
**client-side per-member redirect** (`page.tsx:70-75`): `canViewAny = isGlobalAdmin || my_role==="admin" ||
my_role==="logger"`; a non-`canViewAny` user whose URL `memberId` is **not their own** id is
`router.push("/members")`'d on mount. So staff may view **any** member's workouts; a plain member may view **only their
own**.

**Edit/Delete gate** — `canDelete = canEdit = !isDataEntryLocked(session, program) && (isGlobalAdmin || admin ||
logger || memberId === loggedInUserId)` (`page.tsx:46-53`). So the per-row action buttons render only when the program
is **not locked for this user** AND they are staff or the owner of the logs.

| Role | What they see / can do |
|------|------------------------|
| **global_admin** | List for **any** `memberId`; sort/filter/export; **Edit + Delete** (unless locked). Entry: the landing's Recent Workouts card. |
| **program admin** (`my_role==="admin"`) | Same — any member's workouts, Edit + Delete (unless locked). |
| **logger** (`my_role==="logger"`) | Same — any member's workouts, Edit + Delete (unless locked). |
| **member** | **Only their own** workouts (other `memberId` → redirect). Edit + Delete on **their own** logs, **unless** `admin_only_data_entry` locks them out (then read-only: sort/filter/export only). |

**`admin_only_data_entry`: LIVE (the write path).** This is the per-member **write** surface, so the lock bites — it
zeroes `canEdit`/`canDelete` for any non-program-admin (`isDataEntryLocked` → `admin_only_data_entry &&
!isProgramAdmin`), hiding both action buttons; the backend `requireDataEntryAllowed` is the real boundary
(`routes/logs.js:64, 75`). This is the inverse of the read-only members sub-routes (list/metrics/history/streaks, where
the lock is N/A) — the run-31/36/40 read-vs-write-lock axis: the lock follows whether the page does *logging/mutation*.

**Role-gate asymmetry (F2):** the page's client redirect is **stricter** than the backend read path. The list query
(`getMemberRecent`) authorizes via `ensureProgramAccess` (requester is an active member) + target-enrolled — it does
**not** restrict which member a non-staff requester may *read*. The mutations are separately gated by
`requireDataEntryAllowed` + the logs service. Faithful — the client redirect is the UX layer, the backend is the real
boundary (the run-40 `members/detail` / run-43 `members/history` mirror).

## 8. States & edge cases

- **No `memberId`** — the redirect `useEffect` early-returns and the query is disabled (`enabled` requires
  `memberId`); the page renders header + controls only, no list. Faithful degenerate direct-nav case (the landing
  always passes `memberId`).
- **Loading** — `workoutsQuery.isLoading` → `LoadingState "Loading workouts..."`.
- **Empty** — `data && items.length === 0` → `EmptyState "No workouts found."`.
- **List query error** — **no `isError` branch** — a failed list query renders header + controls only, no list, no
  message (F5). Only **mutation** errors surface (the `errorMessage` line).
- **Edit guard** — `submitEdit` blocks `duration <= 0` with "Enter a valid duration before saving." (inline).
- **Non-staff viewing another member** — `router.push("/members")` on mount before any data renders (§7).
- **Locked non-admin** — list/sort/filter/export render, but Edit/Delete buttons are hidden (`canEdit`/`canDelete`
  false); a forged write would 403 at `requireDataEntryAllowed`.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | Faithful 1:1 port of legacy `members/workouts/page.tsx` (≈470 lines). `consumed_by = [web]` — iOS manages per-member workouts natively. | `rasifiters-webapp/src/app/members/workouts/page.tsx` |
| **D-SCOPE** | This page only — **7th of the 8 deferred `/members` sub-routes**; does **not** close the group (`health` remains 8/8). | `COVERAGE.md` `/members` row |
| **D-DEPS** | **No new dependency** — every import already ported across three families' modules (`members.ts` run 22, `program-workouts.ts`, `logs.ts` run 21, `format.ts`/`permissions.ts`) + all chrome leaves; the sweep ports only the page file. Sized per-function (run 39/40/41 — the import path is the source of truth, not the family). | `apps/web/src/lib/api/{members,program-workouts,logs}.ts`, `lib/format.ts` |
| **D-WRITE** | This is the per-member **write** path (Edit/Delete workout logs) — so `admin_only_data_entry` is **LIVE**, gating `canEdit`/`canDelete` (run-31/36/40 read-vs-write-lock axis). The four read-only members sub-routes had the lock N/A; this one bites. | `members/workouts/page.tsx:46-53` |
| **D-S1** | **Faithful otherwise** — same `force-dynamic` + `useClientSearchParams` (`memberId`/`name`), same `useAuthGuard()` + `canViewAny` redirect, same React Query keys + `enabled` gates, same sort/filter/export markup, same Edit/Delete mutations + payloads (incl. the `member_name`-only-for-others quirk, F3), `maxWidth="4xl"`. | `members/workouts/page.tsx` |
| **D-C1** | **`window.confirm` → `ConfirmDialog`** — the legacy delete used the browser-native `window.confirm("Delete this workout log?")`; the rebuild replaced `window.confirm` everywhere, so a `deleteTarget` state + the ported danger `ConfirmDialog` (mirroring `lifestyle/workouts` run 31) keeps the page from being the lone divergence. | `lifestyle/workouts/page.tsx:258-269`; run 31 |
| **D-C2** | **Reuse hoisted `formatDuration`** — drop the page-local copy (byte-identical body) and import `formatDuration` from `lib/format.ts`, where run 22 hoisted it; pure single-sourcing. | `lib/format.ts:48`; run 22 |
| **D-C3** | **Tokenize the Delete button** — `bg-red-50 … text-red-600` → `bg-rf-danger/10 text-rf-danger`, exactly as run 39 tokenized `members/list`'s "Inactive" badge; theme-aware, light-mode-identical. | `members/list` D-C; run 39 |
| **D-STANCE** | Faithful 1:1 **+ D-C1/C2/C3**. No backend work, no feature bump (all routes + api fns already shipped). | user, this run |

## 10. Open questions / flagged characteristics (kept as-is)

- **F1 — `limit: 0` means "all", but coerces to 1000.** The page passes `limit: 0` intending "no cap"; the api fn
  coerces falsy → `"1000"` (`members.ts:152` `params.limit ? … : "1000"`). So the list is effectively capped at 1000
  rows, not unbounded. Faithful (legacy behavior); flagged — a rebuild cleanup would be an explicit "all" sentinel.
- **F2 — role-gate asymmetry (client redirect stricter than backend read).** The page redirects a non-staff user away
  from another member's `memberId` (`page.tsx:70-75`), but `getMemberRecent` only enforces `ensureProgramAccess` +
  target-enrolled. Faithful; the run-40/43 mirror. Rebuild-cleanup candidate only if per-member read restriction
  should be server-enforced.
- **F3 — `member_name` sent only when editing someone else's log.** `updateWorkoutLog`'s `member_name` is
  `memberId === loggedInUserId ? undefined : memberName` (`page.tsx:158`) — editing your own log omits it; editing
  another member's passes the display name (the backend resolves the target by name in that path). Faithful, load-bearing.
- **F4 — `program-workouts` is lazy-loaded.** The workout-type filter options query is `enabled` only when `showFilter`
  is true (`page.tsx:80`) — the dropdown's vocabulary is fetched on first filter-open, not page-load. Faithful
  (deliberate — most viewers never open the filter).
- **F5 — no list-query error state.** Unlike its read twins (streaks/history use `ErrorState`), this page has **no**
  `workoutsQuery.isError` branch — a failed list fetch renders header + controls only, silently. Only mutation errors
  surface (the `errorMessage` line). Faithful; flagged — a rebuild cleanup would add an `ErrorState` for the list query.
- **F6 — Edit modal edits duration only.** Workout type + date are disabled (display) fields; only the duration is
  editable, matching the backend `PUT /workout-logs` contract (type+date identify the log, duration is the mutable
  field). Faithful.

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-29 | Initial faithful port of `members/workouts` (members sub-route 7 of 8) — per-member workout-log manager (sort + filter modal + CSV export + per-row Edit/Delete, URL `memberId`/`name`, non-staff own-only redirect, `admin_only_data_entry`-gated writes). D-C1 `window.confirm`→`ConfirmDialog`, D-C2 reuse hoisted `formatDuration`, D-C3 tokenize the Delete button. No new dependency, zero backend work, no feature bump. |
