# Feature: `program-memberships` — enrollment, roles, status & the member-exit cascade

> **Status:** 🏗️ built (ported to `apps/backend/`) · **Version:** 0.2.0 · **Apps (`consumed_by`):** `web`, `ios`
> **Provenance (legacy, archived):** `backend` — `routes/memberships.js`, `services/membershipService.js`,
> `utils/programMemberships.js` (`handleMemberExit`), `models/ProgramMembership.js`, `server.js:49`.
> **Depends on:** [`auth`](../auth/SPEC.md) (`authenticateToken` + the program-admin authz pattern) ·
> [`members`](../members/SPEC.md) (`Member` model + the `createMember` Supabase pattern reused by D-C2) ·
> [`programs`](../programs/SPEC.md) (`Program` + the membership row it bootstraps) · `notifications` (the
> membership-event emits — **deferred**, §7) · `invites` (the `ProgramInvite`/`ProgramInviteBlock` tables the
> exit flow writes — **referenced**, §7).
> **Two deliberate changes** (the rest is faithful): **D-C2** `createMemberAndEnroll` becomes a **loginable**
> create (Supabase Auth); **D-C3** the two dead routes (`GET /available`, `POST /enroll`) are **dropped** — §7.

---

## 1. What it is

The **membership layer** of RaSi Fiters — the `program_memberships` join between `members` and `programs`,
plus the **member-exit cascade** (`handleMemberExit`) that promotes a new admin / deletes an emptied program
when someone leaves. Legacy ships **8 routes** at `/api/program-memberships`; this SPEC owns **6** (two dead
routes dropped, D-C3):

1. **Read a program's roster** — `GET /members` (active members, for pickers) and `GET /details` (active
   memberships *with* role/status, for management). Both used by both clients.
2. **Change a membership** — `PUT /` (set role/status; the self-service-vs-admin matrix + last-admin guard)
   and `DELETE /` (admin removes a member → soft-remove + exit cascade). Both used by both clients.
3. **Leave** — `PUT /leave` (a member exits their own program → soft-remove + exit cascade). Both clients.
4. **Admin-create + enroll** — `POST /` (`createMemberAndEnroll`). **Called by neither client** (vestigial),
   but **kept and fixed** (D-C2) to create a loginable member, mirroring the members `createMember` change.

The co-mounted **invite** routes (`my-invites`/`all-invites`/`invite`/`invite-response`/blocks — also at
`/api/program-memberships` via `inviteRoutes`, `server.js:50`) are the separate **`invites`** feature, not
this one (D-C1).

## 2. Why it exists

A *program* is just a container; **membership** is what puts people in it with a **role** (`admin` / `logger`
/ `member`) and a **status** (`active` / `invited` / `requested` / `removed`). Every other feature reads
membership to answer "who's in this program, and what may they do": the member pickers in logging forms, the
role-management screens, the active-member counts on the programs list, the admin gate on every program
mutation. The **exit cascade** keeps a program well-formed when its last admin or last member leaves
(auto-promote the oldest active member; soft-delete an emptied program; preserve the leaver's data for
rejoin). Authorization stays in Express (program-admin checks via `ProgramMembership`), per the auth model.

## 3. Functionality (the routes)

All mounted at **`/api/program-memberships`** (legacy `server.js:49`). Handlers in `routes/memberships.js`;
logic in `services/membershipService.js`; the exit cascade in `utils/programMemberships.js`. Every route is
`authenticateToken`-only at the router; the **authz lives in the service** (program-admin / self checks).

| # | Route | Legacy handler | Auth (effective) | Purpose |
|---|-------|----------------|------------------|---------|
| 1 | `POST /` | `memberships.js:8-17` → `createMemberAndEnroll` (`membershipService.js:27-96`) | program `admin` or `global_admin` | Admin-create a member + enroll. **CHANGED → loginable** (D-C2). 201. **Vestigial** (no client). |
| 2 | `GET /members` | `memberships.js:19-28` → `getProgramMembers` (`membershipService.js:98-120`) | any authenticated member | Active members of a program (picker projection). |
| 3 | `GET /details` | `memberships.js:41-50` → `getMembershipDetails` (`membershipService.js:143-169`) | any authenticated member | Active memberships **with** `program_role`/`status`/`joined_at` (management). |
| 4 | `PUT /` | `memberships.js:63-72` → `updateMembership` (`membershipService.js:241-362`) | `global_admin` / program `admin` / **self** (status-only) | Set role/status; last-admin guard; emit `program.role_changed` (deferred). |
| 5 | `DELETE /` | `memberships.js:74-83` → `removeMember` (`membershipService.js:364-435`) | program `admin` or `global_admin` | Soft-remove a member + revoke their invites + exit cascade; emit `program.member_removed` (deferred). |
| 6 | `PUT /leave` | `memberships.js:85-94` → `leaveProgram` (`membershipService.js:437-515`) | any enrolled member (not `global_admin`) | Self-exit + revoke own invites + exit cascade; emit `program.member_left` (deferred). |

