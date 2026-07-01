# Page: `create-account` (web) — the public sign-up screen

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.1.0 · **App:** `web` (Next.js App Router)
> **Route:** `/create-account` (reached from the login page's "New here? Create an account" link).
> **Provenance (legacy, archived):** `rasifiters-webapp/src/app/create-account/page.tsx`
> (+ `components/{Select,SelectMobile}.tsx`, `components/BrandMark.tsx`).
> **Consumes (features):** [`auth`](../../../features/auth/SPEC.md) — `registerAccount()` (`POST /auth/register`)
> then `login()` (`POST /auth/login/global`), the foundation `useAuth` context
> (`session`, `setSession`, `isBootstrapping`), and the client JWT helpers (`decodeJwtPayload` /
> `resolveGlobalRole`).
> **Cross-app:** iOS `CreateAccountView.swift` (`Features/Auth/`) — same field set + register-then-login;
> the inline validation / authed-redirect / live-checklist cleanups are web-first (F-rows; mirror at the iOS port).
> **Stance:** faithful port **+ 5 deliberate deviations** (D-C1…D-C5) — inline email validation (the
> D-PLAN item-3 mandate), authed redirect, live password checklist, muted mismatch hint, autoFocus.
> Oddities flagged §10.

---

## 1. What it is + who uses it

The **public sign-up screen** — where a new visitor creates a RaSi Fiters account (first/last name, username,
email, optional gender, password + confirm). It's the end of the public/auth path (`splash → login →
create-account`) and the only self-service way to become a member. Used by **everyone pre-auth**; an
already-authenticated visitor is immediately redirected to `/programs` and never sees the form (D-C2 — a
deviation from legacy, which had no such redirect).

## 2. Why it exists

To let a new member register and land signed-in. On submit it calls `registerAccount()` (creating the
Supabase Auth user + `members`/`member_emails` rows server-side), then — because `register` returns **no
session token** (auth SPEC §3) — immediately calls `login()` with the same credentials, decodes the JWT,
resolves the global role, stores the session (`useAuth().setSession`), and routes to `/programs`. This
register-then-auto-login is faithful to legacy.

## 3. Route / location

- **App:** `web`. **Route:** `/create-account`. **Public** (no auth required; not in the `middleware.ts` matcher).
- **Reached via:** the login page's "New here? **Create an account**" link, or a direct visit.
- **Leaves to:** `/programs` (on successful sign-up + the already-authed redirect) · `/login` (the "Already
  have an account? Sign in" link) · `PRIVACY_POLICY_URL` (external).

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Brand logo | `BrandMark` (size 128), centered, with the fade-in `motion.div`. | create-account/page.tsx:114 |
| Heading + subheading | "Create Account" / "Start tracking your fitness journey". | create-account/page.tsx:116-120 |
| First / Last name inputs | Two text inputs (`given-name` / `family-name`); **First Name `autoFocus`** (D-C5). | create-account/page.tsx:127-147 |
| Username input | Text input, `autoComplete="username"`. | create-account/page.tsx:149-158 |
| Email input + inline hint | `type="email"` input; **a muted "Enter a valid email address." hint** when typed-but-invalid (D-C1, new). | create-account/page.tsx:160-169 |
| Gender select (optional) | `Select` (responsive desktop/mobile dropdown), placeholder "Gender (optional)"; sent only when non-empty. | create-account/page.tsx:171-177 |
| Password input + toggle | Password input with a Show/Hide button, `autoComplete="new-password"`. | create-account/page.tsx:179-195 |
| Confirm-password input + toggle | Second password input with its own Show/Hide. | create-account/page.tsx:197-213 |
| **Live password checklist** | **REPLACES the legacy static hint line (D-C3)** — a ✓/○ list (≥8 chars · uppercase · lowercase · number) that appears once the user starts typing and turns green per satisfied rule. | legacy static line: create-account/page.tsx:215-218; `apps/web` `PolicyItem` |
| Confirm-mismatch hint (conditional) | **Muted "Passwords don't match." (D-C4)** — was legacy's red text; aligned to reset-password's styling. | legacy red: create-account/page.tsx:219-221 |
| Error banner (conditional) | Red box with the caught error message (default "Unable to create account. Try again."). | create-account/page.tsx:224-228 |
| Submit button | "Create Account" / "Creating account..." (when `isLoading`); disabled while `!canSubmit \|\| isLoading`. | create-account/page.tsx:230-236 |
| Sign-in link | "Already have an account? **Sign in**" → `/login`. | create-account/page.tsx:239-247 |
| Footer | "By creating an account, you accept our **Privacy Policy**" → `PRIVACY_POLICY_URL`. | create-account/page.tsx:249-257 |

**Submit flow** (create-account/page.tsx:57-102):
guard `canSubmit && !isLoading` → build payload `{ first_name, last_name, username, email, password,
gender? }` → `registerAccount(payload)` → `login(username, password)` → `decodeJwtPayload` →
`resolveGlobalRole` → build session → `setSession` → `router.push("/programs")`. Errors caught → red banner;
`finally` clears `isLoading`. **`canSubmit`** requires all names + username non-empty, a **format-valid email**
(D-C1; was legacy's non-empty-only), the password meeting policy, and `password === confirmPassword`.

## 5. Components + features consumed

- **Components:** `BrandMark` (`src/components/BrandMark.tsx`), **`Select`** (+ `SelectMobile`) — ported with
  this page as the gender dropdown dependency (`src/components/{Select,SelectMobile}.tsx`, using the
  foundation `useIsMobile`), `framer-motion`, `next/link`, `next/navigation` `useRouter`.
- **Features:** [`auth`](../../../features/auth/SPEC.md) — `registerAccount()` + `login()` from
  `src/lib/api/auth.ts`, the foundation `useAuth()` hook (`session`, `setSession`, `isBootstrapping`), and
  `decodeJwtPayload` / `resolveGlobalRole` from `src/lib/auth/jwt.ts`.

## 6. Data / API

- **`POST /auth/register`** (via `registerAccount(payload)`) — body `{ first_name, last_name, username,
  email, password, gender? }`; the backend **requires + normalizes + format-validates email** and enforces
  the password policy (auth `register`: ≥8 chars + upper + lower + number), creates the Supabase Auth user
  (`admin.createUser`, `email_confirm:true`) + `members` + primary `member_emails` rows, and returns
  `{ message, member_id, username, member_name }` — **no token**.
- **`POST /auth/login/global`** (via `login(username, password)`) — called immediately after a successful
  register to obtain the session JWT (auto-login). Same contract as the login page.
- Session is persisted by the `AuthProvider` (localStorage `rasi.fiters.session` + cookie
  `rasi.fiters.token`) inside `setSession`.

## 7. Role-based view rules

**N/A at render — public, pre-auth.** No authenticated user (hence no role) exists while the sign-up form
shows; the form and links are identical for every visitor. A role is only stamped onto the session *after*
the post-register auto-login (`resolveGlobalRole` → `global_admin` vs `standard`), consumed by downstream
pages, not here.

| Viewer | Sees | Can do |
|--------|------|--------|
| Unauthenticated (any visitor) | Full sign-up form + Sign-in / Privacy links. | Create an account · go to login. |
| Any authenticated role (global_admin · program admin · logger · member) | Nothing — redirected to `/programs` after bootstrap (D-C2). | (auto-redirect only) |

`admin_only_data_entry` is irrelevant here (no program context; it's a program-scoped lock applied only
after a program is selected).

## 8. States & edge cases

- **Loading:** `isLoading` flips the button to "Creating account..." and disables it; the form is otherwise live.
- **Validation:** the submit button is disabled until all required fields are filled, the email is
  format-valid (D-C1), the password meets policy (live checklist, D-C3), and the two passwords match. The
  email hint and password checklist appear only after the user starts typing (no flash of errors on a blank form).
- **Register/login error:** caught → red banner with `error.message` (e.g. "Username already exists",
  "Email already exists", a password-policy message, or the default "Unable to create account. Try again.").
- **Auto-login after register:** if `register` succeeds but `login` fails (rare — same just-created
  credentials), the catch surfaces the login error and the user can sign in manually via `/login` (the
  account already exists). Flagged F2.
- **Already authenticated:** `router.replace("/programs")` once `!isBootstrapping && session` (D-C2 —
  replace, not push); a brief form flash is possible during bootstrap (F3, mirrors login F2).
- **Forward dependency:** `/programs` (post-signup + already-authed redirect) is ported in a later run.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Reference impl = legacy `rasifiters-webapp/src/app/create-account/page.tsx` (+ `Select`/`SelectMobile`/`BrandMark`). `consumed_by = [web]`.** **Cross-app:** iOS `CreateAccountView.swift` registers the same field set then logs in; the inline-validation / authed-redirect / checklist cleanups are web-first and mirror at the iOS port (F-rows). | `create-account/page.tsx`; user answer (faithful + cleanups). |
| **D-S1** | **Stance = faithful port of the legacy page + the 5 deviations below.** The field set, the register-then-auto-login flow, the chrome (`BrandMark`/`motion`/`input-shell`/`rf-*`), the Show/Hide toggles, the gender `Select`, the sign-in + Privacy links, and `/programs` on success are ported verbatim. | `create-account/page.tsx:1-261`; user answers (run 19). |
| **D-C1** | **Inline email-format validation (D-PLAN item 3).** Email becomes **format-validated** on the client — `canSubmit` now requires a regex-valid email (the same loose `EMAIL_RE` as forgot-password) and a muted "Enter a valid email address." hint shows when typed-but-invalid. Legacy validated only non-empty + HTML5 `type="email"`. The backend already requires + format-validates email (so this is forward-only; existing/placeholder accounts untouched). | D-PLAN item 3 (login SPEC); forgot-password SPEC D-C2 (same regex); auth `register` email-required; user answer ("inline regex, match forgot-password"). |
| **D-C2** | **Already-authenticated → `/programs` redirect.** A `useEffect` redirects an authed visitor (`!isBootstrapping && session`) to `/programs`, matching login/forgot/reset. Legacy create-account had **no** such redirect (an authed user could open the sign-up form). | Sibling pages (login/forgot/reset redirects); user answer ("add redirect"). |
| **D-C3** | **Live password-policy checklist** replacing legacy's always-visible static hint line. A ✓/○ list (≥8 chars · uppercase · lowercase · number) appears once the user starts typing and turns green per satisfied rule, mirroring the server `validatePassword` policy. Merges the two password-hint cleanup options the user selected (the conditional-hint behavior is subsumed by the checklist's appear-on-type). | legacy static line `create-account/page.tsx:215-218`; auth `validatePassword`; user answer (both hint options). |
| **D-C4** | **Muted confirm-mismatch hint** ("Passwords don't match.") aligned to reset-password's styling, instead of legacy's red "Passwords do not match." text. | reset-password SPEC (muted mismatch hint); `create-account/page.tsx:219-221`; user answer. |
| **D-C5** | **`autoFocus` the First Name field** so the form is immediately typeable on load. Pure nicety; no behavior change. | user answer. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Client-side JWT decode without signature verification** (post-register auto-login) — same as login F1; display/role-hint only, the backend re-verifies every authed call. | `create-account/page.tsx:76-82` | Kept (faithful) — not a security boundary. |
| **F2** | **Two-call register-then-login with no rollback on the login leg.** If `register` succeeds but the follow-up `login` throws, no session is set; the account nonetheless exists and the user can sign in via `/login`. Faithful to legacy. | `create-account/page.tsx:73-94` | Kept (faithful) — recoverable; a rebuild could surface "account created — please sign in". |
| **F3** | **No bootstrap loading gate — brief form flash for authenticated users** (mirrors login F2). The form renders immediately; the D-C2 redirect fires only after `!isBootstrapping`. | `create-account/page.tsx` (the D-C2 `useEffect`) | Kept (faithful) — cosmetic. |
| **F4** | **No client-side rate limiting** on repeated sign-up attempts (mirrors login F4 / auth F4). | `create-account/page.tsx:57-102` | Kept (faithful) — any throttling belongs server-side. |
| **F5** | **No username-format rules client-side** — username is only checked non-empty; uniqueness + any rules are enforced server-side (400 "Username already exists"). | `create-account/page.tsx:50` | Kept (faithful) — server is the authority. |
| **F6** | **The cleanups are web-first; iOS `CreateAccountView` lacks them** (inline email validation, authed redirect, live checklist, muted mismatch hint, autoFocus). | iOS `CreateAccountView.swift` (`Features/Auth/`) | **Yes — iOS gap** to reconcile at the iOS create-account port. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker` (run 19) — the **fifth web page spec** (closing the public/auth path: splash → login → forgot → reset → create-account). Documents the public `/create-account` sign-up screen: first/last name + username + email + optional gender (`Select`) + password + confirm, register-then-auto-login → `/programs`, sign-in + Privacy links. Consumes `auth` (`registerAccount()` `POST /auth/register` + `login()`, `useAuth`, jwt helpers). Decisions: **D-REF** (`consumed_by=[web]`; iOS `CreateAccountView` mirrors later) · **D-S1** (faithful port + 5 deviations) · **D-C1** (inline email-format validation — D-PLAN item 3, mirrors forgot-password regex) · **D-C2** (already-authed → `/programs` redirect — legacy had none) · **D-C3** (live password-policy checklist replacing the static hint) · **D-C4** (muted confirm-mismatch hint) · **D-C5** (autoFocus First Name). Flagged F1–F6 (client JWT decode; register-then-login no-rollback; bootstrap form flash; no client rate-limit; no client username rules; cleanups web-first / iOS gap). Ported `apps/web/src/app/create-account/page.tsx` + the `Select`/`SelectMobile` dependency; `npm run build` ✓ (`/create-account` prerendered, 6.25 kB). |
