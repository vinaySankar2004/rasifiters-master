# Page: `privacy-policy` (web) — Public Privacy Policy (public legal/contact pair — 1 of 2)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.3.1 · **App:** `web` (Next.js App Router)
> **Route:** `/privacy-policy` — the **PUBLIC** (pre-auth) Privacy Policy document: static policy prose (effective
> date, information-collected/used/shared, connected health data, retention, security, choices, children's privacy, contact)
> in the landing site's chrome (`PublicPage` — [landing D-LAND-13](../landing/SPEC.md)), whose footer cross-links
> its sibling [`support`](../support/SPEC.md).
> The **first of the two final public legal/contact pages** that **CLOSE the entire web surface** (33rd web page).
> **The one Privacy Policy copy (D-ONE, 2026-10-13):** every Privacy entry on every surface opens this pre-auth
> route (NOT under the `middleware.ts` matcher → no edge bounce, no auth guard); the retired in-app
> [`program/privacy`](../program/privacy/SPEC.md) 308-redirects here.
> **Provenance (legacy, archived):** `rasifiters-webapp/src/app/privacy-policy/page.tsx`.
> **Consumes (features):** none — the chrome is the landing's `PublicPage` (D-LAND-13). No
> feature SPEC is involved; the policy text is hardcoded page content. **No `useAuthGuard`** (public page).
> **Cross-app:** iOS and Android open this URL from every Privacy entry (D-ONE); it is the shared
> cross-surface legal document (it intentionally describes the iOS push/APNs behavior even on web — F1); parity
> audited at the iOS port.
> **Stance:** **faithful 1:1 port + deliberate content updates** (D-AH 2026-07-01: an Apple Health/HealthKit
> disclosure for App-Store/TestFlight review of the net-new iOS `apple-health` feature; D-NP1 2026-10-13). Content otherwise verbatim.

---

## 1. What it is + who uses it

The **PUBLIC Privacy Policy** page: `PublicPage` (eyebrow "Legal", H1 "Privacy Policy", subtitle
"Effective date: 2026-10-13") containing the full policy prose — sections for *Information we collect*, *How we use information*, *Connected health data*,
*Sharing of information*, *Data retention*, *Security*, *Your choices*, *Children's privacy*,
*Changes to this policy*, and *Contact us*
(`geethasankar78@gmail.com`). Used by **anyone, signed-in or not** (it is a public, pre-auth route) to read the
policy. It is **read-only** — nothing on the page is interactive beyond the landing header/footer links.

## 2. Why it exists

To present the app's privacy policy at a **public URL** reachable without an account (required for App-Store /
web-store listings and for users deciding whether to sign up) — and, since 2026-10-13, the only copy (D-ONE). It
is a static legal document — there is **no server content, no API, and no per-user state** — so it never touches
the backend or another member, and renders identically for everyone.

## 3. Route / location

- **App:** `web`. **Route:** `/privacy-policy`. **PUBLIC** — **NOT** under the `middleware.ts` matcher (which
  only covers `/summary`, `/members`, `/lifestyle`, `/program`, `/programs` — `middleware.ts:6-13`), so a
  tokenless visitor is **not** bounced to `/login`. There is **no `useAuthGuard`** and **no role redirect** — the
  page is reachable signed-out.
- **Reached via:** every Privacy entry (D-ONE) — iOS / Android (login, sign-up, account menus), web login /
  create-account, the web account menus (`program` + `programs`, a new tab), the landing footer, and the 308 from the
  retired `/program/privacy`.
- **Chrome:** `PublicPage` — the landing header + footer around one readable column; skips the app shell via
  `PUBLIC_PAGE_PATHS` ([landing D-LAND-13](../landing/SPEC.md)). **No back button** (the public page has no in-app
  history to return to); **no bottom nav** (not a workspace tab).
- **Leaves to:** the landing header/footer links (`/` sections, the auth CTA, Privacy · Support); no page-specific
  navigation or actions.

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Header | `PublicPage` header: eyebrow "Legal" + H1 "Privacy Policy" + subtitle "Effective date: 2026-10-13" (0.2.4), above a divider. | privacy-policy/page.tsx:5 |
| Policy body | The intro paragraph + the ten titled policy sections in `PublicPage`'s body column (`space-y-8`, 15px `text-rf-text-muted`) — no card. | privacy-policy/page.tsx:6-131 |
| Section | Each section: a `text-base font-semibold text-rf-text` heading + either a paragraph or a `list-disc` `<ul>` of points (collect / use / apple-health / share / retain / secure / choices / children / changes / contact). | privacy-policy/page.tsx:14-131 |

