# Page: `program` (web) — the program settings hub (fourth & last workspace tab)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.3.2 · **App:** `web` (Next.js App Router)
> **Route:** `/program` — **the fourth (last) bottom-nav tab** of a program's workspace. The settings hub:
> a role-gated menu of settings entries (program info/edit · members/invite · role management · workout types ·
> leave program · my account) for admins, or a **read-only** program-info card + switch/leave for non-admins.
> The actual editors (edit details, profile, password, appearance, privacy, roles) are **sub-routes, deferred**
> (see §3). Only **Leave Program** and **Sign Out** are live actions on the landing itself.
> **Provenance (legacy, archived):** `rasifiters-webapp/src/app/program/page.tsx`.
> **Consumes (features):** [`program-memberships`](../../../features/program-memberships/SPEC.md)
> (`fetchMembershipDetails` → the role lists + active count; `leaveProgram` → the Leave action),
> [`program-workouts`](../../../features/program-workouts/SPEC.md) (`fetchProgramWorkouts` → the workout-type
> count), [`auth`](../../../features/auth/SPEC.md) (`useAuthGuard` + `useAuth.signOut` + the client role), and the
> active program from `lib/storage.ts` (`clearActiveProgram`).
> **Cross-app:** the iOS admin-home **Program/Settings tab** (`Features/Home/` + `Features/Settings/`) renders the
> same settings hub natively; parity audited at the iOS port.
> **Stance:** faithful 1:1 port **+ two small cleanups** (D-C1 read the appearance label via `getStoredTheme()`;
> D-C2 extract the duplicated Leave Program button). Oddities flagged §10.

---

## 1. What it is + who uses it

The **program settings hub** for the active program — the workspace's "settings/account" tab. For a program
admin (or global admin) it is a menu of grouped settings cards: **Program Info** (Select Program · Edit Program
Details), **Members** (View Members · Invite Member), **Role Management** (live Admins/Loggers lists + Manage
Roles), **Workout Types** (count + entry), **Leave Program**, and **My Account** (Profile · Change Password ·
Appearance · Privacy Policy · Support · Sign Out). For a non-admin (logger/member) it collapses to a **read-only Program
Info card** (name, status, duration, a client-computed progress bar, active-member count) + **Switch Program** +
**Leave Program** + **My Account**. Used by **every enrolled member**; the menu vs read-only-card split is by
role (§7). Almost every control is forward-navigation; the only live actions on the landing are **Leave Program**
(a mutation) and **Sign Out**.

## 2. Why it exists

To be the workspace's settings + account surface: where an admin manages the program (edit details, invite,
roles, workout types) and any member manages their account (profile, password, appearance, privacy) or leaves
the program. It is the landing/hub for the program-settings cluster — the entry point that fans out to the
edit/profile/password/appearance/privacy/roles editors and re-uses the cross-tab routes (`/programs`,
`/members/{list,invite}`, `/lifestyle/workouts`).

## 3. Route / location

- **App:** `web`. **Route:** `/program`. **Protected** — in the `middleware.ts` matcher; an unauthenticated
  edge request → `/login`, and the page's `useAuthGuard()` (default `requireProgram: true`) is a second client
  gate that **bounces to `/programs` if no active program** is selected.
- **Reached via:** the app-wide bottom nav (`apps/web/src/app/shell.tsx` — `showNav` includes `/program`),
  the **Program** tab, once a program is active.
- **Chrome:** the bottom nav renders the 4 workspace tabs (Summary / Members / Lifestyle / Program); this is
  the last of them, so all four tabs now resolve to a real page.
- **Leaves to** (all `router.push`): `/programs` (switch/select program), the 6 settings sub-routes
  `/program/{edit,roles,profile,password,appearance,privacy}`, plus `/members/list` · `/members/invite` ·
  `/lifestyle/workouts`. The 6 `/program/*` sub-routes were **deferred** at port time as their own page-spec
  rows and have **all since been built** (F2).
- **Header circle (0.3.1, D-PC1):** the initials circle → `/program/profile`; Back returns here.

## 4. Contents / sections

