# Page: `forgot-password` (web) — request a password reset (auth-recovery, step 1)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.1.0 · **App:** `web` (Next.js App Router)
> **Route:** `/forgot-password` (reached from the `/login` "Forgot your password?" link — login SPEC D-C1).
> **Reference impl (legacy):** **NONE — 100% net-new.** No `/forgot-password` exists on either legacy
> client (web or iOS); confirmed `question-asker` run 16. This page exists only because the migration to
> Supabase Auth enables self-service recovery (the whole reason that provider was chosen).
> **Consumes (features):** [`auth`](../../../features/auth/SPEC.md) v0.3.0 — `requestPasswordReset()`
> (`POST /auth/forgot-password`); the foundation `useAuth` context (`session`, `isBootstrapping`) for the
> already-authed redirect; `SUPPORT_EMAIL` from `src/lib/config.ts` for the contact fallback.
> **Cross-app:** none yet — iOS has **no** recovery screen (its only affordance is a `supportURL` contact
> link in Settings). Web-first per the auth-recovery plan; iOS mirrors later (login SPEC F3).
> **Stance:** **net-new, built to the D-PLAN contract** (login SPEC §9 D-PLAN) — always-send (privacy-safe)
> + always-visible `mailto:` contact fallback + inline email-format validation.

---

## 1. What it is + who uses it

The **request step of self-service password recovery** — where a user who can't sign in enters their
**email** and asks for a reset link. It's the destination of the login page's "Forgot your password?"
link (the one migration addition to login). Used by **anyone pre-auth** who's locked out; an
already-authenticated visitor is redirected to `/programs` (consistent with splash/login).

