# Feature: `members` — member directory, profiles, and admin lifecycle

> **Status:** 🏗️ built (ported to `apps/backend/`) · **Version:** 0.3.0 · **Apps (`consumed_by`):** `web`, `ios`
> **Reference impl (legacy):** `../../../backend` — `routes/members.js`, `services/memberService.js`,
> `models/Member.js`, `models/MemberEmail.js`, `server.js:47`.
> **Depends on:** [`auth`](../auth/SPEC.md) (every route applies `authenticateToken` / `isAdmin`).
> **One deliberate change** (the rest is faithful): `createMember` now creates a **loginable** member via
> Supabase Auth — see **§7** (decision **D-C2**).

---

## 1. What it is

The **member directory + profile + admin lifecycle** of RaSi Fiters — the five `/api/members` routes over
the `members` table (the FK-anchor entity for everything else). Three of the five are the live surface both
clients use; two are vestigial admin routes:

1. **Read the directory** — `GET /api/members` (list standard members), `GET /api/members/:id` (one
   member's public profile). Used by both clients.
2. **Edit your own profile** — `PUT /api/members/:id` (`first_name` / `last_name` / `gender`), gated to
   the member themselves or a `global_admin`. Used by both clients (web profile page · iOS `MyProfileView`).
3. **Admin lifecycle** — `POST /api/members` (create) and `DELETE /api/members/:id` (delete + cascade).
   **Neither web nor iOS calls these** (decision **D-REF**, §10 F1) — clients create members via
   `/auth/register` and manage participation via `/program-memberships`.

## 2. Why it exists

`members` is the **anchor entity**: every program, membership, invite, log, notification, and analytics row
FKs to `members.id`. Clients need to (a) list the people in a program, (b) view a profile, and (c) let a
user edit their own name/gender. The two admin routes (`POST`/`DELETE`) round out CRUD parity with the
legacy API but have no client caller today; they are kept (faithful surface) — with `POST` upgraded to do
something useful (§7) and `DELETE` deferred until its cross-feature cascade has owners (§7, D-C1).

## 3. Functionality (the routes)

All mounted at **`/api/members`** (legacy `server.js:47`). Handlers in `routes/members.js`; logic in
`services/memberService.js`.

| # | Route | Legacy handler | Auth | Purpose |
|---|-------|----------------|------|---------|
| 1 | `GET /` | `members.js:8-17` → `getAllMembers` (`memberService.js:15-20`) | `authenticateToken` | List members where `global_role = 'standard'`, ordered `first_name ASC`. |
| 2 | `GET /:id` | `members.js:19-28` → `getMemberById` (`memberService.js:22-36`) | `authenticateToken` | One member's profile (hand-picked fields). 404 if missing. |
| 3 | `POST /` | `members.js:30-39` → `createMember` (`memberService.js:38-69`) | `authenticateToken` + `isAdmin` | Admin-create a member. **CHANGED** (§7) — now creates a loginable member. 201. |
| 4 | `PUT /:id` | `members.js:41-50` → `updateMember` (`memberService.js:71-106`) | `authenticateToken` | Update `first_name`/`last_name`/`gender`; own-profile **or** `global_admin` only. |
| 5 | `DELETE /:id` | `members.js:56-65` → `deleteMember` (`memberService.js:147-179`) | `authenticateToken` + `isAdmin` | Delete member + cross-feature cascade (`cascadeMemberDeletion`) + Supabase auth-user delete. **WIRED** (§7, D-C1). |

### Response shapes (preserved 1:1, except the auth_user_id exclusion in §7)

- **`GET /`** (`memberService.js:15-20`): a JSON array of **full `members` rows** — but with the
  migration-added `auth_user_id` column **excluded** to preserve the exact legacy shape (§7).
- **`GET /:id`** (`memberService.js`): `{ id, member_name, username, gender, email, date_joined,
  global_role, created_at, updated_at }` (`member_name`/`date_joined` are model virtuals). **`email`** is the
  primary `member_emails` row (`is_primary`), added so the web profile page can display it (read-only here —
  changing email goes through `PUT /auth/email`, not the `updateMember` whitelist; F6 holds).
- **`POST /`** (`memberService.js:56-63`, HTTP 201): `{ id, member_name, username, gender, date_joined,
  global_role }` — **shape preserved**; the change (§7) is internal (it also provisions auth).
- **`PUT /:id`** (`memberService.js:95-100`): `{ message: "Profile updated successfully.", member_name,
  first_name, last_name }`.
- **`DELETE /:id`** (`memberService.js:184`): `{ message: "Member deleted successfully." }` (once
  un-deferred).

### Error contract (faithful — `routes/members.js` + `utils/response.AppError`)

`AppError(statusCode, message)` → `{ error: message }`; any other throw → `500` with a route-specific
generic (`"Failed to fetch members."`, etc.). Status codes: `400` (missing `member_name`/`password`;
username already exists), `403` (`updateMember` not own-profile-and-not-admin; `deleteMember` global-admin
block), `404` (member not found).

## 4. Feature list (behaviors to port)

- **List standard members** — `Member.findAll({ where: { global_role: 'standard' }, order: [["first_name",
  "ASC"]] })` (`memberService.js:16-19`). Global admins are excluded from the directory. **Excludes
  `auth_user_id`** in the rebuild (§7).
- **Member detail** — hand-picked field projection (`memberService.js:26-35`); `404` if no row.
- **Create member (CHANGED — the one deliberate change, §7/D-C2)** — legacy (`memberService.js:38-69`):
  require `member_name` + `password`; derive `username = member_name.toLowerCase().replace(/\s+/g, '')`
  (`:43`); reject duplicate username (`400`); `Member.create({ member_name, username, gender })`. **Legacy
  destructures `password` but never persists it and writes no `member_emails` row → the member has no
  credential and cannot log in.** Rebuild fixes this (§7): require an explicit `email`, run the auth
  password policy, create the Supabase auth user, write the primary `member_emails` row, and backfill
  `auth_user_id` — mirroring the ported `authService.register` (`apps/backend/services/authService.js:172-233`).
- **Update member** (`memberService.js:71-106`) — authorize: `requester.id === member.id` **or**
  `requester.global_role === 'global_admin'`, else `403` (`:80-85`). Apply only `first_name` / `last_name`
  / `gender` (each trimmed) when present; ignore everything else. Transactional.
- **Delete member (WIRED, §7)** (`memberService.js:147-179`) — block `global_admin` (`403`); then run the
  shared cascade `utils/programMemberships.cascadeMemberDeletion`: destroy `program_invites` referencing the
  member by `invited_by` / `invited_username` / `invited_email ∈ member's emails`; destroy `notifications`
  where `actor_member_id = member.id`; run `handleMemberExit` for every `active` membership **and** every
  program the member `created_by` (reassigning `created_by`, possibly deleting the program, notifying
  remaining members); destroy the member. After the transaction commits the rebuild **best-effort deletes
  the Supabase auth user** (admin API) — the migration delta vs legacy. The cascade is single-sourced in
  `program-memberships` (it drives `handleMemberExit`) and shared with `DELETE /api/auth/account` (D-C1).

## 5. Data / schema touchpoints

Faithful names (R5); schema in `apps/backend/sql/001_schema.sql`.

- **`members`** (owned — read + write) — `id` (preserved UUID), `username` (unique), `first_name`,
  `last_name`, `gender` (**`varchar(32)`** — widened from legacy `varchar(10)` via migration
  `003_widen_gender_column.sql` so `"Prefer not to say"` fits), `global_role`
  (`'standard'|'global_admin'`), `status`, `created_at`/`updated_at`,
  and the **migration-added** `auth_user_id uuid UNIQUE → auth.users(id)`. Virtuals: `member_name`
  (`first + " " + last`), `date_joined` (`created_at` as `YYYY-MM-DD`) — `models/Member.js`.
- **`member_emails`** (read by the delete cascade; **written by `createMember`** in the rebuild) — `email`
  (unique, normalized lowercase via the model setter), `is_primary`, `verified_at` (`models/MemberEmail.js`).
- **`auth.users`** (Supabase-managed) — `createMember` now **creates** a row (admin API); `deleteMember`
  will **delete** it (deferred). `members.auth_user_id` ↔ `auth.users.id`.
- **Referenced for the delete cascade, owned by other features** — `program_invites`, `notifications`,
  `program_memberships`, `programs`; utils `handleMemberExit` (`utils/programMemberships.js:38`),
  `createNotification` + `getActiveProgramMemberIds` (`utils/notifications.js`). These migrate with the
  `program-memberships` / `notifications` features, not this one (D-C1).

## 6. Flags / env

No members-specific env. Inherits the shared Supabase values from `auth`: **`SUPABASE_URL`** +
**`SUPABASE_SERVICE_ROLE_KEY`** (the admin API for `createMember`'s `createUser` and, when un-deferred,
`deleteMember`'s `deleteUser`). DB access via the shared `DATABASE_URL` (`config/database.js`).

## 7. The migration delta + the one deliberate change — the load-bearing part

**What stays (faithful 1:1):** all five route paths + their auth gates, the response shapes, the error
contract, the `global_role = 'standard'` directory filter + `first_name ASC` ordering, the hand-picked
`getMemberById` projection, the own-profile-or-global-admin update gate, the `first_name`/`last_name`/`gender`
update whitelist, and the `global_admin` delete block.

**What changes:**

- **`createMember` becomes a real, loginable create (D-C2 — the single deliberate cleanup, per the user's
  "change/cleanup now, scoped to createMember" decision).** Legacy `createMember` ignored `password` and
  wrote no email, leaving a profile that could never authenticate. The rebuild requires an explicit
  **`email`** (new request field — legacy sent only `member_name`/`gender`/`password`) and then mirrors the
  ported `authService.register` (`apps/backend/services/authService.js:172-233`): `validatePassword`
  (≥ 8 chars, one lower + one upper + one digit), reject duplicate normalized email, `supabaseAdmin.auth.
  admin.createUser({ email, password, email_confirm: true })`, transactional `members` + primary
  `member_emails` create, backfill `members.auth_user_id`, and best-effort `deleteUser` rollback on failure.
  The **201 response shape is unchanged** (`{ id, member_name, username, gender, date_joined, global_role }`).
- **`getAllMembers` excludes `auth_user_id`** from its full-row response. Legacy returned whole `members`
  rows and had no such column; the migration added it, so a faithful response must project it out
  (`attributes: { exclude: ["auth_user_id"] }`) to keep the exact legacy shape. This is shape-preservation,
  not a behavior change.
- **`DELETE /:id` is WIRED** (D-C1) now that `program-memberships` / `invites` / `notifications` are ported.
  The cross-feature cascade is single-sourced in `utils/programMemberships.cascadeMemberDeletion` and shared
  with `DELETE /api/auth/account`; it additionally deletes the Supabase auth user (admin API) after commit.

## 8. Dependencies

- **Upstream:** [`auth`](../auth/SPEC.md) — `authenticateToken` (establishes `req.user`) + `isAdmin` gate
  the routes; Supabase admin API + `members.auth_user_id` (created by the migrator) power the `createMember`
  change.
- **Downstream / referenced:** `program-memberships`, `invites`, `notifications` — own the `deleteMember`
  cascade tables + utils (deferred). No feature depends on `members`' write routes today (clients use
  `/auth/register` + `/program-memberships`).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-C1** | **Scope = the five `/api/members` routes + `memberService`.** The `deleteMember` cross-feature cascade (invites / notifications / membership-exit) is single-sourced in `utils/programMemberships.cascadeMemberDeletion` (owned by `program-memberships`) and **WIRED** now those features are ported; `DELETE /:id` additionally deletes the Supabase auth user after commit. Shared verbatim with the auth `/account` cascade. | `memberService.js:147-179`; `utils/programMemberships.js:cascadeMemberDeletion`; auth SPEC D-C1. |
| **D-C2** | **`createMember` is wired to Supabase `createUser` + requires an explicit `email`** so admin-created members can log in — the single deliberate change. Mirrors the ported `authService.register`. | `memberService.js:38-69` (legacy gap); `apps/backend/services/authService.js:172-233`; user decision. |
| **D-REF** | **Reference impl = legacy `../../../backend`** (`routes/members.js`, `services/memberService.js`, the two models, `server.js:47`). **`consumed_by = [web, ios]`** for the read + self-update routes; **`POST` and `DELETE` are called by neither client** (vestigial — kept for API parity, §10 F1). | Web + iOS consumption sweep (Explore agents); `members.js`. |
| **D-S1** | **Stance = faithful 1:1 except `createMember`.** Response shapes, gates, filtering/ordering, virtuals preserved; `getAllMembers` excludes the migration-added `auth_user_id` to keep the legacy shape. Other oddities are kept and flagged (§10), not fixed. | Whole-module review; §7. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Two dead admin routes** — `POST /api/members` and `DELETE /api/members/:id` are called by neither web nor iOS (clients create via `/auth/register`, manage participation via `/program-memberships`, and "delete" = unenroll). | `members.js:30-39, 56-65`; consumption sweep | Kept for API parity. `POST` now does useful work (D-C2); `DELETE` now wired with the full cascade (D-C1). |
| **F2** | **Username derived by `member_name.toLowerCase().replace(/\s+/g, '')`** — collision → `400`; no explicit username input on create. | `memberService.js:43, 47-51` | Kept (faithful). |
| **F3** | **Inconsistent read shapes** — `getAllMembers` returns full rows; `getMemberById`/`updateMember` hand-pick fields. | `memberService.js:15-20` vs `26-35`/`95-100` | Kept (faithful); the only delta is the `auth_user_id` exclusion (§7). |
| **F4** | **Update authz lives in the service, not middleware** — `PUT /:id` is `authenticateToken`-only at the route; the own-profile-or-`global_admin` check is in `updateMember`. | `members.js:41`; `memberService.js:80-85` | Kept (faithful). |
| **F5** | **`deleteMember` blocks `global_admin`** (`403`) — same guard as `DELETE /api/auth/account`. | `memberService.js:116-119` | Kept (faithful). |
| **F6** | **`updateMember` whitelists only `first_name`/`last_name`/`gender`** — username, `global_role`, status, email cannot be changed here. | `memberService.js:87-90` | Kept (faithful). |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.3.0 | 2026-06-30 | **`getMemberById` now returns the primary `email`** (resolved from `member_emails`, `is_primary`) so the web profile page can display it — additive read-shape change, backward-compatible (`updateMember` whitelist unchanged; email changes go through `PUT /auth/email`, F6 holds). **`members.gender` widened `varchar(10)`→`varchar(32)`** via migration `apps/backend/sql/003_widen_gender_column.sql` (+ `001_schema.sql` canonical line) so `"Prefer not to say"` (17 chars) stops erroring on save. MINOR (additive; consumers: web profile reads `email`, ios unaffected). Drives `program/profile` page v0.2.0. `node -c` ✓; migration applied by the user. |
| 0.1.0 | 2026-06-28 | Initial SPEC authored via `question-asker`. Documents the five `/api/members` routes + `memberService`. Decisions D-C1 (scope; `DELETE` cascade deferred → 501, auth `/account` pattern) / D-C2 (the one deliberate change — `createMember` wired to Supabase `createUser`, requires `email`) / D-REF (`consumed_by [web, ios]`; `POST`+`DELETE` called by neither client) / D-S1 (faithful except `createMember`; `getAllMembers` excludes `auth_user_id`). Flagged F1–F6. |
| 0.1.0 (built) | 2026-06-28 | **Ported to `apps/backend/`** — `services/memberService.js` (faithful `getAllMembers` w/ `auth_user_id` excluded, `getMemberById`, `updateMember`; **`createMember` wired to Supabase `admin.createUser` + requires `email`** per D-C2, reusing `authService.validatePassword`/`normalizeEmail`; `deleteMember`→501 per D-C1), `routes/members.js` (faithful 1:1), mounted `/api/members` in `server.js`. Module-load + route-stack boot check pass. Status 📄→🏗️ (no semver bump — the port matches the SPEC). |
| 0.2.0 | 2026-06-28 | **Wired `DELETE /:id` (D-C1) — the 501 deferral is resolved.** The cross-feature cascade (destroy outbound invites + actored notifications, `handleMemberExit` per active membership/created program, notify remaining members, destroy the member) is single-sourced as `utils/programMemberships.cascadeMemberDeletion` and **shared verbatim** with `DELETE /api/auth/account`; after commit it best-effort deletes the Supabase auth user (the migration delta). Faithful to the legacy `deleteMember` body; minor bump (functionality previously 501). Boot check passes. |