The page renders one of **two role variants** of the body (`isProgramAdmin ? menu : read-only card`), then a
shared sign-out/account section + the leave-confirm dialog.

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Header | "Program" + active program name + the user's initials circle — a button (`aria-label="My Profile"`) that opens `/program/profile` (0.3.1, D-PC1). | program/page.tsx (`<header>`) |
| Error banner | `ErrorState` on a failed leave mutation. **0.3.0 (D-REL1):** a failed membership read (or, on the admin view, a failed workout-types read) shows the kit `ErrorView` + Retry under it; a failed refresh over shown data shows the floating "Couldn't refresh · Retry" banner. | program/page.tsx (header + `loadError` / `loadStale`) |
| **Admin variant** — Program Info | Select Program (→ `/programs`) · Edit Program Details (→ `/program/edit`, subtitle = status + date range). | program/page.tsx:104-138 |
| Admin — Members | View Members (→ `/members/list`, subtitle = active count) · Invite Member (`canInvite` → `/members/invite`). **0.2.0 (D-NP1):** behind `PEOPLE_LIVE` (on since 2026-10-13) the first row reads **`People`** · `<n> enrolled` (switched off: `View Members` · `<n> active`). | program/page.tsx (Members section) |
| Admin — Role Management | `canManageRoles`-only; live **Admins** + **Loggers** lists (`RoleList`, from membership details) + Manage Roles (→ `/program/roles`). | program/page.tsx:178-217 |
| Admin — Workout Types | Count (`{visible} available, {custom} custom`) → `/lifestyle/workouts`. | program/page.tsx:219-242 |
| **Non-admin variant** — Program Info card | Read-only `GlassCard`: Name · Status (`StatusBadge`) · Duration · a **client-computed progress bar** (`computeProgramProgress`, %/elapsed/remaining) · Active Members. | program/page.tsx:265-315 |
| Non-admin — Switch Program | → `/programs`. | program/page.tsx:317-330 |
| Leave Program | `canLeaveProgram`-only (both variants) → opens the leave-confirm dialog. Extracted to one `LeaveProgramButton` (D-C2). | program/page.tsx:244-259, 332-347 |
| My Account | Profile (→ `/program/profile`; 0.3.0: titled with the member name, subtitle `@username`, initials in the circle — D-REL1) · **`Inbox`** (0.2.0: `<n> new` + a count pill, else `Invites and notifications` → `/programs?open=inbox`) · **`Notifications`** (0.2.0 → `/program/notifications`) · Change Password (→ `/program/password`) · Appearance (→ `/program/appearance`, subtitle = stored theme label) · **`Announcements`** (0.2.0, global admins → `/program/announcements`) · Privacy Policy (0.3.2: `/privacy-policy` in a new tab — privacy-policy D-ONE) · **`Support`** (0.3.0, `Get help or contact us` → `/support` in a new tab — D-REL1) · **Sign Out** (~~live `signOut()`~~ *(superseded at v0.3.0 by D-REL1)* opens the `Sign Out?` confirm). | program/page.tsx (`MyAccountSection`) |
| Leave-confirm dialog | `ConfirmDialog` (danger) — runs `leaveMutation`; on success clears the active program, invalidates `["programs"]`, → `/programs`. | program/page.tsx:354-362 |
| Sign-out confirm (0.3.0) | `ConfirmDialog` (danger) `Sign Out?` / `Are you sure you want to sign out?` / `Sign Out` → `signOut()` → `/login`; at page root, not inside `MyAccountSection` (D-REL1). | program/page.tsx (page root) |

**Data flow.** `membershipQuery` (`fetchMembershipDetails`) → active members (`is_active`) → the active count +
the Admins/Loggers `RoleList`s. `workoutsQuery` (`fetchProgramWorkouts`) → visible + custom counts for the
Workout Types subtitle. `leaveMutation` (`leaveProgram`) is the only write. Both reads are keyed under
`["program", …]` and gated on `token && programId`.

## 5. Components + features consumed

- **Already-ported, reused (no new deps this run):** `useAuthGuard` (default `requireProgram:true`), `useAuth`
  (`signOut`), `clearActiveProgram` (`lib/storage.ts`), `getStoredTheme` (`lib/theme.ts`, D-C1),
  `fetchMembershipDetails` / `leaveProgram` / `MembershipDetail` (`lib/api/programs.ts`), `fetchProgramWorkouts`
  (`lib/api/program-workouts.ts`), `formatDateRange` / `initials` (`lib/format.ts`), `PageShell` / `GlassCard` /
  `ErrorState` / `ConfirmDialog` / `StatusBadge` + `programStatusVariant` (`components/ui/`), and 11 icons
  (`IconInfo/Users/Key/Dumbbell/User/Mail/Settings/Lock/Palette/Document/Logout`). React Query. **No new
  components, api modules, or backend routes** — this page consumes only already-mounted endpoints.
