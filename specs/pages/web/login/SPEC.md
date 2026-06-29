# Page: `login` (web) — the public sign-in screen + entry to auth-recovery

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.1.0 · **App:** `web` (Next.js App Router)
> **Route:** `/login` (reached from `/splash` Sign-in CTA, or a middleware redirect when a session is missing/expired).
> **Reference impl (legacy):** `../../../../../rasifiters-webapp/src/app/login/page.tsx` (+ `components/BrandMark.tsx`).
> **Consumes (features):** [`auth`](../../../features/auth/SPEC.md) — `login()` (`POST /auth/login/global`),
> the foundation `useAuth` context (`session`, `setSession`, `isBootstrapping`), and the client JWT helpers
> (`decodeJwtPayload` / `resolveGlobalRole`).
> **Cross-app:** iOS `LoginView.swift` (`Features/Auth/`) — same single "Username or Email" identifier +
> password + Show/Hide, same `/auth/login/global` call; iOS has **no** "Forgot password?" link (D-REF; F3).
> **Stance:** faithful 1:1 (D-S1) **+ ONE migration addition** — a "Forgot your password?" link (D-C1)
> that opens the new Supabase-Auth self-service recovery path. Oddities flagged §10.

---

## 1. What it is + who uses it

The **public sign-in screen** — where an unauthenticated visitor enters a **username-or-email** + password
to authenticate. It's the middle of the public/auth path (`splash → login → create-account`) and the only
route from which a returning member gets a session. Used by **everyone pre-auth**; an already-authenticated
visitor is immediately redirected to `/programs` and never sees the form.

## 2. Why it exists

To authenticate returning members and funnel new ones into sign-up. On success it decodes the issued JWT,
resolves the global role, stores the session (via `useAuth().setSession`), and routes to `/programs`. It is
also the **landing point for session-loss redirects** (the `middleware.ts` `?reason=expired|invalid` banner)
and now the **entry to password recovery** (the migration-added "Forgot your password?" link).

## 3. Route / location

- **App:** `web`. **Route:** `/login`. **Public** (no auth required; not in the `middleware.ts` matcher).
- **Reached via:** the splash Sign-in CTA (`/splash` → `/login`), a direct visit, or a middleware redirect
  from a protected route (`/login?reason=expired|invalid&from=<path>`).
