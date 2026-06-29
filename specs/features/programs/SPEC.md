# Feature: `programs` — program lifecycle (create / list / update / soft-delete)

> **Status:** 🏗️ built (ported to `apps/backend/`) · **Version:** 0.1.0 · **Apps (`consumed_by`):** `web`, `ios`
> **Reference impl (legacy):** `../../../backend` — `routes/programs.js`, `services/programService.js`,
> `models/Program.js`, `models/ProgramMembership.js`, `server.js` (`/api/programs` mount).
> **Depends on:** [`auth`](../auth/SPEC.md) (every route applies `authenticateToken`; authz via
> `ProgramMembership` lookup) · `program-memberships` (the `ProgramMembership` join the creator-row + authz
> read) · `notifications` (the `program.updated`/`program.deleted` emit — **deferred**, §7).
> **One deliberate change** (the rest is faithful): `createProgram` **drops the vestigial `description`
> field** — see **§7** (decision **D-C2**).

---

## 1. What it is

The **program lifecycle** of RaSi Fiters — the four `/api/programs` routes over the `programs` table. A
*program* is the top-level container every membership, invite, workout, log, and analytics row hangs off
(via `program_id`). The four routes:

1. **List my programs** — `GET /api/programs`. Returns each program the requester can see, decorated with
   membership counts, the requester's own `my_role`/`my_status`, and a computed `progress_percent`. Two
   visibility branches: a `global_admin` sees **all** non-deleted programs; everyone else sees **only the
   programs they belong to**. Used by both clients.
2. **Create a program** — `POST /api/programs`. Creates the program **and** enrolls the creator as an
   `active` `admin` member, transactionally. Used by both clients.
3. **Update a program** — `PUT /api/programs/:id`. Edits `name`/`status`/`start_date`/`end_date`/
   `admin_only_data_entry`; gated to a program `admin` or `global_admin`. Used by both clients (but the
   `admin_only_data_entry` toggle is **web-only** — §7 / D-REF).
4. **Soft-delete a program** — `DELETE /api/programs/:id`. Sets `is_deleted = true` (no hard cascade);
   same admin gate. Used by both clients.

## 2. Why it exists

`programs` is the **organizing container** for the whole app: members enroll into a program, log workouts
and health against it, and analytics aggregate within it. Clients need to (a) list the programs a user
participates in (with their role + progress), (b) spin up a new program (auto-making the creator its
admin), (c) edit its schedule/name/status and flip the admin-only-data-entry lock, and (d) retire it.
Authorization stays in Express (program-admin checks via `ProgramMembership`), per the auth model — we do
not rely on RLS.

## 3. Functionality (the routes)

All mounted at **`/api/programs`** (legacy `routes/programs.js`). Handlers in `routes/programs.js`; logic in
`services/programService.js`. Every route is `authenticateToken`-only at the router; the **admin gate lives
in the service** (`updateProgram`/`deleteProgram` do the `ProgramMembership` lookup) — like the members
own-profile gate (members SPEC F4).

| # | Route | Legacy handler | Auth (effective) | Purpose |
|---|-------|----------------|------------------|---------|
| 1 | `GET /` | `programs.js:8-17` → `getPrograms` (`programService.js:6-68`) | any authenticated member | List visible programs (global-admin: all; else: own), decorated. |
| 2 | `POST /` | `programs.js:19-28` → `createProgram` (`programService.js:70-113`) | any authenticated member | Create program + enroll creator as `active`/`admin`. 201. |
| 3 | `PUT /:id` | `programs.js:30-39` → `updateProgram` (`programService.js:115-176`) | program `admin` **or** `global_admin` (service-enforced) | Update fields; flip `admin_only_data_entry`; emit `program.updated` (deferred). |
| 4 | `DELETE /:id` | `programs.js:41-50` → `deleteProgram` (`programService.js:178-204`) | program `admin` **or** `global_admin` (service-enforced) | Soft-delete (`is_deleted=true`); emit `program.deleted` (deferred). |

### Response shapes (preserved 1:1, except the `description` drop in §7)

- **`GET /`** (`programService.js:11-67`): a JSON array of program rows, each:
  `{ id, name, status, start_date, end_date, is_deleted, created_at, updated_at, admin_only_data_entry,
  total_members, active_members, my_role, my_status, progress_percent }`. `total_members`/`active_members`
  are integer active-member counts (always equal — §10 F2); `my_role`/`my_status` come from the requester's
  own membership row (null if none); `progress_percent` is the 0–100 elapsed-time integer (§4).
