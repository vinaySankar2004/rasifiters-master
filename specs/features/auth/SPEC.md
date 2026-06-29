# Feature: `auth` — authentication, session, and request authorization

> **Status:** 🏗️ built (ported to `apps/backend/`; not yet deployed) · **Version:** 0.1.0 · **Apps (`consumed_by`):** `web`, `ios`
> **Reference impl (legacy):** `../../../backend` — `routes/auth.js`, `services/authService.js`,
> `middleware/auth.js`, `models/{Member,MemberEmail,MemberCredential,RefreshToken,MemberPushToken}.js`,
> `server.js`.
> **Migration anchor:** METHODOLOGY.md **R1** (Supabase Auth via Express proxy + bcrypt import +
> `members.auth_user_id`). This SPEC is the detailed contract for R1.

---

## 1. What it is

The single front door for **identity** in RaSi Fiters: who a request is, and what they're allowed to do.
It owns three things as one cohesive module (decision **D-C1**, faithful to the legacy single
`middleware/auth.js` + `routes/auth.js` + `authService.js` triad):

1. **Authentication** — login / refresh / logout / register / change-password / delete-account, exposed
   as `/api/auth/*` routes that **proxy Supabase Auth**.
2. **Session verification** — the `authenticateToken` middleware that verifies a **Supabase-issued JWT**
   on every protected request and establishes `req.user`.
3. **Authorization gates** — the role/membership middlewares (`isAdmin`, `requireProgramAdmin`,
   `requireProgramMember`, `canModifyLog`) that every other feature applies per-route.

Both clients (`web`, `ios`) consume it through the same backend; the API response shapes are preserved
1:1 so **neither client changes** (decision **D-C3**).

## 2. Why it exists

Every other feature (members, programs, logs, analytics, notifications) is gated by it — nothing else can
be rebuilt until the identity layer is in place. It is also the **one feature that structurally changes**
in the migration: the legacy app self-issues JWTs and stores password hashes in `member_credentials`;
the rebuild moves credentials + token issuance to **Supabase Auth** while keeping Express as the
auth-facing API so the clients see no difference. See **§7** for exactly what changes vs stays.

## 3. Functionality (the routes)

All mounted at **`/api/auth`** (legacy `server.js:46`). Reference handlers in `routes/auth.js`; logic in
`services/authService.js`.

| # | Route | Legacy handler | Auth? | Purpose |
|---|-------|----------------|-------|---------|
| 1 | `POST /login` | `routes/auth.js:8-18` → `loginLegacy` (`authService.js:131-154`) | no | Web login. Returns legacy payload (`role`). |
| 2 | `POST /login/app` | `routes/auth.js:35` → `loginGlobal` (`authService.js:156-185`) | no | Mobile login. Returns `global_role` + `member_id`; upserts push token. |
| 3 | `POST /login/global` | `routes/auth.js:36` → same `handleAppLogin` | no | Alias of `/login/app` (identical handler). |
| 4 | `POST /refresh` | `routes/auth.js:38-47` → `refreshAccessToken` (`authService.js:187-228`) | no | Exchange a refresh token for a fresh access (+ refresh) token. |
| 5 | `POST /logout` | `routes/auth.js:49-58` → `logout` (`authService.js:230-240`) | no | Revoke the supplied refresh token. |
| 6 | `POST /register` | `routes/auth.js:60-69` → `register` (`authService.js:242-300`) | no | Create a new account (member + email + credential). 201. |
| 7 | `PUT /change-password` | `routes/auth.js:71-80` → `changePassword` (`authService.js:302-315`) | **yes** | Set a new password for the authenticated member. |
| 8 | `DELETE /account` | `routes/auth.js:82-91` → `deleteAccount` (`authService.js:317-409`) | **yes** | Delete the authenticated member + cascade cleanup. |

### Response shapes (preserved 1:1 — D-C3)

- **`/login`** (`authService.js:145-153`): `{ token, refresh_token, username, role, member_name,
  date_joined, message: "Login successful!" }` where `role ∈ {"admin","member"}` (mapped from
  `global_role === "global_admin"`, `authService.js:149`).
