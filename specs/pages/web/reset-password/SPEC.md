# Page: `reset-password` (web) — set a new password (auth-recovery, step 2)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.1.1 · **App:** `web` (Next.js App Router)
> **Route:** `/reset-password` (the destination of the password-reset **email link**; `PASSWORD_RESET_REDIRECT_URL`).
> **Provenance (legacy, archived):** **NONE — 100% net-new.** No `/reset-password` exists on either legacy
> client (web or iOS); confirmed `question-asker` runs 16–17. Exists only because the migration to Supabase
> Auth enables self-service recovery.
> **Consumes (features):** [`auth`](../../../features/auth/SPEC.md) v0.4.0 — `resetPassword()`
> (`POST /auth/reset-password`); the foundation `useAuth` context (`session`, `isBootstrapping`) for the
> already-authed redirect.
> **Cross-app:** none yet — iOS has **no** recovery screen (login SPEC F3). Web-first; iOS mirrors later.
> **Stance:** **net-new, built to the D-PLAN contract** (login SPEC §9 D-PLAN) — the **reset (consume) step**
> that pairs with `forgot-password` (the request step). Faithful to the **sibling** auth pages' chrome (D-S1).

---

## 1. What it is + who uses it

The **consume step of self-service password recovery** — where a user who clicked the reset link in their
email **sets a new password**. It is **step 2 of 2**: [`forgot-password`](../forgot-password/SPEC.md)
requests the email (step 1); this page is the link's destination and actually changes the password.

Used by **anyone pre-auth** who followed a valid reset link. The recovery session arrives in the URL
**fragment** (`#access_token=…&type=recovery`) — Supabase's implicit flow (auth SPEC D-C5) — and the page
forwards that token through Express to set the new password (R1 — the client never embeds Supabase).

## 2. Why it exists

The legacy app had **zero** password recovery on either client. `forgot-password` sends the email; this page
is where the link lands and the password is actually reset. Without it the request step is a dead end.

## 3. Route / location

- **App:** `web`. **Route:** `/reset-password`. **Public** (no auth; not in the `middleware.ts` matcher).
- **Reached via:** the reset **email link** only (Supabase verify → redirect to
  `PASSWORD_RESET_REDIRECT_URL` = `<web-origin>/reset-password#access_token=…&type=recovery`). A direct
  visit (no fragment) shows the "link invalid/expired" state.
- **Leaves to:** `/login?reason=password-reset` (on success — the login page shows a green confirmation
  banner) · `/forgot-password` ("Request a new reset link", from the invalid-link state) · `/programs`
  (already-authed auto-redirect, when no recovery token is present). **No standalone "Back to login" link**
  (D-C5) — this page is the shared destination of the reset email opened by **both** web and iOS clients,
  so a web-only login link would strand iOS users.

## 4. Contents / sections

| Block | What | Where |
|-------|------|-------|
| Brand logo | `BrandMark` (size 128), centered. | `reset-password/page.tsx` (shared `BrandMark`) |
| Heading + subheading | "Set a new password" / "Choose a new password for your account." | `reset-password/page.tsx` |
| New-password input + toggle | `type=password`/`text`, placeholder "New password", `autoComplete="new-password"`, shared Show/Hide button (toggles **both** fields). | `reset-password/page.tsx` |
| Confirm-password input | placeholder "Confirm new password", `autoComplete="new-password"`. | `reset-password/page.tsx` |
| Policy hint (conditional) | "Use at least 8 characters with an uppercase letter, a lowercase letter, and a number." — shown once the new password is non-empty but not yet strong (mirrors server `validatePassword`). | `reset-password/page.tsx` |
| Match hint (conditional) | "Passwords don't match." — shown once confirm is non-empty and unequal. | `reset-password/page.tsx` |
| Error banner (conditional) | Red box on a non-401 failure (e.g. the server policy 400, or a neutral retry message). | `reset-password/page.tsx` |
| Submit button | "Reset password" / "Saving…" (`isLoading`); disabled until a valid token + strong + matching passwords (`canSubmit`). | `reset-password/page.tsx` |
| Success state | On success the form is **replaced** by a green "Your password has been reset. Redirecting you to login…" banner; auto-redirects to `/login?reason=password-reset` after ~2.2s. | `reset-password/page.tsx` |
| Invalid-link state | Amber banner ("This password reset link has expired or is invalid…") + a "Request a new reset link" → `/forgot-password`. Shown when the fragment carries an error, no token, or a submit returns 401. | `reset-password/page.tsx` |
| ~~Back link~~ | **Removed (D-C5, v0.1.1)** — no standalone "Back to login" link, since this page is opened by both web and iOS clients. Navigation is covered by the success auto-redirect and the invalid-link "Request a new reset link". | `reset-password/page.tsx` |