- **Leaves to:** `/programs` (on successful login, and the auto-redirect when a session already exists) ·
  `/create-account` (the sign-up link) · **`/forgot-password`** (the migration-added recovery link —
  **target built in the immediate follow-up port**) · `PRIVACY_POLICY_URL` (external).

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Brand logo | `BrandMark` (size 128) — `app-icon.png` in a rounded circle, centered. | [login/page.tsx:88](../../../../../rasifiters-webapp/src/app/login/page.tsx#L88); `BrandMark.tsx` |
| Heading + subheading | "Welcome Back" / "Login to access your fitness dashboard". | [login/page.tsx:90-95](../../../../../rasifiters-webapp/src/app/login/page.tsx#L90) |
| Session alert (conditional) | Amber banner when `?reason=expired` ("Your session expired…") or `?reason=invalid` ("We could not verify your session…"). | [login/page.tsx:31-36, 97-101](../../../../../rasifiters-webapp/src/app/login/page.tsx#L31) |
| Identifier input | Text input, placeholder "Username or Email", `autoComplete="username"`. | [login/page.tsx:107-116](../../../../../rasifiters-webapp/src/app/login/page.tsx#L107) |
| Password input + toggle | Password input with a Show/Hide text button (`showPassword`), `autoComplete="current-password"`. | [login/page.tsx:118-134](../../../../../rasifiters-webapp/src/app/login/page.tsx#L118) |
| Error banner (conditional) | Red box with the caught error message (default "Unable to login. Try again."). | [login/page.tsx:136-140](../../../../../rasifiters-webapp/src/app/login/page.tsx#L136) |
| Submit button | "Login" / "Signing in…" (when `isLoading`); disabled while `!canSubmit \|\| isLoading`. | [login/page.tsx:142-148](../../../../../rasifiters-webapp/src/app/login/page.tsx#L142) |
| **"Forgot your password?" link** | **MIGRATION ADDITION (not in legacy)** — `next/link` → `/forgot-password`, placed below the form. | `apps/web/src/app/login/page.tsx` (added block); see D-C1 |
| Sign-up link | "New here? **Create an account**" → `/create-account`. | [login/page.tsx:151-159](../../../../../rasifiters-webapp/src/app/login/page.tsx#L151) |
| Footer | "Training hard? Login to track your progress." + a "Privacy Policy" link → `PRIVACY_POLICY_URL`. | [login/page.tsx:161-168](../../../../../rasifiters-webapp/src/app/login/page.tsx#L161) |

**Submit flow** ([login/page.tsx:44-78](../../../../../rasifiters-webapp/src/app/login/page.tsx#L44)): guard
`canSubmit && !isLoading` → `login(identifier.trim(), password)` → `decodeJwtPayload` → `resolveGlobalRole`
→ build session `{ token, refreshToken, user{ id, username, memberName, globalRole } }` → `setSession` →
`router.push("/programs")`. Errors caught → red banner; `finally` clears `isLoading`.

## 5. Components + features consumed

- **Components:** `BrandMark` (`src/components/BrandMark.tsx`), `framer-motion` (`motion.div` fade-in),
  `next/link`, `next/navigation` `useRouter`.
- **Features:** [`auth`](../../../features/auth/SPEC.md) — `login()` from `src/lib/api/auth.ts`
  (`POST /auth/login/global`, identifier resolved server-side), the foundation `useAuth()` hook
  (`session`, `setSession`, `isBootstrapping`), and `decodeJwtPayload` / `resolveGlobalRole` from
  `src/lib/auth/jwt.ts`. `useClientSearchParams` (foundation) reads `?reason`.

## 6. Data / API

- **`POST /auth/login/global`** (via `login(identifier, password)`) — body `{ identifier, password }`;
  response `{ token, refresh_token?, member_id?, username?, member_name?, global_role?, message? }`. The
  backend resolves `identifier` → member → primary email, then calls Supabase `signInWithPassword`
  (auth SPEC §3). The JWT is decoded **client-side without signature verification** (display/role only;
  the backend re-verifies on every authed call).
- No other endpoint. Session is persisted by the `AuthProvider` (localStorage `rasi.fiters.session` +
  cookie `rasi.fiters.token`) inside `setSession`.

## 7. Role-based view rules

**N/A at render — public, pre-auth.** No authenticated user (hence no role) exists while the login form
shows; the form, fields, and all links are identical for every visitor. Role only becomes meaningful
*after* a successful login, when `resolveGlobalRole` stamps `global_admin` vs `standard` onto the stored
session (consumed by downstream pages, not here).

| Viewer | Sees | Can do |
|--------|------|--------|
| Unauthenticated (any visitor) | Full login form + Forgot-password / Create-account / Privacy links. | Sign in · go to forgot-password · go to create-account. |
| Any authenticated role (global_admin · program admin · logger · member) | Nothing — redirected to `/programs` after bootstrap (F2). | (auto-redirect only) |

`admin_only_data_entry` is irrelevant here (no data entry on this page; it's a program-scoped lock that
applies only after a program is selected).

## 8. States & edge cases

- **Loading:** `isLoading` flips the button to "Signing in…" and disables it; the form is otherwise live.
- **Validation:** no inline error — the submit button is simply disabled until both fields are non-empty
  after trim (`canSubmit`).
- **Auth error:** caught → red banner with `error.message` (default "Unable to login. Try again.").
- **Session-loss landing:** middleware redirect with `?reason=expired|invalid` shows the amber banner.
- **Already authenticated:** `router.replace("/programs")` once `!isBootstrapping && session` (replace,
  not push — leaves no history entry); a brief form flash is possible during bootstrap (F2).
- **Forward dependencies (targets not built yet):** `/programs` (post-login + already-authed redirect),
  `/create-account` (sign-up link), and **`/forgot-password`** (the migration-added recovery link) are
  ported in subsequent runs. The forgot-password page is the **immediate** next port (see D-PLAN / §10).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Reference impl = legacy `../../../../../rasifiters-webapp/src/app/login/page.tsx` (+ `BrandMark.tsx`). `consumed_by = [web]`.** **Cross-app:** iOS `LoginView.swift` is functionally identical (single "Username or Email" identifier + password + Show/Hide, same `/auth/login/global` call) — the only divergence is the new "Forgot password?" link, which web gains first per the auth-recovery plan and iOS mirrors later (F3). | `login/page.tsx`; iOS `LoginView.swift:1-192`, `APIClient+Auth.swift:50`; user answer (web-first auth recovery). |
| **D-S1** | **Stance = faithful 1:1, no behavior change to the existing form.** Port `login/page.tsx` verbatim — identifier+password, Show/Hide, `canSubmit` gate, JWT decode + `resolveGlobalRole`, session build, `/programs` redirect, `?reason` banner, create-account + Privacy links. Oddities → §10 flags, not changes. | `login/page.tsx:1-173`; user answer (faithful as-is). |
| **D-C1** | **ONE migration addition — a "Forgot your password?" link → `/forgot-password`**, placed below the form. This is the only deviation from the faithful port; it's the entry point to the new Supabase-Auth recovery flow (the whole reason for adopting Supabase Auth). Legacy and iOS have no such link. | User requirement (auth self-service); legacy has zero recovery flow (both clients); `apps/web/src/app/login/page.tsx`. |
| **D-PLAN** | **Auth-recovery path plan (scope: login page only this run; the rest follow).** Resolved with the user so the link's destination + mechanics are pinned: (1) **forgot-password page** = **always-send + always-visible contact link** — always call Supabase `resetPasswordForEmail` (privacy-safe "if an account exists, a link was sent"; no enumeration) AND always show a "No email on your account? Contact us" `mailto:` (support = **`vinay.sankara@gmail.com`**, a **placeholder that may change**, wired as a config value); (2) the **reset flow runs through the Express backend** (METHODOLOGY R1 — clients never embed Supabase) → new routes (e.g. `POST /auth/forgot-password`, `POST /auth/reset-password`) + a **MINOR bump on the `auth` feature SPEC**; (3) **sign-up email becomes mandatory + format-validated** (forward-only — existing/placeholder accounts untouched). Each is its **own** follow-up spec/port. | User answers (4-Q decision round, 2026-06-29); auth SPEC §3/§10 (no reset route today; `resetPasswordForEmail` unused); members SPEC D-C2 (register already requires email + creates a loginable Supabase user). |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Client-side JWT decode without signature verification.** The page base64-decodes the token for `id`/`username`/`role` display only; trust rests on the backend re-verifying every authed call. | [login/page.tsx:52-58](../../../../../rasifiters-webapp/src/app/login/page.tsx#L52); `jwt.ts` | Kept (faithful) — display/role-hint only; not a security boundary. |
| **F2** | **No bootstrap loading gate — brief form flash for authenticated users.** The form renders immediately; the redirect to `/programs` only fires after `!isBootstrapping`, so a returning signed-in user can glimpse the form before redirect. | [login/page.tsx:38-42](../../../../../rasifiters-webapp/src/app/login/page.tsx#L38) | Kept (faithful) — cosmetic flash; a rebuild could gate render on `isBootstrapping`/`session`. |
| **F3** | **No "Forgot password?" on iOS (and none in legacy web).** The recovery link is web-first per the auth plan; iOS `LoginView` has no recovery entry (its only recovery affordance is a `supportURL` contact link in Settings). To be reconciled at the iOS login port. | iOS `LoginView.swift:1-192`; `MyAccountSection.swift:107-110` (`supportURL`) | **Yes — iOS gap** to close when the auth-recovery path is mirrored to iOS. |
| **F4** | **No client-side rate limiting / lockout.** Repeated failed logins only surface the backend error; no attempt throttling on the page (mirrors auth SPEC F4). | [login/page.tsx:71-74](../../../../../rasifiters-webapp/src/app/login/page.tsx#L71) | Kept (faithful) — any throttling belongs server-side. |
| **F5** | **No inline field validation.** Empty/whitespace fields only disable the button (`canSubmit`); there's no "email looks invalid" hint (the identifier is intentionally username-or-email, resolved server-side). | [login/page.tsx:26-29](../../../../../rasifiters-webapp/src/app/login/page.tsx#L26) | Kept (faithful) — identifier is dual-purpose; validation would be misleading. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker` — the **second web page spec** (after `splash`). Documents the public `/login` sign-in screen: identifier (username-or-email) + password + Show/Hide, `?reason` session-loss banner, error banner, JWT decode + `resolveGlobalRole` → `setSession` → `/programs`, already-authed redirect, create-account + Privacy links. Consumes `auth` (`login()` `POST /auth/login/global`, `useAuth`, jwt helpers). Decisions: **D-REF** (`consumed_by=[web]`; iOS `LoginView` identical except the new recovery link) · **D-S1** (faithful 1:1, no behavior change) · **D-C1** (ONE migration addition — "Forgot your password?" link → `/forgot-password`) · **D-PLAN** (auth-recovery path: forgot-password = always-send + always-visible `mailto:` contact link to `vinay.sankara@gmail.com` placeholder; reset runs through Express → `auth` MINOR bump; sign-up email mandatory+validated forward-only — each a follow-up spec). Flagged F1–F5 (client JWT decode; no bootstrap gate / form flash; iOS recovery gap; no client rate-limit; no inline validation). Ported `apps/web/src/app/login/page.tsx` (faithful + the recovery link); `npm run build` ✓ (`/login` prerendered). |