- **`/login/app` · `/login/global`** (`authService.js:176-184`): `{ token, refresh_token, member_id,
  username, member_name, global_role, message: "Login successful" }` where `global_role ∈
  {"standard","global_admin"}`.
- **`/refresh`** (`authService.js:223-227`): `{ token, refresh_token, message: "Token refreshed" }`.
- **`/logout`** (`authService.js:239`): `{ message: "Logged out" }`.
- **`/register`** (`authService.js:289-294`, HTTP 201): `{ message: "Account created successfully",
  member_id, username, member_name }`.
- **`/change-password`** (`authService.js:314`): `{ message: "Password changed successfully." }`.
- **`/account`** (`authService.js:403`): `{ message: "Account deleted successfully." }`.

### Error contract (faithful — `routes/auth.js` + `utils/response.AppError`)

`AppError(statusCode, message)` → `{ error: message }` at that status; any other throw → `500` with a
generic `"Server error during <op>"`. Status codes used: `400` (missing/invalid input), `401` (invalid
credentials / token), `403` (global-admin delete block), `404` (credentials/account not found).

## 4. Feature list (behaviors to port)

- **Username-or-email login.** `identifier || username` is resolved by `resolveMemberByIdentifier`
  (`authService.js:68-81`): exact `members.username` match first, else normalized-email
  (`trim().toLowerCase()`) lookup against `member_emails` joined to the member. **In the rebuild this
  becomes the privacy-safe username→email resolution**: resolve identifier → member → the member's
  **primary** `member_emails` row → call Supabase sign-in with that email (D-C2, §7).
- **Dual login payloads / client types.** Legacy `buildLegacyPayload` (`authService.js:49-56`) vs
  `buildGlobalPayload` (`58-64`); the refresh path rebuilds the right one from the stored
  `refresh_tokens.client_type` (`authService.js:209-213`). Preserved as a flagged characteristic
  (§10 — F1) since the two clients still expect different login response shapes.
- **Refresh-token rotation.** Legacy: SHA-256 hash stored in `refresh_tokens`, single-use, old token
  marked `revoked_at` + `replaced_by_hash` on rotation (`authService.js:216-221`); expiry from
  `REFRESH_TOKEN_TTL_DAYS` (`authService.js:26-30`). **In the rebuild this is owned by Supabase Auth**
  (the `refresh_tokens` table + this rotation code retire — R1); `/refresh` proxies Supabase's token
  endpoint.
- **Password policy** (`validatePassword`, `authService.js:83-91`): ≥ 8 chars, must include a lowercase,
  an uppercase, and a digit. **Kept in Express** on `/register` + `/change-password` (D-S1) — we do not
  defer to Supabase's password policy.
- **Registration** (`authService.js:242-300`): transactional create of `members` (`global_role
  "standard"`, `status "active"`) + `member_credentials` (bcrypt cost 10) + `member_emails`
  (`is_primary: true`, unverified). Uniqueness checks on username and normalized email. **Rebuild:**
  create the Supabase Auth user (admin API) + `members` + `member_emails` + backfill `auth_user_id`; no
  `member_credentials` write (R1).
- **Change password** (`authService.js:302-315`): re-hash + update `member_credentials`. **Rebuild:**
  Supabase admin update of the auth user's password.
- **Delete account** (`authService.js:317-409`): blocks `global_admin` (403, `:327-330`); cascades —
  deletes `program_invites` referencing the member (by id / username / any of their emails, `:338-348`),
  deletes `notifications` where `actor_member_id` = member (`:350-353`), runs `handleMemberExit` for every
  active membership + every program they created (reassigning `created_by`, possibly deleting the program,
  notifying remaining members, `:355-398`), then destroys the member (`:400`). **Rebuild:** same cascade,
  plus delete the Supabase Auth user (admin API). The non-auth cascade (invites/notifications/membership
  exit) is **referenced** as belonging to those features, not owned here (D-C1).