**Submit flow:** guard `canSubmit` (token present && strong && matching && !loading) →
`resetPassword(accessToken, newPassword)` (`POST /auth/reset-password`, token as Bearer) → on resolve show
the success banner + schedule the `/login?reason=password-reset` redirect → `finally` clears `isLoading`. A
**401** flips to the invalid-link state ("expired or already used — request a new one"); any other throw →
neutral red error banner.

## 5. Components + features consumed

- **Components:** `BrandMark` (`src/components/BrandMark.tsx`), `framer-motion` (`motion.div` fade-in),
  `next/link`, `next/navigation` `useRouter`.
- **Features:** [`auth`](../../../features/auth/SPEC.md) v0.4.0 — `resetPassword()` from
  `src/lib/api/auth.ts` (`POST /auth/reset-password`); `ApiError` (`src/lib/api/client.ts`) to detect the
  401; `useAuth()` (`session`, `isBootstrapping`) for the already-authed redirect.

## 6. Data / API

- **`POST /auth/reset-password`** (via `resetPassword(accessToken, newPassword)`) — the Supabase recovery
  `access_token` is sent as the **`Authorization: Bearer` header**; body `{ new_password }`. The backend's
  `authenticateToken` JWKS-verifies the recovery token + maps `sub`→member, then reuses `changePassword`
  (Supabase admin `updateUserById`). Returns `200 { message: "Password changed successfully." }`. **`401`**
  = expired/invalid recovery token; **`400`** = password failed the server policy. See
  [auth SPEC](../../../features/auth/SPEC.md) §3 route #10 / D-C5.
- The recovery `access_token` is read **client-side from the URL fragment** (`window.location.hash`); the
  fragment is scrubbed from the address bar after parsing (`history.replaceState`) so the token doesn't
  linger in history. No Supabase SDK in the client (R1).

## 7. Role-based view rules

**N/A at render — public, pre-auth.** No authenticated user (hence no role) exists while the page shows;
the form and links are identical for every visitor. An already-authenticated visitor **without** a recovery
token is redirected to `/programs`; one **with** a token may still reset (F4).

| Viewer | Sees | Can do |
|--------|------|--------|
| Unauthenticated (any visitor) with a valid recovery token | New-password + confirm form. | Set a new password · go back to login. |
| Any visitor with an invalid/expired/absent token | Invalid-link banner + "Request a new reset link". | Request a new link · go back to login. |
| Authenticated role (global_admin · program admin · logger · member), no token | Nothing — redirected to `/programs` after bootstrap (F1/F4). | (auto-redirect only) |

`admin_only_data_entry` is irrelevant here (pre-auth; no program selected).

## 8. States & edge cases

- **Parsing:** until the fragment is read on mount (`accessToken === undefined`) the form area renders a
  blank spacer — avoids a flash of the wrong state.
- **Valid token:** the new-password + confirm form shows; submit stays disabled until the password is strong
  (≥8, upper/lower/digit — mirrors server `validatePassword`) **and** the two fields match.
- **Success:** form replaced by the green banner; auto-redirect to `/login?reason=password-reset` (where
  login shows a green "Your password has been reset. Sign in with your new password." banner — login SPEC
  v0.1.1).