**Dropped (D-C3) — not ported:** `GET /available` (`getAvailableMembers`, `membershipService.js:122-141`)
and `POST /enroll` (`enrollMember`, `membershipService.js:171-239`) — both called by **no client** (web has
no API method; iOS has dormant `fetchAvailableMembers`/`enrollExistingMember` with no call sites).

### Response shapes (faithful, except the `POST /` change in §7)

- **`GET /members`** (`membershipService.js:112-119`): array of `{ id, member_name, username, gender,
  date_joined, global_role }` (active members; `member_name`/`date_joined` are `Member` virtuals).
- **`GET /details`** (`membershipService.js:157-168`): array of `{ member_id, member_name, username, gender,
  date_joined, global_role, program_role, status, is_active, joined_at }`.
- **`PUT /`** (`membershipService.js:347-356`): `{ program_id, member_id, member_name, role, status,
  is_active, joined_at, message }`.
- **`DELETE /`** (`membershipService.js:422-429`): `{ message, program_deleted, new_admin_member_id,
  new_admin_member_name }` (the exit-cascade outcome).
- **`PUT /leave`** (`membershipService.js:502-509`): `{ message, program_id, member_id, program_deleted,
  new_admin_member_id, new_admin_member_name }`; `message` varies by cascade outcome (preserved/promoted/
  deleted — `membershipService.js:495-500`).
- **`POST /`** (HTTP 201): the loginable member + `program_id` — **shape adjusted** (drops the legacy
  `date_of_birth`/`role` keys that mapped to non-columns; §7 / D-C2).

### Error contract (faithful — `routes/memberships.js` + `utils/response.AppError`)

`AppError(statusCode, message)` → `{ error: message }`; any other throw → `500` route-generic. Status codes:
`400` (missing required fields; already-enrolled; already-removed; invalid self-status update; **last-admin**
removal block, `membershipService.js:322-325`), `403` (not admin / not self; self trying to change role; self
on a non-`invited`/`requested` status; `global_admin` cannot leave), `404` (program / member / membership
not found).

## 4. Feature list (behaviors to port)

- **`createMemberAndEnroll` (CHANGED — D-C2)** (`membershipService.js:27-96`). Authz: `global_admin` or an
  `active`/`admin` `ProgramMembership` for `program_id` (`403` else); program must exist & be non-deleted
  (`404`). Legacy then `Member.create({ member_name, username, password, gender, date_of_birth, date_joined,
  role:'member' })` — but the Member model has **no** `password`/`date_of_birth`/`role`/`date_joined` columns
  (Sequelize silently drops them) → an **unloggable** member (the members `createMember` bug, again). Rebuild
  mirrors the ported `memberService.createMember` (`apps/backend/services/memberService.js:42-101`): require an
  explicit **`email`**, `validatePassword`, `normalizeEmail`, unique username (`generateUniqueUsername`,
  `membershipService.js:8-25`) + email, `supabaseAdmin.auth.admin.createUser`, then **transactionally**
  `Member.create({ member_name, username, gender, auth_user_id })` + primary `MemberEmail` + the
  `ProgramMembership.create({ program_id, member_id, role: role||'member', joined_at, status })` enrollment;
  compensating `deleteUser` on rollback.
- **`getProgramMembers`** (`membershipService.js:98-120`) — `ProgramMembership.findAll({ status:'active' })`
  include `Member`, `ORDER BY Member.first_name ASC`; filter rows whose `Member` is null; project the picker
  shape. `400` if no `programId`.
- **`getMembershipDetails`** (`membershipService.js:143-169`) — same query, richer projection adding
  `program_role` (`m.role`), `status`, `is_active` (`status==='active'`), `joined_at`.