- **Push-token capture on mobile login** (`loginGlobal` → `upsertPushToken`, `authService.js:99-121`,
  `171-174`). **Referenced** — owned by the `notifications` feature; this SPEC only notes the call site.

### Request authorization (the middleware this feature owns — `middleware/auth.js`)

| Middleware | Lines | Rule |
|------------|-------|------|
| `authenticateToken` | `4-19` | Verify the bearer JWT → `req.user`. **This is the piece that changes** (§7). |
| `isAdmin` | `21-33` | Pass if `req.user.role === "admin"` **or** `global_role === "global_admin"`; else 403. |
| `requireProgramAdmin` | `65-93` | `global_admin` bypasses; else require an `active` `program_memberships` row with `role "admin"` for the resolved `program_id`; else 403. |
| `requireProgramMember` | `95-123` | `global_admin` bypasses; else require any `active` membership; attaches `req.programMembership`; else 403. |
| `canModifyLog` | `35-63` | `role "admin"` bypasses; else the request's `member_id`/`member_name` must equal the caller's; else 403. |

`program_id` is resolved from `req.body.program_id || req.query.programId || req.params.programId`
(`auth.js:74, 104`). A second, SSE-specific verifier, `authenticateStream`, lives in
`routes/notifications.js:11-28` (accepts the token via `?token=` query as well as the header) — it is the
**same verification logic** and must migrate in lockstep with `authenticateToken` (§10 — F5).

## 5. Data / schema touchpoints

Owned/required by this feature (faithful names, R5; schema in `apps/backend/sql/001_schema.sql`):

- **`members`** — `id` (preserved UUID, the FK anchor for everything), `username` (unique), `first_name`,
  `last_name`, `gender`, `global_role` (`'standard'|'global_admin'`), `status` (`'active'|'disabled'`),
  and the **added** `auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL`
  (`001_schema.sql:34`, index `:242`). Virtuals in the model: `member_name` = `first_name + " " +
  last_name`, `date_joined` = `created_at` as `YYYY-MM-DD` (`models/Member.js`).
- **`member_emails`** — `member_id`, `email` (unique, normalized lowercase), `is_primary`, `verified_at`.
  Drives username→email resolution + the registration email write.
- **`auth.users`** (Supabase-managed) — the credential store; `members.auth_user_id` → `auth.users.id`,
  `sub` in the JWT = `auth.users.id`. Populated by the migrator (bcrypt hashes imported, 48/48 linked).
- **Retired at cutover (R1):** `member_credentials`, `refresh_tokens` (and `REFRESH_TOKEN_TTL_DAYS`).
- **Referenced (read) for authorization, owned by other features:** `program_memberships`
  (`role`, `status`), `programs` (`admin_only_data_entry`, `created_by`).

## 6. Flags / env

| Var | Legacy use | Rebuild |
|-----|-----------|---------|
| `JWT_SECRET` | sign + verify self-issued JWTs (`authService.js:24`, `auth.js:13`) | **retired** (Supabase signs; we verify via JWKS — D-C2). |
| `ACCESS_TOKEN_TTL` | access-token expiry, default `"1h"` (`authService.js:21`) | **retired** → Supabase Auth config. |
| `REFRESH_TOKEN_TTL_DAYS` | refresh expiry, `90` (`authService.js:26-30`) | **retired** → Supabase Auth config. |
| `DB_URL` | Sequelize → Render Postgres (`config/database.js:5`) | → Supabase Postgres connection string. |
| — (new) | — | **`SUPABASE_URL`**, **`SUPABASE_SERVICE_ROLE_KEY`** (admin API for sign-in proxy / createUser / updateUser / deleteUser), **`SUPABASE_JWKS_URL`** / project ref (JWT verification). Concrete values in `ENV_RUNBOOK.md` at build time. |

## 7. The migration delta (legacy → Supabase Auth) — the load-bearing part

**What stays:** the `/api/auth/*` route surface, the response shapes, the error contract, the password
policy, username-or-email login, the dual login payloads, and **all four authorization middlewares
unchanged** (`isAdmin`/`requireProgramAdmin`/`requireProgramMember`/`canModifyLog` keep reading
`req.user.role` / `req.user.global_role` and querying `program_memberships`).