- **Expired / invalid / missing link:** the invalid-link amber state with a path to `/forgot-password`.
  Triggered by (a) a Supabase error in the fragment (`#error=…`), (b) no `access_token` in the fragment
  (direct visit), or (c) a **401** from the submit (token expired between landing and submitting).
- **Server policy rejection (400):** the server message is shown inline in the red error banner (the client
  pre-checks the same policy, so this is rare — a backstop).
- **Token in URL:** scrubbed from the address bar immediately after parsing (no token left in history).
- **Already authenticated (no token):** `router.replace("/programs")` once `!isBootstrapping && session`.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Net-new — no reference impl; `consumed_by = [web]`.** No `/reset-password` exists on either legacy client (runs 16–17). Built only because Supabase Auth enables self-service recovery; iOS mirrors later (login SPEC F3). | `question-asker` runs 16–17 sweep; login SPEC D-PLAN/F3. |
| **D-SCOPE** | **This run = the reset-password PAGE + the one backend route it calls** (`POST /auth/reset-password`, an `auth` MINOR bump → v0.4.0) — completing the by-page recovery slice that `forgot-password` (run 17) started. The recovery path is now end-to-end. | User answer (recovery plan); forgot-password SPEC D-SCOPE / F4 (this page was named the next run). |
| **D-C1** | **Backend reuses `changePassword` via the recovery token as Bearer.** The page sends the Supabase recovery `access_token` as `Authorization: Bearer`; `POST /auth/reset-password` = `authenticateToken` (JWKS-verifies it + maps `sub`→member) + the existing `changePassword(req.user.id, new_password)` — single-sourcing the password update + policy, faithful to existing patterns. | User answer (backend design = "Bearer + reuse changePassword"); `routes/auth.js` `POST /reset-password`; `middleware/auth.js` `authenticateToken`; auth SPEC D-C5. |
| **D-C2** | **In-page success → login.** On success show a green banner, then redirect to `/login?reason=password-reset` (a new positive banner case on login — login SPEC v0.1.1) so the user signs in fresh with the new password. Recovery stays separate from login; no Supabase session is embedded in the client (clean R1 fit) — auto-login was the rejected alternative. | User answer (post-reset dest = "In-page success → login"); login SPEC v0.1.1 banner; METHODOLOGY R1. |
| **D-C3** | **New-password + Confirm-password + inline policy hint.** Two fields with a shared Show/Hide toggle, an inline password-policy hint mirroring the server `validatePassword` (≥8, upper/lower/digit), and a match hint; submit disabled until valid + matching. Consistent with forgot-password's inline-validation divergence (D-C2) and the mandated "validate passwords" direction. | User answer (form fields = "New + Confirm + policy hint"); `authService.js` `validatePassword`; forgot-password SPEC D-C2. |
| **D-C4** | **Recovery token via the implicit-flow URL fragment, forwarded through Express (R1).** supabase-js defaults to (and is pinned to) the **implicit** flow, so the email link lands with the session in the fragment — consumable by any browser (PKCE would need the code verifier on the server-side initiating client). The page reads the fragment, scrubs it from history, and round-trips the token through Express. | `@supabase/supabase-js` 2.108.2 default; `config/supabase.js` `flowType: "implicit"` (auth SPEC D-C5); METHODOLOGY R1. |
| **D-C5** | **No standalone "Back to login" link (client-neutral destination).** Removed in v0.1.1: this page is the destination of the reset email's link, now opened by **both** web and iOS clients (iOS's request step is native — see `forgot-password` iOS mirror), so a web-only `/login` link would strand an iOS user on the web login. The page stays fully navigable without it — success auto-redirects to `/login?reason=password-reset` and the invalid-link state offers "Request a new reset link". `forgot-password` keeps its "Back to login" (web-only entry). | User request (2026-06-30); paired iOS `ForgotPasswordView` native request screen; `reset-password/page.tsx`. |
| **D-S1** | **Faithful to the sibling auth pages' look & feel.** Reuses login/splash/forgot chrome verbatim — `BrandMark`, the `motion.div` fade-in, `input-shell` fields, the `Show/Hide` toggle, `button-primary--dark-white` CTA, `rf-*` tokens, the same redirect-when-authed pattern. No new design language. | `apps/web/src/app/{login,splash,forgot-password}/page.tsx`; `globals.css`. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **No bootstrap loading gate — brief flash possible** (same as login F2 / forgot F1). The page renders immediately; the `/programs` redirect (for an authed visitor without a token) fires only after `!isBootstrapping`. | `reset-password/page.tsx` (the redirect `useEffect`) | Kept (faithful to siblings) — cosmetic. |
| **F2** | **No client-side rate limiting** on reset submits (mirrors auth SPEC F4). Supabase rate-limits its own auth ops; the recovery token is single-use/short-lived. | `reset-password/page.tsx`; auth SPEC F4 | Kept — any throttling belongs server-side. |
| **F3** | **iOS has a native recovery *request* screen, not a native reset screen** (2026-06-30). iOS's `ForgotPasswordView` natively runs the request step (`POST /auth/forgot-password`); the **set-new-password step stays on this web page** — the emailed link opens `rasifiters.com/reset-password` in the browser for both clients (hence D-C5). No native reset (would need Universal Links + Supabase redirect config). | iOS `Features/Auth/ForgotPasswordView.swift`, `LoginView.swift` | Partial — a fully-native iOS reset (deep-link the recovery token) remains a future option. |
| **F4** | **An already-authenticated visitor *with* a recovery token is allowed to reset** (the `/programs` redirect is suppressed when a token is present), since a logged-in user who clicked a reset link still intends to reset. The redirect only fires for an authed visitor with no token. | `reset-password/page.tsx` (redirect guard `accessToken === null`) | Kept — sensible; an uncommon combination. |
| **F5** | **Recovery token lives in the URL fragment on arrival** (Supabase implicit flow). Fragments aren't sent to the server, and the page scrubs it from history immediately, but it transits the browser. | `reset-password/page.tsx` (fragment parse + `history.replaceState`); auth SPEC D-C5 | Kept (the implicit flow is required by our backend-initiated architecture — D-C4). |
| **F6** | **Auto-redirect timing is fixed (~2.2s)** before navigating to login on success — a long-enough glance at the confirmation, but not user-dismissable. | `reset-password/page.tsx` (`setTimeout`) | Kept — a rebuild could add a "Go to login now" button. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.1 | 2026-06-30 | **Removed the standalone "Back to login" link** (D-C5, F3) — this page is the reset email's destination, now opened by **both** web and iOS clients (iOS's request step became native — `apps/ios/.../Features/Auth/ForgotPasswordView.swift`), so a web-only login link would strand iOS users. Page stays navigable via the success auto-redirect + the invalid-link "Request a new reset link". `/forgot-password` keeps its "Back to login". No behavior change to the reset flow itself. `apps/web/src/app/reset-password/page.tsx`. |
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker` (run 18) — the **fourth web page spec** and the **second net-new page** (the reset/consume step pairing with `forgot-password`). Documents `/reset-password`: reads the Supabase recovery `access_token` from the implicit-flow URL **fragment** (D-C4), a **new-password + confirm form with an inline policy hint** (D-C3), forwards the token as Bearer to **`POST /auth/reset-password`** which reuses `authenticateToken` + `changePassword` (D-C1), then **in-page success → `/login?reason=password-reset`** (D-C2). Reset routed **through Express** (R1). Consumes `auth` v0.4.0. Flagged F1–F6 (bootstrap flash; no client rate-limit; iOS recovery gap; authed-with-token may reset; token in fragment; fixed redirect timing). Ported `apps/web/src/app/reset-password/page.tsx` + `resetPassword()` (`api/auth.ts`) + the login `password-reset` banner (login SPEC → v0.1.1); `npm run build` ✓ (`/reset-password` prerendered, 4.28 kB). **The auth-recovery path is now end-to-end** (forgot → email → reset → login). |
