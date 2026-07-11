# Page: `delete-account` (web) — Public Account-Deletion Instructions

> **Status:** 🏗️ built (`apps/web/`, deployed to prod) · **Version:** 0.1.0 · **App:** `web` (Next.js App Router)
> **Route:** `/delete-account` — the **PUBLIC** (pre-auth) account-deletion instructions page: a single static
> `GlassCard` explaining how a user requests deletion of their RaSi Fiters account and data (in-app steps + an
> email fallback), **what data is deleted**, and **what is retained + for how long**. Header **Support** link to
> [`support`](../support/SPEC.md), mirroring the sibling [`privacy-policy`](../privacy-policy/SPEC.md).
> **Provenance:** **NET-NEW (no legacy port)** — created **2026-07-10** to satisfy **Google Play's Data safety
> form + account-deletion policy**, which require a **public web URL** (viewable without signing in or installing)
> that describes the deletion process. Filled into the Play Console **Data safety → account deletion URL** field.
> **Consumes (features):** none beyond the foundation — `PageShell`/`PageHeader`/`GlassCard` + `next/link`. No
> feature SPEC; the content is hardcoded page prose. **No `useAuthGuard`** (public page).
> **Cross-app:** the same public URL is the account-deletion resource referenced by the **Android** Play listing
> (and reusable by the iOS App Store listing). The actual in-app deletion action lives on
> [`program/profile`](../program/profile/SPEC.md) (the "Delete Account?" confirm → `deleteAccountApi`); this page
> only *documents* that flow at a public URL. **Stance:** net-new compliance page, written to be faithful to the
> real deletion behavior and to the privacy-policy page's structure/tone.

---

## 1. What it is + who uses it