**What changes — only the credential + token + verify plumbing:**

- **Login** no longer bcrypt-compares locally. Express resolves `identifier`→member→primary email
  (`member_emails`), then calls **Supabase sign-in with email+password**; Supabase verifies the imported
  bcrypt hash and returns its access + refresh tokens. Express maps the member's data into the legacy
  response shape and returns Supabase's tokens as `token` / `refresh_token`.
- **`authenticateToken` is replaced** (D-C2): verify the Supabase JWT via **JWKS (ES256)**, read `sub`,
  then **look up the member by `members.auth_user_id = sub`** and build the same `req.user`
  (`{ id: members.id, username, member_name, global_role, role }`) the rest of the app already expects.
  This is **one indexed lookup per request** (`idx_members_auth_user_id`) — a deliberate change from the
  legacy lookup-free, self-contained token (§10 — F2), chosen for faithfulness to the existing `req.user`
  contract without a Supabase auth-hook to maintain.
- **`/refresh`** proxies Supabase's token-refresh; **`/logout`** revokes via Supabase. The
  `refresh_tokens` table + the SHA-256 hash/rotation code in `authService.js` retire.
- **`/register` / `/change-password` / `/account`** call the Supabase admin API (createUser /
  updateUserById / deleteUser) in addition to / instead of the `member_credentials` writes; the
  non-credential parts (members/email rows, the delete cascade) stay as-is.

## 8. Dependencies

- **Upstream:** Supabase Auth (credential store + token issuer/verifier), `members.auth_user_id` (created
  by the migrator + `001_schema.sql`), `member_emails` (resolution source).
- **Downstream (everything):** every other feature applies this feature's middleware. `notifications`
  owns the push-token upsert called from `loginGlobal`. The delete-account cascade depends on the
  `program-memberships`, `invites`, and `notifications` features' tables.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-C1** | **Scope = the whole `middleware/auth.js` module as one unit** — this feature owns authentication (routes + service), session verification (`authenticateToken`), **and** the authorization gates (`isAdmin`/`requireProgramAdmin`/`requireProgramMember`/`canModifyLog`). The per-route *application* of those gates, and the non-auth delete cascade + push-token upsert, are **referenced** by their owning features. | `middleware/auth.js` is one cohesive file; `routes/auth.js`; `authService.js`. |
