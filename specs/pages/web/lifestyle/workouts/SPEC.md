# Page: `lifestyle/workouts` (web) — workout types (lifestyle sub-route 1 of 2)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.1.0 · **App:** `web` (Next.js App Router)
> **Route:** `/lifestyle/workouts` — the program's **workout-type management** screen, the first of the two
> deferred `/lifestyle` sub-routes (reached from the [`lifestyle`](../SPEC.md) landing's
> "Manage workouts" / "View workouts" pill). A searchable list of the program's workout types — **global**
> (library) + **custom** — split into Available / Hidden, with Add / Edit / Hide-Show / Delete for admins and a
> **read-only** Available list for everyone else.
> **Provenance (legacy, archived):** `rasifiters-webapp/src/app/lifestyle/workouts/page.tsx`.
> **Consumes (features):** [`program-workouts`](../../../../features/program-workouts/SPEC.md) (all 6 routes:
> `GET /program-workouts`, `PUT /toggle-visibility`, `PUT /:id/toggle-visibility`, `POST /custom`, `PUT /:id`,
> `DELETE /:id` — the backend `requireProgramAdmin` route guard enforces the admin 403 on every write; `GET` is
> ungated) and [`auth`](../../../../features/auth/SPEC.md) (`useAuthGuard` + the client role for `canManage`).
> **Cross-app:** the iOS admin **workout-type management** screen renders the same list natively; parity audited
> at the iOS port.
> **Stance:** faithful 1:1 port **+ two small cleanups** (D-C1 `window.confirm` → `ConfirmDialog`; D-C2 clear the
> stale error on Add **and** Edit modal open). Oddities flagged §10.

---

## 1. What it is + who uses it

The **workout-type manager** for the active program. It lists every workout type the program exposes — the
shared **global** library plus the program's **custom** types — as cards, filtered by a search box and split
into **Available** (`!is_hidden`) and **Hidden** sections. A **program admin** (or global admin) can **add** a
custom type, **edit** a custom type's name, **hide/show** any type (global or custom), and **delete** a custom
type. Everyone else (logger / member) sees a **read-only** Available list — no controls, no Hidden section. It
is the write surface behind the lifestyle landing's workout pill, and the source of the workout-type vocabulary
the log forms (`/summary`) draw from
(workouts/page.tsx:21-27).

## 2. Why it exists

To let a program admin curate which workout types members can log against — surfacing the standard library,
hiding types that don't apply to this program, and adding program-specific custom types. The Available/Hidden
split is the visibility contract: hidden types disappear from the log-form pickers but stay recoverable (Show).
Custom types are fully owned by the program (editable/deletable); global library types can only be hidden/shown,
never edited or deleted from here.

## 3. Route / location

- **App:** `web`. **Route:** `/lifestyle/workouts`. **Protected** — under the `middleware.ts` matcher (unauth
  edge request → `/login`); `useAuthGuard()` (default `requireProgram: true`) bounces to `/programs` with no
  active program. **No admin redirect** — non-admins are *not* bounced; they get the read-only view (D-S1, F2).