It is **step 1 of 2**: this page requests the email; the actual password change happens on a separate
**`/reset-password`** page (the email link's destination — built the **next** run, with its backend route).

## 2. Why it exists

The legacy app had **zero** password recovery on either client (a locked-out member had to be reset
manually). Adopting Supabase Auth was chosen specifically to enable easy self-service recovery, so this
page is the realization of that. It must also serve the **migrated placeholder (no-email) accounts** —
members imported without a real email (e.g. `admin@no-email.rasifiters.com`) who **can't receive a reset
email at all** — via an always-visible "Contact us" `mailto:` fallback.

## 3. Route / location

- **App:** `web`. **Route:** `/forgot-password`. **Public** (no auth; not in the `middleware.ts` matcher).
- **Reached via:** the login page's "Forgot your password?" link (`/login` → `/forgot-password`), or a
  direct visit.
- **Leaves to:** `/login` ("Back to login") · the support `mailto:` (external mail client) · `/programs`
  (the already-authed auto-redirect). The reset email's link leaves to **`/reset-password`** — a
  **forward dependency** built next run (§8).

## 4. Contents / sections

| Block | What | Where |
|-------|------|-------|
| Brand logo | `BrandMark` (size 128), centered. | `forgot-password/page.tsx` (shared `BrandMark`) |
| Heading + subheading | "Reset your password" / "Enter your email and we'll send you a link to reset it." | `forgot-password/page.tsx` |
| Email input | `type="email"`, placeholder "Email", `autoComplete="email"`. **Email-only** (not username-or-email). | `forgot-password/page.tsx` |
| Format hint (conditional) | "Enter a valid email address." — shown once the field is non-empty but not yet valid (D-C2). | `forgot-password/page.tsx` |
| Error banner (conditional) | Red box on a genuine send failure (network/500) — neutral "couldn't send… try again, or contact us below". | `forgot-password/page.tsx` |
| Submit button | "Send reset link" / "Sending…" (`isLoading`); disabled until the email is valid (`canSubmit`). | `forgot-password/page.tsx` |
| Success state | On submit, the form is **replaced** by a green banner: "If an account with that email exists, we've sent a password reset link…" — the **same message regardless of existence** (no enumeration). | `forgot-password/page.tsx` |
| **Contact fallback** | **ALWAYS visible** (both form + success states) — "No email on your account? **Contact us** …" → `mailto:SUPPORT_EMAIL`. Serves the placeholder no-email accounts. | `forgot-password/page.tsx`; `config.ts` `SUPPORT_EMAIL` |
| Back link | "Back to login" → `/login`. | `forgot-password/page.tsx` |

**Submit flow:** guard `canSubmit` (valid email && !loading) → `requestPasswordReset(trimmedEmail)`
(`POST /auth/forgot-password`) → on resolve `setSubmitted(true)` (show generic success) → `finally` clears
`isLoading`. A genuine throw → neutral red error banner (not an existence signal); the contact fallback
stays visible.

## 5. Components + features consumed

- **Components:** `BrandMark` (`src/components/BrandMark.tsx`), `framer-motion` (`motion.div` fade-in),
  `next/link`, `next/navigation` `useRouter`.
- **Features:** [`auth`](../../../features/auth/SPEC.md) v0.3.0 — `requestPasswordReset()` from
  `src/lib/api/auth.ts` (`POST /auth/forgot-password`); `useAuth()` (`session`, `isBootstrapping`) for the
  already-authed redirect. `SUPPORT_EMAIL` from `src/lib/config.ts`.

## 6. Data / API

- **`POST /auth/forgot-password`** (via `requestPasswordReset(email)`) — body `{ email }`; response **always
  `200 { message }`** with a generic message (privacy-safe — never reveals whether the email maps to an
  account). The backend calls Supabase `resetPasswordForEmail(email, { redirectTo })`, where `redirectTo`
  (env `PASSWORD_RESET_REDIRECT_URL`) is our **own** web `/reset-password` page — clients never embed
  Supabase (METHODOLOGY R1). See [auth SPEC](../../../features/auth/SPEC.md) §3 route #9 / D-C4.
- No other endpoint. No session is created or read (the page is pre-auth except for the redirect check).

## 7. Role-based view rules

**N/A at render — public, pre-auth.** No authenticated user (hence no role) exists while the page shows;
the form, the contact fallback, and the links are identical for every visitor. An already-authenticated
visitor never sees the page (redirected to `/programs`).

| Viewer | Sees | Can do |
|--------|------|--------|
| Unauthenticated (any visitor) | Email form (or success banner) + always-visible Contact-us fallback + Back-to-login. | Request a reset · contact support · return to login. |
| Any authenticated role (global_admin · program admin · logger · member) | Nothing — redirected to `/programs` after bootstrap (F1). | (auto-redirect only) |

`admin_only_data_entry` is irrelevant here (pre-auth; no program selected).

## 8. States & edge cases

- **Loading:** `isLoading` flips the button to "Sending…" and disables it.
- **Validation:** inline email-format check (`EMAIL_RE`); the button stays disabled until valid, and a hint
  appears once the field is non-empty but invalid (D-C2). Whitespace is trimmed before validation/submit.
- **Success:** form replaced by the generic green banner — **identical whether or not the email exists**
  (no enumeration). Contact fallback stays visible.
- **Send failure (network/500):** neutral red banner ("couldn't send… try again, or contact us below"); a
  500 is **not** existence info, so this doesn't leak. Contact fallback stays visible.
- **Placeholder / no-email accounts:** can't receive a reset email — the always-visible `mailto:` contact
  fallback is their path back in (the reason it's always shown).
- **Already authenticated:** `router.replace("/programs")` once `!isBootstrapping && session` (brief
  form flash possible during bootstrap — F1, same as login F2).
- **Forward dependency:** the reset email's link lands on **`/reset-password`** (+ `POST /auth/reset-password`)
  — **built the next run**. Until web is deployed to Vercel and that page exists, the email link's
  destination is not yet live (F4).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Net-new — no reference impl; `consumed_by = [web]`.** No `/forgot-password` exists on either legacy client (run 16). Built only because Supabase Auth enables self-service recovery. iOS has no recovery screen (web-first; iOS mirrors later — login SPEC F3). | `question-asker` run 16 sweep (3 Explore agents — recovery on neither client); login SPEC D-PLAN/F3. |
| **D-SCOPE** | **This run = the forgot-password PAGE + the one backend route it calls** (`POST /auth/forgot-password`, an `auth` MINOR bump → v0.3.0). The **`/reset-password` page + `POST /auth/reset-password` are the NEXT run.** Cleanest by-page vertical slice (each page paired with its route). | User answer (scope = "Page + forgot route"); D-PLAN item (2). |
| **D-C1** | **Always-send + always-visible contact fallback** (privacy-safe). The page always calls `requestPasswordReset` and always shows the generic "if an account exists…" success — **no account-enumeration**. The `mailto:SUPPORT_EMAIL` "Contact us" block is shown in **both** the form and success states, serving the migrated placeholder (no-email) accounts. Support = `vinay.sankara@gmail.com` (**placeholder, may change**), wired as `SUPPORT_EMAIL` (`NEXT_PUBLIC_SUPPORT_EMAIL`). | User answers (login SPEC D-PLAN); `config.ts` `SUPPORT_EMAIL`; backend always-200 (auth D-C4). |
| **D-C2** | **Inline email-format validation** (the field is email-only, unlike login's username-or-email identifier). A loose `EMAIL_RE` gates the submit button + shows a hint; consistent with the mandated "sign-up email must be format-validated" direction. **This is a deliberate divergence from login's F5** (login does no inline validation — different because its identifier is dual-purpose). | User answer (email field = "Add inline email-format validation"); contrast login SPEC F5. |
| **D-C3** | **Reset runs through the Express backend (R1).** The page never touches Supabase; the email's reset link lands on our **own** `/reset-password` page (`PASSWORD_RESET_REDIRECT_URL`), which will forward the recovery token to `POST /auth/reset-password` next run. Locked by METHODOLOGY R1 (clients never embed Supabase) — stated as context, not re-asked. | METHODOLOGY R1; auth SPEC §7 / D-C4; `render.yaml` `PASSWORD_RESET_REDIRECT_URL`. |
| **D-S1** | **Faithful to the sibling auth pages' look & feel.** Reuses login/splash chrome verbatim — `BrandMark`, the `motion.div` fade-in, `input-shell` field, `button-primary--dark-white` CTA, `rf-*` tokens, the same redirect-when-authed pattern. No new design language. | `apps/web/src/app/{login,splash}/page.tsx`; `globals.css`. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **No bootstrap loading gate — brief form flash for authenticated users** (same as login F2). The page renders immediately; the `/programs` redirect fires only after `!isBootstrapping`. | `forgot-password/page.tsx` (the `useEffect` redirect) | Kept (faithful to login/splash) — cosmetic; a rebuild could gate render on bootstrap. |
| **F2** | **No client-side rate limiting** on reset requests — repeated submits each hit the backend (which also has no limiter — auth SPEC F4). | `forgot-password/page.tsx`; auth SPEC F4 | Kept — any throttling belongs server-side (Supabase also rate-limits `resetPasswordForEmail`). |
| **F3** | **iOS has no recovery screen** — web-first; the iOS recovery entry is to be added at the iOS auth port (login SPEC F3). | iOS `LoginView.swift`; `MyAccountSection.swift` (`supportURL`) | **Yes — iOS gap** to close when recovery is mirrored to iOS. |
| **F4** | **Forward dependency — the reset link's destination isn't live yet.** `/reset-password` + `POST /auth/reset-password` land next run; until web deploys to Vercel and that page exists, a sent email's link has no live target. | this run's scope (D-SCOPE); `render.yaml` `PASSWORD_RESET_REDIRECT_URL` | Resolved next run (build `/reset-password`). |
| **F5** | **Support email is a placeholder** (`vinay.sankara@gmail.com`) that may change — wired as config (`SUPPORT_EMAIL` / `NEXT_PUBLIC_SUPPORT_EMAIL`) so it's a one-line swap, not a code edit. | `config.ts`; D-C1 | Update the env value when the real support address is decided. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker` (run 17) — the **third web page spec** (after splash, login) and the **first net-new page** (no legacy reference; recovery existed on neither client). Documents `/forgot-password`: email-only field with **inline format validation** (D-C2), **always-send + generic success** (privacy-safe, no enumeration), an **always-visible `mailto:` contact fallback** for placeholder no-email accounts (D-C1), reset routed **through Express** (R1, D-C3), already-authed → `/programs` redirect. Consumes `auth` v0.3.0 (`requestPasswordReset()` `POST /auth/forgot-password`). **Scope (D-SCOPE): page + the one backend route this run; `/reset-password` + `POST /auth/reset-password` next run.** Flagged F1–F5 (form flash; no client rate-limit; iOS recovery gap; reset-page forward dependency; placeholder support email). Ported `apps/web/src/app/forgot-password/page.tsx` + `SUPPORT_EMAIL` (`config.ts`) + `requestPasswordReset()` (`api/auth.ts`); `npm run build` ✓ (`/forgot-password` prerendered, 3.94 kB). |
