# Page: `support` (web) — Public Support / Contact (public legal/contact pair — 2 of 2 — CLOSES the web surface)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.3.0 · **App:** `web` (Next.js App Router)
> **Route:** `/support` — the **PUBLIC** (pre-auth) Support / Contact page: a contact card (email + an **Email
> support** button) and a per-platform "what to include" grid, in the landing site's chrome (`PublicPage` —
> [landing D-LAND-13](../landing/SPEC.md)). The **second & LAST of the two final public
> legal/contact pages — it CLOSES the entire web surface** (34th & final web page).
> **It is the SMALLEST page in the rebuild** (38-line legacy file): no data, no state, no API, no auth guard, no
> role logic — a contact card. The landing footer (Privacy · Support) cross-links it with
> [`privacy-policy`](../privacy-policy/SPEC.md).
> **Provenance (legacy, archived):** `rasifiters-webapp/src/app/support/page.tsx`.
> **Consumes (features):** none — the chrome is the landing's `PublicPage` (D-LAND-13). No
> feature SPEC is involved; the contact text is hardcoded page content. **No `useAuthGuard`** (public page).
> **Cross-app:** iOS surfaces support/contact natively (Settings → Support); parity audited at the iOS port.
> **Stance:** **faithful 1:1 port**, plus two deliberate changes: the platform-split include list (0.2.0) and the
> landing chrome (0.3.0). Content otherwise verbatim; already fully `rf-*` tokenized.

---

## 1. What it is + who uses it

The **PUBLIC Support / Contact** page: `PublicPage` (eyebrow "Help", H1 "Support") with a contact card
(`vinay.sankara@gmail.com` as a `mailto:` link + an **Email support** `mailto:` button) and a platform-split
"what to include" grid — **iOS app** (App version · iOS version · Device model), **Android app** (App version ·
Android version · Device model) and **Web** (Browser and version · Operating system) — plus a shared
short-description line.
Used by **anyone, signed-in or not** (a public, pre-auth route) to find how to contact support. It is **read-only**
— nothing on the page is interactive beyond the two `mailto:` links and the landing header/footer links.

## 2. Why it exists

To give users a **public** way to reach support (required for App-Store / web-store listings and for signed-out
users). It is a static contact document — there is **no server content, no API, and no per-user state** — so it
never touches the backend, and renders identically for everyone.

## 3. Route / location

- **App:** `web`. **Route:** `/support`. **PUBLIC** — **NOT** under the `middleware.ts` matcher (which only covers
  `/summary`, `/members`, `/lifestyle`, `/program`, `/programs` — `middleware.ts:6-13`), so a tokenless visitor is
  **not** bounced to `/login`. There is **no `useAuthGuard`** and **no role redirect** — reachable signed-out.
- **Reached via:** any direct link (App-Store listing, the iOS/Android in-app Support links) and the landing footer's
  **Support** link (on `/` and the sibling public pages).
- **Chrome:** `PublicPage` (**no subtitle**) — the landing header + footer around one readable column; skips the
  app shell via `PUBLIC_PAGE_PATHS` ([landing D-LAND-13](../landing/SPEC.md)). **No back button** (the public page
  has no in-app history to return to); **no bottom nav** (not a workspace tab).
- **Leaves to:** the visitor's mail client (the two `mailto:` links) and the landing header/footer links; no other
  page-specific navigation.

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Header | `PublicPage` header: eyebrow "Help" + H1 "Support" (no subtitle), above a divider. | support/page.tsx:12 |
| Contact card | `glass-card` (one row on `sm+`, stacked on phones): "If you need help with RaSi Fiters, contact us at:" + the email `SUPPORT_EMAIL` as a `mailto:` link (`text-lg font-semibold text-rf-text`) + an **Email support** `mailto:` pill (`button-primary--dark-white`). | support/page.tsx:13-29 |
| What to include | The platform lead-in, a `sm:grid-cols-3` grid of `glass-card`s from `PLATFORM_DETAILS` (**iOS app** · **Android app** · **Web**; stacks on phones), then the shared short-description line. | support/page.tsx:4-8, 31-49 |

## 5. Components + consumed features

- **Shared UI:** `PublicPage` (landing chrome — D-LAND-13) + the global `glass-card` / `button-primary` classes;
  `SUPPORT_EMAIL` from `components/landing/content.ts`. No icons, no other primitives.
- **Hooks/state:** **none** — a server component; no `useAuthGuard`, no `useState`, no `useEffect`, no router. A pure static render.
- **Consumed features:** **none.** The contact text is hardcoded JSX; no feature SPEC, no `lib/*` data module, no
  network dependency.

## 6. Data / API

- **No API, no backend, no network call, and no client storage at all.** The page renders hardcoded prose; it
  reads nothing and writes nothing. No `useAuthGuard` session check (public route).
- **No backend work, no feature bump** — there is no endpoint to confirm; the content is static page markup. The
  sweep ports **only the page**.

## 7. Role-based view rules

| Role | Access | Notes |
|------|--------|-------|
| **(signed-out / pre-auth)** | Reads the contact info. | **Public route** — no session required. |
| **global_admin · program admin · logger · member** | Reads the contact info. | No role gate — identical static document for everyone. |

- **Role rules = N/A (pre-auth).** A **public page** — viewable with no session, so no role exists to gate on (the
  splash/login shape). No JWT read, **no role-conditional UI**.
- **`admin_only_data_entry` effect:** **N/A** — a read-only public contact document, not a data-entry surface.

## 8. States & edge cases

- **Only one state:** the fully-rendered static document. **No loading, empty, error, pending, or offline state** —
  nothing is fetched. No interaction beyond the `mailto:` links and the landing header/footer links.
