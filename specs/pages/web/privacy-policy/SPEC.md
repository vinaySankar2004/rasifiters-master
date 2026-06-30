# Page: `privacy-policy` (web) — Public Privacy Policy (public legal/contact pair — 1 of 2)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.1.0 · **App:** `web` (Next.js App Router)
> **Route:** `/privacy-policy` — the **PUBLIC** (pre-auth) Privacy Policy document: a single static `GlassCard` of
> policy prose (effective date, information-collected/used/shared, retention, security, choices, children's
> privacy, contact), with a header **Support** link to its cross-linked sibling [`support`](../support/SPEC.md).
> The **first of the two final public legal/contact pages** that **CLOSE the entire web surface** (33rd web page).
> **It is the PUBLIC twin of the already-built [`program/privacy`](../program/privacy/SPEC.md)** — the policy body
> is **byte-identical** — but lives at a **pre-auth route** (NOT under the `middleware.ts` matcher → no edge
> bounce, no auth guard) and swaps the in-app Back button for a header **Support** link. The two are conceptually
> **distinct access tiers** that merely share text today: a public legal URL (App-Store / marketing reachable
> while signed-out) vs the in-app settings copy.
> **Reference impl (legacy):** `../../../../../rasifiters-webapp/src/app/privacy-policy/page.tsx`.
> **Consumes (features):** none beyond the foundation — `PageShell`/`PageHeader`/`GlassCard` + `next/link`. No
> feature SPEC is involved; the policy text is hardcoded page content. **No `useAuthGuard`** (public page).
> **Cross-app:** the same policy is surfaced natively on iOS (Settings → Privacy Policy) and is the shared
> cross-surface legal document (it intentionally describes the iOS push/APNs behavior even on web — F1); parity
> audited at the iOS port.
> **Stance:** **faithful 1:1 port, no deviations.** Content kept verbatim; the web↔web policy-body duplication
> with `program/privacy` is **kept faithful (NOT single-sourced)** per the user decision and flagged §10.

---

## 1. What it is + who uses it

The **PUBLIC Privacy Policy** page: a `PageShell maxWidth="3xl"` + `PageHeader` ("Privacy Policy", subtitle
"Effective date: 2026-03-02", a **Support** link action) over a single `GlassCard padding="lg"` containing the
full policy prose — sections for *Information we collect*, *How we use information*, *Sharing of information*,
*Data retention*, *Security*, *Your choices*, *Children's privacy*, *Changes to this policy*, and *Contact us*
(`geethasankar78@gmail.com`). Used by **anyone, signed-in or not** (it is a public, pre-auth route) to read the
policy. It is **read-only** — nothing on the page is interactive except the header **Support** link.

## 2. Why it exists

To present the app's privacy policy at a **public URL** reachable without an account (required for App-Store /
web-store listings and for users deciding whether to sign up). The in-app copy lives at
[`program/privacy`](../program/privacy/SPEC.md) (behind auth); this is the same document at a pre-auth route. It
is a static legal document — there is **no server content, no API, and no per-user state** — so it never touches
the backend or another member, and renders identically for everyone.

## 3. Route / location

- **App:** `web`. **Route:** `/privacy-policy`. **PUBLIC** — **NOT** under the `middleware.ts` matcher (which
  only covers `/summary`, `/members`, `/lifestyle`, `/program`, `/programs` — `middleware.ts:6-13`), so a
  tokenless visitor is **not** bounced to `/login`. There is **no `useAuthGuard`** and **no role redirect** — the
  page is reachable signed-out.
- **Reached via:** any direct link (App-Store listing, marketing footer) and the **Privacy Policy** header link on
  the sibling [`support`](../support/SPEC.md) page.
- **Chrome:** `PageShell maxWidth="3xl"` (a text document) + `PageHeader` (title "Privacy Policy", subtitle
  "Effective date: 2026-03-02", `actions` = a `next/link` **Support** link → `/support`). **No `backHref`** (the
  public page has no in-app history to return to); **no bottom nav** (not a workspace tab).
