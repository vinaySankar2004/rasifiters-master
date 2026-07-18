# Feature: `auth` — authentication, session, and request authorization

> **Status:** 🚀 deployed (live on Render) · **Version:** 0.9.0 · **Apps (`consumed_by`):** `web`, `ios`, `android`
> **Provenance (legacy, archived):** `backend` — `routes/auth.js`, `services/authService.js`,
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

All three clients (`web`, `ios`, `android`) consume it through the same backend; the legacy API response
shapes are preserved 1:1 (decision **D-C3**), and the NET-NEW federated/identity surfaces (`/oauth*`,
`/identities`, `/link`, `/unlink`, `/set-password`) share one contract across surfaces.

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
| 8 | `DELETE /account` | `routes/auth.js:82-91` → `deleteAccount` (`authService.js:deleteAccount`) | **yes** | Delete the authenticated member: shared cross-feature cascade (`cascadeMemberDeletion`) + Supabase auth-user delete. **WIRED** (D-C1). |
| 9 | `POST /forgot-password` | **NET-NEW** (no legacy handler) → `requestPasswordReset` | no | **Self-service password recovery, request step.** Proxies Supabase `resetPasswordForEmail`. **Privacy-safe — always 200** with a generic message (no account-enumeration). Pairs with `POST /reset-password`. **D-C4.** |
| 10 | `POST /reset-password` | **NET-NEW** (no legacy handler) → reuses `changePassword` | **yes** (recovery token) | **Self-service password recovery, RESET step.** The web `/reset-password` page sends the Supabase recovery `access_token` as Bearer; `authenticateToken` verifies it + maps `sub`→member, then reuses `changePassword` to set the new password. **D-C5.** |
| 11 | `PUT /email` | **NET-NEW** (no legacy handler) → `changeEmail` (`authService.js`) | **yes** | **Self-service email change.** Re-auths the current password (Supabase `signInWithPassword`), then **direct** change: Supabase `admin.updateUserById({ email, email_confirm:true })` + the primary `member_emails` row (compensating-revert on DB failure). Keeps `auth.users` + `member_emails` in sync; session JWT stays valid. **D-C6.** |
| 12 | `GET /me` | **NET-NEW** (no legacy handler) → inline in `routes/auth.js` | **yes** | **Server-authoritative identity ("who am I").** Echoes the JWKS-verified, `auth_user_id`→member-mapped `req.user` (no DB query, no service): `{ member_id, username, member_name, global_role }`. Exists so the **web** can self-heal a stale/missing `session.user.id` (the member's `members.id`) on load — the web derives the id only from the login response and never re-derives it, and a stock Supabase JWT carries no `id` claim. Additive: the LIVE iOS binary never calls it. **D-C7.** |
| 13 | `POST /oauth` | **NET-NEW** (no legacy handler) → `socialSignIn` (`authService.js`) | no | **Federated (Google/Apple) sign-in.** Body accepts a provider `id_token` (native mobile: GoogleSignIn / Credential Manager / ASAuthorization) **OR** a Google auth `code` (web custom-button auth-code/popup flow — the backend exchanges it for an `id_token` at Google's token endpoint via `GOOGLE_WEB_CLIENT_SECRET`, `redirect_uri=postmessage`, so the browser can render its OWN button instead of Google's widget). Then exchanges the `id_token` via Supabase `signInWithIdToken` (R1 — the client never embeds Supabase, never holds the client secret). Returns a login `AuthResponse` (existing member, by `auth_user_id` else verified provider email → link if unlinked) **or** `{ needs_profile:true, ... }` for a brand-new social user (→ `/oauth/complete`). **409** if the provider email already belongs to a different auth user. **D-C8.** |
| 14 | `POST /oauth/complete` | **NET-NEW** (no legacy handler) → `completeSocialRegistration` (`authService.js`) | **yes** (pending session) | **Finish a brand-new federated sign-up.** The pending Supabase `access_token` from `POST /oauth` is the **Bearer** (verified directly via JWKS — no member row exists yet to map through `authenticateToken`); the client re-sends its `refresh_token` in the body. Creates `members` + `member_emails` linked to the already-created auth user (no `createUser`, no password), then returns the login `AuthResponse` (201). Txn + compensation mirrors `register` with a concurrent-double-submit race guard. **D-C9.** |
| 15 | `GET /identities` | **NET-NEW** (no legacy handler) → `listIdentities` (`authService.js`) | **yes** | **List the signed-in member's sign-in methods** for account settings: `{ identities: [{ provider, email }], has_password }`. `has_password` derived from the `email` identity and/or `app_metadata.providers`. **D-C10.** |
| 16 | `POST /link` | **NET-NEW** (no legacy handler) → `linkProvider` (`authService.js`) | **yes** | **Link a Google/Apple identity to the current member.** Body: `{ provider, id_token \| code (web Google), refresh_token, nonce? (iOS) }`. Binds an ephemeral client to the caller's own session (Bearer + `refresh_token`) and calls GoTrue `linkIdentity` onto the member's existing `auth_user_id` (R1; no OAuth redirect). **409** if that identity already belongs to a different auth user; **400** if Supabase "Manual linking" is disabled. **D-C10.** |
| 17 | `POST /unlink` | **NET-NEW** (no legacy handler) → `unlinkProvider` (`authService.js`) | **yes** | **Unlink a provider.** Body: `{ provider, refresh_token }`. Session-bound `unlinkIdentity`; **rejects (400)** removing the member's last usable sign-in method. **D-C10.** |
| 18 | `POST /set-password` | **NET-NEW** (no legacy handler) → `setPassword` (`authService.js`) | **yes** | **Add/replace the password** for a social-only member. Body: `{ new_password }`; `validatePassword` → `admin.updateUserById({ password })`; returns the refreshed identities with `has_password:true`. **D-C10.** |

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
- **`/email`** (`changeEmail`, NET-NEW): on success `200 { message: "Email updated successfully.", email }`.
  `400` (bad/duplicate/no-op email), `401` (current password incorrect), `404` (account/email not found),
  `500` (DB write failed after the Supabase update — best-effort reverted).
- **`/account`** (`authService.js:403`): `{ message: "Account deleted successfully." }`.
- **`/me`** (inline, NET-NEW D-C7): `200 { member_id, username, member_name, global_role }` straight from
  `req.user` (`middleware/auth.js` resolved identity). `401` if the bearer JWT is missing/invalid. No body.
- **`/forgot-password`** (`requestPasswordReset`, NET-NEW): **always** `200 { message: "If an account
  with that email exists, a password reset link has been sent." }` — the **same** response whether or not
  the email maps to an account (no enumeration). A malformed/empty email returns the same 200 (no Supabase
  call made); a Supabase error is swallowed.
- **`/reset-password`** (reuses `changePassword`, NET-NEW): on success `200 { message: "Password changed
  successfully." }`. The recovery `access_token` is the Bearer; `authenticateToken` → **401** on an
  expired/invalid/used recovery token, then `changePassword` → **400** on a password that fails the policy.
  No new response shape (identical to `/change-password`).
- **`/oauth`** (`socialSignIn`, NET-NEW D-C8): for an **existing** member, the **login `AuthResponse`**
  (`{ token, refresh_token, member_id, username, member_name, global_role, message: "Login successful" }` —
  identical to `/login/app`). For a **brand-new** social user, `200 { needs_profile: true, email,
  first_name, last_name, token, refresh_token }` (the prefill + the pending Supabase session for
  `/oauth/complete`). `400` (unsupported provider / missing token), `401` (federated sign-in failed),
  `409` ("An account with this email already exists. Sign in with your password." — provider email maps to
  a different auth user).
- **`/oauth/complete`** (`completeSocialRegistration`, NET-NEW D-C9, HTTP **201**): the **login
  `AuthResponse`** (same shape as `/login/app`; `refresh_token` echoes the client-re-sent value). `401`
  (missing/invalid/expired pending Bearer, or invalid session), `400` (missing `username`, duplicate
  username/email, or the provider account has no email).

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
- **Delete account** (`authService.js:deleteAccount`, **WIRED**): blocks `global_admin` (403); runs the
  shared cascade `utils/programMemberships.cascadeMemberDeletion` — deletes `program_invites` referencing
  the member (by id / username / any of their emails), deletes `notifications` where `actor_member_id` =
  member, runs `handleMemberExit` for every active membership + every program they created (reassigning
  `created_by`, possibly deleting the program, notifying remaining members), then destroys the member.
  **Rebuild delta:** after the transaction commits, best-effort delete the Supabase Auth user (admin API).
  The non-auth cascade is **owned by `program-memberships`** (single-sourced) and shared verbatim with
  `DELETE /api/members/:id` (D-C1).
- **Password recovery — request step** (`requestPasswordReset`, **NET-NEW**, no legacy equivalent — D-C4):
  normalize the email, and if it's syntactically valid call Supabase `resetPasswordForEmail(email,
  { redirectTo: PASSWORD_RESET_REDIRECT_URL })` (the link lands on our **own** web `/reset-password` page —
  R1). **Always returns the same generic 200** regardless of existence/validity/delivery (no enumeration);
  Supabase errors are swallowed. This is the migration's new self-service recovery (legacy had none on
  either client).
- **Password recovery — reset (consume) step** (`POST /reset-password`, **NET-NEW**, no legacy equivalent —
  D-C5): the web `/reset-password` page extracts the Supabase recovery `access_token` from the email-link
  **URL fragment** (Supabase **implicit** flow — `config/supabase.js` `flowType: "implicit"`, required
  because the backend initiates `resetPasswordForEmail` but an arbitrary browser completes it; PKCE would
  strand the code verifier server-side) and sends it as the **Bearer** token. The route reuses
  `authenticateToken` (JWKS-verify the recovery token + map `sub`→member) + the existing `changePassword`
  (Supabase admin `updateUserById`) — **single-sourcing the password update + policy**, no bespoke service
  fn. An expired/used token → 401 (the page tells the user to request a new link); a weak password → the
  policy 400. R1: the client never embeds Supabase — the token round-trips through Express. Drives the web
  [`reset-password`](../../pages/web/reset-password/SPEC.md) page.
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

Required by this feature (faithful names, R5; schema in `apps/backend/sql/001_schema.sql`; the app tables
below are **owned by the `members` feature** — auth reads/writes them but does not own their schema):

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
| — (new) | — | **`PASSWORD_RESET_REDIRECT_URL`** (D-C4) — the recovery email link destination; MUST equal the deployed web origin + `/reset-password` and be allow-listed in Supabase → Auth → URL Configuration → Redirect URLs. Unset / not-allow-listed → Supabase falls back to its Site URL. Committed (non-secret) in `render.yaml` = `https://rasifiters.com/reset-password`. **CONFIGURED LIVE 2026-06-30:** Supabase **Site URL** set to `https://rasifiters.com` + this URL added to the Redirect-URLs allow-list (was the dev default `http://localhost:3000`, which is why the link initially landed there). Recovery verified end-to-end incl. Outlook. |
| — (new) | — | **Supabase client `flowType: "implicit"`** (`config/supabase.js`, D-C5) — not an env var but a load-bearing client config: it makes the recovery email link deliver the session in the URL **fragment** (consumable by any browser + forwarded through Express) rather than a PKCE `?code=` that would strand the verifier on the server-side initiating client. Implicit is already supabase-js's default; pinned explicitly to survive a future default flip. |

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
| **D-C3** | **Legacy shapes unchanged; `consumed_by = [web, ios, android]`** (`android` added v0.7.0 — doc↔code lag fix). Express returns the exact legacy response shapes; login proxies Supabase sign-in (resolved email); refresh/logout proxy Supabase; the `refresh_tokens` rotation table retires. | `authService.js:145-153, 176-184, 223-227`; CONTEXT.md (backend) Auth §. |
| **D-S1** | **Faithful 1:1 stance.** Preserve endpoints, response shapes, the ≥8/upper/lower/digit password rule, dual legacy/global payloads, and all authorization rules. Oddities are kept and flagged in §10, not fixed now. | `validatePassword` (`authService.js:83-91`); whole-module review. |
| **D-C4** | **NET-NEW `POST /forgot-password` (v0.3.0) — privacy-safe, backend-proxied recovery request.** No legacy equivalent; added because Supabase Auth enables self-service recovery. `requestPasswordReset` always returns the same generic 200 (no account-enumeration) and proxies Supabase `resetPasswordForEmail` with `redirectTo` = our **own** web `/reset-password` page (R1 — clients never embed Supabase). The **consume step** (`POST /reset-password`) is the **next run** (scope = "Page + forgot route", forgot-password page SPEC D-SCOPE). MINOR bump (additive, backward-compatible). | User answers (recovery plan; this-run scope); `authService.js` `requestPasswordReset`; `routes/auth.js` `POST /forgot-password`; METHODOLOGY R1. |
| **D-C5** | **NET-NEW `POST /reset-password` (v0.4.0) — the recovery RESET (consume) step.** No legacy equivalent. The web `/reset-password` page extracts the Supabase recovery `access_token` from the email-link **URL fragment** (implicit flow — `config/supabase.js` `flowType: "implicit"`, pinned because the backend initiates the reset but an arbitrary browser completes it) and sends it as the **Bearer**; the route reuses `authenticateToken` + the existing `changePassword` (single-sourced update + policy), **no bespoke service fn**. 401 on an expired/used token; 400 on a weak password. Clients never embed Supabase (R1). Completes the recovery path begun by D-C4 (forgot → email → reset → login). MINOR bump (additive). | User answers (run 18: Bearer+reuse changePassword / in-page success→login / new+confirm+policy hint); `routes/auth.js` `POST /reset-password`; `config/supabase.js`; reset-password page SPEC. |
| **D-C6** | **NET-NEW `PUT /email` — self-service email change.** No legacy equivalent (email was fixed at registration). `changeEmail` re-auths the **current password** (Supabase `signInWithPassword` — a safeguard for a sensitive change) then does a **direct** change (`email_confirm:true`, no verification email — consistent with register/createMember + the limited email-delivery reality behind D-C4's mailto fallback), updating Supabase `auth.users` **and** the primary `member_emails` row in a compensating order (revert Supabase if the DB write fails) so the two never drift. The session JWT stays valid (`sub`/`auth_user_id` unchanged). Drives the web `program/profile` page; iOS My Profile port deferred. MINOR bump (additive). | User decisions (direct + password-confirmed); `authService.changeEmail`; `routes/auth.js` `PUT /email`; profile page SPEC D-EMAIL. |
| **D-C8** | **NET-NEW `POST /oauth` (v0.7.0) — federated (Google/Apple) sign-in.** No legacy equivalent. **R1-preserving:** the CLIENT obtains a provider `id_token` from its native SDK (Google Identity Services / Credential Manager / `ASAuthorization`) and POSTs it here; the backend exchanges it via Supabase `signInWithIdToken` — clients **never** embed Supabase. Provider **audiences are validated by Supabase inside `signInWithIdToken`** (the providers are configured in the Supabase Dashboard + `GOOGLE_*_CLIENT_ID` / `APPLE_SERVICES_ID` in `render.yaml`); the backend does NOT re-check them. `signInWithIdToken` uses the **anon** client → new-user signup is gated by the project **"Allow new users to sign up"** toggle (unlike `register()`'s `admin.createUser`, which bypasses it). Existing member ⇒ resolve by `auth_user_id`, else by **verified provider email** → adopt the identity if the member is unlinked; brand-new ⇒ `{ needs_profile:true, ... }` (→ D-C9). MINOR bump (additive; consumers: web, ios, android). | User answers (federated sign-in plan); `authService.socialSignIn`; `routes/auth.js` `POST /oauth`; `render.yaml`; METHODOLOGY R1. |
| **D-C9** | **NET-NEW `POST /oauth/complete` (v0.7.0) — finish a brand-new federated sign-up (two-step).** A brand-new social user has a Supabase auth user (created by `signInWithIdToken`) but no member row yet, so `needs_profile:true` → the client collects `username` + `gender` and calls this. The **pending Supabase `access_token` is the Bearer, JWKS-verified directly** (`verifySupabaseJwt`) — `authenticateToken` can't map it (no member exists yet); the client re-sends its `refresh_token` in the body so the same session is echoed. Creates `members` + `member_emails` (no `createUser`, no password), txn + compensation **mirrors `register` with a race guard** (a concurrent double-submit does NOT delete the shared auth user — the already/raced member's session is returned, idempotent). **Email-collision with an existing account is REJECTED (409, "sign in with your password")** at the `/oauth` step — linking Google to an existing account is a **deferred phase-2 account-settings** feature, out of scope here. MINOR bump (additive). | User answers (federated sign-in plan); `authService.completeSocialRegistration`; `routes/auth.js` `POST /oauth/complete`; `config/supabase.js` `verifySupabaseJwt`. |
| **D-C10** | **NET-NEW authenticated identity-management routes (v0.9.0) — link/unlink a provider + add a password, from account settings.** Four additive routes behind `authenticateToken`: `GET /identities` (list the member's sign-in methods + `has_password`), `POST /link`, `POST /unlink`, `POST /set-password`. **R1-preserving:** the CLIENT obtains a provider token exactly like `/oauth` (native `id_token`, or a web Google auth `code` the backend exchanges) and POSTs it; the backend **binds a session-scoped ephemeral client to the caller's OWN Supabase user** (`makeEphemeralAuthClient` + `setSession({access_token: request Bearer, refresh_token: body})`) and calls GoTrue **`linkIdentity({provider, token, nonce})`** (`linkIdentityIdToken` → `POST /token?grant_type=id_token&link_identity=true`) to attach the identity onto the member's existing `auth_user_id` — **no OAuth redirect, no same-email auto-link toggle, no second `auth.users` row**. Requires the Supabase **"Manual linking"** (`security_manual_linking_enabled`) project toggle; the same-email auto-link toggle stays **OFF**, so **`/oauth`'s D-C8 409 collision behavior is untouched** (link is a separate authenticated path). Unlink = session-bound `unlinkIdentity(target)` guarded so a member can never remove their **last** usable sign-in method (`(federatedCount-1)+(hasPassword?1:0) ≥ 1`). Add-password = `validatePassword` → `admin.updateUserById({password})`, reporting `has_password:true` authoritatively. **This resolves the deferred phase-2 linking (D-C9/F11).** UI: a "Sign-in methods" section on each account/settings screen (web `program/profile`, iOS `MyProfileView`, Android `ProfileScreen`) that does NOT restyle the page; **Apple link/unlink is iOS-only (reaffirms F9)** — web + android surface Google + password only. Backend deploys FIRST; the routes are additive so the LIVE iOS/Android binaries are unaffected. MINOR bump (additive; no existing route/shape/JWT/middleware changed). | `authService.{linkProvider,unlinkProvider,listIdentities,setPassword}`; `routes/auth.js` `/identities`,`/link`,`/unlink`,`/set-password`; per-surface account-settings screens; `config/supabase.js` `makeEphemeralAuthClient`; Supabase Dashboard "Manual linking". |
| **D-REF** | **Reference implementation** = legacy `backend` (`routes/auth.js`, `services/authService.js`, `middleware/auth.js`, the five auth models, `server.js:46`). Faithful port except the §7 credential/token/verify delta **and the net-new recovery routes (D-C4/D-C5, no legacy reference)** **and the net-new email-change route (D-C6, no legacy reference)**. | Verified file:line throughout this SPEC. |

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
| **F8** | **Per-surface federated sign-in UI + One-Tap mechanism divergence is sanctioned parity** — the backend contract (`/oauth` + `/oauth/complete`) is identical across surfaces, but each client uses its native idiom (React on web, SwiftUI + `ASAuthorization`/GSI on iOS, Compose + Credential Manager on Android) and its own One-Tap / button flow. This is intended, not drift. | `routes/auth.js` `/oauth*` (D-C8/D-C9); per-surface client code | No — deliberate per-surface parity. |
| **F9** | **Sign in with Apple is iOS-only** — App Store Review Guideline 4.8 requires it where other social logins are offered on Apple platforms; web + Android offer Google only (Apple is not surfaced there). The backend `/oauth` accepts `provider: "apple"` regardless (single contract). | `socialSignIn` (`provider ∈ {google, apple}`); iOS client | No — platform-policy driven. |
| **F10** | **Abandoned social sign-up leaves an orphan `auth.users` row with no member** — if a brand-new social user gets `needs_profile:true` from `/oauth` but never completes `/oauth/complete`, the Supabase auth user created by `signInWithIdToken` persists with no `members` row. **Non-breaking:** re-authenticating returns the **same `sub`**, so `/oauth` again yields `needs_profile:true` and completion still works; the orphan never maps to a member (can't sign into any protected route). No auto-cleanup. | `socialSignIn` (branch 3); `completeSocialRegistration` | Optional — a periodic sweep of member-less `auth.users` could reclaim them; not needed now. |
| **F11** | **Apple "Hide My Email" relay addresses can create a duplicate member** — a user who first signed up with a real email, then signs in with Apple using "Hide My Email", presents a `@privaterelay.appleid.com` address that never matches their real-email `member_emails` row, so `/oauth` treats it as brand-new and can create a second member. **Kept as-is** (faithful; no cross-email identity reconciliation). | `socialSignIn` (email-match branch 2) | Partially addressed v0.9.0 — the relay-duplicate is still not auto-reconciled, but **D-C10** now lets a member manually link/unlink Apple from account settings as the remedy. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.9.0 | 2026-07-10 | **NET-NEW authenticated identity-management routes (D-C10) — link/unlink a provider + add a password, from account settings.** Backend: `listIdentities`/`linkProvider`/`unlinkProvider`/`setPassword` (`services/authService.js`) + `GET /identities`, `POST /link`, `POST /unlink`, `POST /set-password` (`routes/auth.js`), all behind `authenticateToken`. **R1-preserving:** the client obtains a provider token exactly like `/oauth` (native `id_token`, or a web Google auth `code`) and POSTs it; the backend binds a session-scoped ephemeral client to the caller's OWN Supabase user (`makeEphemeralAuthClient` + `setSession({access_token: Bearer, refresh_token: body})`) and calls GoTrue `linkIdentity` (`linkIdentityIdToken`) to attach the identity onto the member's existing `auth_user_id` — no OAuth redirect, no same-email auto-link toggle, no second `auth.users` row; **`/oauth`'s D-C8 409 is untouched**. Requires the Supabase **"Manual linking"** (`security_manual_linking_enabled`) toggle. Unlink guards the last usable sign-in method; add-password = `validatePassword` → `admin.updateUserById` (reports `has_password:true`). Clients gain a "Sign-in methods" section on the account/settings screen (web `program/profile`, iOS `MyProfileView`, Android `ProfileScreen`) — **Apple link/unlink is iOS-only (F9)**; web + android show Google + password. Resolves the deferred phase-2 linking (D-C9/F11). No new env, no migration. Also fixed the §1/D-C3 doc-lag (`consumed_by` prose now reads `[web, ios, android]`). **MINOR** (additive; no existing route/shape/JWT/middleware changed → zero dependent re-version; backend deploys FIRST, live iOS/Android binaries unaffected). Backend `node -c` ✓ + live (routes 401 pre-auth); web `npm run build` ✓; android `assembleDebug` ✓; iOS static-review clean (Xcode build user-run). Consumers: web (deployed this run), ios + android (binaries ship next). |
| 0.8.0 | 2026-07-10 | **Web custom "Continue with Google" button + unified federated-button design.** `POST /oauth` now accepts a Google auth `code` (web auth-code/popup flow) in addition to `id_token` (native mobile): the backend exchanges the code for an `id_token` at Google's token endpoint (`exchangeGoogleAuthCode`, `redirect_uri=postmessage`, new secret `GOOGLE_WEB_CLIENT_SECRET` — `render.yaml` `sync:false`), so the web renders its OWN dark-pill button instead of Google's mandated GSI widget. R1 preserved — the browser never holds the client secret. UI: all three surfaces now render the identical custom dark pill (input-surface fill/stroke + hairline border + multicolor Google "G" + "Continue with Google"); iOS additionally replaces the native `SignInWithAppleButton` with a matching custom "Continue with Apple" pill driven by a standalone `ASAuthorizationController`. No existing shape changed (id_token path intact); backward-compatible additive **MINOR**, no dependent re-version. Web + backend deployed; iOS/Android ship in the next binaries. |
| 0.7.0 | 2026-07-10 | **NET-NEW `POST /oauth` (D-C8) + `POST /oauth/complete` (D-C9) — federated (Google/Apple) sign-in.** Added `socialSignIn` + `completeSocialRegistration` (`services/authService.js`) + the two public/pending-Bearer routes (`routes/auth.js`) + `GOOGLE_{WEB,IOS,ANDROID}_CLIENT_ID` / `APPLE_SERVICES_ID` (`render.yaml`, non-secret placeholders). **R1-preserving:** the client obtains a provider `id_token` from its native SDK and POSTs it; the backend exchanges it via Supabase `signInWithIdToken` (clients never embed Supabase); audiences validated by Supabase. Existing member ⇒ login `AuthResponse` (by `auth_user_id`, else verified provider email → link if unlinked; **409** on a different-auth-user email collision — linking is deferred phase-2); brand-new ⇒ `{ needs_profile:true, ... }` → `/oauth/complete` (JWKS-verified pending Bearer; txn + compensation mirrors `register` with a concurrent-double-submit race guard; 201). No existing route/shape changed. `consumed_by` gains `android` (doc↔code lag fix — android already consumed auth). Flags F8–F11 (per-surface UI parity, Apple-only-on-iOS, orphan-auth-user + Apple-relay-email trade-offs). **MINOR** (additive; deploys FIRST — the LIVE iOS/Android binaries never call these routes, unaffected). `node -c` ✓ on the three touched JS files. Consumers: web, ios, android clients (built next). |
| 0.6.0 | 2026-07-07 | **NET-NEW `GET /me` (D-C7)** — server-authoritative identity that echoes the JWKS-verified `req.user` (`{ member_id, username, member_name, global_role }`; no DB query). Fixes a **web** bug: `session.user.id` (= the member's `members.id`) is derived only from the login response and never re-derived, and a stock Supabase JWT has no `id` claim — so a stale/missing id stayed broken until re-login, which sent `member_id:""` on workout logging (backend 403 "You can only log workouts for yourself.") and blanked the Members tab (own cards gated on that id). The web `AuthProvider` now calls `/me` on load/refresh to make the id authoritative + self-healing. **MINOR** (additive owned endpoint, backward-compatible — existing routes/JWT/middleware unchanged); blast-radius FYI (`web`,`ios`; no dependent re-version). Additive + safe for the LIVE iOS binary (never calls `/me`). Web `npm run build` ✓. |
| 0.1.0 | 2026-06-28 | Initial SPEC authored via `question-asker` (Phase 2 kickoff). Documents the legacy `/api/auth/*` surface + `middleware/auth.js` and the R1 Supabase-Auth migration delta. Decisions D-C1/D-C2/D-C3/D-S1/D-REF; flagged F1–F7. |
| 0.1.0 (built) | 2026-06-28 | **Ported to `apps/backend/`** — faithful foundation (13 models + `index.js` minus retired `member_credentials`/`refresh_tokens`; `Member.auth_user_id` added) + the auth slice (`config/supabase.js` JWKS verify, `middleware/auth.js`, `services/authService.js`, `routes/auth.js`, `server.js` mounting only `/api/auth`). Status 📄→🏗️ (no semver bump — faithful port, contract unchanged). Known gaps: `DELETE /account`→501 (cascade owned by program-memberships/notifications, D-C1); backend deploy + asymmetric Supabase JWT keys pending. |
| 0.1.0 (infra) | 2026-06-28 | **Backend host = Render, not Railway** (METHODOLOGY R7) — the D-C2 JWKS verify path is unchanged; the deploy target is a Render web service (Blueprint `apps/backend/render.yaml`). **Asymmetric Supabase JWT keys RESOLVED:** the project's JWKS endpoint serves a live `ES256`/P-256 key, so JWKS verify finds a key. No SPEC/contract change (no semver bump). Remaining gap: `DELETE /account`→501 (unchanged). |
| 0.1.0 (deployed 🚀) | 2026-06-28 | **DEPLOYED to Render + verified live** at `https://rasifiters-api.onrender.com` (service `srv-d90tgmv7f7vs73cudptg`). Full auth round-trip green against migrated data (admin): `login`→200 (member resolution + primary-email + Supabase sign-in, **imported bcrypt password verified**, ES256 JWT `kid 0f6cd324…`); guarded route w/ valid token→200 (`authenticateToken` JWKS verify + `sub`→`members.auth_user_id`→`req.user`, the D-C2 path); garbage token→401; `refresh`→200; `logout`→200; unauth guard→401. Status 🏗️→🚀 (faithful deploy, no semver bump). **Migration fix shipped:** placeholder (no-email) members lacked a `member_emails` row → `admin` 401'd before password check; backfilled via `apps/backend/sql/002_backfill_placeholder_member_emails.sql` + the one-time migrator's auth-import step (wrote the placeholder row on create/link/re-run). Remaining gap: `DELETE /account`→501 (unchanged). |
| 0.5.0 (verified 🚀) | 2026-06-30 | **Password recovery VERIFIED LIVE end-to-end (incl. Outlook).** Root cause of the earlier broken link found + fixed in **Supabase config** (not code): the project **Site URL** was still the dev default `http://localhost:3000` and the prod URL wasn't on the **Redirect-URLs** allow-list, so Supabase dropped `redirect_to` and the email link landed on `localhost`. Set Site URL → `https://rasifiters.com` + allow-listed `https://rasifiters.com/**`; recovery now works forgot → email link → `/reset-password` → new password → login, on Gmail **and Outlook**. (A typed-6-digit-code variant was built + reverted — `f12ff2d`/reverted by `29693ed` — kept in history in case a future inbox's link-scanner consumes the single-use link; not needed now.) Also `PUT /email` (D-C6) verified. No code/contract change → no semver bump. |
| 0.5.0 | 2026-06-30 | **NET-NEW `PUT /email` (D-C6) — self-service email change.** Added `changeEmail` (`services/authService.js`) + the authenticated route (`routes/auth.js`). No legacy equivalent (email was fixed at registration). **Password-confirmed** (re-auth current password via Supabase `signInWithPassword`) + **direct** change (`admin.updateUserById { email, email_confirm:true }`, no verification email — parity with register/createMember + the limited delivery behind D-C4), updating Supabase `auth.users` **and** the primary `member_emails` row in a compensating order (revert Supabase if the DB write fails). Session JWT stays valid (`sub`/`auth_user_id` unchanged). Clients never embed Supabase (R1). MINOR (additive; consumers: web `program/profile`, ios deferred). `node -c` ✓; runtime smoke-test deferred to the batched pre-cutover pass. |
| 0.4.0 | 2026-06-29 | **NET-NEW `POST /reset-password` (D-C5) — self-service password recovery, RESET (consume) step.** Added the public route (`routes/auth.js`) reusing `authenticateToken` + the existing `changePassword` (the recovery `access_token` arrives as the Bearer; `sub`→member maps it; single-sourced password update + policy — no new service fn). Pinned `flowType: "implicit"` on the Supabase clients (`config/supabase.js`) so the recovery email link delivers the session in the URL fragment (consumable by any browser, forwarded through Express; PKCE would strand the verifier server-side). 401 on an expired/used recovery token; 400 on a weak password; clients never embed Supabase (R1). MINOR bump (additive). **Completes the recovery path** (forgot → email → reset → login). Boot check passes (route mounted, `authenticateToken` + handler, mw=2). Drives the web `reset-password` page ([SPEC](../../pages/web/reset-password/SPEC.md)). Runtime smoke-test deferred to the batched pre-cutover pass. |
| 0.3.0 | 2026-06-29 | **NET-NEW `POST /forgot-password` (D-C4) — self-service password recovery, request step.** Added `requestPasswordReset` (`services/authService.js`) + the public route (`routes/auth.js`) + `PASSWORD_RESET_REDIRECT_URL` (`render.yaml`). Privacy-safe: **always 200** with a generic message (no enumeration); proxies Supabase `resetPasswordForEmail(email, { redirectTo: <web>/reset-password })`; clients never embed Supabase (R1). No legacy reference (recovery existed on neither client). MINOR bump (additive). **The consume step `POST /reset-password` is the NEXT run** (this run's scope = forgot-password page + this one route — page SPEC D-SCOPE). Boot check passes (route mounted public, 1 handler). Drives the web `forgot-password` page ([SPEC](../../pages/web/forgot-password/SPEC.md)). Runtime smoke-test deferred to the batched pre-cutover pass. |
| 0.2.0 | 2026-06-28 | **Wired `DELETE /account` (D-C1) — the 501 deferral is resolved** now that `program-memberships`/`invites`/`notifications` are ported. `deleteAccount` runs the shared cross-feature cascade `utils/programMemberships.cascadeMemberDeletion` (destroy outbound invites + actored notifications, `handleMemberExit` per active membership/created program, notify remaining members, destroy the member) — **single-sourced, shared verbatim** with `DELETE /api/members/:id` — then best-effort deletes the Supabase auth user after commit (the migration delta vs legacy `member_credentials`). Faithful to the legacy `deleteAccount` body; minor bump (functionality previously 501). Boot check passes. |
