# Feature: `invites` — program invitations (send · inbox · accept/decline/revoke · block)

> **Status:** 🚀 deployed (ported to `apps/backend/`) · **Version:** 0.2.1 · **Apps (`consumed_by`):** `web`, `ios`, `android`
> **Provenance (legacy, archived):** `backend` — `routes/invites.js`, `services/inviteService.js`,
> `models/ProgramInvite.js`, `models/ProgramInviteBlock.js`, `server.js:50` (co-mounted at
> `/api/program-memberships`).
> **Depends on:** [`auth`](../auth/SPEC.md) (`authenticateToken` + the program-admin authz pattern) ·
> [`programs`](../programs/SPEC.md) (`Program` — existence + name) · [`members`](../members/SPEC.md)
> (`Member` + the `member_name` virtual) · [`program-memberships`](../program-memberships/SPEC.md)
> (`ProgramMembership` — the join the accept path writes inline) · [`notifications`](../notifications/SPEC.md)
> (`createNotification` + `getActiveProgramMemberIds` — the invite emits, **now wired live**, §7).
> **Two deliberate cleanups** (the rest is faithful): **D-C3a** drop the vestigial `target_member_id` param;
> **D-C3b** replace `getAllInvites`' N+1 lookup with a single batched query — §7.
> **0.2.0 (reliability overhaul R3):** one-transaction send, logged no-op reasons, real 500s, expired invites hidden, one inbox for all three clients — D-C4–D-C8, client contract §3.1.
> **0.2.1 (Phase 3 client release):** all three clients on §3.1 — swallow removed, card Accept/Decline retired — D-C9.

---

## 1. What it is

The **invitation layer** of RaSi Fiters — the co-mounted other half of `/api/program-memberships`
(`server.js:50`, `inviteRoutes`). A program admin invites an existing member **by username**; the invitee
sees it in a pending-invites inbox and **accepts / declines** (optionally **blocking** future invites);
a global admin can **revoke** any pending invite or accept-on-behalf. Accepting is what actually puts the
member into the program — the accept path writes the `program_memberships` row **inline**. Legacy ships
**4 routes**, all owned by this SPEC:

