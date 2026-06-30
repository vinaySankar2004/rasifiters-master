# Page: `support` (web) — Public Support / Contact (public legal/contact pair — 2 of 2 — CLOSES the web surface)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.1.0 · **App:** `web` (Next.js App Router)
> **Route:** `/support` — the **PUBLIC** (pre-auth) Support / Contact page: a single static `GlassCard` with a
> contact email and a short "what to include" list, with a header **Privacy Policy** link to its cross-linked
> sibling [`privacy-policy`](../privacy-policy/SPEC.md). The **second & LAST of the two final public
> legal/contact pages — it CLOSES the entire web surface** (34th & final web page).
> **It is the SMALLEST page in the rebuild** (38-line legacy file): no data, no state, no API, no auth guard, no
> role logic — a contact card. It cross-links with `/privacy-policy` (each page's header links to the other).
> **Reference impl (legacy):** `../../../../../rasifiters-webapp/src/app/support/page.tsx`.
> **Consumes (features):** none beyond the foundation — `PageShell`/`PageHeader`/`GlassCard` + `next/link`. No
> feature SPEC is involved; the contact text is hardcoded page content. **No `useAuthGuard`** (public page).
> **Cross-app:** iOS surfaces support/contact natively (Settings → Support); parity audited at the iOS port.
> **Stance:** **faithful 1:1 port, no deviations.** Content kept verbatim; already fully `rf-*` tokenized.

---

## 1. What it is + who uses it

The **PUBLIC Support / Contact** page: a `PageShell maxWidth="3xl"` + `PageHeader` ("Support", a **Privacy Policy**
link action) over a single `GlassCard padding="lg"` with a contact line (`vinay.sankara@gmail.com`) and a
`list-disc` "Please include:" list (App version · iOS version · Device model · a short description of the issue).
Used by **anyone, signed-in or not** (a public, pre-auth route) to find how to contact support. It is **read-only**
— nothing on the page is interactive except the header **Privacy Policy** link.

## 2. Why it exists

To give users a **public** way to reach support (required for App-Store / web-store listings and for signed-out
users). It is a static contact document — there is **no server content, no API, and no per-user state** — so it
never touches the backend, and renders identically for everyone.

## 3. Route / location

- **App:** `web`. **Route:** `/support`. **PUBLIC** — **NOT** under the `middleware.ts` matcher (which only covers
  `/summary`, `/members`, `/lifestyle`, `/program`, `/programs` — `middleware.ts:6-13`), so a tokenless visitor is
  **not** bounced to `/login`. There is **no `useAuthGuard`** and **no role redirect** — reachable signed-out.
- **Reached via:** any direct link (App-Store listing, marketing footer) and the **Support** header link on the
  sibling [`privacy-policy`](../privacy-policy/SPEC.md) page.
- **Chrome:** `PageShell maxWidth="3xl"` + `PageHeader` (title "Support", **no subtitle**, `actions` = a
  `next/link` **Privacy Policy** link → `/privacy-policy`). **No `backHref`** (the public page has no in-app history
  to return to); **no bottom nav** (not a workspace tab).
- **Leaves to:** `/privacy-policy` via the header link; otherwise stays in place (no other navigation, no actions).

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Header | `PageHeader` "Support" (no subtitle) + a **Privacy Policy** `next/link` action → `/privacy-policy`. | [support/page.tsx:11-21](../../../../../rasifiters-webapp/src/app/support/page.tsx#L11) |
| Contact card | `GlassCard padding="lg"` (`space-y-6 text-sm text-rf-text-muted`): a "contact us at:" paragraph + the email `vinay.sankara@gmail.com` (`font-semibold text-rf-text`) + a "Please include:" line + a `list-disc` list (App version · iOS version · Device model · issue description). | [support/page.tsx:23-35](../../../../../rasifiters-webapp/src/app/support/page.tsx#L23) |

## 5. Components + consumed features

- **Shared UI:** `PageShell`, `PageHeader`, `GlassCard` + `next/link` `Link` — **all already ported** (no new
  dependency this run). No icons, no other primitives.
- **Hooks/state:** **none** — no `useAuthGuard`, no `useState`, no `useEffect`, no router. A pure static render.
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
  nothing is fetched. No interaction beyond the header **Privacy Policy** link.
- **Unauthenticated:** **allowed** — the public route renders with no redirect.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | `consumed_by = [web]` for this page spec; iOS surfaces support/contact natively (Settings → Support) and is audited at the iOS port. No cross-app divergence to resolve (web-only page spec). | legacy `support/page.tsx`; iOS `Features/Settings/` |
| **D-SCOPE** | **2nd of the two final public pages this run — and it CLOSES the web surface.** Ported alongside its cross-linked sibling [`privacy-policy`](../privacy-policy/SPEC.md); it is the **34th & final** web page — the **last** route in the legacy tree, so with it the **entire web surface is complete** (route-tree diff vs legacy shows zero remaining pages, modulo the net-new `forgot-password`/`reset-password`). User decision: "Both pages, one run (closes web)." | route-tree diff vs `../rasifiters-webapp/src/app/**`; [COVERAGE.md](../../../../COVERAGE.md) |
| **D-DEPS** | **No new dependency** — `PageShell`/`PageHeader`/`GlassCard` and `next/link` are **all already ported**. The run-29/30 purest shape at its floor: the **smallest page in the rebuild** (38 legacy lines), no state, no storage, no `useAuthGuard` (public route). | `components/ui/`; legacy `support/page.tsx:1-6` |
| **D-S1** | **Faithful 1:1, no deviations.** The contact prose (email, "Please include" list) is ported **verbatim** (already fully `rf-*` tokenized — **no tokenize cleanup**), as is `PageShell maxWidth="3xl"`, the header **Privacy Policy** `next/link` action, and the absence of any auth guard. No nav cleanup (static `<Link>`, no router), no form, no `useAuthGuard` analogue. | [support/page.tsx](../../../../../rasifiters-webapp/src/app/support/page.tsx) |

## 10. Flagged characteristics (kept as-is)

- **F1 — public, no auth, no role read at all.** A pre-auth public route with no session check and no
  role-conditional UI — §7 is "same for everyone (incl. signed-out)." Faithful (the splash/login pre-auth shape).
- **F2 — hardcoded contact email + "include" list.** The support email `vinay.sankara@gmail.com` and the
  what-to-include list are literal JSX (support/page.tsx:27, 30-33); the email here differs from the privacy
  policy's contact (`geethasankar78@gmail.com`) — both faithful to legacy. A config-sourced contact would be a
  rebuild feature, not a cleanup.
- **F3 — the "iOS version" / "Device model" prompts are iOS-oriented on the web page.** The "Please include:" list
  asks for iOS version + device model even on web (support/page.tsx:31-32) — faithful to the shared cross-surface
  contact copy; a content-review candidate, not a code cleanup (mirrors `privacy-policy` F1).

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker` (run 47) — the **34th & FINAL web page spec**, the **2nd of the two final public legal/contact pages — it CLOSES the entire web surface**. The **PUBLIC Support / Contact** page — the **smallest page in the rebuild** (38 legacy lines): a static `GlassCard` with a contact email + a "what to include" list at a **pre-auth route** (NOT under the `middleware.ts` matcher → no auth guard, no edge bounce), with a header **Privacy Policy** link cross-linking the sibling. Decisions: **D-REF** (`consumed_by=[web]`; iOS Settings → Support mirrors it) · **D-SCOPE** (2nd of two final public pages this run — CLOSES the web surface) · **D-DEPS** (no new dependency — purest shape at its floor, no auth guard) · **D-S1** (faithful 1:1, no deviations; content verbatim, already tokenized). Flagged F1–F3 (public/no-role; hardcoded contact email differs from the policy's; iOS-oriented include-list on web). Consumes only foundation chrome + `next/link`; **no feature bump.** Ported `apps/web/src/app/support/page.tsx`. `npm run build` ✓ (1.52 kB, prerendered — the smallest page). |
