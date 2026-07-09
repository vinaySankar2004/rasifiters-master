# Page: `members/health` (web) — per-member daily-health log manager (members sub-route 8 of 8 — CLOSES the group)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.2.0 · **App:** `web` (Next.js App Router)
> **Route:** `/members/health?memberId=&name=` — the **View Health** manager for one member, reached by the
> `/members` landing's "View Health / Daily health logs" card. Sort + filter modal + CSV export over the member's
> daily-health-log list, each row **editable** (sleep + diet modal) and **deletable**. **8th & LAST** of the eight
> deferred `/members` sub-routes (`list`/`detail`/`invite`/`metrics`/`history`/`streaks`/`workouts`/`health`) — **it
> CLOSES the group** (8/8).
> **Provenance (legacy, archived):** `rasifiters-webapp/src/app/members/health/page.tsx` (≈550 lines).
> **Consumes (features):** [`member-analytics`](../../../../features/member-analytics/SPEC.md)
> (`GET /daily-health-logs`, the list read) via the already-ported `lib/api/members.ts` `fetchMemberHealthLogs`;
> [`daily-health-logs`](../../../../features/daily-health-logs/SPEC.md) (`PUT`+`DELETE /daily-health-logs`, both gated
> by `requireDataEntryAllowed`) via `lib/api/logs.ts`; [`auth`](../../../../features/auth/SPEC.md) (`useAuthGuard`).
> **Cross-app:** `consumed_by = [web]` — iOS surfaces per-member daily-health management natively; parity audited at the iOS port.
> **Stance:** faithful 1:1 port **+ 2 cleanups** (D-C1 `window.confirm`→`ConfirmDialog`, D-C2 tokenize the Delete
> button). **No new dependency, zero backend work, no feature bump.** This is the **write path** —
> `admin_only_data_entry` is LIVE here. Oddities flagged §10. The **WRITE twin of `members/workouts` (run 45)**.

---

## 1. What it is + who uses it