1. **Send** — `POST /invite` (program admin / global admin invites a member by username; privacy-safe).
2. **My inbox** — `GET /my-invites` (the current user's own pending invites).
3. **Admin inbox** — `GET /all-invites` (**global_admin only** — every pending invite, grouped by program).
4. **Respond** — `PUT /invite-response` (`accept` / `decline` [+ `block_future`] / `revoke`).

The owning `ProgramInvite` + `ProgramInviteBlock` tables (and their associations `InvitedByMember` /
`SentInvites` / the block associations) are **already ported** (they landed with `program-memberships`,
whose exit cascade *writes* these tables — `program-memberships` SPEC §7/F5). This feature owns the **routes
+ service**; the tables are shared but anchored here.

## 2. Why it exists

A program is invite-gated: you don't self-join, an admin invites you. Invites are the controlled on-ramp into
a `program_memberships` row. The flow has to be **privacy-safe** (an admin probing usernames must not learn
who exists — every non-happy `sendInvite` branch returns the same `"Invitation sent"`), **idempotent-ish**
(re-inviting an already-pending / already-member / blocked user is a silent no-op), and **reversible** (a
member can decline + permanently block; a global admin can revoke). Accepting **restores prior data** when a
previously-`removed` member rejoins (reactivates the soft-removed membership rather than creating a new one).
Authorization stays in Express (program-admin via `ProgramMembership`; global-admin via `global_role`), per
the auth model.

## 3. Functionality (the routes)

All mounted at **`/api/program-memberships`** (legacy `server.js:50` — `inviteRoutes` co-mounted with
`membershipRoutes` under the same prefix). Both clients call them as `/program-memberships/<path>`. Handlers
in `routes/invites.js`; logic in `services/inviteService.js`. Every route is `authenticateToken`-only at the
router; the **authz lives in the service** (program-admin / global-admin / self checks).

| # | Route | Legacy handler | Auth (effective) | Purpose |
|---|-------|----------------|------------------|---------|
| 1 | `POST /invite` | `invites.js:8-16` → `sendInvite` (`inviteSendService.js`, 0.2.0) | program `admin` or `global_admin` | Invite a member by username. `200 { message: "Invitation sent" }` whether sent or a privacy-safe no-op (F1, D-C5); `500 { error }` on an unexpected failure (D-C6). Invite + `program.invite_received` in one transaction (D-C4). |
| 2 | `GET /my-invites` | `invites.js:18-27` → `getMyInvites` (`inviteService.js:79-100`) | any authenticated member | The caller's own `pending`, **unexpired** invites (by `invited_username`; D-C7). |
| 3 | `GET /all-invites` | `invites.js:29-38` → `getAllInvites` (`inviteService.js:102-140`) | **`global_admin` only** (`403` else) | Every `pending` invite, grouped by program; adds invitee identity columns. |
| 4 | `PUT /invite-response` | `invites.js:40-49` → `respondToInvite` (`inviteService.js:142-304`) | invitee (`accept`/`decline`); **`global_admin`** also (`accept`/`decline`/**`revoke`**) | Accept (→ enroll/reactivate + emit `program.member_joined`), decline (+ optional `block_future`), or revoke. Transactional. |

### Response shapes (faithful, except the §7 cleanups)

- **`POST /invite`** (`inviteSendService.js`): `{ message: "Invitation sent" }` for a sent invite and every no-op (F1); `500 { error: "Failed to send invitation." }` on an unexpected failure (D-C6).
- **`GET /my-invites`** (`inviteService.js:89-99`): array of `{ invite_id, program_id, program_name,
  program_status, program_start_date, program_end_date, invited_by_name, invited_at, expires_at }`.
- **`GET /all-invites`** (`inviteService.js:125-138`): the `my-invites` shape **plus** `invited_username`,
  `invited_member_name`, `invited_member_id` (the invitee's identity, for the admin grid).
- **`PUT /invite-response`** (`inviteService.js:225-298`): `{ message }`, the wording varying by role
  (admin vs self) and outcome (joined / rejoined-with-restore / already-member / declined / revoked).

`invited_by_name` / `invited_member_name` come from the `Member.member_name` **virtual** (computed from
`first_name`/`last_name`, which the includes select) — F4.

### Error contract (faithful — `routes/invites.js` + `utils/response.AppError`)

`AppError(statusCode, message)` → `{ error: message }`. **`POST /invite` (0.2.0):** every privacy-safe no-op is a
`200 { message: "Invitation sent" }` (F1); a non-`AppError` throw is a real `500 { error: "Failed to send
invitation." }` (D-C6 — before 0.2.0 it was swallowed into a 200; no `code`, like every backend 500 — the frontend-kit
derives `server` from the status). The other three routes map unknown throws to a route-generic `500 { error }`.
Status codes: `400` (missing / non-string `username`, missing or non-UUID `program_id`; missing `invite_id`/`action`;
invalid `action` for role; expired invite), `403` (not program admin on send; not global admin on `/all-invites`),
`404` (invite not found / already processed; invited user not found on admin-accept).

### 3.1 Client contract — one invite inbox for web / iOS / Android (0.2.0, D-C8)

All under `/api/program-memberships`, `Authorization: Bearer <access token>`; `401` / `503` per `authenticateToken`
(auth D-C11). Callers: web (`lib/api/invites.ts`, `lib/api/members.ts`), iOS (`APIClient+Invites.swift`) and, since
1.1.0 (5), Android (`net/ApiService.kt`; `ui/programs/{ProgramActionsSheet,InviteInbox}.kt`) — Android 1.0.0 never
calls the inbox routes (no shim). Errors are `{ "error": message }`; the HTTP status decides the frontend-kit error kind.

**`GET /my-invites`** → `200`, newest first, only `pending` invites that have not expired:

```json
[ { "invite_id": "uuid", "program_id": "uuid", "program_name": "RaSi Winter Reset",
    "program_status": "planned", "program_start_date": "2026-10-01", "program_end_date": "2026-12-31",
    "invited_by_name": "Ava Rivera", "invited_at": "2026-10-12T18:04:05.000Z",
    "expires_at": "2026-11-11T18:04:05.000Z" } ]
```
`program_status` ∈ `planned | active | completed`; `program_start_date` / `program_end_date` are `YYYY-MM-DD` or
`null`; `expires_at` may be `null`. `500 { "error": "Failed to fetch invites." }`.

**`PUT /invite-response`** — body `{ "invite_id": "uuid", "action": "accept" | "decline", "block_future": true }`
(`block_future` optional, honoured on `decline`). `200 { "message": "<human text>" }` — **not shown** (amended 0.2.1,
A1: the client refreshes the inbox and shows the new state) · `400` (missing field / invalid action / `"This invite has
expired."`) · `404 "Invite not found or already processed."` · `500 { "error": "Failed to process invite response." }`
— every error is shown (A10). Global admins also use `GET /all-invites` and `action: "revoke"` (§3 table, unchanged) —
on all three clients since 0.2.1 (Android: "All Invites" + a Revoke pill).

**`POST /invite`** (program admins) — body `{ "program_id": "uuid", "username": "string" }`.

| Status | Body | Client shows |
|---|---|---|
| `200` | `{ "message": "Invitation sent" }` | "Invitation sent" — also for unknown / blocked / already-member / already-invited usernames (privacy) |
| `400` | `{ "error": "program_id and username are required." }` | the server text (invalidInput) |
| `403` | `{ "error": "Admin privileges required for this program." }` | forbidden |
| `500` | `{ "error": "Failed to send invitation." }` | the kit's server error |
| network / timeout | — | the kit's offline / timeout error |

**Client-side swallow removed (0.2.1, D-C9).** Web, iOS 1.5.0 (58) and Android 1.1.0 (5) show `Invitation sent` only on
`200` and route every other status through the frontend-kit (the server keeps the privacy guarantee — F1). Older
binaries (iOS ≤ 1.4.x, Android 1.0.0) still treat any non-network error as success — no visible change there.

**Refresh the inbox** on program-picker load / pull-to-refresh, on every SSE or push `program.invite_received` (incl. a
`/unacknowledged` re-fetch that carries one — notifications D-C17), and after every `/invite-response`, success or not
(web: the mutation's `onSettled`). Push and SSE are hints only — the inbox is always `GET /my-invites`. A tapped invite
push opens the inbox (notifications D-C17c).

## 4. Feature list (behaviors to port)

- **`sendInvite({ program_id, username }, requester)`** (`inviteSendService.js`, 0.2.0) — `400` unless `program_id`
  is a UUID and `username` a non-empty string. Authz: `global_admin`, or an `active`/`admin` `ProgramMembership` for
  `program_id` (`403` else). Then the chain of **privacy-safe no-ops** — each returns `{ sent: false, reason }` and
  creates nothing: program missing/deleted (`program_not_found`); username not found (`unknown_username`); target
  already has a non-`removed` membership (`already_member`); target is in `program_invite_blocks` (`blocked`); a
  non-expired `pending` invite already exists (`pending_invite`). Happy path in ONE transaction (D-C4): mark a
  superseded **expired** pending invite `expired`, create a `ProgramInvite` (`token_hash` = 32 random bytes hex,
  `status:'pending'`, `max_uses:1`, `uses_count:0`, `expires_at` = **now + 30 days**), emit
  **`program.invite_received`** to `[targetMember.id]` with the transaction (dispatch after commit). A `23505` on the
  pending-invite index (concurrent duplicate) → `pending_invite`. Returns `{ sent: true, reason: null }`. The route
  answers `200 { message: "Invitation sent" }` either way and logs the reason (D-C5).
- **`getMyInvites(requester)`** — `ProgramInvite.findAll({ invited_username: requester.username, status:'pending',
  expires_at IS NULL OR expires_at > now })` (D-C7) include `Program` (id/name/status/start/end) + `InvitedByMember` (the
  `member_name` source), `created_at DESC`; project the inbox shape.
- **`getAllInvites(requester)` (CHANGED — D-C3b)** (`inviteService.js:102-140`) — `403` unless
  `global_admin`. Query all `pending` invites with the same includes, ordered `Program.name ASC,
  created_at DESC`. Legacy then does an **N+1** (`Promise.all` → one `Member.findOne` per invite to resolve
  `invited_member_name`/`invited_member_id` by `LOWER(username)`). The rebuild **batches**: collect the
  distinct `invited_username`s, one `Member.findAll` over them, build a lowercase→member map, project in
  memory. **Identical response shape**, one query instead of N (§7).
- **`respondToInvite({ invite_id, action, block_future }, requester)` (CHANGED — D-C3a drops
  `target_member_id`)** (`inviteService.js:142-304`) — require `invite_id` + `action` (`400`). Valid actions
  by role: `global_admin` → `accept`/`decline`/`revoke`; everyone else → `accept`/`decline` (invalid →
  `400`). **Transactional.** Resolve the invite + the target member:
  - **global_admin:** find the `pending` invite by id (`404` else); resolve `targetMember` by
    `LOWER(invited_username)` (`404` on `accept` if not found).
  - **self:** find the `pending` invite by id **AND** `invited_username = requester.username` (`404` else);
    `targetMember = requester`.
  - **Expiry:** if `expires_at` < now → mark `expired`, **commit**, then throw `400` "expired".
  - **`accept`:** if a membership exists and is `removed` → reactivate (`status:'active', left_at:null`),
    mark invite `accepted` (`uses_count+1`), emit **`program.member_joined`** to active members **minus the
    joiner** (restore-data message). If it exists and is **not** `removed` → mark `accepted`, "already a
    member" message (no emit). If none exists → `ProgramMembership.create({ role:'member', status:'active',
    joined_at:now })` **inline**, mark `accepted`, emit `program.member_joined` to active-minus-joiner.
  - **`decline`:** mark `declined`; if `block_future === true` and a target is known →
    `ProgramInviteBlock.findOrCreate({ program_id, member_id })`.
  - **`revoke`:** mark `revoked` (global_admin only — gated by the action allow-list).
  - Messages differ admin-vs-self at each outcome (`inviteService.js:225-297`).

## 5. Data / schema touchpoints

Faithful names (R5); schema in `apps/backend/sql/001_schema.sql`. Both tables + all associations are
**already ported** (they landed with `program-memberships`).

- **`program_invites`** (owned — read + write) — `id` UUID PK, `program_id` FK, `invited_by` FK→members,
  `invited_username` TEXT, `invited_email` TEXT (**unused** — F5), `token_hash` TEXT UNIQUE, `status`
  (`pending`/`accepted`/`declined`/`expired`/`revoked`, default `pending`), `max_uses` (default 1),
  `uses_count` (default 0), `expires_at`, `created_at`. `models/ProgramInvite.js` (`timestamps:false`).
- **`program_invite_blocks`** (owned — read + write) — `id` UUID PK, `program_id` FK, `member_id` FK,
  `created_at`; unique `(program_id, member_id)`. `models/ProgramInviteBlock.js`.
- **`program_memberships`** (read for guards; **written inline by the accept path** — create/reactivate) —
  owned by [`program-memberships`](../program-memberships/SPEC.md). The accept-path write stays **inline**
  here (faithful — legacy writes the join directly, not via `membershipService`) — D-C1.
- **`programs`** (read — existence + `name`) — owned by [`programs`](../programs/SPEC.md).
- **`members`** (read — username resolution + the `member_name` virtual) — owned by
  [`members`](../members/SPEC.md). Associations `InvitedByMember` (`invited_by`) + `SentInvites` already in
  `models/index.js`.
- **`createNotification` + `getActiveProgramMemberIds`** (`utils/notifications.js`, owned by
  `notifications`) — the invite emits, **now wired live** (§7).

## 6. Flags / env

No invite-specific env. Inherits the shared `DATABASE_URL` (DB) and the `auth`/`notifications` Supabase
values. The 30-day expiry and `max_uses:1` are **hardcoded** in `sendInvite` (`inviteSendService.js` `INVITE_TTL_MS`),
not env-driven — F6. SSE/APNs delivery of the emits is owned + configured by `notifications`.

## 7. The migration delta + the two deliberate cleanups — the load-bearing part

**What stays (faithful 1:1):** the 4 route paths + auth gates, the privacy-safe no-op chain on `sendInvite`,
the token/expiry/`max_uses` creation, the inbox projections, the whole transactional `respondToInvite`
state machine (accept→enroll/reactivate-with-data-restore / already-member / decline+block / revoke), the
admin-vs-self message wording, the global-admin accept-on-behalf + revoke powers, the inline
`ProgramMembership` write on accept, the error contract (except 0.2.0 D-C6: an unexpected `POST /invite` failure is a real 500, no longer a 200).

**What changes:**

- **The notification emits are wired LIVE — not deferred (D-C2).** `sendInvite` emits
  `program.invite_received`; the accept path emits `program.member_joined`. Both call the **ported**
  `createNotification` + `getActiveProgramMemberIds` from `utils/notifications.js` (real DB write +
  transactional SSE/APNs dispatch) — **by name, unchanged**. This is the keystone payoff: with
  `notifications` already ported, the faithful behavior is the live behavior, so there is **no stub** (unlike
  `programs` D-C1 / `program-memberships` D-C4, which deferred against the then-unported engine). The
  `member_joined` emit runs **inside** the `respondToInvite` transaction (passes `transaction`), so the
  alert is `afterCommit`-gated by the engine.
- **Drop the vestigial `target_member_id` param (D-C3a).** Legacy `respondToInvite` destructures
  `target_member_id` (`inviteService.js:142`) but **never reads it** — and **neither client sends it** (web
  `respondToInvite` body = `{invite_id, action, block_future}`; iOS the same). The target is resolved
  server-side (from `invited_username` for admin; `= requester` for self). Removed from the destructure;
  no behavior change, smaller surface.
- **Fix `getAllInvites`' N+1 (D-C3b).** Replace the per-invite `Promise.all(Member.findOne)` with a single
  batched `Member.findAll` over the distinct `invited_username`s + an in-memory lowercase map. **Identical
  response shape** (`invited_member_name`/`invited_member_id` per row); honors the workspace "no N+1"
  standard. The per-invite `LOWER(username)` match becomes one case-insensitive `IN` set built in JS.

> **The keystone, realized.** This is the first ported feature whose notification emits are **live from day
> one** — `notifications` (the engine) was ported just before it. The deferred-stub seam used by `programs` /
> `program-memberships` is not needed here.

## 8. Dependencies

- **Upstream:** [`auth`](../auth/SPEC.md) (`authenticateToken`, program-admin / global-admin authz);
  [`programs`](../programs/SPEC.md) (`Program`); [`members`](../members/SPEC.md) (`Member` + `member_name`);
  [`program-memberships`](../program-memberships/SPEC.md) (`ProgramMembership` — the join the accept path
  writes inline; the models + associations it already ported); [`notifications`](../notifications/SPEC.md)
  (`createNotification` + `getActiveProgramMemberIds` — wired live).
- **Downstream:** the `program-memberships` exit cascade (`removeMember`/`leaveProgram`) **writes these
  tables** (revoke pending invites, destroy blocks) — already ported there (that SPEC §7/F5).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-C1** | **Scope = the 4 invite routes + `inviteService` + the `ProgramInvite`/`ProgramInviteBlock` tables.** The accept-path `ProgramMembership` create/reactivate stays **inline** in `inviteService` (faithful — legacy writes the join directly, not via `membershipService`). Co-mounted at `/api/program-memberships`. | `routes/invites.js`; `inviteService.js`; `server.js:50`; user decision. |
| **D-C2** | **Wire the invite emits LIVE** — `program.invite_received` (send) + `program.member_joined` (accept) via the ported `createNotification` + `getActiveProgramMemberIds`. No stub (the keystone is already ported). | `inviteService.js:67-74, 210-222, 251-263`; `apps/backend/utils/notifications.js`; user decision. |
| **D-C3a** | **Drop the vestigial `target_member_id` param** from `respondToInvite` — destructured but never read; sent by neither client. | `inviteService.js:142`; web + iOS consumption sweep; user decision. |
| **D-C3b** | **Fix `getAllInvites`' N+1** — one batched `Member.findAll` + in-memory map instead of `Promise.all(findOne)` per invite. Identical response shape. | `inviteService.js:116-139`; workspace "no N+1" standard; user decision. |
| **D-REF** | **Reference impl = legacy `backend`. `consumed_by = [web, ios]`** — all 4 routes are live on **both** clients with **identical** role gating and matching DTOs (web `lib/api/{invites,members}.ts`; iOS `APIClient+Invites.swift` + `PendingInviteDTO`). **No cross-app divergence.** (Web's program-card accept/decline uses the *program-memberships* `updateMembership`, not this feature — F3.) **Superseded in part 0.2.0 (D-C8):** `consumed_by` = `[web, ios, android]`. | Web + iOS consumption sweep (Explore agents). |
| **D-S1** | **Stance = faithful except D-C3a/D-C3b (two cleanups) + D-C2 (live emits).** Privacy-safe no-ops, the accept state machine, admin-on-behalf powers, and the inline join write are all faithful; other oddities flagged (§10), not changed. | Whole-module review; §7. |
| **D-C4** | **One transaction per sent invite (0.2.0).** `sendInvite` (moved to `services/inviteSendService.js` — `inviteService.js` was 334 lines) runs its authz + no-op checks, then ONE managed `sequelize.transaction`: mark a superseded expired invite `expired`, create the invite, `createNotification({ …, transaction })` — an invite never exists without its notification row, and SSE/push dispatch runs `afterCommit`. A concurrent duplicate that loses the `uniq_program_invites_program_username_pending` race (`23505`, `001_schema.sql:277`) is the `pending_invite` no-op. | DESIGN_BOARD §3.1; W2 F4. |
| **D-C5** | **No-op reasons are logged, never returned (0.2.0).** `sendInvite` returns `{ sent, reason }`; reasons `program_not_found` · `unknown_username` · `already_member` · `blocked` · `pending_invite`. The route always answers `200 { message: "Invitation sent" }` and logs one stdout line `{"type":"invite_noop","request_id":…,"program_id":…,"reason":…}` — joinable to the request log line (which carries `member_id`), never the username. Console (Render, 7 days), not `app_events` — that table stays for client + R1 auth events; no new server-event helper. | DESIGN_BOARD §3.2 (D-12); W2 F3. |
| **D-C6** | **Real errors (0.2.0).** A non-`AppError` throw from `POST /invite` → `500 { error: "Failed to send invitation." }` (it was swallowed into a 200; no `code`, like every backend 500), logged as error name + Postgres code only (observability F8). A non-string `username` or non-UUID `program_id` → `400 "program_id and username are required."`. **Live binaries: no visible change** — web (`members/invite/page.tsx:37-44`), iOS 1.4.2 (`InviteMemberView.swift:161-170`) and Android 1.0.0 (`ProgramContext.kt:999-1006`) all show "Invitation sent" for any non-network error; the three client plans remove that swallow (§3.1). | DESIGN_BOARD §3.2; D-12. |
| **D-C7** | **The inbox hides expired invites (0.2.0).** `GET /my-invites` adds `expires_at IS NULL OR expires_at > now` (accepting one only returned `400 "This invite has expired."`; 5 prod invites expire ~2026-10-21). `GET /all-invites` is unchanged (admin view). | DESIGN_BOARD §3.1; W2 F12. |
| **D-C8** | **One invite inbox for web / iOS / Android (0.2.0).** `GET /my-invites` + `PUT /invite-response` (+ `POST /invite`) are THE contract for all three (§3.1). Web (`lib/api/invites.ts:23,34`) and iOS (`APIClient+Invites.swift:71,94`) already use them; Android adopts them in its next build — its 1.0.0 picker reads `invited` membership rows that nothing creates (0 in prod, W2 F1/E2); no shim (board ✅). `consumed_by` += `android` now: Android 1.0.0 already calls `POST /invite` (`ApiService.kt:252`). Web's program-card accept path over `program-memberships` (F3) acts only on those never-created rows — the web client plan retires it. | DESIGN_BOARD §3.1; W2 F1/E2. |
| **D-C9** | **All three clients on §3.1 (0.2.1 — web live, iOS 1.5.0 (58), Android 1.1.0 (5); approval amendments A1, A10).** (a) The send swallow is gone: `Invitation sent` only on `200`; other statuses through the frontend-kit (web `members/invite/page.tsx`, iOS `InviteMemberView.swift`, Android `MemberManagementScreens.kt`). (b) The `PUT /invite-response` 200 `message` is not shown; accept / decline / revoke errors are (web: a `respondError` line in `InvitesTab` + the decline modal). (c) **Card actions:** the *invited* card's Accept / Decline is retired on all three (the inbox is the one path — completes D-C8 / F3); the *requested* card keeps its Cancel request (program-memberships). (d) Android adopts the inbox incl. the global-admin **All Invites + Revoke** (`fetchAllInvites`, a Revoke pill when `isGlobalAdmin`); `PendingInviteDTO` carries explicit `@SerialName`s. (e) Inbox refresh triggers per §3.1. No backend change. | Phase 3 client plans C1 / C2 / C3 + approval amendments (2026-10-13). |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **`sendInvite` is privacy-safe for every no-op** — missing/deleted program, unknown/blocked/already-member target, existing pending invite (incl. a concurrent duplicate) all return the same `200 { message: "Invitation sent" }`; the reason is logged server-side only (D-C5). **0.2.0:** unexpected failures are no longer swallowed — `500 { error }` (D-C6). | `inviteSendService.js`; `routes/invites.js` | Kept — a security property; the swallow-to-200 half was removed by D-C6. |
| **F2** | **Global admin can accept/decline on behalf + revoke** any pending invite (`accept`/`decline`/`revoke` allow-list); a normal user is scoped to their own invite (`invited_username = requester.username`). | `inviteService.js:147-188, 292-298` | Kept (faithful) — intended admin power. |
| **F3** | **Web has a *second* accept/decline path** on program cards that calls `program-memberships` `updateMembership` (status `active`/`removed`), **not** this feature's `/invite-response`. Two UI entry points, two backends; this SPEC owns only `/invite-response`. | web `app/programs/page.tsx:239-244` (program-memberships) | **Retired (web, C1)** — 0.2.1 (D-C9c): the `invited` card's Accept/Decline is gone on all three clients; a `requested` card keeps Cancel request (program-memberships). |
| **F4** | **`invited_by_name`/`invited_member_name` rely on the `Member.member_name` VIRTUAL** — the includes select only `first_name`/`last_name`/`username`; the virtual computes the name. Works because the dependent real columns are selected. | `inviteService.js:84,96,111,132,136`; `models/Member.js` (VIRTUAL) | Kept (faithful) — relies on the virtual's deps being selected. |
| **F5** | **`program_invites.invited_email` is unused** — the column + model field exist; every code path invites by **username** only. | `models/ProgramInvite.js:30-33`; `inviteService.js` (no read/write) | Kept (faithful) — vestigial column; cleanup candidate. |
| **F6** | **Expiry (30 days) + `max_uses` (1) are hardcoded** in `sendInvite`, not env/config-driven; `uses_count` increments on accept but `max_uses` is never re-checked (single-use by construction). | `inviteService.js:62-64, 208,232,249` | Kept (faithful) — would be config in a redesign. |
| **F7** | **`getAllInvites` originally N+1** (one `Member.findOne` per invite) — **fixed in the rebuild** (D-C3b, batched). Recorded here as the legacy characteristic that motivated the cleanup. | `inviteService.js:116-139` (legacy) | Fixed (D-C3b). |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.1 | 2026-10-13 | **Clients on §3.1 (reliability-overhaul Phase 3 client release — web live, iOS 1.5.0 (58), Android 1.1.0 (5)).** D-C9: the send swallow removed on all three (`Invitation sent` only on 200); the `PUT /invite-response` message is not shown (§3.1 amended, A1) and its errors are (A10); inbox refetch after every response (web `onSettled`) and on SSE / push / re-fetch invite hints; the *invited* card's Accept/Decline retired on all three, the *requested* Cancel request kept (F3 → Retired (web, C1)); Android adopts the inbox incl. global-admin All Invites + Revoke. §3.1 caller refs refreshed. No backend change. PATCH. |
| 0.2.0 | 2026-10-12 | **Reliability overhaul Phase 3 R3 (backend).** D-C4 `sendInvite` moved to new `services/inviteSendService.js`; supersede-expired + create invite + `program.invite_received` notification in ONE managed transaction (push/SSE after commit); a concurrent duplicate (`23505` on `uniq_program_invites_program_username_pending`) = the pending no-op. D-C5 every no-op returns a reason the route logs as `{"type":"invite_noop","request_id","program_id","reason"}` (never the username). D-C6 unexpected failures → `500 { error: "Failed to send invitation." }` (were a false 200); non-string `username` / non-UUID `program_id` → 400; live binaries show no change (they swallow non-network errors — the client plans remove that). D-C7 `GET /my-invites` hides expired invites. D-C8 one inbox for web / iOS / Android (client contract §3.1); `consumed_by` += `android`. MINOR — owned-interface + `consumed_by` change; response shapes unchanged; dependent program-memberships unaffected. |
| 0.1.0 | 2026-06-28 | Initial SPEC authored via `question-asker`. Read the legacy `routes/invites.js` + `inviteService.js` + the two models in full; fanned 2 `Explore` agents over web + iOS consumption (`consumed_by = [web, ios]`, all 4 routes 1:1, no divergence). Documents the 4 owned `/api/program-memberships` invite routes + `inviteService` + the `ProgramInvite`/`ProgramInviteBlock` tables. Decisions D-C1 (scope; inline accept-path join write) / D-C2 (emits wired **live** — the keystone is ported, no stub) / D-C3a (drop vestigial `target_member_id`) / D-C3b (fix `getAllInvites` N+1) / D-REF (`consumed_by [web, ios]`, gates match) / D-S1 (faithful except the two cleanups). Flagged F1–F7. |
