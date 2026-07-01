# Page: `program/edit` (web) — edit program details (program-settings sub-route 1 of 6)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.1.0 · **App:** `web` (Next.js App Router)
> **Route:** `/program/edit` — the **admin-only** program-details editor, the first of the six deferred
> `/program/*` settings sub-routes (reached from the [`program`](../SPEC.md) hub's "Edit Program Details" row).
> A single form: program **name** · **status** (`Select`) · **start/end date** · **admin-only data entry** toggle
> → `PUT /programs/:id` → back to `/program`.
> **Provenance (legacy, archived):** `rasifiters-webapp/src/app/program/edit/page.tsx`.
> **Consumes (features):** [`programs`](../../../../features/programs/SPEC.md) (`updateProgram` → `PUT /programs/:id`;
> the backend service enforces the 403 program-admin gate + fires the live `program.updated` emit), and
> [`auth`](../../../../features/auth/SPEC.md) (`useAuthGuard` + the client role for the admin redirect). The active
> program is read from / written back to `lib/storage.ts` (`saveActiveProgram`).
> **Cross-app:** the iOS admin **Settings → Edit Program** screen renders the same form natively; parity audited
> at the iOS port.
> **Stance:** faithful 1:1 port **+ three small cleanups** (D-C1 client-side date-range validation; D-C2 hydrate
> the active-program cache from the server response; D-C3 skip a no-op PUT). Oddities flagged §10.

---

## 1. What it is + who uses it

The **edit-program-details form** for the active program. A single `GlassCard` with: a **Program name** text
input, a **Status** `Select` (Planned / Active / Completed), **Start date** + **End date** date inputs, an
**Admin-only data entry** toggle (when on, only admins may add/edit/delete workouts + health logs), an inline
error line, and a **Save changes** button. Used only by a **program admin** (or global admin) — a non-admin who
reaches it is redirected back to `/program` (edit/page.tsx:34-38),
and the backend independently enforces a 403.

## 2. Why it exists

To let a program admin change the program's editable attributes — its name, lifecycle status, date window, and
the `admin_only_data_entry` lock that gates the log forms on the other workspace tabs. It is the write surface
behind the hub's read-only **Program Info** display; on success it writes the new values back into the active
program (cached in `localStorage`) and the React-Query `["programs"]` list, then returns to the hub.

## 3. Route / location

- **App:** `web`. **Route:** `/program/edit`. **Protected** — under the `middleware.ts` matcher (unauth edge
  request → `/login`); `useAuthGuard()` (default `requireProgram: true`) bounces to `/programs` with no active
  program; a client `useEffect` then bounces a **non-admin** to `/program`.
- **Reached via:** the [`program`](../SPEC.md) hub's "Edit Program Details" row (`router.push("/program/edit")`,
  admin variant only).
- **Chrome:** `PageShell maxWidth="2xl"` + `PageHeader` (title "Edit Program", `backHref="/program"`). No bottom
  nav (it is a sub-route, not a workspace tab).
- **Leaves to** (all `router.push`): `/program` — on Back, on a successful save, and on the no-op-save short
  circuit (D-C3).

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Header | `PageHeader` "Edit Program" / "Update the program details." + Back → `/program`. | edit/page.tsx:81-85 |
| Program name | Text input, controlled `name` state; Save disabled when empty. | edit/page.tsx:88-96 |
| Status | `Select` over `STATUS_OPTIONS` (planned/active/completed). | edit/page.tsx:98-103 |
| Start / End date | Two `<input type="date">` in a responsive grid. | edit/page.tsx:105-124 |
| Admin-only data entry | A `role="switch"` toggle + descriptive copy. | edit/page.tsx:128-152 |
| Error line | Inline `rf-danger` text on a failed mutation (+ the new D-C1 date-range line). | edit/page.tsx:154 |
| Save changes | Disabled until name non-empty + not pending (+ D-C1 valid range); "Saving…" while pending. | edit/page.tsx:156-166 |

## 5. Components + consumed features

- **Shared UI:** `PageShell`, `GlassCard` (already ported); `Select` (ported with create-account);
  **`PageHeader` + `BackButton` — newly ported this run** (verbatim from legacy), shared chrome for all six
  `/program/*` sub-routes.
- **Hooks/state:** `useAuthGuard` (session/program/token/programId + role); `useMutation`/`useQueryClient`
  (React Query); `saveActiveProgram` (`lib/storage.ts`).
- **Consumed features:** [`programs`](../../../../features/programs/SPEC.md) (`updateProgram`),
  [`auth`](../../../../features/auth/SPEC.md) (`useAuthGuard`).

## 6. Data / API