- **Features:** [`program-memberships`](../../../features/program-memberships/SPEC.md),
  [`program-workouts`](../../../features/program-workouts/SPEC.md),
  [`auth`](../../../features/auth/SPEC.md).

## 6. Data / API

All calls send the Supabase access JWT as `Authorization: Bearer` (via `apiRequest`); the backend JWKS-verifies
+ maps `sub` → member and runs all authorization. Paths are relative to `API_BASE_URL` (which ends in `/api`).
**All endpoints are already ported + mounted** (`apps/backend/server.js`).

| Call | Endpoint | Notes |
|------|----------|-------|
| `fetchMembershipDetails(token, programId)` | `GET /program-memberships/details?programId` | All memberships; the page filters `is_active`, then splits by `program_role` for the Admins/Loggers lists. |
| `fetchProgramWorkouts(token, programId)` | `GET /program-workouts?programId` | Workout-type list; the page counts `!is_hidden` (visible) + `source==="custom"` (custom). |
| `leaveProgram(token, programId)` | `PUT /program-memberships/leave` | The only write — body `{ program_id }`; success clears the active program + → `/programs`. |

## 7. Role-based view rules

Roles derive from `session.user.globalRole` (client JWT, F1) + the active program's `my_role`. The page computes
`isGlobalAdmin`, `isProgramAdmin = my_role=="admin" || isGlobalAdmin`, `canInvite = canManageRoles =
isProgramAdmin`, and `canLeaveProgram = !isGlobalAdmin`
(program/page.tsx:37-41).

| Role | Sees | Can do |
|------|------|--------|
| **global_admin** | The **admin menu** variant (Program Info · Members · Role Management · Workout Types · My Account). **No Leave Program** (`canLeaveProgram=false`). | Edit program/invite/manage roles (forward-nav); switch program; sign out. **Cannot** leave. |
| **program admin** (`my_role=="admin"`) | The **admin menu** variant **plus Leave Program**. | Same as global_admin **and** can leave the program. |
| **logger** (`my_role=="logger"`) | The **read-only Program Info card** + Switch Program + Leave Program + My Account. No menu, no role lists, no invite. | View program info; switch program; leave; manage own account; sign out. |
| **member** (active, non-admin/logger) | Same as logger — read-only Program Info card + Switch + Leave + My Account. | View program info; switch program; leave; manage own account; sign out. |

**`admin_only_data_entry`:** **N/A on this page** — `/program` performs **no workout/health data entry**; it is
settings + account management. The lock has no effect here; it governs the log forms on `/summary` and the
deferred workout/health edit sub-routes, not this hub. (Leave Program is a membership mutation, not data entry,
and is not gated by the lock.)

## 8. States & edge cases

- **Loading:** the Members count shows "Loading...", Role Management shows "Loading roles...", Workout Types
  shows "Loading...", and the non-admin Active Members row shows "—" until each query resolves.
- **Failed (D-REL1):** the Members count and Workout Types subtitle read "—" (never "0 active"), the non-admin
  Active Members row stays "—", and the page shows one `ErrorView` + Retry (membership failure first; a
  workout-types failure counts only on the admin view). A failed read reloads when the connection returns.
- **Empty:** Role Management with no admins/loggers → "No admins or loggers assigned." — only on loaded data,
  never after a failure (D-REL1).
- **Leave success:** `clearActiveProgram()` + invalidate `["programs"]` + → `/programs`. **Leave failure:** the
  `ErrorState` banner shows the mutation error; the dialog's confirm label reads "Leaving..." while pending.
- **No active program:** `useAuthGuard()` (default `requireProgram:true`) redirects to `/programs`.
- **Unauthenticated / expired:** edge `middleware.ts` → `/login` (or pass-through for client refresh), same
  posture as the other workspace tabs.
- **Appearance label:** rendered client-side after mount via `getStoredTheme()` (D-C1) — defaults to "System"
  on first paint to avoid a hydration mismatch (the raw legacy read had the same SSR guard).
- **Forward nav:** the menu rows and My Account rows point at the 6 `/program/*` sub-routes +
  `/members/{list,invite}` + `/lifestyle/workouts` — deferred at port time, **all since built** (F2).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Reference impl = legacy `rasifiters-webapp/src/app/program/page.tsx`. `consumed_by = [web]`.** Cross-app: the iOS admin-home Program/Settings tab renders the same settings hub natively; parity audited at the iOS port. | `program/page.tsx`; user answer (faithful). |
