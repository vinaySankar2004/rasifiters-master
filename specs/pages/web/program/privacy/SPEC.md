# Page: `program/privacy` (web) — Privacy Policy (program-settings sub-route 6 of 6 — LAST)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.2.2 · **App:** `web` (Next.js App Router)
> **Route:** `/program/privacy` — the **Privacy Policy** document: a single static `GlassCard` of policy prose
> (effective date, information-collected/used/shared, Apple Health, retention, security, choices, children's privacy, contact),
> the **sixth and LAST** of the deferred `/program/*` settings sub-routes (reached from the
> [`program`](../SPEC.md) hub's account menu).
> **Despite living under `/program/*` it is NOT a program-admin setting** like
> [`edit`](../edit/SPEC.md)/[`roles`](../roles/SPEC.md) — it is a read-only legal document available to **every**
> role (no admin redirect). It is the **purest page in the rebuild: fully static content with no state, no
> `localStorage`, no API, no backend, and no new dependency** — purer even than the run-29 `appearance` picker
> (which at least writes `localStorage`). With this page the **entire `/program/*` sub-route group (6 of 6) is
> complete.**
> **Provenance (legacy, archived):** `rasifiters-webapp/src/app/program/privacy/page.tsx`.
> **Consumes (features):** none beyond the foundation — `PageShell`/`PageHeader`/`GlassCard` + `useAuthGuard`.
> No feature SPEC is involved; the policy text is hardcoded page content.
> **Cross-app:** the same policy is surfaced natively on iOS (Settings → Privacy Policy) and is the shared
> cross-surface legal document (it intentionally describes the iOS push/APNs behavior even on web — F1); parity
> audited at the iOS port.
> **Stance:** faithful 1:1 port **+ one small cleanup** (D-C1 reuse `useAuthGuard`) **+ one deliberate
> 2026-07-01 content update** (D-AH: Apple Health/HealthKit disclosure for App-Store review). Content
> otherwise verbatim; cross-surface oddities flagged §10.

---

## 1. What it is + who uses it

The **Privacy Policy** page for the signed-in member: a `PageShell` + `PageHeader` ("Privacy Policy", subtitle
"Effective date: 2026-07-01") over a single `GlassCard padding="lg"` containing the full policy prose — sections
for *Information we collect*, *How we use information*, *Apple Health*, *Sharing of information*, *Data retention*,
*Security*, *Your choices*, *Children's privacy*, *Changes to this policy*, and *Contact us* (`geethasankar78@gmail.com`).
Used by **any authenticated user** to read the policy; there is **no admin gate and no role redirect** — the only
guard is `!session?.token → /login` (now via `useAuthGuard`, D-C1). It is **read-only** — nothing on the page is
interactive except the header Back button.

## 2. Why it exists

To present the app's privacy policy to members in-app (required for app-store compliance and surfaced behind the
hub's account-menu "Privacy Policy" row). It is a static legal document — there is **no server content, no API,
and no per-user state** — so it never touches the backend or another member, and renders identically for everyone.

## 3. Route / location

- **App:** `web`. **Route:** `/program/privacy`. **Protected** — under the `middleware.ts` matcher (unauth edge
  request → `/login`). `useAuthGuard({ requireProgram: false })` — **no active program required** (you can read
  the policy with no program selected); there is **no role redirect** (every role may read it).
- **Reached via:** the [`program`](../SPEC.md) hub's account menu (`router.push("/program/privacy")`).
- **Chrome:** `PageShell maxWidth="3xl"` (wider than `appearance`'s `2xl` — it's a text document) + `PageHeader`
  (title "Privacy Policy", subtitle "Effective date: 2026-07-01", `backHref = program?.id ? "/program" :
  "/programs"` — back to the hub if a program is active, else the programs list). No bottom nav (sub-route, not a
  workspace tab).
- **Leaves to:** `/program` or `/programs` on Back; otherwise stays in place (no other navigation, no actions).

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Header | `PageHeader` "Privacy Policy" + "Effective date: 2026-07-01" subtitle + Back → `/program` or `/programs`. | privacy/page.tsx:14-18 |
| Policy card | `GlassCard padding="lg"` (`space-y-6 text-sm text-rf-text-muted`) wrapping the intro paragraph + the ten titled policy sections. | privacy/page.tsx:20-134 |
| Section | Each section: a `text-base font-semibold text-rf-text` heading + either a paragraph or a `list-disc` `<ul>` of points (collect / use / apple-health / share / retain / secure / choices / children / changes / contact). | privacy/page.tsx:27-133 |

## 5. Components + consumed features

- **Shared UI:** `PageShell`, `PageHeader`, `GlassCard` — **all already ported** (no new dependency this run). No
  icons, no other primitives.
- **Hooks/state:** `useAuthGuard({ requireProgram: false })` (provides `program` for the back-href + the
  login-redirect). **No `useState`, no `useEffect`, no other hook** — the page is a pure static render.
- **Consumed features:** **none.** The policy text is hardcoded JSX; there is no feature SPEC, no `lib/*` data
  module, and no network dependency. `useAuthGuard` is the foundation auth hook.

## 6. Data / API

- **No API, no backend, no network call, and no client storage at all.** The page renders hardcoded prose; it
  reads nothing and writes nothing (not even `localStorage`, unlike `appearance`). The only "state" is
  `useAuthGuard`'s session check for the redirect + `program` for the back-href.
- **No backend work, no feature bump** — there is no endpoint to confirm; the content is static page markup. The
  sweep ports **only the page**.

## 7. Role-based view rules

| Role | Access | Notes |
|------|--------|-------|
| **global_admin** | Reads the policy. | No role gate — identical static document for everyone. |
| **program admin** | Reads the policy. | — |
| **logger** | Reads the policy. | — |
| **member** | Reads the policy. | — |

- **No admin redirect** — unlike `edit`/`roles`, every role lands here and reads the same document; the page never
  reads a JWT-decoded role and has **no role-conditional UI** (the ABSENCE of role logic is the finding — same as
  `appearance` F3 / `password`).
- **`admin_only_data_entry` effect:** **N/A** — the policy is a read-only document, not a workout/health
  data-entry surface; the toggle (set on `/program/edit`) gates the log forms on the workspace tabs, not this page.

## 8. States & edge cases

- **Only one state:** the fully-rendered static document. There is **no loading, empty, error, pending, or offline
  state** — nothing is fetched, so nothing can fail. No interaction beyond the header Back button.
- **Unauthenticated:** the `useAuthGuard` redirect (and the edge `middleware.ts`) send a tokenless visitor to
  `/login` (the policy is behind auth, faithful — F2; legacy also gated it, though a public `/privacy-policy`
  route exists separately for the pre-auth path).
- **No active program:** allowed — `requireProgram: false`; Back then targets `/programs`.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | `consumed_by = [web]` for this page spec; iOS surfaces the same policy natively (Settings → Privacy Policy) and is audited at the iOS port. No cross-app divergence to resolve (web-only page spec); the shared policy text intentionally describes iOS push/APNs behavior on both surfaces (F1). | legacy `program/privacy/page.tsx`; iOS `Features/Settings/` |
| **D-SCOPE** | **This page only — and it CLOSES the group.** Port `/program/privacy` faithful 1:1; it is the **6th & last** `/program/*` sub-route, so with it the entire `/program/*` sub-route layer is complete. | per-page cadence; [`program` SPEC §3](../SPEC.md) |
| **D-DEPS** | **No new dependency** — `PageShell`/`PageHeader`/`GlassCard` and `useAuthGuard` are **all already ported**. The run-29 purest shape, here even purer: a fully static page with no state and no storage, not even a chrome leaf to drag in. | `components/ui/`; [use-auth-guard.ts](../../../../../../apps/web/src/lib/hooks/use-auth-guard.ts) |
| **D-S1** | **Faithful 1:1** to legacy otherwise (the one intentional post-rebuild change is **D-AH**) — the policy prose (all ten sections incl. the Apple Health section, the contact email) is otherwise **verbatim** (already fully `rf-*` tokenized in legacy — **no tokenize cleanup needed**), as is `PageShell maxWidth="3xl"` and `backHref = program?.id ? "/program" : "/programs"`. Content otherwise exactly as legacy (user decision: "keep all content verbatim"). | privacy/page.tsx |
| **D-AH** | **Deliberate post-rebuild update (2026-07-01): add an *Apple Health* disclosure + bump the effective date to 2026-07-01.** The net-new iOS `apple-health` feature reads workouts + sleep from HealthKit; App-Store/TestFlight review requires the policy to disclose it (read-only, only for auto-logging, never sold/advertised/shared with third parties, user-revocable). Added as the 3rd section (after *How we use information*) plus an Apple-Health clause in the fitness collect-bullet, a new *How we use* bullet, and the *Sharing* no-sell line. Applied **identically** to the byte-identical public [`privacy-policy`](../../privacy-policy/SPEC.md) (duplication parity preserved). NOT a legacy port — a called-out change per CLAUDE.md; iOS needs no rebuild (it links to this policy URL). | privacy/page.tsx:32, 44, 52-58, 78 |
| **D-C1** | **Reuse `useAuthGuard({ requireProgram: false })`** instead of the inline `useAuth` + `useActiveProgram` + manual `useEffect(() => !session?.token && router.push("/login"))` redirect — matches siblings [`profile`](../profile/SPEC.md)/[`password`](../password/SPEC.md)/[`appearance`](../appearance/SPEC.md) exactly; the hook subsumes the redirect AND returns `program` for the back-href, deleting the `useRouter`/`useAuth`/`useActiveProgram`/`useEffect` imports. Legacy predated the foundation hook. | privacy/page.tsx:11-21; [use-auth-guard.ts](../../../../../../apps/web/src/lib/hooks/use-auth-guard.ts) |

## 10. Flagged characteristics (kept as-is)

- **F1 — the policy describes iOS-only behavior (Apple Health, push/APNs) on the shared web surface.** The
  cross-surface document references Apple Health (HealthKit) reads and collecting an APNs device token / Apple's
  Push Notification service, but the web client uses SSE (no APNs, no device token) and never touches Apple Health.
  **As of 0.2.1 these are now explicitly scoped in-copy** — the intro flags that Apple Health and push notifications
  are iOS-app-only, the *Apple Health* section is titled "Apple Health (iOS app only)" with a lead sentence stating
  the web app does not read from it, and the collect/use bullets say "iOS app". Still one shared legal document (not
  forked per surface); the in-copy scoping is the professional clarification, not a fork.
- **F2 — the policy is gated behind auth.** `/program/privacy` requires a session (redirects to `/login`),
  unlike a typical always-public privacy page; a separate public `/privacy-policy` route exists for the pre-auth
  path. Faithful — legacy also placed this copy behind auth under `/program/*`.
- **F3 — hardcoded effective date + contact email.** The effective date `2026-07-01` and contact
  `geethasankar78@gmail.com` are literal strings in the JSX (privacy/page.tsx:16, 132); updating the policy means
  editing the page. Faithful; a CMS/config-sourced policy would be a rebuild feature, not a cleanup.
- **F4 — no role is read at all.** Like `appearance`/`password`, this page has no role-conditional UI — the
  ABSENCE of role logic is the finding; §7 is "same for everyone." Faithful.

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.2 | 2026-07-10 | **Audience clause → adults 18+.** Replaced the *Children's privacy* clause "not intended for children under 4" with an adults-18-and-over-intended statement (not directed to children; no knowing collection from under-18s; contact-to-delete), aligning with the Google Play **"18 and over"** target audience set during the first Android release. Bumped **effective date → 2026-07-10**. Applied **identically** to the byte-identical public [`privacy-policy`](../../privacy-policy/SPEC.md) (D-DUP parity). **No iOS/Android change** — the apps open the public URL; no embedded copy. Committed `d724d8a`, deployed + verified live. |
| 0.2.1 | 2026-07-01 | **Platform-scope clarification** (one app, two surfaces): scoped the iOS-only *Apple Health* feature explicitly in-copy so web users aren't told it applies to them. Titled the section "Apple Health (iOS app only)" + added a lead sentence ("the web app does not connect to or read from Apple Health"), split the fitness collect-bullet so the Apple Health clause is its own "(iOS app only)" bullet, added "in the iOS app" to the *How we use* auto-log bullet, and added an intro sentence noting platform-specific features (Apple Health, push) are called out where they apply. No change to what data is collected/used; **effective date unchanged (2026-07-01)**. Applied **identically** to the byte-identical public [`privacy-policy`](../../privacy-policy/SPEC.md) (D-DUP parity). Updated **F1**. **No iOS change** — the app links to this URL. `npm run build` ✓. |
| 0.2.0 | 2026-07-01 | **Deliberate content update (D-AH)** ahead of iOS TestFlight/App-Store submission: added an **Apple Health** section disclosing the net-new iOS `apple-health` HealthKit read (workouts + sleep — read-only, used only for auto-logging, never sold/advertised/shared with third parties, user-revocable), an Apple-Health clause in the fitness collect-bullet, a *How we use* auto-log bullet, and the *Sharing* no-sell line; bumped the **effective date → 2026-07-01**; light clarity polish. Applied **identically** to the byte-identical public [`privacy-policy`](../../privacy-policy/SPEC.md). **No iOS change** — the app links to this policy URL. `npm run build` ✓. |
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker` (run 30) — the **sixteenth web page spec**, the **sixth & LAST of the deferred `/program/*` settings sub-routes** (the `/program/*` group is now complete). The **Privacy Policy** document — a fully static `GlassCard` of policy prose; **not** a program-admin setting (no admin redirect; available to every role; no role-conditional UI at all). The **purest page in the rebuild: static content with no state, no `localStorage`, no API, no backend, and no new dependency** (purer even than the run-29 `appearance` picker). Decisions: **D-REF** (`consumed_by=[web]`; iOS Settings → Privacy Policy mirrors the same shared policy later) · **D-SCOPE** (this page only — CLOSES the 6-of-6 `/program/*` group) · **D-DEPS** (no new dependency — purest shape) · **D-S1** (faithful 1:1; content verbatim, already fully tokenized, no tokenize cleanup) · **D-C1** (reuse `useAuthGuard({ requireProgram: false })` over the inline redirect). Flagged F1–F4 (shared iOS-push text on web; auth-gated policy; hardcoded date/email; no role read at all). Consumes only foundation chrome + `useAuthGuard`; **no feature bump.** Ported `apps/web/src/app/program/privacy/page.tsx`. `npm run build` ✓. |