- **Reached via:** the [`lifestyle`](../SPEC.md) landing's workout pill — `router.push("/lifestyle/workouts")`
  from **both** the "Manage workouts" (admin) and "View workouts" (non-admin) labels
  ([apps/web/src/app/lifestyle/page.tsx:177-182](../../../../../../apps/web/src/app/lifestyle/page.tsx#L177)).
- **Chrome:** `PageShell maxWidth="4xl"` + `PageHeader` (title "Workout Types", `subtitle` = program name,
  `backHref="/lifestyle"`, `actions` = the "+ Add workout" button for admins only). No bottom nav (sub-route).
- **Leaves to:** `/lifestyle` — on Back.

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Header | `PageHeader` "Workout Types" / program-name subtitle + Back → `/lifestyle`; admin-only "+ Add workout" action button. | workouts/page.tsx:116-134 |
| Search | A single `input-shell` text box filtering by `workout_name` (client-side, case-insensitive substring). | workouts/page.tsx:136-143 |
| Error line | Inline `rf-danger` text on a failed mutation. | workouts/page.tsx:145 |
| Loading | `LoadingState` ("Loading workout types...") while fetching. | workouts/page.tsx:147 |
| Available section | `WorkoutSection` "Available (n)" — the `!is_hidden` cards; shown to **all** roles. | workouts/page.tsx:151-166 |
| Hidden section | `WorkoutSection` "Hidden (n)" — the `is_hidden` cards; **admins only**, and only when `hiddenWorkouts.length > 0`. | workouts/page.tsx:168-185 |
| Workout card | Per type: name + "Custom"/"Standard" (+ " · Hidden") label; admin controls — Edit (custom & not-hidden), Hide/Show (all), Delete (custom). | workouts/page.tsx:283-332 |
| Add modal | `Modal` with a name input → `addCustomProgramWorkout`. | workouts/page.tsx:189-221 |
| Edit modal | `Modal` (open when `editTarget`) with a pre-filled name input → `editCustomProgramWorkout`. | workouts/page.tsx:223-256 |
| Delete confirm | Legacy `window.confirm(`Delete ${name}?`)` → **D-C1: `ConfirmDialog`**. | workouts/page.tsx:161-165,179-183 |

## 5. Components + consumed features

- **Shared UI (all already ported — no new dependency):** `PageShell`, `PageHeader`, `GlassCard`, `Modal`,
  `LoadingState`, and **`ConfirmDialog`** (used by D-C1). The page-local `WorkoutSection` stays co-located.
- **Hooks/state:** `useAuthGuard` (session/program/token/programId + role); `useQuery`/`useMutation`/
  `useQueryClient` (React Query); local `useState` for search, the Add/Edit modal targets, the new/edit name
  fields, the error message, and (D-C1) the delete target.
- **Consumed features:** [`program-workouts`](../../../../features/program-workouts/SPEC.md) — the whole
  `lib/api/program-workouts.ts` module (6 fns + the `ProgramWorkout` type), already ported with `summary`;
  [`auth`](../../../../features/auth/SPEC.md) (`useAuthGuard`).

## 6. Data / API

All six routes are **already mounted** at `/api/program-workouts`
([apps/backend/server.js:72](../../../../../../apps/backend/server.js#L72) →
[apps/backend/routes/programWorkouts.js](../../../../../../apps/backend/routes/programWorkouts.js)) and all six
client fns are **already ported** ([apps/web/src/lib/api/program-workouts.ts](../../../../../../apps/web/src/lib/api/program-workouts.ts)).

| Action | Client fn | Route | Backend gate |
|--------|-----------|-------|--------------|
| List | `fetchProgramWorkouts(token, programId)` | `GET /program-workouts?programId=` | `authenticateToken` only (any program member) |
| Hide/Show **global** | `toggleGlobalWorkoutVisibility(token, {program_id, library_workout_id})` | `PUT /program-workouts/toggle-visibility` | `requireProgramAdmin` → 403 |
| Hide/Show **custom** | `toggleCustomWorkoutVisibility(token, id)` | `PUT /program-workouts/:id/toggle-visibility` | `requireProgramAdmin` → 403 |
| Add custom | `addCustomProgramWorkout(token, programId, name)` | `POST /program-workouts/custom` | `requireProgramAdmin` → 403 |
| Edit custom | `editCustomProgramWorkout(token, id, name)` | `PUT /program-workouts/:id` | `requireProgramAdmin` → 403 |
| Delete custom | `deleteCustomProgramWorkout(token, id)` | `DELETE /program-workouts/:id` | `requireProgramAdmin` → 403 |

- **Query key:** `["lifestyle", "workouts", programId]`; every mutation `invalidateQueries` that key on success
  (faithful — legacy refetches, no optimistic update here, unlike `program/roles`).
- **No backend work, no feature bump** — all routes, all client fns, and the admin gate were delivered with the
  `program-workouts` feature (run 8, deployed 2026-06-28).

## 7. Role-based view rules

`canManage = globalRole === "global_admin" || (globalRole === "standard" && program?.my_role === "admin")`
(workouts/page.tsx:25-27).

| Role | Available list | Hidden section | "+ Add" / Edit / Hide-Show / Delete |
|------|---------------|----------------|-------------------------------------|
| **global_admin** | ✅ visible | ✅ visible | ✅ all controls |
| **program admin** | ✅ visible | ✅ visible | ✅ all controls |
| **logger** | ✅ visible (read-only) | ❌ hidden | ❌ no controls |
| **member** | ✅ visible (read-only) | ❌ hidden | ❌ no controls |

- Within the controls, source matters: **Edit** shows only for `source === "custom" && !is_hidden`; **Delete**
  only for `source === "custom"`; **Hide/Show** for both global and custom.
- **`admin_only_data_entry` effect: N/A.** This page is gated by **admin role**, not the data-entry lock — the
  legacy file never references `admin_only_data_entry`
  (grep confirms absent). The lock
  (set on `/program/edit`) gates whether non-admins may **log** workouts on the `/summary` forms; managing the
  workout-type *vocabulary* is always admin-only regardless of the flag. (Corrects the run-23 lifestyle-landing
  forward-inference that called this "the write path where `admin_only_data_entry` bites" — F1.)
- The client role is decoded from the JWT (recurring F3); the **real** boundary is the backend
  `requireProgramAdmin` 403 on every write route.

## 8. States & edge cases

- **Loading:** `LoadingState` ("Loading workout types...") while the list query runs.
- **Error (mutation):** inline `rf-danger` line (`error.message` or a fallback per mutation); cleared on Add/Edit
  modal open (D-C2).
- **Empty (no matches / no types):** each `WorkoutSection` renders "No workouts to show." when its list is empty.
  Faithful — no page-level empty state.
- **Search:** client-side substring filter on the loaded rows; clears to the full list when blank (F4 — it
  filters already-loaded data, not a server query).
- **Add/Edit submit:** the modal button is disabled while the name is blank (`.trim().length === 0`) or the
  mutation `isPending`; on success the modal closes and the field resets.
- **Delete:** **D-C1** — `ConfirmDialog` (danger, "Delete") replaces `window.confirm`; confirm →
  `deleteCustomProgramWorkout`. Only on custom types.
- **Non-admin:** read-only Available list, no Hidden section, no controls — **not** redirected (D-S1, F2).
- **No active program:** `useAuthGuard` bounces to `/programs`.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | `consumed_by = [web]` for this page spec; the iOS workout-type management screen mirrors the same list and is audited at the iOS port. No cross-app divergence to resolve (web-only page spec). | legacy `lifestyle/workouts/page.tsx`; iOS workout-management view |
| **D-SCOPE** | **This page only.** Port `/lifestyle/workouts` faithful 1:1; the sibling `/lifestyle/timeline` remains its own deferred row. **1st of 2** `/lifestyle` sub-routes — does **not** close the group. | per-page cadence; [`lifestyle` SPEC §3](../SPEC.md) |
| **D-DEPS** | **No new dependency.** Every import — `PageShell`/`PageHeader`/`GlassCard`/`Modal`/`LoadingState`/`ConfirmDialog`, the whole `lib/api/program-workouts.ts` module, `useAuthGuard` — is already ported (the api module landed "vestigial-here" with `summary`, run 21; the chrome leaves with the `/program/*` sub-routes). The sweep ports **only the page itself**. | [apps/web/src/lib/api/program-workouts.ts](../../../../../../apps/web/src/lib/api/program-workouts.ts); `components/ui/*` |
| **D-S1** | **Faithful 1:1** otherwise — same `canManage` admin gate (no redirect; read-only degrade for non-admins), same Available/Hidden split, same global-vs-custom control matrix, same `["lifestyle","workouts",programId]` query + invalidate-on-success (no optimistic update), same modal markup and payloads. | workouts/page.tsx |
| **D-C1** | **`window.confirm` → `ConfirmDialog`.** Replace the two native `window.confirm(`Delete ${name}?`)` prompts with the ported `ui/ConfirmDialog` (a `deleteTarget` state opens it; danger style, "Delete" confirm, `loading = deleteCustomMutation.isPending`). Matches **every** sibling — no rebuilt page uses `window.confirm`; keeping it would be the rebuild's lone divergence from its established confirm pattern. Mirrors `program/profile`'s delete flow. | workouts/page.tsx:161-165,179-183; `components/ui/ConfirmDialog.tsx` |
| **D-C2** | **Clear the stale error on Add and Edit modal open.** Legacy clears `errorMessage` only when opening the Add modal (line 125), not the Edit modal — a prior failure lingers above the sections when you open Edit. Clear it on **both** opens. | workouts/page.tsx:124-126,155,173 |

## 10. Flagged characteristics (kept as-is)

- **F1 — the page is admin-ROLE gated, not `admin_only_data_entry` gated** (workouts/page.tsx:25-27).
  `admin_only_data_entry` is never read here. The run-23 lifestyle-landing note that called this "the write path
  where `admin_only_data_entry` bites" was a forward-inference that the landing file couldn't confirm; the actual
  gate is `canManage` (admin role). Recorded here so the SPEC, not the guess, is the source of truth.
- **F2 — non-admins get a read-only DEGRADE, not a redirect** (workouts/page.tsx:121-132,168,300).
  Unlike `program/edit` and `program/roles` (which bounce non-admins to `/program`), this page renders for every
  role and merely hides the controls + the Hidden section via `canManage`. Faithful — the landing's "View
  workouts" pill intentionally routes non-admins here. Backend writes still 403.
- **F3 — client-side admin gate via JWT-decoded role** (workouts/page.tsx:25-27).
  `canManage` derives from `session.user.globalRole` + `program.my_role` (decoded JWT); the authoritative gate is
  the backend `requireProgramAdmin` 403. Recurring across the rebuild. Kept (defense-in-depth).
- **F4 — search filters already-loaded rows client-side** (workouts/page.tsx:104-109).
  The search box does a `useMemo` substring filter over `workoutsQuery.data`, not a server query — faithful, fine
  at program-workout-list scale (tens of rows).
- **F5 — global library types can only be hidden/shown, never edited/deleted here** (workouts/page.tsx:284,300-326).
  Edit/Delete render only for `source === "custom"`; the global library is shared across programs, so this page
  toggles per-program visibility only. Faithful and correct.
- **F6 — no client-side rate-limit / in-flight cross-disable** (workouts/page.tsx:52-102).
  Only the Add/Edit submit buttons gate on `isPending`; the per-card Hide/Show/Delete buttons can be re-clicked
  while a mutation settles (unlike `program/roles`' D-C3 global lock). Faithful — kept; the backend is idempotent
  enough and invalidate-refetch reconciles. Rebuild-cleanup candidate.

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker` (run 31) — the **seventeenth web page spec**, the **first of the two deferred `/lifestyle` sub-routes**. The **workout-type management** screen — searchable Available/Hidden list of global + custom types; admins Add/Edit/Hide-Show/Delete, everyone else read-only. Decisions: **D-REF** (`consumed_by=[web]`; iOS mirrors later) · **D-SCOPE** (this page only; `/lifestyle/timeline` deferred; 1st-of-2, does not close the group) · **D-DEPS** (**no new dependency** — every import already ported; sweep ports only the page) · **D-S1** (faithful 1:1: `canManage` admin gate with read-only degrade, Available/Hidden split, global-vs-custom control matrix, invalidate-on-success) · **D-C1** (`window.confirm` → `ConfirmDialog`, 2 delete sites) · **D-C2** (clear stale error on Add **and** Edit modal open). Flagged F1–F6 (admin-role gate not `admin_only_data_entry` — corrects the run-23 inference; read-only degrade not redirect; client JWT-decode admin gate; client-side search filter; global types hide/show-only; no per-card in-flight lock). Consumes `program-workouts` (all 6 routes/fns) + `auth` (`useAuthGuard`); **all endpoints already mounted, api module already ported, no feature bump.** Ported `apps/web/src/app/lifestyle/workouts/page.tsx`. `npm run build` ✓ (`/lifestyle/workouts` prerendered, 4.82 kB — no Recharts; Middleware 27.4 kB active). |