- **`updateMembership`** (`membershipService.js:241-362`) — the authz matrix: `isSelf` / `isGlobalAdmin` /
  `isProgramAdmin`; non-admin self may change **status only** (`:274-283`) and only from `invited`/`requested`
  to `active`/`removed` (`:292-297`); admins may set role + status. `removed` sets `left_at=now`, `active`
  clears it (`:298-305`). **Last-admin guard** (`:308-326`): demoting/removing the target when it's the last
  `active` `admin` → `400`. On a role change to an `active` membership, emit `program.role_changed` to the
  member — **deferred** (§7).
- **`removeMember`** (`membershipService.js:364-435`) — admin authz; `404` if no membership; `400` if already
  `removed`; soft-remove (`status='removed', left_at=now`); emit `program.member_removed` (**deferred**);
  **revoke the member's pending invites** (`ProgramInvite.update status='revoked'`) + **destroy their invite
  blocks** (`ProgramInviteBlock.destroy`) — **ported** (models exist, §7); run `handleMemberExit`; return the
  cascade outcome.
- **`leaveProgram`** (`membershipService.js:437-515`) — `404` if no membership; `403` if `global_admin`; `400`
  if already `removed`; soft-remove; revoke own pending invites + destroy blocks (ported); `handleMemberExit`;
  emit `program.member_left` to **remaining** active members (**deferred**); compose the outcome message.
- **`handleMemberExit`** (`utils/programMemberships.js:38-149`) — the cascade, **owned here**. If no active
  members remain after the exit → soft-delete the program (optionally null `created_by` when
  `updateCreatedBy`), notify; else if no active admin remains → promote the **oldest** active membership
  (`joined_at ASC, member_id ASC`) to `admin`, notify the promotee + the program. Params
  `updateCreatedBy`/`notificationActorId`/`includeExitingMemberInRecipients` are exercised by the **deferred**
  `members.deleteMember` + auth `/account` cascades, not the membership routes (which call it with defaults) —
  §10 F2. All emits **deferred** (§7).

## 5. Data / schema touchpoints

Faithful names (R5); schema in `apps/backend/sql/001_schema.sql`.

- **`program_memberships`** (owned — read + write) — composite PK `(program_id, member_id)`, no surrogate id;
  `joined_at`, `role` (`admin`/`logger`/`member`, default `member`), `status` (`active`/`invited`/`requested`/
  `removed`, default `active`), `left_at` (nullable). `models/ProgramMembership.js` (`timestamps:false`).
- **`members`** (read for the roster joins; **written by `createMemberAndEnroll`** — the D-C2 loginable create)
  — owned by [`members`](../members/SPEC.md); this feature creates the member row + primary email + auth user.
- **`programs`** (read for existence + soft-delete in the exit cascade) — owned by
  [`programs`](../programs/SPEC.md).
- **`member_emails`** (written by the D-C2 create — primary row) + **`auth.users`** (Supabase — the D-C2
  create) — same path the ported `memberService.createMember` uses.
- **Referenced, owned by other features** — `program_invites` + `program_invite_blocks` (the exit flow
  **writes** these — revoke pending / destroy blocks — but they're owned by `invites`; the write is ported
  since the models exist, §7); `createNotification` + `getActiveProgramMemberIds` (`utils/notifications.js`,
  owned by `notifications`, **deferred**, §7).

## 6. Flags / env

No membership-specific env. Inherits the shared Supabase values from `auth`/`members` (**`SUPABASE_URL`** +
**`SUPABASE_SERVICE_ROLE_KEY`** — the admin API for the D-C2 `createUser`). DB access via the shared
`DATABASE_URL`. The per-program **`admin_only_data_entry`** flag (owned by `programs`) is *read* by the
logging features, not by membership — membership only sets the `role` those gates compare against.

## 7. The migration delta + the two deliberate changes — the load-bearing part

**What stays (faithful 1:1):** the 6 ported route paths + auth gates, the read projections, the
self-vs-admin authz matrix, the `invited`/`requested`→`active`/`removed` self-service constraint, the
`left_at` set/clear, the **last-admin guard**, the soft-remove semantics, the **invite revoke/block writes**
in the exit flow (ported — the `ProgramInvite`/`ProgramInviteBlock` models exist), the whole
`handleMemberExit` cascade (admin promotion by oldest `joined_at`, empty-program soft-delete, `created_by`
nulling), and the outcome-message composition. Error contract preserved.

**What changes:**