- **`POST /`** (`programService.js:100-108`, HTTP 201): `{ id, name, status, start_date, end_date, message
  }` — **`description` removed** from this object (§7 / D-C2; legacy returned it at `:106`).
- **`PUT /:id`** (`programService.js:167-175`): `{ id, name, status, start_date, end_date,
  admin_only_data_entry, message }`.
- **`DELETE /:id`** (`programService.js:203`): `{ id, message: "Program deleted successfully." }`.

### Error contract (faithful — `routes/programs.js` + `utils/response.AppError`)

`AppError(statusCode, message)` → `{ error: message }`; any other throw → `500` with a route-specific
generic (`"Failed to fetch programs"`, `"Failed to create program."`, etc.). Status codes: `400` (missing
/ blank program `name` on create), `403` (`updateProgram`/`deleteProgram` requester is not a program admin
and not `global_admin`), `404` (program not found / already soft-deleted).

## 4. Feature list (behaviors to port)

- **List — two visibility branches** (`programService.js:10-67`). `global_admin` → raw SQL over all
  `programs WHERE is_deleted = false`, `LEFT JOIN program_memberships` for counts + a second
  `LEFT JOIN … member_id = :userId` for `my_role`/`my_status`. Non-admin → the same projection but an
  `INNER JOIN program_memberships pm_user … member_id = :userId AND pm_user.status IN
  ('active','invited','requested')` (so you see programs you're active/invited/requested in) + a
  `LEFT JOIN … status = 'active'` for counts. Both `ORDER BY p.start_date ASC`. **Kept as raw
  `sequelize.query` verbatim** (D-S2).
- **`progress_percent`** (`programService.js:19-27, 46-54`) — `0` unless both dates set and
  `end_date > start_date`; else `LEAST(100, GREATEST(0, ((CURRENT_DATE - start_date) / (end_date -
  start_date)) * 100))::int`. Time-elapsed bar; recomputed server-side each request.
- **Create** (`programService.js:70-113`) — require non-blank `name` (`400` else); coerce `status` to one
  of `planned|active|completed` (default `planned`, `:75-76`); **transaction**: `Program.create({ name
  (trimmed), status, start_date|null, end_date|null, created_by: requester.id, is_deleted:false })` then
  `ProgramMembership.create({ program_id, member_id: requester.id, role:'admin', status:'active',
  joined_at: today })`; commit. Rollback → `AppError(500)`. **`description` is dropped** (D-C2): no longer
  destructured, persisted, or returned.
- **Update** (`programService.js:115-176`) — `404` if no non-deleted program; **authz**: unless
  `global_admin`, require an `active` `admin` `ProgramMembership` for the requester (`403` else). Snapshot
  the before-values, then apply only the **present** fields among `name`/`status`/`start_date`/`end_date`/
  `admin_only_data_entry` (the flag coerced via `=== true || === 'true'`, `:139-141`); set `updated_at =
  new Date()` (§10 F3). If any of `name|status|start_date|end_date|admin_only_data_entry` actually changed,
  **emit `program.updated`** to active members — **deferred** (§7).
- **Soft-delete** (`programService.js:178-204`) — same admin authz gate **first**, then `404` if no
  non-deleted program, then `program.update({ is_deleted:true, updated_at })`. **No hard cascade** (rows
  stay; queries filter `is_deleted=false`). Then **emit `program.deleted`** to active members — **deferred**
  (§7).

## 5. Data / schema touchpoints

Faithful names (R5); schema in `apps/backend/sql/001_schema.sql`.

- **`programs`** (owned — read + write) — `id` (UUID), `name`, `status` (`planned|active|completed`),
  `start_date`/`end_date` (DATEONLY, nullable), `description` (TEXT, nullable — **column kept, write path
  removed** per D-C2), `created_by` (UUID → `members.id`, nullable), `is_deleted` (bool),
  `admin_only_data_entry` (bool, default false), `created_at`/`updated_at`. `models/Program.js`
  (`timestamps:false`, `underscored:true`).
- **`program_memberships`** (read for authz + counts; **written by `createProgram`** — the creator's
  `admin`/`active` row) — `program_id`, `member_id`, `role`, `status`, `joined_at`. Owned by the
  `program-memberships` feature; `programs` only creates the one bootstrap row + reads for the admin gate
  and member counts.
- **Referenced for the notification emit, owned by `notifications`** — `getActiveProgramMemberIds` +
  `createNotification` (`utils/notifications.js` → `notificationStreams` SSE + `pushNotifications` APNs).
  **Deferred** (D-C1) — not ported with this feature.

## 6. Flags / env

No programs-specific env. DB access via the shared `DATABASE_URL` (`config/database.js`). `progress_percent`
depends on the DB's `CURRENT_DATE` (server clock / timezone). **`admin_only_data_entry`** is a per-program
row flag (not env): set only via `PUT /:id`, read in `GET /`; it **gates data-entry in the logging features**
(workout-logs / daily-health-logs), *not* enforced inside `programs` itself (§10 F4).

## 7. The migration delta + the one deliberate change — the load-bearing part

**What stays (faithful 1:1):** all four route paths + their `authenticateToken` gate, the service-level
program-admin authz (global-admin bypass), the two raw-SQL `getPrograms` branches (D-S2), the
`progress_percent` math, the create transaction (program + creator `admin`/`active` membership), the
`status` coercion + default, the present-fields-only update whitelist, the `admin_only_data_entry`
coercion, the soft-delete semantics (no cascade), the response shapes (minus `description`), and the error
contract.

**What changes:**

- **`createProgram` drops the vestigial `description` field (D-C2 — the single deliberate cleanup).**
  Legacy `createProgram` destructured `description` from the body, persisted it to `programs.description`,
  and returned it in the 201 body (`programService.js:70, 85, 106`). But **no client sends it** (web POST
  omits it — `programs/page.tsx:104`; iOS omits it — `APIClient+Programs.swift:51-68`), `updateProgram`
  can't change it, and `getPrograms` never returns it — a write-only, half-wired field. The rebuild stops
  destructuring/persisting/returning `description` in `createProgram`. The **`programs.description` column
  is kept in schema** (faithful R5 — no schema change), just no longer written by this path. All other
  create behavior + the 201 shape (minus that one key) is unchanged.
- **The `program.updated` / `program.deleted` notification emit is deferred (D-C1 — the deferred
  dependency pattern, cf. auth `/account` + members `DELETE /:id`).** `updateProgram` (on a real field
  change) and `deleteProgram` call `createNotification` + `getActiveProgramMemberIds` from
  `utils/notifications`, which pulls in the SSE streams + APNs push of the undocumented `notifications`
  feature. The CRUD ports **fully functional** (200s, soft-delete, flag write all work); only the
  member-alert side-effect is left as a **guarded TODO no-op**, wired when `notifications` is ported. This
  is a *temporary implementation gap, not a spec change* — faithful behavior is the emit.

> **Migration note (no auth-table delta here).** Unlike `auth`/`members`, `programs` touches none of the
> retired credential tables; the only stack delta is `DATABASE_URL` (shared). The two deltas above are the
> whole story.

## 8. Dependencies

- **Upstream:** [`auth`](../auth/SPEC.md) — `authenticateToken` establishes `req.user` (`id`, `global_role`);
  the service reads `requester.global_role`/`requester.id` for the admin gate.
- **Sibling (read + one write):** `program-memberships` — owns `program_memberships`; `programs` creates the
  creator's bootstrap row and reads memberships for authz + counts.
- **Downstream / referenced (deferred):** `notifications` — owns `createNotification` +
  `getActiveProgramMemberIds`; the `program.updated`/`program.deleted` emits wire up when it lands (D-C1).
- **Consumers:** `web` (programs hub `programs/page.tsx`, edit page `program/edit/page.tsx`,
  `NotificationsGate.tsx` refresh) + `ios` (`ProgramPickerView`, `CreateProgramTabView`,
  `EditProgramInfoView`, `ProgramContext+*`).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-C1** | **Scope = the four `/api/programs` routes + `programService`.** The `program.updated`/`program.deleted` notification emit is a **referenced dependency** (owned by `notifications`, which drags in SSE + APNs) → deferred to a guarded TODO no-op; CRUD ports fully functional. Wired when `notifications` lands. Faithful to the auth `/account` + members `DELETE` deferrals. | `programService.js:153-164, 191-201`; `utils/notifications.js`; auth/members SPEC D-C1. |
| **D-C2** | **`createProgram` drops the vestigial `description` field** (stop destructuring/persisting/returning it) — the single deliberate cleanup. No client sends it; update can't change it; list never returns it. The `programs.description` column is kept in schema (R5). | `programService.js:70, 85, 106`; web `programs/page.tsx:104`; iOS `APIClient+Programs.swift:51-68`; user decision. |
| **D-S2** | **`getPrograms` keeps both raw `sequelize.query` branches verbatim** (global-admin-all vs member-INNER-JOIN), incl. the `progress_percent` CASE + active-member counts — no ORM rewrite (divergence risk on a load-bearing read). | `programService.js:6-68`; user decision. |
| **D-REF** | **Reference impl = legacy `../../../backend`. `consumed_by = [web, ios]`** — both clients call all four routes. **Cross-app divergence:** `admin_only_data_entry` is **web-only** (web edit-page toggle reads + writes it; iOS `ProgramDTO` never decodes/sets it). The backend faithfully serves/accepts it for both clients regardless — kept as-is (§10 F1). | Web + iOS consumption sweep (Explore agents); `program/edit/page.tsx:136-151`; `APIClient+Programs.swift:5-17`. |
| **D-S1** | **Stance = faithful 1:1 except the `description` drop (D-C2).** Routes, authz gates, raw SQL, transaction, response shapes, error contract preserved; remaining oddities kept + flagged (§10), not fixed. | Whole-module review; §7. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **`admin_only_data_entry` is web-only** — web's edit page reads + writes the toggle; iOS never decodes or sets it. The backend serves/accepts it for both clients identically. | `program/edit/page.tsx:136-151`; `APIClient+Programs.swift:5-17` | Kept (D-REF) — a client divergence, not a backend change. |
| **F2** | **`total_members` and `active_members` are always equal** — both branches count the same `status='active'` set under two aliases. | `programService.js:15-16, 42-43` | Kept (faithful) — both clients read both keys; collapsing would break them. |
| **F3** | **`updateProgram` sets `updated_at` manually** despite `Program` having `timestamps:false`; `deleteProgram` does the same on soft-delete. | `programService.js:142, 189` | Kept (faithful). |
| **F4** | **`admin_only_data_entry` is read/written here but enforced elsewhere** — the lock that blocks non-admin logging lives in the logging features (workout-logs / daily-health-logs), not in `programs`. | `programService.js:139-141` | Kept (faithful) — cross-feature gate, owned downstream. |
| **F5** | **Both clients decode an `enrollments_closed` field that `getPrograms` never returns** — it resolves to undefined/nil on web + iOS. | web `programs/page.tsx`; `APIClient+Programs.swift:5-17` | Kept (faithful) — backend never produced it; a client-side optional. Not added. |
| **F6** | **Update authz lives in the service, not middleware** — `PUT`/`DELETE` are `authenticateToken`-only at the router; the program-admin gate is inside `updateProgram`/`deleteProgram`. | `programs.js:30, 41`; `programService.js:119-124, 179-184` | Kept (faithful) — same pattern as members F4. |
| **F7** | **`created_by` is set on create but reassigned/relied on by the members delete-cascade** — `programs` writes `created_by = requester.id`; the (deferred) members `deleteMember` cascade reassigns it / may delete the program. | `programService.js:86`; members SPEC §4 | Kept (faithful) — ownership-transfer logic owned by `members`/`program-memberships`. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-28 | Initial SPEC authored via `question-asker`. Documents the four `/api/programs` routes + `programService`. Decisions D-C1 (scope; notification emit deferred to `notifications`, CRUD fully functional) / D-C2 (the one deliberate change — `createProgram` drops the vestigial `description` field) / D-S2 (keep `getPrograms` raw SQL verbatim) / D-REF (`consumed_by [web, ios]`; `admin_only_data_entry` web-only) / D-S1 (faithful except the `description` drop). Flagged F1–F7. |
| 0.1.0 (built) | 2026-06-28 | **Ported to `apps/backend/`** — `services/programService.js` (faithful raw-SQL `getPrograms` two branches per D-S2; `createProgram` **without `description`** per D-C2; `updateProgram`/`deleteProgram` soft-delete with the `program.updated`/`program.deleted` emit **deferred** to a guarded `emitProgramNotification` no-op per D-C1), `routes/programs.js` (faithful 1:1), mounted `/api/programs` in `server.js`. Module-load + GET/POST/PUT/DELETE route-stack boot check pass. Status 📄→🏗️ (no semver bump — the port matches the SPEC). |