| **D-C2** | **Verify Supabase JWTs via JWKS (ES256) + a per-request DB lookup** `sub`→`members.auth_user_id` to rebuild the existing `req.user` shape. Not custom claims / auth-hook; not the legacy HS256 shared secret. | Replaces `auth.js:13-14`; `001_schema.sql:34,242`; METHODOLOGY R1. |
| **D-C3** | **Clients unchanged; `consumed_by = [web, ios]`.** Express returns the exact legacy response shapes; login proxies Supabase sign-in (resolved email); refresh/logout proxy Supabase; the `refresh_tokens` rotation table retires. | `authService.js:145-153, 176-184, 223-227`; CONTEXT.md (backend) Auth §. |
| **D-S1** | **Faithful 1:1 stance.** Preserve endpoints, response shapes, the ≥8/upper/lower/digit password rule, dual legacy/global payloads, and all authorization rules. Oddities are kept and flagged in §10, not fixed now. | `validatePassword` (`authService.js:83-91`); whole-module review. |
| **D-REF** | **Reference implementation** = legacy `../../../backend` (`routes/auth.js`, `services/authService.js`, `middleware/auth.js`, the five auth models, `server.js:46`). Faithful port except the §7 credential/token/verify delta. | Verified file:line throughout this SPEC. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Dual login payloads / response shapes** — `/login` returns `role` (`admin`/`member`), `/login/app` returns `global_role` + `member_id`. Two clients, two shapes, plus a `client_type` (`legacy`/`global`) that drove refresh-payload rebuild. | `authService.js:49-64, 145-184, 209-213` | Possible (unify post-migration), but **kept** for client compatibility. |
| **F2** | **Per-request DB lookup in verify** — a deliberate change from the legacy lookup-free, self-contained token. | new `authenticateToken` (D-C2) vs `auth.js:13-14` | No — intentional (cost: one indexed read). |
| **F3** | **Unused auth tables** — `auth_identities` (Apple SSO) and `email_verification_tokens` exist in the legacy schema but have **no model, no routes, no flow** (and were excluded from `001_schema.sql`). Email verification + OAuth are unimplemented. | legacy `docs/db-schema.sql:103-122`; migration notes | Yes — Supabase Auth would own these if ever built; left out. |
| **F4** | **No rate limiting** on any auth route (login/register included). | `routes/auth.js` (no limiter) | Yes — add a limiter in the rebuild if desired (out of scope for faithful port). |
| **F5** | **Two JWT verifiers** — `authenticateToken` (`middleware/auth.js`) and `authenticateStream` (`routes/notifications.js:11-28`, also accepts `?token=`). Both must migrate to Supabase-JWT verification together. | `auth.js:4-19`; `notifications.js:11-28` | Consolidate into one shared verifier during the rebuild. |
| **F6** | **`rejectUnauthorized: false`** on the legacy DB SSL config. | legacy `config/database.js:8-11` | Yes — review TLS posture against Supabase (don't carry the laxness blindly). |
| **F7** | **`userId` duplicates `id`** in the legacy payload (`buildLegacyPayload`); only `id` is read downstream. | `authService.js:51` | Yes — drop `userId` when unifying payloads (F1). |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-28 | Initial SPEC authored via `question-asker` (Phase 2 kickoff). Documents the legacy `/api/auth/*` surface + `middleware/auth.js` and the R1 Supabase-Auth migration delta. Decisions D-C1/D-C2/D-C3/D-S1/D-REF; flagged F1–F7. |
| 0.1.0 (built) | 2026-06-28 | **Ported to `apps/backend/`** — faithful foundation (13 models + `index.js` minus retired `member_credentials`/`refresh_tokens`; `Member.auth_user_id` added) + the auth slice (`config/supabase.js` JWKS verify, `middleware/auth.js`, `services/authService.js`, `routes/auth.js`, `server.js` mounting only `/api/auth`). Status 📄→🏗️ (no semver bump — faithful port, contract unchanged). Known gaps: `DELETE /account`→501 (cascade owned by program-memberships/notifications, D-C1); backend deploy + asymmetric Supabase JWT keys pending. |
| 0.1.0 (infra) | 2026-06-28 | **Backend host = Render, not Railway** (METHODOLOGY R7) — the D-C2 JWKS verify path is unchanged; the deploy target is a Render web service (Blueprint `apps/backend/render.yaml`). **Asymmetric Supabase JWT keys RESOLVED:** the project's JWKS endpoint serves a live `ES256`/P-256 key, so JWKS verify finds a key. No SPEC/contract change (no semver bump). Remaining gap: `DELETE /account`→501 (unchanged). |
| 0.1.0 (deployed 🚀) | 2026-06-28 | **DEPLOYED to Render + verified live** at `https://rasifiters-api.onrender.com` (service `srv-d90tgmv7f7vs73cudptg`). Full auth round-trip green against migrated data (admin): `login`→200 (member resolution + primary-email + Supabase sign-in, **imported bcrypt password verified**, ES256 JWT `kid 0f6cd324…`); guarded route w/ valid token→200 (`authenticateToken` JWKS verify + `sub`→`members.auth_user_id`→`req.user`, the D-C2 path); garbage token→401; `refresh`→200; `logout`→200; unauth guard→401. Status 🏗️→🚀 (faithful deploy, no semver bump). **Migration fix shipped:** placeholder (no-email) members lacked a `member_emails` row → `admin` 401'd before password check; backfilled via `apps/backend/sql/002_backfill_placeholder_member_emails.sql` + `tools/migrator/src/importAuth.js` (writes the placeholder row on create/link/re-run). Remaining gap: `DELETE /account`→501 (unchanged). |