- **`createMemberAndEnroll` becomes a loginable create (D-C2).** Same fix + rationale as members `createMember`
  (D-C2): legacy ignored `password` and wrote no email/auth → an unauthenticatable member; it also passed
  `date_of_birth`/`role`/`date_joined` to `Member.create` where no such columns exist (silently dropped). The
  rebuild requires an explicit **`email`** and reuses the ported `memberService.createMember` flow (Supabase
  `admin.createUser` + primary `member_emails` + `auth_user_id` backfill), then enrolls in the same
  transaction. The 201 body drops the legacy `date_of_birth`/`role` keys (they were always undefined). Kept
  despite being **vestigial** (no client calls it) for API parity + consistency with the members fix.
- **The two dead routes are dropped (D-C3).** `GET /available` (`getAvailableMembers`) and `POST /enroll`
  (`enrollMember`) are called by **neither** client (web has no API method; iOS's `fetchAvailableMembers`/
  `enrollExistingMember` have no call sites). They are **not ported** — a cleaner surface than the members
  feature (which kept its vestiges). Re-add if a caller ever appears.
- **The notification emits are deferred (D-C4 — the `programs` D-C1 pattern).** `updateMembership`
  (`program.role_changed`), `removeMember` (`program.member_removed`), `leaveProgram` (`program.member_left`),
  and every `handleMemberExit` emit (`program.deleted` / `role_changed` / `admin_transferred`) call
  `createNotification` + `getActiveProgramMemberIds` from the unported `notifications` util (SSE + APNs). The
  membership logic ports **fully functional**; only the alerts are a **guarded TODO no-op**, wired when
  `notifications` lands. A temporary implementation gap, not a spec change.

> **Unblocks the deferred cascades.** Porting `handleMemberExit` here gives the deferred
> `members.deleteMember` (`DELETE /api/members/:id` → 501) and auth `DELETE /api/auth/account` their cascade
> dependency. Wiring those two routes to it is the **members / auth** features' follow-up (they call it with
> `updateCreatedBy:true`), not this run.

## 8. Dependencies

- **Upstream:** [`auth`](../auth/SPEC.md) (`authenticateToken`, the program-admin authz pattern);
  [`members`](../members/SPEC.md) (`Member` + the `createMember` Supabase flow reused by D-C2);
  [`programs`](../programs/SPEC.md) (`Program` + the bootstrap membership it creates).
- **Referenced / deferred:** `notifications` (the membership-event emits — D-C4); `invites`
  (`ProgramInvite`/`ProgramInviteBlock` — the exit flow writes them, ported since the models exist).
- **Downstream:** `members` + `auth` wire their deferred delete cascades to **`handleMemberExit`** (owned
  here). Logging / analytics features read membership (`role`/`status`) for their gates + active-member sets.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-C1** | **Scope = the 6 membership routes + `membershipService` + `handleMemberExit`** (`utils/programMemberships.js`). The co-mounted invite routes (`server.js:50`, `inviteRoutes`) are **referenced** → the separate `invites` feature. | `routes/memberships.js`; `server.js:49-50`; COVERAGE split. |