- **Unauthenticated:** **allowed** — the public route renders with no redirect.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | `consumed_by = [web]` for this page spec; iOS surfaces support/contact natively (Settings → Support) and is audited at the iOS port. No cross-app divergence to resolve (web-only page spec). | legacy `support/page.tsx`; iOS `Features/Settings/` |
| **D-SCOPE** | **2nd of the two final public pages this run — and it CLOSES the web surface.** Ported alongside its cross-linked sibling [`privacy-policy`](../privacy-policy/SPEC.md); it is the **34th & final** web page — the **last** route in the legacy tree, so with it the **entire web surface is complete** (route-tree diff vs legacy shows zero remaining pages, modulo the net-new `forgot-password`/`reset-password`). User decision: "Both pages, one run (closes web)." | route-tree diff vs `rasifiters-webapp/src/app/**`; [COVERAGE.md](../../../../COVERAGE.md) |
| **D-DEPS** | **No new dependency** — ~~`PageShell`/`PageHeader`/`GlassCard` and `next/link` are **all already ported**~~ *(chrome superseded at 0.3.0 by landing D-LAND-13: `PublicPage`)*. The run-29/30 purest shape at its floor: the **smallest page in the rebuild** (38 legacy lines), no state, no storage, no `useAuthGuard` (public route). | `components/ui/`; legacy `support/page.tsx:1-6` |
| **D-S1** | **Faithful 1:1, no deviations.** The contact prose (email, "Please include" list) is ported **verbatim** (already fully `rf-*` tokenized — **no tokenize cleanup**), as is ~~`PageShell maxWidth="3xl"`, the header **Privacy Policy** `next/link` action,~~ *(superseded at 0.3.0 by landing D-LAND-13)* and the absence of any auth guard. No nav cleanup (static `<Link>`, no router), no form, no `useAuthGuard` analogue. | support/page.tsx |

## 10. Flagged characteristics (kept as-is)

- **F1 — public, no auth, no role read at all.** A pre-auth public route with no session check and no
  role-conditional UI — §7 is "same for everyone (incl. signed-out)." Faithful (the splash/login pre-auth shape).
- **F2 — hardcoded contact email + "include" list.** The support email `vinay.sankara@gmail.com` (`SUPPORT_EMAIL`
  in `components/landing/content.ts`) and the what-to-include list (`PLATFORM_DETAILS`, support/page.tsx:4-8) are
  hardcoded; the email here differs from the privacy
  policy's contact (`geethasankar78@gmail.com`) — both faithful to legacy. A config-sourced contact would be a
  rebuild feature, not a cleanup.
- **F3 — RESOLVED (0.2.0): the include-list is now split by platform.** Previously the single "Please include:"
  list asked for iOS version + device model even for web users (the page serves both the web `/support` route and,
  via `APIConfig.supportURL`, the iOS Settings → Support link). As of 0.2.0 the list is split into an **iOS app**
  group (App version · iOS version · Device model) and a **Web** group (Browser and version · Operating system),
  plus a shared "short description" line — a deliberate, applied content deviation from the faithful legacy port
  (one app, two surfaces). This closes the former content-review flag.

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.3.0 | 2026-10-13 | **Landing chrome (landing D-LAND-13):** renders through `PublicPage` (eyebrow "Help", H1) instead of `PageShell` + the 96px `BrandMark` + `PageHeader` + `GlassCard`; the header Privacy Policy link gives way to the footer's Privacy · Support. Same words, restyled: a `glass-card` contact card (email as a `mailto:` link + an **Email support** button) and a 3-card platform grid that stacks on phones. Now a server component. |
| 0.2.1 | 2026-10-13 | Phase 4 quick wins: the RaSi brand mark (`BrandMark` 96) centred above the `PageHeader` (#48). |
| 0.2.0 | 2026-07-01 | **Platform-aware support details** (one app, two surfaces): the page is shared by web (`/support`) and iOS (Settings → Support opens `APIConfig.supportURL` → `rasifiters.com/support`), but the "Please include:" list previously asked only for iOS version + device model. Split it into a labelled **iOS app** group (App version · iOS version · Device model) and a **Web** group (Browser and version · Operating system), plus a shared "short description of the issue" line, with a lead-in asking which platform the user is on. Uses the existing `GlassCard`/`text-rf-*` styling — no new component or dependency. **Resolves flagged F3.** **No iOS change** — iOS opens this same URL. `npm run build` ✓. |
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker` (run 47) — the **34th & FINAL web page spec**, the **2nd of the two final public legal/contact pages — it CLOSES the entire web surface**. The **PUBLIC Support / Contact** page — the **smallest page in the rebuild** (38 legacy lines): a static `GlassCard` with a contact email + a "what to include" list at a **pre-auth route** (NOT under the `middleware.ts` matcher → no auth guard, no edge bounce), with a header **Privacy Policy** link cross-linking the sibling. Decisions: **D-REF** (`consumed_by=[web]`; iOS Settings → Support mirrors it) · **D-SCOPE** (2nd of two final public pages this run — CLOSES the web surface) · **D-DEPS** (no new dependency — purest shape at its floor, no auth guard) · **D-S1** (faithful 1:1, no deviations; content verbatim, already tokenized). Flagged F1–F3 (public/no-role; hardcoded contact email differs from the policy's; iOS-oriented include-list on web). Consumes only foundation chrome + `next/link`; **no feature bump.** Ported `apps/web/src/app/support/page.tsx`. `npm run build` ✓ (1.52 kB, prerendered — the smallest page). |