| **D-SCOPE** | **This run owns the `/program` landing page only** (the admin menu + non-admin read-only card + the leave-confirm flow + the in-file `MyAccountSection`/`RoleList`/`SectionCard` helpers). **Deferred:** all 6 `/program/*` sub-routes (`edit`, `roles`, `profile`, `password`, `appearance`, `privacy`) — separate page-spec rows; links to them (and to `/members/{list,invite}`, `/lifestyle/workouts`) are forward-nav (F2). | inventory (`specs/pages/REGISTRY.md`); user answer ("Landing only, defer 6 sub-routes"). |
| **D-S1** | **Stance = faithful 1:1 port** — both role variants + the leave mutation ported verbatim from legacy; verbatim except D-C1 / D-C2. **No feature bump** — consumes only already-mounted endpoints + already-ported deps. | `program/page.tsx:1-541`; user answer ("faithful + pinned cleanups"). |
| **D-C1** | **Read the appearance label via `getStoredTheme()`** (from `lib/theme.ts`) instead of the raw `localStorage.getItem("rf:appearance")` + manual mapping in `MyAccountSection` (legacy `page.tsx:459-463`). Single-sources the storage key (`THEME_KEY`) + valid values; behavior-identical (still a post-mount `useEffect` to avoid hydration mismatch). | `program/page.tsx:459-463`; `lib/theme.ts:1-12`; user answer (pinned cleanup). |
| **D-C2** | **Extract the duplicated Leave Program button** into one local `LeaveProgramButton` component. The button markup was byte-identical in both role branches (legacy `page.tsx:244-259` & `332-347`), both gated by `canLeaveProgram`; a single component is behavior-preserving. | `program/page.tsx:244-259`, 332-347; user answer (pinned cleanup). |
| **D-C3** | **Keep `computeProgramProgress` local (no change).** It is **client-computed** from `program.start_date`/`end_date`, semantically distinct from the summary tab's `ProgramProgressCard` which uses the **server-derived** `progress_percent`/`elapsed_days` (run-11 "client copy vs server copy"). Single-use here; not hoisted. Flagged §10 (F4). | `program/page.tsx:434-453`; `summary/page.tsx:338-347`; user answer (confirm, no change). |
| **D-REL1** | **Phase 4 polish (#33, #41).** #33 honest roster / roles / workout-type states (the Summary recipe): `Loading...` while loading, "—" only after a failed read, the role-lists empty line only on loaded data, one kit `ErrorView` + Retry (`retryNow` on the failed key) for a failed membership read or — admin view only — a failed workout-types read, the stale `FloatingBanner` at page root, refetch on reconnect (program-memberships **D-C7** #33; program-workouts **D-C3**). #41 `MyAccountSection` names the member (name + `@username` + initials, iOS ProfileRow parity), adds a **Support** row (`Get help or contact us`, opens `/support` in a new tab), and Sign Out opens a `Sign Out?` / `Are you sure you want to sign out?` / `Sign Out` confirm (the picker keeps its `Sign Out` title). | `ec13107`; polish amendments PA1 (#41 copy) |
| **D-NP1** | **Phase 4 account rows + the People label (0.2.0; notifications D-C30, people D-C13).** `MyAccountSection` gains `Inbox` (the unread `badge`: `<n> new` + a red count pill — W18; opens `/programs?open=inbox`), `Notifications` (`Choose what you're notified about` → `/program/notifications`) and, for global admins, `Announcements` (→ `/program/announcements`). The Members section's first row reads `People` · `<n> enrolled` only when `PEOPLE_LIVE` (release day; *on since 2026-10-13*); dark it keeps `View Members` · `<n> active`. | NP amendments R7, R8, NP-U1; web plan W5, W18. |
| **D-PC1** | **Touch-up (c) — the header circle opens My Profile (2026-10-13).** The header's initials circle (was a decorative `<div>`) is a `<button type="button" aria-label="My Profile">` with the same classes → `router.push("/program/profile")`; Back (`router.back()` / browser Back) returns to `/program`. Same as web summary D-PC1 and the iOS/Android Summary + Program headers. `MyAccountSection` keeps its profile row. | user, touch-up (c) (reliability HANDOFF) |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Client-side role from an unverified JWT decode** (`session.user.globalRole`) + the active program's `my_role` drive `isProgramAdmin` / `canInvite` / `canManageRoles` / `canLeaveProgram` — display/gating only; the backend re-verifies + re-authorizes every call (e.g. `leaveProgram` runs the membership-exit authz server-side). Same posture as the other workspace tabs' F1. | `program/page.tsx:37-41` | Kept (faithful) — not a security boundary. |
| ~~**F2**~~ **RESOLVED** | Forward navigation to then-unbuilt routes — the 6 `/program/*` sub-routes (edit/roles/profile/password/appearance/privacy) + `/members/list` + `/members/invite` + `/lifestyle/workouts`. **All since ported; nothing 404s.** | `program/page.tsx:123`, 144, 162, 203, 223, 469, 484, 499, 514 | Closed — targets ported in later runs. |
| **F3** | **`global_admin` cannot Leave Program** (`canLeaveProgram = !isGlobalAdmin`) yet is treated as a program admin everywhere else — a deliberate asymmetry (a global admin isn't an enrolled member to exit). | `program/page.tsx:41`, 244 | Kept (faithful) — intentional product rule. |
| **F4** | **Client-computed progress bar** — the non-admin Program Info card derives % / elapsed / remaining days locally via `computeProgramProgress(start_date, end_date)` (D-C3), distinct from summary's server-derived progress. A second, divergent progress source. | `program/page.tsx:434-453`, 292-307 | Candidate — could read the same server `analytics` progress as summary, but the legacy card intentionally avoids the analytics call here; left faithful. |
| **F5** | **Raw `rf:appearance` write contract** — the appearance label is now read via `getStoredTheme()` (D-C1), but the **value is still written** by the deferred `/program/appearance` sub-route directly to `localStorage` (the legacy contract); this page only reads it. | `program/page.tsx:455-463` | Kept (faithful) — the appearance sub-route owns the write; both ends share `lib/theme.ts`'s `THEME_KEY`. |
| **F6** | **No client-side rate limiting / no refetch throttle** on the two reads (membership details + workouts), consistent with the other tabs' no-throttle posture. | `program/page.tsx:45-55` | Kept (faithful) — throttling belongs server-side. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.3.2 | 2026-10-13 | **Privacy Policy row → the public page** (privacy-policy D-ONE): `window.open(PRIVACY_POLICY_URL)` in a new tab, like Support and the phones; the in-app `/program/privacy` copy is retired. |
| 0.3.1 | 2026-10-13 | **D-PC1 — touch-up (c).** The header initials circle is a button (`aria-label="My Profile"`, same look) → `/program/profile`; Back returns to Program. |
| 0.3.0 | 2026-10-13 | **D-REL1 — Phase 4 polish (`ec13107`).** #33 honest roster / roles / workout-type states (`Loading...`, "—" only on failure, ErrorView + Retry, stale banner, reload on reconnect); #41 signed-in-as profile row (name + `@username`), Support row (new tab), `Sign Out?` confirm. |
| 0.2.0 | 2026-10-13 | **D-NP1 — Phase 4 (`b2ea09b`).** My Account rows `Inbox` (count), `Notifications`, `Announcements` (global admins); the Members row label `People` · `<n> enrolled` behind `PEOPLE_LIVE` (dark: unchanged). |
| 0.1.1 | 2026-10-13 | Phase 4 quick wins: the Leave error goes through `toAppError` (frontend-kit D-KIT-19, #8). |
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker` (run 24) — the **ninth web page spec**, the program workspace **Program** tab (fourth & last bottom-nav tab; all four tabs now resolve). The **settings hub**: a role-gated menu (program info/edit · members/invite · role management · workout types · leave · my account) for admins, or a read-only program-info card + switch/leave for non-admins. Only **Leave Program** + **Sign Out** are live actions on the landing; everything else is forward-nav. Read-only-ish → `admin_only_data_entry` **N/A** here. Consumes `program-memberships` (`fetchMembershipDetails` + `leaveProgram`) + `program-workouts` (`fetchProgramWorkouts`) + `auth`; **all endpoints already mounted, no new deps, no feature bump**. Decisions: **D-REF** (`consumed_by=[web]`; iOS Settings tab mirrors later) · **D-SCOPE** (landing only; the 6 `/program/*` sub-routes deferred) · **D-S1** (faithful 1:1) · **D-C1** (appearance label via `getStoredTheme()` instead of raw localStorage) · **D-C2** (extract the duplicated `LeaveProgramButton`, behavior-preserving) · **D-C3** (keep `computeProgramProgress` local — client-computed, distinct from summary's server-derived progress). Flagged F1–F6 (client JWT-decode role; forward-nav to unbuilt routes; global_admin can't leave; client-computed progress; raw `rf:appearance` write contract; no client throttle). Ported `apps/web/src/app/program/page.tsx`. `npm run build` ✓ (`/program` prerendered, 4.36 kB — no Recharts; Middleware 27.3 kB active). |