- **`PUT /programs/:id`** via `updateProgram(token, programId, { name, status, start_date, end_date,
  admin_only_data_entry })` ([lib/api/programs.ts:70](../../../../../../apps/web/src/lib/api/programs.ts#L70)).
  **Already mounted** ([apps/backend/routes/programs.js:34](../../../../../../apps/backend/routes/programs.js#L34)
  → `programService.updateProgram`). The service: 404 if not found → 403 unless requester is global_admin or an
  active program admin → partial update of the five fields (only `!== undefined` keys) → fires a **live**
  `program.updated` notification when a detail field changed → returns the canonical row.
- **No backend work, no feature bump** — `updateProgram` + the route + the `program.updated` emit were all
  delivered with the `programs` + `notifications` features.

## 7. Role-based view rules

| Role | Access | Notes |
|------|--------|-------|
| **global_admin** | Full form, can save. | `isProgramAdmin` true via `isGlobalAdmin`; backend skips the membership check. |
| **program admin** | Full form, can save. | `program.my_role === "admin"`. |
| **logger** | **No access** — redirected to `/program`. | Client `useEffect` redirect; backend would also 403. |
| **member** | **No access** — redirected to `/program`. | Same as logger. |

- **`admin_only_data_entry` effect:** **N/A as a gate on this page** — this is the page that *sets* the toggle.
  It does not lock the editor; it is the value being edited (and it gates the log forms on the other tabs).
- The client role is decoded from the JWT (recurring F1); the **real** authorization boundary is the backend
  403 in `updateProgram`.

## 8. States & edge cases

- **Loading:** form fields populate from the active `program` once `useAuthGuard` resolves it (a `useEffect`
  seeds the five inputs); before that they hold their empty defaults.
- **Empty name:** Save disabled (`name.trim().length > 0`).
- **Invalid date range (D-C1):** both dates set and `start >= end` → inline error + Save disabled.
- **No-op save (D-C3):** Save with nothing changed → no PUT; just navigate back to `/program`.
- **Pending:** button reads "Saving…", disabled.
- **Error:** failed mutation → inline `rf-danger` message (`error.message` or a fallback); user can retry.
- **Permission-denied:** non-admin → redirected to `/program` before interacting; an admin who lost the role
  server-side gets the backend 403 surfaced in the error line.
- **No active program:** `useAuthGuard` bounces to `/programs`.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | `consumed_by = [web]` for this page spec; the iOS Settings → Edit Program screen mirrors the same form and is audited at the iOS port. No cross-app divergence to resolve (web-only page spec). | legacy `program/edit/page.tsx`; iOS `Features/Settings/` |
| **D-SCOPE** | **This page only.** Port `/program/edit` faithful 1:1; the other five `/program/*` sub-routes (roles/profile/password/appearance/privacy) remain their own deferred rows. | per-page cadence; [`program` SPEC §3](../SPEC.md) |
| **D-DEPS** | Port **`PageHeader` + `BackButton` verbatim** into the rebuilt foundation (shared chrome, single-sourced for all six `/program/*` sub-routes) rather than inlining. | legacy `components/ui/PageHeader.tsx` + `components/BackButton.tsx` |
| **D-S1** | **Faithful 1:1** otherwise — same fields, same `Select`/toggle markup, same admin redirect, same `PUT /programs/:id` payload + back-to-`/program` flow. | edit/page.tsx |
| **D-C1** | **Client-side date-range validation** — when both dates are set and `start_date >= end_date`, show an inline error and disable Save. Legacy had none (a backwards range saved silently and read as 0% progress). Additive, low-risk. | edit/page.tsx:54-56 (legacy payload, no guard) |
| **D-C2** | **Hydrate the active program from the server response** — on success, `saveActiveProgram` from the returned `ProgramResponse` (canonical row) instead of the optimistic local form state; carry `my_role`/`my_status` over from the current program (the PUT response omits them). | edit/page.tsx:58-68 (legacy writes form state) |
| **D-C3** | **Skip a no-op PUT** — if no field changed vs the loaded program, short-circuit to `/program` without the network call. Legacy always PUTs. | edit/page.tsx:49-75 |

## 10. Flagged characteristics (kept as-is)

- **F1 — client-side admin gate via JWT-decoded role + redirect** (edit/page.tsx:24-38).
  The page derives admin-ness from the decoded JWT and redirects non-admins client-side; the authoritative
  guard is the backend 403 in `updateProgram`. Recurring across the rebuild (the same F1 on every protected
  page). Kept; not a cleanup candidate (defense-in-depth is correct).
- **F2 — `status` state default `"active"`** (edit/page.tsx:28)
  while `createProgram` defaults to `"planned"`. Inert here — the `useEffect` overwrites it from `program.status`
  before render; only matters in the sub-second before the program loads. Kept.
- **F3 — date inputs trust a `YYYY-MM-DD` shape** (edit/page.tsx:42-45).
  `program.start_date`/`end_date` are fed straight into `<input type="date">`; relies on the backend DATEONLY
  column already being date-shaped. Faithful — no normalization. Rebuild-cleanup candidate only if the API
  ever returns timestamps.
- **F4 — no client-side rate-limit / double-submit guard beyond `isPending`.** The Save button disables while
  pending; no additional throttle. Recurring across the rebuild. Kept.

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker` (run 25) — the **eleventh web page spec**, the first of the six deferred `/program/*` settings sub-routes. The **admin-only edit-program-details form** (name · status · start/end date · admin-only-data-entry toggle → `PUT /programs/:id` → back to `/program`). Decisions: **D-REF** (`consumed_by=[web]`; iOS Settings → Edit Program mirrors later) · **D-SCOPE** (this page only; other 5 `/program/*` sub-routes deferred) · **D-DEPS** (port `PageHeader` + `BackButton` verbatim as shared chrome) · **D-S1** (faithful 1:1) · **D-C1** (client-side date-range validation) · **D-C2** (hydrate active-program cache from the server response) · **D-C3** (skip a no-op PUT). Flagged F1–F4 (client JWT-decode admin gate; vestigial `status` default; date-shape trust; no client throttle). Consumes `programs` (`updateProgram`) + `auth` (`useAuthGuard`); **all endpoints already mounted, no new api modules, no feature bump.** Ported `apps/web/src/app/program/edit/page.tsx` + new shared `components/ui/PageHeader.tsx` + `components/BackButton.tsx`. `npm run build` ✓ (`/program/edit` prerendered, 5.7 kB — no Recharts; Middleware 27.3 kB active). |
