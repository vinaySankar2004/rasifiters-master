# Page: `program/password` (web) — change password (program-settings sub-route 4 of 6)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.2.1 · **App:** `web` (Next.js App Router)
> **Route:** `/program/password` — the logged-in user's **own change-password page** (new + confirm password
> with a live policy checklist → `PUT /auth/change-password`), the fourth of the six deferred `/program/*`
> settings sub-routes (reached from the [`program`](../SPEC.md) hub's account menu).
> **Despite living under `/program/*` it is NOT a program-admin setting** like
> [`edit`](../edit/SPEC.md)/[`roles`](../roles/SPEC.md) — it changes the *requester's own* password and is
> therefore available to **every** role (no admin redirect). It is a **near-twin of the built
> [`reset-password`](../../reset-password/SPEC.md) form** (same new+confirm + policy checklist), minus the
> URL-fragment recovery token (here the user is already signed in, so the session bearer authorizes the change),
> and a sibling of [`profile`](../profile/SPEC.md) (run 27).
> **Provenance (legacy, archived):** `rasifiters-webapp/src/app/program/password/page.tsx`.
> **Consumes (features):** [`auth`](../../../../features/auth/SPEC.md) (`changePassword` → `PUT
> /auth/change-password` — `authenticateToken` + the single-sourced `changePassword` service fn that re-validates
> the password policy and updates it via Supabase `admin.updateUserById`; plus `useAuthGuard`).
> **Cross-app:** the iOS **Settings → Change Password** screen renders the same form natively; parity audited at
> the iOS port.
> **Stance:** faithful 1:1 port **+ three small cleanups** (D-C1 tokenize the success/checklist color; D-C2 reuse
> `useAuthGuard`; D-C3 clear the stale success/error message on field edit). Oddities flagged §10.

---

## 1. What it is + who uses it

The **change-password form** for the signed-in member. It shows a **New password** field (with a Show/Hide
toggle), a **Confirm password** field, a live **policy checklist** (5 rows: ≥8 chars · one uppercase · one
lowercase · one number · passwords match — each turning `rf-success` when met), an inline error/success line,
and an **Update Password** button (disabled until the whole policy passes + not in flight). Used by **any
authenticated user** to change their own password; there is **no admin gate and no role redirect** — the only
guard is `!session?.token → /login`
(password/page.tsx:25-29). The
backend independently re-validates the policy and updates only the **caller's own** Supabase user (`req.user.id`).

## 2. Why it exists

To let each member rotate their account password from within the app while signed in (distinct from the
signed-out self-service [`reset-password`](../../reset-password/SPEC.md) recovery flow). It is the surface behind
the hub's "Change Password" account-menu row. The submit calls `PUT /auth/change-password`, which reuses the same
`changePassword` service fn + `validatePassword` policy that the recovery `POST /auth/reset-password` and
sign-up paths share (single-sourced).

## 3. Route / location

- **App:** `web`. **Route:** `/program/password`. **Protected** — under the `middleware.ts` matcher (unauth edge
  request → `/login`). `useAuthGuard({ requireProgram: false })` — **no active program required** (you can change
  your password with no program selected); there is **no role redirect** (every role may change own password).
- **Reached via:** the [`program`](../SPEC.md) hub's account menu (`router.push("/program/password")`).
- **Chrome:** `PageShell maxWidth="2xl"` + `PageHeader` (title "Change Password", subtitle "Enter a new password
  for your account.", `backHref = program?.id ? "/program" : "/programs"` — back to the hub if a program is
  active, else the programs list). No bottom nav (sub-route, not a workspace tab).
- **Leaves to:** `/program` or `/programs` on Back; stays in place on success (form clears, success line shows).

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Header | `PageHeader` "Change Password" + subtitle + Back → `/program` or `/programs`. | password/page.tsx:48-52 |
| New password | `input-shell` field (`type` flips with `showPassword`) + a Show/Hide toggle button (44 px target, `aria-label` "Show password" / "Hide password" — D-REL2); label linked by `htmlFor`. | password/page.tsx:55-76 |
| Confirm password | `input-shell` field, always `type="password"`; label linked by `htmlFor`. | password/page.tsx:78-88 |
| Policy checklist | 5 `<p>` rows, each gaining **`text-rf-success`** when its rule is met (D-C1). | password/page.tsx:90-96 |
| Error / success | Inline `rf-danger` error line; **`rf-success`** "Password updated. Your other devices will be signed out." (D-C1, D-REL1). | password/page.tsx (message lines) |
| Update | "Update Password" (`bg-rf-accent text-black`); disabled unless `validation.isValid` + not pending; clears both messages then mutates. | password/page.tsx:101-114 |

## 5. Components + consumed features

- **Shared UI:** `PageShell`, `PageHeader`, `GlassCard` — **all already ported** (no new dependency this run).
  The page-local `validatePassword` helper + the new/confirm/show state stay co-located; both fields are bare
  `input-shell` inputs (faithful — not the `Input` component).
- **Hooks/state:** `useAuthGuard({ requireProgram: false })` (session/program/token); `useMutation` (React
  Query); `useMemo` for the live `validatePassword` derivation.
- **Consumed features:** [`auth`](../../../../features/auth/SPEC.md) (`changePassword`, `useAuthGuard`).

## 6. Data / API

- **`PUT /auth/change-password`** via `changePassword(token, newPassword)`
  ([lib/api/auth.ts:83](../../../../../../apps/web/src/lib/api/auth.ts#L83)) — body `{ new_password }`, the
  session bearer authorizes. **Already mounted**
  ([apps/backend/routes/auth.js:101](../../../../../../apps/backend/routes/auth.js#L101) → `authenticateToken`
  → `authService.changePassword(req.user.id, req.body.new_password)`). The service re-runs `validatePassword`
  (400 on failure) then updates the **caller's own** Supabase user via `admin.updateUserById` and returns
  `{ message }`. On success the page shows the success line + clears both fields (no session/cache mutation —
  the bearer is unchanged; a password change does not re-issue the JWT here).
- **No backend work, no feature bump** — the route + `changePassword` client fn + the shared `validatePassword`
  policy all shipped with `auth` (the route landed v0.1.0; `reset-password` reuses the same service fn). The
  sweep CONFIRMS the mount; it ports nothing backend-side.

## 7. Role-based view rules

| Role | Access | Notes |
|------|--------|-------|
| **global_admin** | Changes own password. | No role gate — same form for everyone. |
| **program admin** | Changes own password. | — |
| **logger** | Changes own password. | — |
| **member** | Changes own password. | — |

- **No admin redirect** — unlike `edit`/`roles`, every role lands here and changes *their own* password; the
  backend updates only `req.user.id`'s Supabase user, so the page never targets another member.
- **`admin_only_data_entry` effect:** **N/A** — a password form is not a workout/health data-entry surface; the
  toggle (set on `/program/edit`) gates the log forms on the workspace tabs, not this page.
- No JWT-decoded role is read at all here (unlike `profile`'s role label) — the page has no role-conditional UI.

## 8. States & edge cases

- **Update disabled:** until the live `validation.isValid` passes (all 5 rules) **and** no mutation is in flight
  (`canSubmit`).
- **Update success:** `rf-success` "Password updated. Your other devices will be signed out." line; both password
  fields clear; this device stays signed in (auth §3.1 rule 4). The message is **cleared when the user next edits
  a field** (D-C3; legacy left it lingering with the empty fields until the next submit).
- **Update error (D-REL1):** inline `rf-danger` line via `credentialErrorMessage(error, "account")` — the server
  text for 400 / 409 / 422 (e.g. the policy message), the kit `signedOut` copy for a 401, the kit copy otherwise;
  also cleared on next field edit (D-C3) and on the next submit click.
- **Unknown outcome (D-REL1, rule 6):** a 401 is refreshed and re-sent once by the client (the write never ran);
  after a SENT 5xx / 408 / timeout / dropped connection the page shows "We couldn't confirm your password change.
  It may have gone through, so try signing in with your new password." and keeps the fields. A failure with no
  response while the browser is offline shows the kit offline copy instead. A manual retry of the SAME password
  answered with the same-password 400 counts as done (success copy).
- **Show/Hide:** toggles only the **New password** field's `type`; Confirm stays masked (faithful, F3).
- **Unauthenticated:** the `useAuthGuard` redirect (and the edge `middleware.ts`) send a tokenless visitor to
  `/login`.
- **No active program:** allowed — `requireProgram: false`; Back then targets `/programs`.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | `consumed_by = [web]` for this page spec; the iOS Settings → Change Password screen mirrors the same form and is audited at the iOS port. No cross-app divergence to resolve (web-only page spec). | legacy `program/password/page.tsx`; iOS `Features/Settings/` |
| **D-SCOPE** | **This page only.** Port `/program/password` faithful 1:1; the remaining two `/program/*` sub-routes (appearance/privacy) remain their own deferred rows. | per-page cadence; [`program` SPEC §3](../SPEC.md) |
| **D-DEPS** | **No new dependency** — `PageShell`/`PageHeader`/`GlassCard`, `changePassword`, `useAuthGuard` are all already ported (the run-27 purest shape). `changePassword` + the `PUT /auth/change-password` route shipped with `auth`; `reset-password` already proved the shared `changePassword` service fn. | [lib/api/auth.ts:83](../../../../../../apps/web/src/lib/api/auth.ts#L83); `components/ui/` |
| **D-S1** | **Faithful 1:1** otherwise — same new/confirm fields, Show/Hide toggle on New only, the 5-row live `validatePassword` checklist, `canSubmit` gating, clear-both-then-mutate submit, form-clears-on-success, and `backHref = program?.id ? "/program" : "/programs"`. | password/page.tsx |
| **D-C1** | **Tokenize the success/checklist color** — `text-emerald-600` → `text-rf-success` (`#2fb861` light / `#36c56f` dark) at **all six sites** (the 5 met-rule checklist states + the success line) so they are theme-aware and symmetric with the `rf-danger` error line. (Mirrors `profile` D-C1; clean token mapping exists — no literal-amber holdout here, unlike profile's avatar chip.) | password/page.tsx:91-95,99; `globals.css` `--rf-success` |
| **D-C2** | **Reuse `useAuthGuard({ requireProgram: false })`** instead of the inline `useAuth` + manual `useEffect(() => !session?.token && router.push("/login"))` redirect — matches sibling [`profile`](../profile/SPEC.md) exactly; the hook subsumes the inline redirect (and provides `program` for the back-href + `token` for the mutation). Legacy predated the foundation hook. | password/page.tsx:14-29; [use-auth-guard.ts](../../../../../../apps/web/src/lib/hooks/use-auth-guard.ts) |
| **D-C3** | **Clear the stale success/error message on field edit** — reset `successMessage`/`errorMessage` when New password / Confirm changes, so a prior "Password updated successfully." doesn't linger over the cleared fields. Legacy only cleared them at the *next* Update click (password/page.tsx:36,103-110). Mirrors `profile` D-C2. | legacy lingering `successMessage` |

| **D-REL1** | **Reliability Phase 3 C1 (auth §3.1 rules 4 + 6).** Success copy `AUTH_COPY.passwordChanged` ("Password updated. Your other devices will be signed out." — the same string on iOS + Android). No TanStack auto-retry; the client re-sends once only after a 401 (never ran); "couldn't confirm" (`AUTH_COPY.passwordUnconfirmed`) only after a sent 5xx / 408 / timeout / dropped connection; a same-password 400 after a manual retry of the same value = done. Errors via `credentialErrorMessage(…, "account")`. | auth §3.1; amendments A1 / A8 / A9. |
| **D-REL2** | **Phase 4 polish (#36, #37).** #36 the Show/Hide toggle is a 44 px target with `aria-label` "Show password" / "Hide password" (frontend-kit **D-KIT-22**; PA12). #37 the New / Confirm labels are linked to their inputs (`htmlFor`). Behaviour unchanged. | `ec13107`; polish amendments PA12 |

## 10. Flagged characteristics (kept as-is)

- **F1 — client `validatePassword` duplicates the server policy** (password/page.tsx:117-134;
  [authService.js:60](../../../../../../apps/backend/services/authService.js#L60)). The 5-rule checklist mirrors
  the backend `validatePassword` for live UX; the backend re-validates authoritatively (400 on mismatch). The
  two copies can drift (e.g. the client also requires `matches`, which the server can't check). Faithful — a
  client-side hint over the server-of-record, recurring across the rebuild (login / create-account /
  reset-password all carry their own mirror).
- **F2 — no client-side rate-limit / debounce** on Update beyond the `isPending` disable. Recurring across the
  rebuild. Kept.
- **F3 — Show/Hide reveals only the New password field** (password/page.tsx:63-72).
  Confirm stays `type="password"` with no toggle, so a Show'd new password can't be visually diffed against a
  masked confirm. Faithful; minor UX nit, rebuild-cleanup candidate.
- **F4 — `changePassword` does not re-issue the session JWT** (since auth 0.13.0 the OTHER devices' sessions end at
  their next refresh; this one stays valid) ([lib/api/auth.ts:83](../../../../../../apps/web/src/lib/api/auth.ts#L83);
  [auth.js:101](../../../../../../apps/backend/routes/auth.js#L101)). The bearer that authorized the change stays
  valid (it is not bound to the old password); the page makes no session/cache mutation on success. Faithful —
  matches legacy; the next natural refresh re-issues normally.

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.1 | 2026-10-13 | **D-REL2 — Phase 4 polish (`ec13107`).** #36 Show/Hide toggle 44 px + `aria-label` Show/Hide password; #37 linked labels. |
| 0.2.0 | 2026-10-13 | Reliability Phase 3 C1 — D-REL1: success copy "Password updated. Your other devices will be signed out."; auth §3.1 rule 6 (401 re-sent once after a refresh; "couldn't confirm" after a sent 5xx / 408 / timeout; same-password 400 on a same-value retry = done); errors via `credentialErrorMessage(…, "account")`. §4/§8 updated. |
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker` (run 28) — the **fourteenth web page spec**, the **fourth of the six deferred `/program/*` settings sub-routes**. The signed-in user's **own change-password page** (new + confirm + live policy checklist → `PUT /auth/change-password`) — **not** a program-admin setting (no admin redirect; available to every role; no role-conditional UI at all). A near-twin of the built `reset-password` form (minus the URL-fragment recovery token) and a sibling of `profile`. Decisions: **D-REF** (`consumed_by=[web]`; iOS Settings → Change Password mirrors later) · **D-SCOPE** (this page only; appearance/privacy still deferred) · **D-DEPS** (no new dependency — purest shape) · **D-S1** (faithful 1:1) · **D-C1** (tokenize success/checklist color → `rf-success` at all 6 sites) · **D-C2** (reuse `useAuthGuard({ requireProgram: false })` over the inline redirect) · **D-C3** (clear stale success/error on field edit). Flagged F1–F4 (client policy mirror; no client throttle; Show toggles New only; no JWT re-issue on change). Consumes `auth` (`changePassword`/`useAuthGuard`); **route + api fn + shared policy already shipped, no feature bump.** Ported `apps/web/src/app/program/password/page.tsx`. `npm run build` ✓. |