- **Leaves to:** `/support` via the header link; otherwise stays in place (no other navigation, no actions).

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Header | `PageHeader` "Privacy Policy" + "Effective date: 2026-03-02" subtitle + a **Support** `next/link` action → `/support`. | [privacy-policy/page.tsx:11-22](../../../../../rasifiters-webapp/src/app/privacy-policy/page.tsx#L11) |
| Policy card | `GlassCard padding="lg"` (`space-y-6 text-sm text-rf-text-muted`) wrapping the intro paragraph + the nine titled policy sections. | [privacy-policy/page.tsx:24-127](../../../../../rasifiters-webapp/src/app/privacy-policy/page.tsx#L24) |
| Section | Each section: a `text-base font-semibold text-rf-text` heading + either a paragraph or a `list-disc` `<ul>` of points (collect / use / share / retain / secure / choices / children / changes / contact). | [privacy-policy/page.tsx:31-126](../../../../../rasifiters-webapp/src/app/privacy-policy/page.tsx#L31) |

## 5. Components + consumed features

- **Shared UI:** `PageShell`, `PageHeader`, `GlassCard` + `next/link` `Link` — **all already ported** (no new
  dependency this run). No icons, no other primitives.
- **Hooks/state:** **none** — no `useAuthGuard`, no `useState`, no `useEffect`, no router. The page is a pure
  static render (purer than `program/privacy`, which at least calls `useAuthGuard` for its redirect + back-href).
- **Consumed features:** **none.** The policy text is hardcoded JSX; there is no feature SPEC, no `lib/*` data
  module, and no network dependency.

## 6. Data / API

- **No API, no backend, no network call, and no client storage at all.** The page renders hardcoded prose; it
  reads nothing and writes nothing. There is not even a `useAuthGuard` session check (public route).
- **No backend work, no feature bump** — there is no endpoint to confirm; the content is static page markup. The
  sweep ports **only the page**.

## 7. Role-based view rules

| Role | Access | Notes |
|------|--------|-------|
| **(signed-out / pre-auth)** | Reads the policy. | **Public route** — no session required. |
| **global_admin · program admin · logger · member** | Reads the policy. | No role gate — identical static document for everyone. |

- **Role rules = N/A (pre-auth).** This is a **public page** — it may be viewed with no session at all, so no role
  exists to gate on (the splash/login shape, runs 15–16). The page reads no JWT and has **no role-conditional UI**
  (the ABSENCE of role logic is the finding).
- **`admin_only_data_entry` effect:** **N/A** — the policy is a read-only public document, not a workout/health
  data-entry surface; the toggle (set on `/program/edit`) gates the log forms on the workspace tabs, not this page.

## 8. States & edge cases

- **Only one state:** the fully-rendered static document. There is **no loading, empty, error, pending, or offline
  state** — nothing is fetched, so nothing can fail. No interaction beyond the header **Support** link.
- **Unauthenticated:** **allowed** — the public route renders the policy with no redirect (the genuine difference
  from `program/privacy`, which gates the same copy behind auth — F2 there). A signed-in user may also reach it.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | `consumed_by = [web]` for this page spec; iOS surfaces the same policy natively (Settings → Privacy Policy) and is audited at the iOS port. No cross-app divergence to resolve (web-only page spec); the shared policy text intentionally describes iOS push/APNs behavior on both surfaces (F1). | legacy `privacy-policy/page.tsx`; iOS `Features/Settings/` |
| **D-SCOPE** | **Both final public pages this run — and they CLOSE the web surface.** This run ports `/privacy-policy` **and** its cross-linked sibling [`support`](../support/SPEC.md); they are the **33rd & 34th** web pages and the **last two** routes in the legacy tree, so with them the **entire web surface is complete (the route-tree diff vs legacy shows zero remaining pages, modulo the net-new `forgot-password`/`reset-password`)**. User decision: "Both pages, one run (closes web)." | route-tree diff vs `../rasifiters-webapp/src/app/**`; [COVERAGE.md](../../../../COVERAGE.md) |
| **D-DEPS** | **No new dependency** — `PageShell`/`PageHeader`/`GlassCard` and `next/link` are **all already ported**. The run-29/30 purest shape: a fully static page with no state and no storage; even purer than `program/privacy` — **no `useAuthGuard`** either (public route). | `components/ui/`; legacy `privacy-policy/page.tsx:1-6` |
| **D-S1** | **Faithful 1:1, no deviations.** The policy prose (effective date, all nine sections, the contact email) is ported **verbatim** (already fully `rf-*` tokenized in legacy — **no tokenize cleanup**), as is `PageShell maxWidth="3xl"`, the header **Support** `next/link` action, and the absence of any auth guard. Unlike `program/privacy` there is **no `useAuthGuard` cleanup** to make (there's no auth guard on a public page — D-C1 there has no analogue here). | [privacy-policy/page.tsx](../../../../../rasifiters-webapp/src/app/privacy-policy/page.tsx) |
| **D-DUP** | **Keep the policy body faithful — DUPLICATE, do NOT single-source.** The `<GlassCard>` policy body is byte-identical to the already-built [`program/privacy`](../program/privacy/SPEC.md), but the legacy keeps them as **two independent files** and the two routes are **conceptually distinct access tiers** (public legal URL vs in-app settings). Port `/privacy-policy` with its own verbatim copy; do **not** extract a shared `<PrivacyPolicyContent>` component (that would touch the already-committed `program/privacy` page + couple two access tiers a future divergence — different effective date, public-only clauses — would need to re-split). Matches run-30 "keep the shared legal doc verbatim, don't fork/couple." The web↔web duplication is flagged F2 (rebuild-cleanup candidate). User decision: "Keep faithful — duplicate, flag it." | [privacy-policy/page.tsx:24-127](../../../../../rasifiters-webapp/src/app/privacy-policy/page.tsx#L24); [program/privacy/page.tsx:20-123](../../../../../apps/web/src/app/program/privacy/page.tsx#L20) |

## 10. Flagged characteristics (kept as-is)

- **F1 — the policy describes iOS push/APNs behavior even on the web surface.** The shared cross-surface document
  references collecting an APNs device token and Apple's Push Notification service (privacy-policy/page.tsx:39, 50,
  62-65), but the web client uses SSE, not APNs, and registers no device token. Faithful — it is one shared legal
  document across both surfaces; trimming web-irrelevant clauses would fork the policy. Kept verbatim;
  content-review candidate, not a code cleanup.
- **F2 — web↔web policy-body duplication with `program/privacy`.** The `<GlassCard>` body is byte-identical to the
  in-app [`program/privacy`](../program/privacy/SPEC.md) page, kept as a separate verbatim copy (D-DUP) rather than
  a shared `<PrivacyPolicyContent>` component. Faithful to legacy (two independent files); single-sourcing is a
  rebuild-cleanup candidate but couples two distinct access tiers, so it is left as a flagged dup, not done.
- **F3 — hardcoded effective date + contact email.** The effective date `2026-03-02` and contact
  `geethasankar78@gmail.com` are literal strings in the JSX (privacy-policy/page.tsx:13, 125); updating the policy
  means editing the page. Faithful; a CMS/config-sourced policy would be a rebuild feature, not a cleanup.
- **F4 — public, no auth, no role read at all.** Unlike `program/privacy` (auth-gated), this is a pre-auth public
  route with no session check and no role-conditional UI — §7 is "same for everyone (incl. signed-out)." Faithful.

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker` (run 47) — the **33rd web page spec**, the **1st of the two final public legal/contact pages** (paired with [`support`](../support/SPEC.md), which CLOSES the web surface). The **PUBLIC Privacy Policy** document — a fully static `GlassCard` of policy prose at a **pre-auth route** (NOT under the `middleware.ts` matcher → no auth guard, no edge bounce), with a header **Support** link. The **public twin of [`program/privacy`](../program/privacy/SPEC.md)** (byte-identical body) but a distinct access tier. Even purer than the run-30 `program/privacy`: **no `useAuthGuard`** (public). Decisions: **D-REF** (`consumed_by=[web]`; iOS Settings → Privacy Policy mirrors the same shared policy) · **D-SCOPE** (both final public pages this run — CLOSES the web surface) · **D-DEPS** (no new dependency — purest shape, no auth guard) · **D-S1** (faithful 1:1, no deviations; content verbatim, already tokenized; no `useAuthGuard` cleanup analogue) · **D-DUP** (keep the policy body duplicated, do NOT single-source — distinct access tiers; user decision). Flagged F1–F4 (shared iOS-push text on web; web↔web body duplication; hardcoded date/email; public/no-role). Consumes only foundation chrome + `next/link`; **no feature bump.** Ported `apps/web/src/app/privacy-policy/page.tsx`. `npm run build` ✓ (2.81 kB, prerendered). |