| **D-C2** | **`createMemberAndEnroll` is fixed to a loginable create** (Supabase `admin.createUser` + require `email`), mirroring members D-C2, then enrolls in the same transaction. Kept though vestigial. | `membershipService.js:27-96` (legacy bug); `apps/backend/services/memberService.js:42-101`; user decision. |
| **D-C3** | **Drop the two dead routes** `GET /available` + `POST /enroll` — called by no client (web has no method; iOS methods are dormant). Not ported. | `membershipService.js:122-141, 171-239`; web + iOS consumption sweep (Explore agents). |
| **D-C4** | **Defer all membership-event notification emits** → guarded no-op, wired when `notifications` lands; membership/cascade logic ports fully functional (the `programs` D-C1 pattern). | `membershipService.js:331-342, 398-406, 477-490`; `utils/programMemberships.js:72-135`; programs SPEC D-C1. |
| **D-REF** | **Reference impl = legacy `backend`. `consumed_by = [web, ios]`** — `GET /members`, `GET /details`, `PUT /`, `DELETE /`, `PUT /leave` are live on both; `POST /` + the two dropped routes are called by neither. **Cross-app:** `DELETE /` and member-detail edit are **global-admin-only on both** clients; `PUT /leave` is member-facing on both. No divergence (the gates match). | Web + iOS consumption sweep; `members/detail` + `MemberManagementSection.swift:66`. |
| **D-S1** | **Stance = faithful except D-C2 (fix) + D-C3 (drop 2).** The invite-table writes are ported (models exist); the authz matrix, last-admin guard, and `handleMemberExit` cascade are faithful; other oddities flagged (§10), not changed. | Whole-module review; §7. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **`POST /` (createMemberAndEnroll) is vestigial** — called by no client (clients add members via `invites` + `/auth/register`). Kept for parity + **fixed** to be loginable (D-C2); its two sibling dead routes were dropped (D-C3). | consumption sweep; `membershipService.js:27` | Kept + fixed (D-C2). |
| **F2** | **`handleMemberExit` carries caller-specific params** (`updateCreatedBy`/`notificationActorId`/`includeExitingMemberInRecipients`) the membership routes never set — they're for the deferred `members.deleteMember` + auth `/account` cascades. | `utils/programMemberships.js:42-44` | Kept (faithful) — needed by the wiring those features add later. |
| **F3** | **Self-service status updates are tightly constrained** — a non-admin member may change only their **own** membership, **status only**, and only `invited`/`requested` → `active`/`removed`. | `membershipService.js:274-297` | Kept (faithful) — load-bearing authz. |
| **F4** | **Last-admin guard** — cannot remove/demote the last `active` `admin`; `400`. | `membershipService.js:308-326` | Kept (faithful). |
| **F5** | **The exit flow writes another feature's tables** — `removeMember`/`leaveProgram` revoke pending `program_invites` + destroy `program_invite_blocks` (owned by `invites`) inside the membership transaction. Ported here (models exist) rather than deferred, to keep the exit atomic. | `membershipService.js:408-412, 465-469` | Kept (faithful) — cross-feature write owned by the exit transaction. |
| **F6** | **`getProgramMembers` and `getMembershipDetails` are near-duplicate queries** (active memberships + `Member` include, `first_name ASC`) with different projections. | `membershipService.js:101-108` vs `146-153` | Kept (faithful). |
| **F7** | **Notification emits deferred** (D-C4) — `role_changed`/`member_removed`/`member_left` + the cascade emits are no-ops until `notifications` lands. | `membershipService.js:331, 398, 481`; `utils/programMemberships.js:73, 110, 125` | Temporary gap (wired with `notifications`), not a spec change. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-28 | Initial SPEC authored via `question-asker`. Documents the 6 owned `/api/program-memberships` routes + `membershipService` + the `handleMemberExit` cascade. Decisions D-C1 (scope; invites referenced) / D-C2 (fix `createMemberAndEnroll` → loginable, mirrors members D-C2) / D-C3 (drop the two dead routes `GET /available` + `POST /enroll`) / D-C4 (defer notification emits; logic ports functional) / D-REF (`consumed_by [web, ios]`; gates match across clients) / D-S1 (faithful except D-C2/D-C3; invite-writes ported). Flagged F1–F7. |
| 0.1.0 (built) | 2026-06-28 | **Ported to `apps/backend/`** — `utils/notifications.js` (DEFERRED STUB per D-C4: real `getActiveProgramMemberIds`, no-op `createNotification`), `utils/programMemberships.js` (faithful `handleMemberExit` cascade), `services/membershipService.js` (6 fns: `createMemberAndEnroll` **fixed→loginable** per D-C2 reusing the members Supabase flow; faithful `getProgramMembers`/`getMembershipDetails`/`updateMembership`/`removeMember`/`leaveProgram` with deferred emits + ported invite-table writes; `getAvailableMembers`+`enrollMember` **dropped** per D-C3), `routes/memberships.js` (6 routes), mounted `/api/program-memberships` in `server.js`. Module-load + 6-route stack boot check pass. Status 📄→🏗️ (no semver bump — the port matches the SPEC). |
| 0.2.0 | 2026-06-28 | **Added the shared `cascadeMemberDeletion` export to `utils/programMemberships.js`** (additive owned interface). It single-sources the full member-removal cascade (destroy outbound invites + actored notifications, `handleMemberExit` per active membership/created program, emit `program.member_left`, destroy the member) extracted from the byte-identical legacy `deleteMember`/`deleteAccount` bodies; now imported by **`members`** (`DELETE /:id`) + **`auth`** (`DELETE /account`) — both gained a `depends_on: program-memberships` edge (mutual with this feature's existing auth/members deps). `handleMemberExit` unchanged. Minor bump (new export, backward-compatible — zero dependent re-version). Boot check passes. |