The **PUBLIC account-deletion instructions** page: a `PageShell maxWidth="3xl"` + `PageHeader` ("Delete Your
Account", subtitle "How to request deletion of your RaSi Fiters account and data", a **Support** link action)
over a single `GlassCard padding="lg"` containing five prose sections — *Delete your account from the app*
(4-step list), *Request deletion by email* (fallback for locked-out users → `geethasankar78@gmail.com`), *What
data is deleted*, *What is retained, and for how long* (immediate live-system removal; encrypted-backup purge
within 30 days; minimal legally-required records only), and *Contact us*. Used by **anyone, signed-in or not**
(public route) — in practice reached from the Play Store listing's "app support / account deletion" link. It is
**read-only**; nothing is interactive except the header **Support** link.

## 2. Why it exists

Google Play policy requires developers whose apps let users create an account to provide a **publicly accessible
web resource** that (a) prominently features the steps to request account deletion, (b) states what data is
deleted vs kept, and (c) states any retention period — and to declare that URL in the **Data safety** form. The
app already has in-app deletion ([`program/profile`](../program/profile/SPEC.md)), but that is behind auth and
does not satisfy the "public URL" requirement. This page is that public resource. It is a static legal/support
document — **no server content, no API, no per-user state** — so it never touches the backend and renders
identically for everyone.

## 3. Route / location

- **App:** `web`. **Route:** `/delete-account`. **PUBLIC** — **NOT** under the `middleware.ts` matcher (which
  only covers `/summary`, `/members`, `/lifestyle`, `/program`, `/programs`), so a tokenless visitor is **not**
  bounced to `/login`. There is **no `useAuthGuard`** and **no role redirect**.
- **Reached via:** the Google Play Console listing's account-deletion / app-support link, and any direct link
  (marketing footer). Pairs with the sibling public pages [`privacy-policy`](../privacy-policy/SPEC.md) and
  [`support`](../support/SPEC.md).
- **Chrome:** `PageShell maxWidth="3xl"` (a text document) + `PageHeader` (title "Delete Your Account", subtitle,
  `actions` = a `next/link` **Support** link → `/support`). **No `backHref`**; **no bottom nav**.
- **Leaves to:** `/support` via the header link; otherwise stays in place.

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Header | `PageHeader` "Delete Your Account" + subtitle + a **Support** `next/link` action → `/support`. | delete-account/page.tsx:11-22 |
| Instructions card | `GlassCard padding="lg"` (`space-y-6 text-sm text-rf-text-muted`) wrapping the intro + five titled sections. | delete-account/page.tsx:24-96 |
| In-app steps | *Delete your account from the app* — a `list-decimal` of the 4 steps (sign in → My Account → Delete Account → confirm). | delete-account/page.tsx:33-46 |
| Email fallback | *Request deletion by email* — for users who cannot sign in; `geethasankar78@gmail.com`, subject "Delete my account". | delete-account/page.tsx:48-59 |
| Data deleted | *What data is deleted* — `list-disc` of account info, profile, fitness/activity logs, Apple-Health/Health-Connect-derived logs (copies removed; originals untouched), push tokens. | delete-account/page.tsx:61-79 |
| Retention | *What is retained, and for how long* — immediate live-system removal, encrypted-backup purge within 30 days, minimal legally-required records only. | delete-account/page.tsx:81-90 |
| Contact | *Contact us* — `geethasankar78@gmail.com`. | delete-account/page.tsx:92-95 |

## 5. Components + consumed features

- **Shared UI:** `PageShell`, `PageHeader`, `GlassCard` + `next/link` `Link` — all already ported (no new
  dependency). No icons, no other primitives.
- **Hooks/state:** **none** — no `useAuthGuard`, no `useState`, no `useEffect`, no router. Pure static render
  (same shape as [`privacy-policy`](../privacy-policy/SPEC.md)).
- **Consumed features:** **none.** The content is hardcoded JSX; no feature SPEC, no `lib/*` module, no network
  dependency. The described in-app deletion action belongs to [`program/profile`](../program/profile/SPEC.md)
  (`deleteAccountApi`), but this page does not call it — it only documents it.

## 6. Data / API

- **No API, no backend, no network call, no client storage.** The page renders hardcoded prose; it reads nothing
  and writes nothing. No `useAuthGuard` session check (public route).
- **No backend work, no feature bump** — content is static page markup.

## 7. Role-based view rules

| Role | Access | Notes |
|------|--------|-------|
| **(signed-out / pre-auth)** | Reads the instructions. | **Public route** — no session required. |
| **global_admin · program admin · logger · member** | Reads the instructions. | No role gate — identical static document for everyone. |

- **Role rules = N/A (pre-auth).** Public page — viewable with no session, so no role to gate on. No JWT read,
  no role-conditional UI.
- **`admin_only_data_entry` effect:** **N/A** — read-only public document, not a data-entry surface.

## 8. States & edge cases

- **Only one state:** the fully-rendered static document. **No loading, empty, error, pending, or offline
  state** — nothing is fetched. No interaction beyond the header **Support** link.
- **Unauthenticated:** **allowed** — the public route renders with no redirect (the point of the page: reachable
  while signed-out, and by a locked-out ex-user who still needs the email fallback).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-NEW** | **NET-NEW page (not a legacy port).** Created 2026-07-10 for Google Play's Data-safety + account-deletion policy (a public deletion URL is mandatory to complete the Data safety form and to pass review). Called out per CLAUDE.md as a deliberate addition. | Play Console Data safety / [account-deletion policy](https://support.google.com/googleplay/android-developer/answer/13327111) |
| **D-STRUCT** | **Mirror [`privacy-policy`](../privacy-policy/SPEC.md) exactly** — same `PageShell maxWidth="3xl"` + `PageHeader` (with a **Support** `next/link` action) + single static `GlassCard`, same `rf-*` tokens and section idiom. Keeps the two public legal/support pages visually consistent; no new dependency. | privacy-policy/page.tsx |
| **D-FAITHFUL** | **Content states the REAL deletion behavior**, verified against the code: in-app deletion lives on [`program/profile`](../program/profile/SPEC.md) ("Delete Account?" → `deleteAccountApi`); data removed matches what the privacy policy enumerates (account, profile/gender, workouts/sleep/steps/diet, Health-Connect/Apple-Health-derived logs, push tokens). Retention: immediate live removal + 30-day encrypted-backup purge + minimal legally-required records only. | apps/web/src/app/program/profile/page.tsx; privacy-policy/page.tsx |
| **D-EMAIL** | **Email fallback = `geethasankar78@gmail.com`** (the same contact as the privacy policy), for users who can no longer sign in and thus cannot use the in-app path. Google requires the deletion route to work even without app access. | privacy-policy/page.tsx:140 |
| **D-REF** | `consumed_by = [web]` for this page spec; the SAME public URL is reused by the Android Play listing (and reusable by the iOS App Store listing) — no per-surface duplication of the page, just a shared public URL. | Play Console listing |

## 10. Flagged characteristics (kept as-is)

- **F1 — hardcoded contact email + retention window.** `geethasankar78@gmail.com` and the "within 30 days"
  backup-purge window are literal strings in the JSX (delete-account/page.tsx:52, 85); changing them means editing
  the page. Faithful to the privacy-policy page's F3 pattern; a config-sourced value would be a rebuild feature.
- **F2 — content overlaps the privacy policy's *Data retention* / *Your choices* sections.** The deletion story is
  stated in both [`privacy-policy`](../privacy-policy/SPEC.md) (briefly) and here (in full, with steps). Kept as
  two independent copies (same D-DUP stance as the privacy pages) — the policy is the legal document, this is the
  step-by-step public deletion resource Play requires; not single-sourced.
- **F3 — documents an action it does not perform.** The page describes the [`program/profile`](../program/profile/SPEC.md)
  deletion flow but contains no interactive control and calls no API; if that in-app flow's label/location changes,
  the steps here must be updated by hand. Faithful (a static instructions page); the coupling is documentation-only.
- **F4 — public, no auth, no role read at all.** Same shape as [`privacy-policy`](../privacy-policy/SPEC.md) F4 —
  pre-auth public route, no session check, no role-conditional UI.

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-07-10 | **Net-new public account-deletion page** (D-NEW), created for the **first Android Play release** — Google Play's Data safety form + account-deletion policy require a public URL describing how users request account/data deletion, what is deleted vs retained, and the retention period. Static `GlassCard` mirroring [`privacy-policy`](../privacy-policy/SPEC.md) (D-STRUCT): in-app 4-step instructions + email fallback (D-EMAIL) + data-deleted list + retention (immediate live removal, 30-day backup purge, minimal legal records). Content verified faithful to the real in-app deletion flow on [`program/profile`](../program/profile/SPEC.md) (`deleteAccountApi`) and the privacy policy's data enumeration (D-FAITHFUL). `consumed_by=[web]`; the same URL is reused by the Android/iOS store listings (D-REF). Consumes only foundation chrome + `next/link`; **no feature bump.** Added `apps/web/src/app/delete-account/page.tsx`; committed `4101ae0`, deployed to prod (aliased `www.rasifiters.com`), live at `/delete-account` (verified 200). |