The **View Health** manager for a single program member — a sorted, filterable list of the member's daily-health logs,
each rendered as a `GlassCard` row (Sleep `sleepLabel` · date · Diet `dietLabel`). Reachable controls: a **sort** field
(Date / Sleep hours / Diet quality) + direction, a **Filter** modal (date range, min/max sleep, min/max diet), an
**Export CSV** action, and — for permitted users — per-row **Edit** (a sleep + diet modal) and **Delete** (a confirm
dialog). The target member comes from the URL (`memberId` + display `name`). Reached by program staff (global_admin /
program admin / logger) for any member via the `/members` landing, or by a plain member for **their own** health logs
(a non-staff user navigating to someone else's `memberId` is redirected away — see §7).

## 2. Why it exists

The drill-down behind the `/members` landing's per-member "View Health" card. Staff (and a member, for themselves)
review the member's full daily-health record (sleep hours + diet quality 1–5) with sort/filter/export, and **correct
the record** in place — fix a logged sleep time or diet rating (Edit) or remove a mistaken entry (Delete) — without
leaving the member's context. With `members/workouts`, one of the two per-member **write** surfaces in the `/members`
group.

## 3. Route / location

- **App:** `web` (Next.js 14 App Router).
- **Path:** `/members/health` (`apps/web/src/app/members/health/page.tsx`). `export const dynamic = "force-dynamic"`
  (faithful — the page reads URL search params).
- **URL params:** `memberId` (the target member, required — drives the query + the redirect gate + the delete/update
  payloads) and `name` (display only, defaults to "Member") via `useClientSearchParams` (`page.tsx:50-52`).
- **Reached from:** the `/members` landing's "View Health" card — rendered inside the view-as / logger / member
  overview blocks, passing `memberId`+`name` (`members/page.tsx:357, 404, 441`).
- **Back:** `PageHeader backHref="/members"`.
- **Leaves to:** nowhere — the only navigation off the page is the back link, or the non-staff redirect to `/members`
  (§7). Edit/Delete mutate in place (invalidate the query); the page stays put.

## 4. Contents / sections

1. **`PageHeader`** — title "View Health", subtitle = the `name` URL param, `backHref="/members"`, and an **Export
   CSV** action button (`pill-button`, disabled when the list is empty) (`page.tsx:250-264`).
2. **Controls `GlassCard`** (`relative z-30`) (`page.tsx:266-283`):
   - Two `Select`s — **sort field** (Date / Sleep hours / Diet quality / **Steps**) and **direction** (Descending / Ascending).
   - **Filter** button — opens the filter modal; highlighted (`bg-rf-accent/20`) when any filter is active.
   - A `formattedFilters` summary chip (range · "At least/At most {sleep}" · "Diet ≥/≤/n–m") when filters are set.
3. **Error line** — `errorMessage` (mutation failures) rendered as a `text-rf-danger` `<p>` (`page.tsx:285`).
4. **List states** (`page.tsx:287-331`): `LoadingState "Loading daily health logs..."` / `EmptyState "No daily health
   logs found."` / the row list — one `GlassCard padding="sm"` per item, **stacked metric-cell layout**: a header row
   (`bg-rf-accent` dot + `logDate` semibold) over a 3-col grid of labeled `HealthMetric` cells (uppercase
   `Sleep`/`Diet`/`Steps` label over the semibold value, `bg-rf-surface-muted` fill; `sleepLabel`/`dietLabel`/`stepsLabel`,
   `—` for missing, steps thousands-grouped), with **Edit** + **Delete** buttons below when `canEdit`. (The Members-tab
   `MemberHealthCard` preview keeps the DC-10 two-line form.)
5. **Filter `Modal`** (`page.tsx:333-450`) — start/end date inputs, min/max **sleep** (hr+min `number` pairs), min/max
   **diet** `Select` (1–5), **min/max steps** (`number` inputs, echoed as "Steps ≥/≤ N", cleared by Clear-all), and a
   "Clear all filters" button. **No workout-type dropdown / no lazy `program-workouts` query** (health has no type
   vocabulary — the workouts-twin delta).
6. **Edit `Modal`** (`page.tsx:452-530`) — disabled Date field, an editable **Sleep time** (hr+min pair, digit-stripped
   `inputMode="numeric"`, 0:00–24:00 validation) + a **Diet quality** `Select` (1–5 / Not set) + a **Steps** `number`
   input (blank = clear → send `steps: null`; integer ≥ 0); Cancel/Save. `submitEdit` guards `sleepInput.isValid` AND
   **at least one metric** (sleep / diet / steps) before saving.
7. **`ConfirmDialog`** (D-C1) — the danger delete confirm (`open={!!deleteTarget}`, `loading=deleteMutation.isPending`,
   confirm → `deleteMutation.mutate(deleteTarget)`).

## 5. Components + which shared features it consumes

- **Chrome (all already ported):** `PageShell`, `PageHeader` (→ `BackButton`), `GlassCard`, `Modal`, `ConfirmDialog`,
  `LoadingState`, `EmptyState`, `Select` — landed with earlier runs; `useClientSearchParams`
  (`lib/use-client-search-params.ts`); the `rf-*` tokens.
- **New dep:** **none** — every import is already ported. `fetchMemberHealthLogs`/`MemberHealthItem`
  (`lib/api/members.ts:168, 64`, ported "vestigial-here" with the `/members` landing run 22);
  `deleteDailyHealthLog`/`updateDailyHealthLog` (`lib/api/logs.ts:83, 66`, with `/summary` run 21);
  `sleepLabel`/`dietLabel`/`downloadCsv` (`lib/format.ts:38, 43, 60` — already shared, **not** page-local, so unlike the
  workouts twin there is **no hoist cleanup**); `isDataEntryLocked` (`lib/permissions.ts:21`). The sweep ports only the
  page file. (Sized per-function — the api fns split across two families' modules; cf. run 39/40/41/45.)
- **Hooks/api:** `useAuthGuard` (`auth`), `useMutation`/`useQuery`/`useQueryClient`, `isDataEntryLocked` — all ported.
- **Page-local helpers (kept):** `formatSleepHoursForFilter` (the filter-summary "Xh Ym sleep" label) and
  `splitSleepHours` (number → {hours, minutes} strings for the edit modal) — genuinely health-specific, no shared
  equivalent → ported verbatim, not hoisted.

## 6. Data / API

- **`GET /api/daily-health-logs?programId=&memberId=&sortBy=&sortDir=&startDate=&endDate=&minSleepHours=&maxSleepHours=&minFoodQuality=&maxFoodQuality=&limit=`**
  ← `fetchMemberHealthLogs(token, programId, memberId, {...})` (`members.ts:168`). React Query key
  `["members","health",programId,memberId,sortField,sortDir,startDate,endDate,minSleepHoursNum,maxSleepHoursNum,minDietNum,maxDietNum]`,
  `enabled: !!token && !!programId && !!memberId`. Response `{ items: MemberHealthItem[], total }`.
- **`PUT /api/daily-health-logs`** ← `updateDailyHealthLog(token, { program_id, member_id, log_date, sleep_hours?,
  food_quality?, steps? })` (`logs.ts:66`) — the Edit mutation. **`member_id` is always sent** (unlike the workouts
  twin's `member_name`-only-for-others quirk); `sleep_hours`, `food_quality`, and **`steps`** are all **nullable**
  (a metric cleared to empty sends `null`). CSV export gains a Steps column (header `"Date,Sleep hours,Diet
  quality,Steps"`).
- **`DELETE /api/daily-health-logs`** ← `deleteDailyHealthLog(token, { program_id, member_id, log_date })`
  (`logs.ts:83`) — the Delete mutation. Both mutations `invalidateQueries(["members","health",programId,memberId])`
  on success.
- **Zero backend work, NO feature bump** — all three routes already mounted (`server.js:74`,
  `app.use("/api/daily-health-logs", dailyHealthLogRouter)`); GET is `authenticateToken`-only (`routes/logs.js:102`),
  and both writes are gated by `requireDataEntryAllowed` (`routes/logs.js:113, 124`). The milestone of this run is the
  page file only.

## 7. Role-based view rules

`useAuthGuard()` default (`requireProgram: true`) — no token → `/login`, no active program → `/programs`. A
**client-side per-member redirect** (`page.tsx:79-84`): `canViewAny = isGlobalAdmin || isProgramAdmin` where
`isProgramAdmin = my_role==="admin" || my_role==="logger"`; a non-`canViewAny` user whose URL `memberId` is **not their
own** id is `router.push("/members")`'d on mount. So staff may view **any** member's health logs; a plain member may
view **only their own**.

**Edit/Delete gate** — `canEdit = !isDataEntryLocked(session, program) && (canViewAny || memberId === loggedInUserId)`
(`page.tsx:60`). A single `canEdit` flag gates **both** Edit and Delete buttons (the workouts twin split
`canDelete = canEdit` — same effect). So the per-row action buttons render only when the program is **not locked for
this user** AND they are staff or the owner of the logs.

| Role | What they see / can do |
|------|------------------------|
| **global_admin** | List for **any** `memberId`; sort/filter/export; **Edit + Delete** (unless locked). Entry: the landing's View Health card. |
| **program admin** (`my_role==="admin"`) | Same — any member's health logs, Edit + Delete (unless locked). |
| **logger** (`my_role==="logger"`) | Same — any member's health logs, Edit + Delete (unless locked). |
| **member** | **Only their own** health logs (other `memberId` → redirect). Edit + Delete on **their own** logs, **unless** `admin_only_data_entry` locks them out (then read-only: sort/filter/export only). |

**`admin_only_data_entry`: LIVE (the write path).** This is a per-member **write** surface, so the lock bites — it
zeroes `canEdit` for any non-program-admin (`isDataEntryLocked` → `admin_only_data_entry && !isProgramAdmin`), hiding
both action buttons; the backend `requireDataEntryAllowed` is the real boundary (`routes/logs.js:113, 124`). The
inverse of the read-only members sub-routes (list/metrics/history/streaks, where the lock is N/A) — the run-31/36/40/45
read-vs-write-lock axis: the lock follows whether the page does *logging/mutation*. (Mirrors the workouts twin.)

**Role-gate asymmetry (F2):** the page's client redirect is **stricter** than the backend read path. The list query
(`GET /daily-health-logs`) is `authenticateToken`-only at the route and the service authorizes via `ensureProgramAccess`
(requester is an active member) + target-enrolled — it does **not** restrict which member a non-staff requester may
*read*. The mutations are separately gated by `requireDataEntryAllowed`. Faithful — the client redirect is the UX layer,
the backend is the real boundary (the run-40 `members/detail` / run-43 `members/history` / run-45 `members/workouts`
mirror).

## 8. States & edge cases

- **No `memberId`** — the redirect `useEffect` early-returns and the query is disabled (`enabled` requires
  `memberId`); the page renders header + controls only, no list. Faithful degenerate direct-nav case (the landing
  always passes `memberId`).
- **Loading** — `healthQuery.isLoading` → `LoadingState "Loading daily health logs..."`.
- **Empty** — `data && items.length === 0` → `EmptyState "No daily health logs found."`.
- **List query error** — **no `isError` branch** — a failed list query renders header + controls only, no list, no
  message (F5). Only **mutation** errors surface (the `errorMessage` line).
- **Edit guards** (`submitEdit`, `page.tsx:231-246`) — (a) invalid sleep → "Sleep time must be between 0:00 and
  24:00."; (b) **neither** sleep nor diet provided → "Provide sleep time or diet quality before saving." (the
  at-least-one-metric guard, F6 — the log-health run-37 `hasMetric` mirror).
- **Non-staff viewing another member** — `router.push("/members")` on mount before any data renders (§7).
- **Locked non-admin** — list/sort/filter/export render, but Edit/Delete buttons are hidden (`canEdit` false); a forged
  write would 403 at `requireDataEntryAllowed`.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | Faithful 1:1 port of legacy `members/health/page.tsx` (≈550 lines). `consumed_by = [web]` — iOS manages per-member daily-health natively. | `rasifiters-webapp/src/app/members/health/page.tsx` |
| **D-TWIN** | The near-exact **WRITE twin of `members/workouts` (run 45)** — same `PageShell(4xl)`/`PageHeader`+Export-CSV/controls/list/Filter-modal/Edit-modal/ConfirmDialog shape, same `canViewAny` redirect, same `admin_only_data_entry`-LIVE write gate. The decision shape (D-SCOPE/D-DEPS/D-S1/the cleanups) transcribes from the twin; only the health-metric deltas are authored. | `members/workouts/page.tsx`; run 45 |
| **D-SCOPE** | This page only — **8th & LAST of the 8 deferred `/members` sub-routes**; it **CLOSES the group** (8/8). Flip COVERAGE `/members` row to `[x]`. | `COVERAGE.md` `/members` row |
| **D-DEPS** | **No new dependency** — every import already ported across two families' modules (`members.ts` run 22, `logs.ts` run 21, `format.ts`/`permissions.ts`) + all chrome leaves; the sweep ports only the page file. Sized per-function (run 39/40/41/45). **No hoist cleanup** (unlike workouts' D-C2 — `sleepLabel`/`dietLabel` are *already* shared in `format.ts`, not page-local). | `apps/web/src/lib/api/{members,logs}.ts`, `lib/format.ts` |
| **D-WRITE** | This is a per-member **write** path (Edit/Delete daily-health logs) — so `admin_only_data_entry` is **LIVE**, gating `canEdit` (run-31/36/40/45 read-vs-write-lock axis). The four read-only members sub-routes had the lock N/A; this one (and `workouts`) bite. | `members/health/page.tsx:60` |
| **D-S1** | **Faithful otherwise** — same `force-dynamic` + `useClientSearchParams` (`memberId`/`name`), same `useAuthGuard()` + `canViewAny` redirect, same React Query key + `enabled` gate, same sort/filter/export markup, same Edit/Delete mutations + payloads (incl. always-send `member_id`, nullable `sleep_hours`/`food_quality`), the sleep 0:00–24:00 + at-least-one-metric validation, the page-local `formatSleepHoursForFilter`/`splitSleepHours` helpers, `maxWidth="4xl"`. | `members/health/page.tsx` |
| **D-C1** | **`window.confirm` → `ConfirmDialog`** — the legacy delete used the browser-native `window.confirm("Delete this daily health log?")` (`page.tsx:318`); the rebuild replaced `window.confirm` everywhere, so a `deleteTarget` state + the ported danger `ConfirmDialog` (mirroring the workouts twin run 45 / `lifestyle/workouts` run 31) keeps the page from being the lone divergence. | run 45/31 |
| **D-C2** | **Tokenize the Delete button** — `bg-red-50 … text-red-600` (`page.tsx:322`) → `bg-rf-danger/10 text-rf-danger`, exactly as the workouts twin run 45 / `members/list` run 39 tokenized; theme-aware, light-mode-identical. | run 45/39 |
| **D-STANCE** | Faithful 1:1 **+ D-C1/C2**. No hoist cleanup (deps already shared). No backend work, no feature bump (all routes + api fns already shipped). | user, this run |

## 10. Open questions / flagged characteristics (kept as-is)

- **F1 — `limit: 0` means "all", but coerces to 1000.** The page passes `limit: 0` intending "no cap"; the api fn
  coerces falsy → `"1000"` (`members.ts:196` `params.limit ? … : "1000"`). So the list is effectively capped at 1000
  rows, not unbounded. Faithful (legacy behavior); flagged — a rebuild cleanup would be an explicit "all" sentinel.
  (Shared with the workouts twin F1.)
- **F2 — role-gate asymmetry (client redirect stricter than backend read).** The page redirects a non-staff user away
  from another member's `memberId` (`page.tsx:79-84`), but the read path only enforces `ensureProgramAccess` +
  target-enrolled. Faithful; the run-40/43/45 mirror. Rebuild-cleanup candidate only if per-member read restriction
  should be server-enforced.
- **F3 — `member_id` always sent (no workouts-twin `member_name` quirk).** Unlike `members/workouts` (which sends
  `member_name` only when editing another's log, its F3), the health update/delete always pass `member_id`
  (`page.tsx:139, 155`). A genuine delta from the twin, not a flag of concern — recorded so the divergence is explicit.
- **F4 — no lazy filter query.** The workouts twin lazily fetched `program-workouts` for its type dropdown (its F4);
  the health filter has **no type vocabulary** (sleep + diet are numeric), so there is no lazy query — the workouts F4
  is **subtracted**. Recorded as the deliberate absence.
- **F5 — no list-query error state.** Like the workouts twin, this page has **no** `healthQuery.isError` branch — a
  failed list fetch renders header + controls only, silently. Only mutation errors surface (the `errorMessage` line).
  Faithful; flagged — a rebuild cleanup would add an `ErrorState` for the list query.
- **F6 — Edit modal: sleep + diet, date disabled, at-least-one-metric guard.** The Date field is disabled (display);
  Sleep time (hr+min, 0:00–24:00) and Diet quality (1–5 / Not set) are editable. `submitEdit` requires **at least one**
  of the two metrics (the log-health run-37 `hasMetric` mirror) AND valid sleep — matching the backend `PUT
  /daily-health-logs` contract (`program_id`+`member_id`+`log_date` identify the log; sleep+diet are the mutable,
  nullable fields). Faithful.
- **F7 — sleep parsing is rich + page-local.** `parseSleepInput` (validity + total-hours), `splitSleepHours`
  (number → {hours,minutes} strings with 24h clamping + 60-minute rollover), and `formatSleepHoursForFilter` are
  health-specific page-local helpers (no shared equivalent in `lib/format.ts`) — ported verbatim, not hoisted.
  Faithful.

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.1 | 2026-07-09 | **View Health row clarity refactor (cosmetic, cross-surface parity).** Each row (`GlassCard padding="sm"`) moves off the DC-10 two-line format to a **stacked metric-cell layout**: a header (`bg-rf-accent` dot + `logDate` semibold) over a 3-col grid of new `HealthMetric` cells (uppercase `Sleep`/`Diet`/`Steps` label over the semibold value, `bg-rf-surface-muted` fill), so each value reads at a glance. Formatting unchanged (`sleepLabel`/`dietLabel`/`stepsLabel`, `—` for missing, steps grouped); Edit/Delete unchanged; the Members-tab `MemberHealthCard` preview keeps the DC-10 two-line form. Matches the iOS + Android View Health rows. No contract/behavior change. `tsc --noEmit` ✓; user live-tested. |
| 0.2.0 | 2026-07-09 | **Steps throughout the manager** (daily-health-logs 0.2.0). Sort gains a **Steps** field; the filter modal gains **min/max steps** number inputs (echoed "Steps ≥/≤ N", cleared by Clear-all); list rows adopt the **DC-10 two-line** format (`Sleep · Diet · Steps`, thousands-grouped); the Edit modal gains a **Steps** number input (blank clears → `steps: null`, integer ≥ 0; at-least-one-metric now includes steps); the `updateMutation` payload + `fetchMemberHealthLogs` params gain `steps`/`minSteps`/`maxSteps`; the CSV header gains a Steps column. `npm run build` ✓. |
| 0.1.0 | 2026-06-29 | Initial faithful port of `members/health` (members sub-route 8 of 8 — **CLOSES the group**) — per-member daily-health log manager (sort + filter modal + CSV export + per-row Edit/Delete, URL `memberId`/`name`, non-staff own-only redirect, `admin_only_data_entry`-gated writes). The WRITE twin of `members/workouts` (run 45). D-C1 `window.confirm`→`ConfirmDialog`, D-C2 tokenize the Delete button; no hoist cleanup (deps already shared). No new dependency, zero backend work, no feature bump. |