## 5. Components + consumed features

- **Shared UI:** `PublicPage` (landing chrome — D-LAND-13). No icons, no other primitives.
- **Hooks/state:** **none** — a server component; no `useAuthGuard`, no `useState`, no `useEffect`, no router. The page is a pure
  static render.
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
  state** — nothing is fetched, so nothing can fail. No interaction beyond the landing header/footer links.
- **Unauthenticated:** **allowed** — the public route renders the policy with no redirect. A signed-in user reaches it the same way (D-ONE).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | `consumed_by = [web]` for this page spec; iOS surfaces the same policy natively (Settings → Privacy Policy) and is audited at the iOS port. No cross-app divergence to resolve (web-only page spec); the shared policy text intentionally describes iOS push/APNs behavior on both surfaces (F1). | legacy `privacy-policy/page.tsx`; iOS `Features/Settings/` |
| **D-SCOPE** | **Both final public pages this run — and they CLOSE the web surface.** This run ports `/privacy-policy` **and** its cross-linked sibling [`support`](../support/SPEC.md); they are the **33rd & 34th** web pages and the **last two** routes in the legacy tree, so with them the **entire web surface is complete (the route-tree diff vs legacy shows zero remaining pages, modulo the net-new `forgot-password`/`reset-password`)**. User decision: "Both pages, one run (closes web)." | route-tree diff vs `rasifiters-webapp/src/app/**`; [COVERAGE.md](../../../../COVERAGE.md) |
| **D-DEPS** | **No new dependency** — ~~`PageShell`/`PageHeader`/`GlassCard` and `next/link` are **all already ported**~~ *(chrome superseded at 0.3.0 by landing D-LAND-13: `PublicPage`)*. The run-29/30 purest shape: a fully static page with no state and no storage; even purer than `program/privacy` — **no `useAuthGuard`** either (public route). | `components/ui/`; legacy `privacy-policy/page.tsx:1-6` |
| **D-S1** | **Faithful 1:1 to legacy** (the one intentional post-rebuild change is **D-AH**). The policy prose (all ten sections incl. the Apple Health section, the contact email) is otherwise **verbatim** (already fully `rf-*` tokenized in legacy — **no tokenize cleanup**), as is ~~`PageShell maxWidth="3xl"`, the header **Support** `next/link` action,~~ *(superseded at 0.3.0 by landing D-LAND-13)* and the absence of any auth guard. Unlike `program/privacy` there is **no `useAuthGuard` cleanup** to make (there's no auth guard on a public page — D-C1 there has no analogue here). | privacy-policy/page.tsx |
| **D-AH** | **Deliberate post-rebuild update (2026-07-01): add an *Apple Health* disclosure + bump the effective date to 2026-07-01.** The net-new iOS `apple-health` feature reads workouts + sleep from HealthKit; App-Store/TestFlight review requires the policy to disclose it (read-only, only for auto-logging, never sold/advertised/shared with third parties, user-revocable). Added as the 3rd section (after *How we use information*) plus an Apple-Health clause in the fitness collect-bullet, a new *How we use* bullet, and the *Sharing* no-sell line. Applied **identically** to the byte-identical [`program/privacy`](../program/privacy/SPEC.md) (D-DUP parity preserved). NOT a legacy port — a called-out change per CLAUDE.md; iOS needs no rebuild (it links to this URL). | privacy-policy/page.tsx:36, 48, 55-62, 82 |
| **D-DUP** | *(superseded at 0.3.1 by D-ONE)* ~~**Keep the policy body faithful — DUPLICATE, do NOT single-source.**~~ The policy body is byte-identical to the already-built [`program/privacy`](../program/privacy/SPEC.md), but the legacy keeps them as **two independent files** and the two routes are **conceptually distinct access tiers** (public legal URL vs in-app settings). Port `/privacy-policy` with its own verbatim copy; do **not** extract a shared `<PrivacyPolicyContent>` component (that would touch the already-committed `program/privacy` page + couple two access tiers a future divergence — different effective date, public-only clauses — would need to re-split). Matches run-30 "keep the shared legal doc verbatim, don't fork/couple." The web↔web duplication is flagged F2 (rebuild-cleanup candidate). User decision: "Keep faithful — duplicate, flag it." | privacy-policy/page.tsx:6-131; [program/privacy/page.tsx:20-147](../../../../../apps/web/src/app/program/privacy/page.tsx#L20) |
| **D-ONE** | **One policy copy, one URL (2026-10-13, user).** Every Privacy entry on every surface opens `/privacy-policy`: iOS + Android already did; the web account menus (`program`, `programs`) now open it in a new tab like Support (polish #41) instead of the in-app duplicate. `/program/privacy` is deleted and 308-redirects here (`next.config.mjs`). Why: the duplicate had to be edited identically on every policy change and was the only Privacy entry that differed across surfaces. | `program/page.tsx`, `programs/page.tsx`, `next.config.mjs`; user (2026-10-13) |
| **D-NP1** | **Deliberate content update (2026-10-13; Phase 4 — NP-U6 + people D-C12 / U-1 (b)), identical on both policy pages (D-DUP).** Effective date → 2026-10-13. *Information we collect:* the device / browser **time zone**, sent automatically so reminders and the weekly summary arrive at local time. *How we use information:* notifications now name "kudos from other members"; the daily reminder and weekly summary are sent **only if turned on**, and announcements from the RaSi Fiters team show in the Inbox. *Connected health data:* synced workouts are program activity — co-members can see them (with streaks and active days) unless Hide my activity is on; sleep and steps are never shown to co-members. *Sharing:* first item — what other members of your programs can see (name, username, gender, program role, join dates, workouts, workout stats, kudos received) unless Hide my activity; staff always see activity; sleep / diet / steps only to you, program staff and RaSi Fiters administrators; email never. *Your choices:* Hide my activity (My Profile). The People text ships now, ahead of `PEOPLE_LIVE`. | NP amendments NP-U6 (web A19); S1 plan "Privacy, consent and store disclosures" §A. |

## 10. Flagged characteristics (kept as-is)

- **F1 — the policy describes iOS-only behavior (Apple Health, push/APNs) on the shared web surface.** The
  cross-surface document references Apple Health (HealthKit) reads and collecting an APNs device token / Apple's
  Push Notification service, but the web client uses SSE (no APNs, no device token) and never touches Apple Health.
  **As of 0.2.1 these are now explicitly scoped in-copy** — the intro flags that Apple Health and push notifications
  are iOS-app-only, the *Apple Health* section is titled "Apple Health (iOS app only)" with a lead sentence stating
  the web app does not read from it, and the collect/use bullets say "iOS app". The push/APNs bullets keep their
  "(iOS)" labels. Still one shared legal document (not forked per surface); the in-copy scoping is the professional
  clarification, not a fork.
- **F2 — ~~web↔web policy-body duplication with `program/privacy`~~** — resolved at 0.3.1 (D-ONE: one copy).
- **F3 — hardcoded effective date + contact email.** The effective date `2026-10-13` and contact
  `geethasankar78@gmail.com` are literal strings in the JSX (privacy-policy/page.tsx:5, 130); updating the policy
  means editing the page. Faithful; a CMS/config-sourced policy would be a rebuild feature, not a cleanup.
- **F4 — public, no auth, no role read at all.** A pre-auth public
  route with no session check and no role-conditional UI — §7 is "same for everyone (incl. signed-out)." Faithful.

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.3.1 | 2026-10-13 | **D-ONE — the only policy copy:** the web account menus open this page in a new tab (as iOS / Android and Support do); the in-app `program/privacy` duplicate is retired and 308-redirects here. D-DUP superseded, F2 resolved. |
| 0.3.0 | 2026-10-13 | **Landing chrome (landing D-LAND-13):** renders through `PublicPage` (landing header + footer, eyebrow "Legal", H1, subtitle, one readable column) instead of `PageShell` + the 96px `BrandMark` + `PageHeader` + `GlassCard`; the header Support link gives way to the footer's Privacy · Support. Policy text unchanged (still identical to `program/privacy`, D-DUP); now a server component. |
| 0.2.4 | 2026-10-13 | **D-NP1 — Phase 4 policy text** (`b2ea09b`, live): effective date 2026-10-13; time zone collected; kudos in notifications; opt-in reminder + weekly summary and Inbox announcements; synced workouts visible to co-members unless Hide my activity (sleep / steps never); what co-members can see; Hide my activity under Your choices. Mirrors the sibling policy page (D-DUP). |
| 0.2.3 | 2026-10-13 | Phase 4 quick wins: the RaSi brand mark (`BrandMark` 96) centred above the `PageHeader` (#48). |
| 0.2.2 | 2026-07-10 | **Audience clause → adults 18+.** Replaced the *Children's privacy* clause "not intended for children under 4" with an adults-18-and-over-intended statement (not directed to children; no knowing collection from under-18s; contact-to-delete), aligning with the Google Play **"18 and over"** target audience set during the first Android release. Bumped **effective date → 2026-07-10**. Applied **identically** to the in-app [`program/privacy`](../program/privacy/SPEC.md) (D-DUP parity). **No iOS/Android change** — both open this URL (`APIConfig.privacyPolicyURL` / `AppLinks.privacyPolicyUri`), no embedded copy; the iOS App Store 4+ *content* rating is a separate concept, unchanged. Committed `d724d8a`, deployed to prod + verified live. |
| 0.2.1 | 2026-07-01 | **Platform-scope clarification** (one app, two surfaces): scoped the iOS-only *Apple Health* feature explicitly in-copy so web users aren't told it applies to them. Titled the section "Apple Health (iOS app only)" + added a lead sentence ("the web app does not connect to or read from Apple Health"), split the fitness collect-bullet so the Apple Health clause is its own "(iOS app only)" bullet, added "in the iOS app" to the *How we use* auto-log bullet, and added an intro sentence noting platform-specific features (Apple Health, push) are called out where they apply. No change to what data is collected/used — a clarification, not a new data practice; **effective date unchanged (2026-07-01)**. Applied **identically** to the byte-identical [`program/privacy`](../program/privacy/SPEC.md) (D-DUP parity). Updated **F1**. **No iOS change** — the app links to this URL. `npm run build` ✓. |
| 0.2.0 | 2026-07-01 | **Deliberate content update (D-AH)** ahead of iOS TestFlight/App-Store submission: added an **Apple Health** section disclosing the net-new iOS `apple-health` HealthKit read (workouts + sleep — read-only, used only for auto-logging, never sold/advertised/shared with third parties, user-revocable), an Apple-Health clause in the fitness collect-bullet, a *How we use* auto-log bullet, and the *Sharing* no-sell line; bumped the **effective date → 2026-07-01**; light clarity polish. Applied **identically** to the byte-identical [`program/privacy`](../program/privacy/SPEC.md) (D-DUP parity). **No iOS change** — the app links to this URL, so updating the page updates the in-app policy. `npm run build` ✓. |
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker` (run 47) — the **33rd web page spec**, the **1st of the two final public legal/contact pages** (paired with [`support`](../support/SPEC.md), which CLOSES the web surface). The **PUBLIC Privacy Policy** document — a fully static `GlassCard` of policy prose at a **pre-auth route** (NOT under the `middleware.ts` matcher → no auth guard, no edge bounce), with a header **Support** link. The **public twin of [`program/privacy`](../program/privacy/SPEC.md)** (byte-identical body) but a distinct access tier. Even purer than the run-30 `program/privacy`: **no `useAuthGuard`** (public). Decisions: **D-REF** (`consumed_by=[web]`; iOS Settings → Privacy Policy mirrors the same shared policy) · **D-SCOPE** (both final public pages this run — CLOSES the web surface) · **D-DEPS** (no new dependency — purest shape, no auth guard) · **D-S1** (faithful 1:1, no deviations; content verbatim, already tokenized; no `useAuthGuard` cleanup analogue) · **D-DUP** (keep the policy body duplicated, do NOT single-source — distinct access tiers; user decision). Flagged F1–F4 (shared iOS-push text on web; web↔web body duplication; hardcoded date/email; public/no-role). Consumes only foundation chrome + `next/link`; **no feature bump.** Ported `apps/web/src/app/privacy-policy/page.tsx`. `npm run build` ✓ (2.81 kB, prerendered). |
