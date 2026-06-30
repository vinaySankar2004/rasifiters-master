# PROGRESS.md — Current State & Next Action

> **Read this FIRST every session.** It is the single source of truth for *where we are* and *what's
> next*. The cross-session loop: start → read this → work → at session end, update this file + commit
> (via `git-version`). Next session the user says **"continue"** and you resume from here.
>
> Keep it current: update **Current phase**, tick the **Build sequence**, and append a **Session log**
> entry each time. Durable decisions go in `METHODOLOGY.md` (decision log); legacy-coverage tracking in
> `COVERAGE.md`; this file is the live state + next-step pointer.

## Current phase

**Phase 1 — Provisioning + migration: DONE.** Scaffolding done. **Supabase provisioned** (2026-06-28): org
`RaSi Fiters` (`lxehyprifvuozciizlem`), project `rasifiters` ref **`kpadxjekpiwfkqcxtrio`**, `us-east-1`,
ACTIVE_HEALTHY; `.mcp.json` repointed. **Schema applied + data/auth MIGRATED to Supabase** (2026-06-28): all
13 tables reconcile with legacy (members 48 … notification_recipients 1304), **48/48 members created in
`auth.users` (bcrypt hashes imported, no resets) and linked via `auth_user_id`**, admin on
`admin@no-email.rasifiters.com`. Migration is idempotent (re-run = 48 skips, 0 dupes).

**Phase 2 — backend `auth`: DEPLOYED + VERIFIED LIVE (2026-06-28).** Render web service `rasifiters-api`
(`srv-d90tgmv7f7vs73cudptg`) at `https://rasifiters-api.onrender.com` via Blueprint
`apps/backend/render.yaml` (host = **Render, not Railway** — METHODOLOGY R7). Full auth round-trip green
against migrated data (admin): login→200 (bcrypt password verified, ES256 JWT), guarded route via JWKS
verify + `auth_user_id` mapping→200, garbage token→401, refresh→200, logout→200. Fixed a migration gap
en route (placeholder members had no `member_emails` row → `002` migration + migrator patch). Vercel still
deferred (no web code yet).

**Phase 3 — `web`: ALL PAGES PORTED (2026-06-29).** **The entire web surface is COMPLETE — 34/34 legacy pages
ported + 2 net-new auth-recovery pages (`forgot-password`/`reset-password`) = 36 web page SPECs, all
`npm run build` ✓.** Every legacy route in `../rasifiters-webapp/src/app/**` now has a 1:1 rebuilt page (route-tree
diff is clean). The four workspace-tab groups are done (`/summary` 6/6, `/members` 8/8, `/lifestyle` 2/2,
`/program/*` 6/6) and the **public group is now complete** (`splash`/`login`/`forgot-password`/`reset-password`/
`create-account`/`privacy-policy`/`support`). Remaining web work is the cross-cutting polish line (COVERAGE line 36:
the INERT middleware ES256 fix, the `NotificationsGate` stub) — not pages. **Next surface: `ios` (SwiftUI) — see
COVERAGE `## ios`.** Foundation history below.

**Phase 3 — `web`: STARTED (2026-06-29).** **Foundation scaffold ported + builds green** (`apps/web`,
`npm run build` ✓ — Next.js 14 App Router, TS strict, Tailwind `rf-*` tokens, React Query + Auth + Theme
providers, edge middleware). Ported the shared page-independent infra directly (not via `question-asker` —
that loop is for pages): all `src/lib/*` (config, api/client+auth, auth session/jwt/provider, theme,
storage, permissions, format, hooks), `globals.css`, layout/providers/shell chrome, the icon library,
brand assets. Deviations (all migration-justified, logged in `apps/web/CONTEXT.md` §Foundation port): host
Netlify→Vercel (dropped `@netlify/plugin-nextjs`+`netlify.toml`, pkg renamed `rasifiters-web`); prod API
default → our Render service; **`NotificationsGate` = deferred stub** (returns null until the web
notifications feature lands — backend deferred-stub pattern). Next: the public/auth pages via
`question-asker`.

> NOTE (the `src/middleware.ts` ES256 concern is RESOLVED): the foundation scaffold's edge middleware was
> initially a faithful HS256 port (incompatible with Supabase's ES256 tokens — would have redirect-looped
> every real session). This was **fixed in run 20** (the `programs` hub, the first protected route): per
> D-C1 the middleware now **decodes + checks `exp` only** (no signature verify at the edge — the Express
> backend JWKS-verifies every API call and owns all authz), which is ES256-safe. See `middleware.ts:56-80`.
> Live + correct; not an open question.

> NOTE: the user reset the Supabase DB password on 2026-06-28 — the value in the earlier scratchpad secrets
> file is STALE; the live one is in the user's password manager + `tools/migrator/.env` (gitignored).

## Next action

> ### ⏭️ ON "continue" → PORT THE WEB `notifications` FEATURE (user decision, 2026-06-29)
> The web surface's **pages** are 100% done, but the webapp is **NOT feature-complete**: the
> [`NotificationsGate`](apps/web/src/components/NotificationsGate.tsx) is still a `return null` **deferred stub** —
> the web `notifications` client was never ported. **The user's chosen order is: (1) THIS session = port web
> notifications, then (2) the session after = deploy to Vercel (NO domain switch — staging-ready cutover).** So do
> NOT start iOS yet; the run-47 entry below saying "NEXT SURFACE = ios" is superseded by this banner.
>
> **Scope of the notifications session (client-only — backend is fully live):** the backend `notifications` feature
> is ported + deployed (SSE stream on Supabase JWKS, device register/unregister, broadcast, acknowledge — COVERAGE
> line 22, live on `rasifiters-api.onrender.com`). Port the **web client**: the notifications client lib (the
> `EventSource`/SSE client + `acknowledge` calls — not yet in `apps/web/src/lib/`) + **replace the `NotificationsGate`
> stub** with the faithful port (open the SSE stream → hydrate the active program → render the notification
> modal/bell). The `programs` client deps it leans on are already ported. Run it through `question-asker` → port →
> `git-version`; it adds `web` to the notifications feature's `consumed_by` (a **MINOR bump** on that feature — NOT a
> no-bump page run). Legacy ref: `../rasifiters-webapp/src/components/NotificationsGate.tsx` + its SSE/notifications
> lib. After it lands, the webapp is genuinely feature-complete and ready to deploy.
>
> **Then (next session): deploy to Vercel WITHOUT switching the domain** — the `deploy` skill provisions the Vercel
> project + deploys to a Vercel-generated URL (e.g. `rasifiters-web.vercel.app`), wires env (API → the live Render
> backend, Supabase keys), applies the scope guardrails; the production/custom domain is left UNPOINTED so the app is
> testable + transferable at any point with no rebuild.

> **On "continue": Phase 3 `web` is COMPLETE — THE ENTIRE WEB SURFACE IS PORTED. NEXT SURFACE = `ios`.** The final
> two web pages — the **public legal/contact pair `privacy-policy` + `support` (33rd & 34th web pages, run 47) —
> are DONE** (2026-06-29) and **CLOSE the web surface**. Both are faithful 1:1 ports of the legacy public (pre-auth)
> static pages: **`/privacy-policy`** (a `PageShell maxWidth="3xl"` + `PageHeader` "Privacy Policy" / "Effective date:
> 2026-03-02" / a header **Support** `next/link` action, over one `GlassCard` of policy prose) and **`/support`** (the
> **smallest page in the rebuild**, 38 legacy lines — `PageHeader` "Support" / a header **Privacy Policy** link, over
> one `GlassCard` with the contact email `vinay.sankara@gmail.com` + a "what to include" list). The two **cross-link**
> (each header links to the other). **KEY: both are genuinely PUBLIC — NOT under the `middleware.ts` matcher**
> (`middleware.ts:6-13` covers only `/summary`/`/members`/`/lifestyle`/`/program`/`/programs`), so a tokenless visitor
> is **not** bounced to `/login`; there is **no `useAuthGuard`** at all → **role rules N/A (pre-auth)** (the splash/login
> shape, runs 15–16). **`/privacy-policy` is the PUBLIC TWIN of the already-built `program/privacy`** (byte-identical
> policy body) but a **distinct access tier** (public legal URL vs in-app settings copy) — they are NOT the same page.
> **D-SCOPE** = both pages this run (cross-linked pair, both trivial) and they **CLOSE the web surface** (route-tree diff
> vs legacy is now clean). **D-DEPS = NO new dependency** — `PageShell`/`PageHeader`/`GlassCard` + `next/link` all
> already ported; **even purer than `program/privacy`** (run 30) — no `useAuthGuard` either (public). **Stance = FAITHFUL
> 1:1, NO deviations** (D-S1): content verbatim, already fully `rf-*` tokenized → **no tokenize cleanup**; static
> `<Link>`s, no router → **no nav cleanup**; no forms; **no `useAuthGuard` cleanup analogue** (there is no auth guard on
> a public page — `program/privacy`'s D-C1 has no counterpart here). **THE ONE GENUINELY-OPEN DECISION — D-DUP: keep the
> `/privacy-policy` policy body DUPLICATED, do NOT single-source it.** The body is byte-identical to `program/privacy`,
> but the legacy keeps them as two independent files and the routes are conceptually distinct access tiers; the user chose
> **keep faithful + flag** (F2) over extracting a shared `<PrivacyPolicyContent>` (which would touch the already-committed
> `program/privacy` + couple two access tiers a future divergence would re-split) — matches run-30 "keep the shared legal
> doc verbatim, don't fork/couple". **Zero backend work, NO feature bump** — no endpoint, no `lib/*` module; the sweep
> ported only the two page files. `consumed_by=[web]` (iOS surfaces both natively — Settings → Privacy Policy / Support).
> Flagged: privacy-policy F1 (shared iOS-push/APNs text on the web surface) / F2 (web↔web body dup, kept) / F3 (hardcoded
> date + email) / F4 (public/no-role); support F1 (public/no-role) / F2 (contact email `vinay.sankara@gmail.com` differs
> from the policy's `geethasankar78@gmail.com`, both faithful) / F3 (iOS-oriented "include" list on web). `npm run build`
> ✓ (38 static pages: `/privacy-policy` **2.81 kB**, `/support` **1.52 kB** — the smallest page). **Committed via
> `git-version` next; lessons run 47 appended.** **NEXT = the `web` surface is DONE — start the `ios` (SwiftUI) surface
> (COVERAGE `## ios`: auth splash/login/create-account first), OR the cross-cutting web polish (COVERAGE line 36 — the
> INERT middleware ES256 fix + the `NotificationsGate` stub).**

> **On "continue": Phase 3 `web` in progress — the `/members` SUB-ROUTE GROUP IS NOW COMPLETE (8 of 8).** The
> **`members/health` page (32nd web page, 8th & LAST of the 8 deferred `/members` sub-routes — the per-member daily-health
> log manager behind the `/members` landing's "View Health" card — CLOSES the group) is DONE** (2026-06-29): a faithful 1:1
> port of the legacy ≈550-line **per-member daily-health manager**, the **near-exact WRITE twin of `members/workouts` (run
> 45)** — a `PageShell` (`maxWidth="4xl"`) + `PageHeader` ("View Health" / the member `name` / `backHref="/members"` / an
> **Export CSV** action) wrapping a controls `GlassCard` (sort field + direction `Select`s, a **Filter** button + active-filter
> summary), the list states (`LoadingState`/`EmptyState`/the row list — one `GlassCard` per `MemberHealthItem` with `Sleep
> {sleepLabel}` · date · `Diet {dietLabel}`, plus per-row **Edit**/**Delete**), a **Filter `Modal`** (start/end date, min/max
> **sleep** hr+min, min/max **diet** `Select` 1–5, Clear-all), an **Edit `Modal`** (sleep time hr+min + diet `Select`; date
> disabled; **0:00–24:00 + at-least-one-metric** validation), and a delete **`ConfirmDialog`**. **THE 2nd & last WRITE
> SUB-ROUTE in the `/members` group** — over `fetchMemberHealthLogs` (`GET /daily-health-logs`) for the list and the two
> mutations `updateDailyHealthLog` (`PUT /daily-health-logs`) + `deleteDailyHealthLog` (`DELETE /daily-health-logs`), both
> gated by `requireDataEntryAllowed`. **KEY ROLE FINDING — `admin_only_data_entry` is LIVE here** (the read-vs-write-lock
> axis, runs 31/36/40/45): this page WRITES, so `canEdit = !isDataEntryLocked(session, program) && (canViewAny || memberId
> === loggedInUserId)` (`page.tsx:60`) — a single `canEdit` flag gates **both** Edit + Delete (the workouts twin split
> `canDelete = canEdit`, same effect); the lock hides both buttons for any locked non-admin; the backend
> `requireDataEntryAllowed` (`routes/logs.js:113, 124`) is the real boundary. **Same `canViewAny` per-member redirect**
> (`page.tsx:79-84`) — staff view any member, a plain member only their own (else `router.push("/members")`). **F2 (the
> run-40/43/45 MIRROR): the client redirect is STRICTER than the backend read path** — `GET /daily-health-logs` is
> `authenticateToken`-only at the route + `ensureProgramAccess` + target-enrolled in the service, not which member a
> non-staff requester may read. **D-SCOPE** = this page only — **8th-of-8, and it CLOSES the group** (COVERAGE `/members`
> now COMPLETE 8/8). **D-DEPS = NO new dependency** — every import already ported across TWO families' modules:
> `fetchMemberHealthLogs`/`MemberHealthItem` (`lib/api/members.ts:168, 64`, run 22), `deleteDailyHealthLog`/
> `updateDailyHealthLog` (`lib/api/logs.ts:83, 66`, run 21), `sleepLabel`/`dietLabel`/`downloadCsv` (`lib/format.ts:38, 43,
> 60` — **already shared**, NOT page-local), `isDataEntryLocked` (`lib/permissions.ts:21`), + all chrome incl.
> `ConfirmDialog`/`Modal`/`Select`/`EmptyState`; sized per-FUNCTION (the import path is the source of truth, run 39/40/41/45).
> The sweep ports only the page file. **Stance = faithful + 2 user-picked cleanups: D-C1** `window.confirm`→`ConfirmDialog`
> (a `deleteTarget` state + the ported danger dialog, mirroring the workouts twin run 45 / `lifestyle/workouts` run 31);
> **D-C2** tokenize the Delete button `bg-red-50 text-red-600` → `bg-rf-danger/10 text-rf-danger` (run 45/39). **NO hoist
> cleanup** (unlike workouts' D-C2 — `sleepLabel`/`dietLabel` are already shared in `lib/format.ts`, not page-local; the
> page-local `formatSleepHoursForFilter`/`splitSleepHours` are health-specific with no shared equivalent). Faithful otherwise
> (D-S1 — same `force-dynamic` + `useClientSearchParams`, same `useAuthGuard()` + redirect, same React Query key + `enabled`
> gate, same sort/filter/export markup + mutation payloads incl. **always-send `member_id`** (no workouts `member_name`
> quirk) + nullable `sleep_hours`/`food_quality`, the rich sleep validation). **Zero backend work, NO feature bump** — all
> three routes already mounted (`server.js:74`) + every api fn ported. `consumed_by=[web]` (iOS manages per-member health
> natively). Flagged F1–F7 (`limit:0`→1000 coercion; client redirect stricter than backend read; always-send `member_id`
> delta from the twin; NO lazy filter query — workouts F4 subtracted, no type vocabulary; NO list-query error state — only
> mutation errors surface; Edit edits sleep+diet with at-least-one-metric guard, date disabled; rich page-local sleep
> parsing). `npm run build` ✓ (`/members/health` prerendered, **5.64 kB** — largest members sub-route, the dual-modal +
> ConfirmDialog write path, just above `workouts`' 5.2 kB). **Committed via `git-version` next; lessons run 46 appended.**
> **NEXT = the `/members` group is COMPLETE (8/8) — the SUB-ROUTE layer continues with the remaining deferred groups (see
> COVERAGE.md for the next hub).**

> **On "continue": Phase 3 `web` in progress — the `/members` SUB-ROUTE GROUP IS ADVANCING (7 of 8).** The
> **`members/workouts` page (31st web page, 7th of the 8 deferred `/members` sub-routes — the per-member workout-log
> manager behind the `/members` landing's Recent Workouts card) is DONE** (2026-06-29): a faithful 1:1 port of the legacy
> ≈470-line **per-member workout manager** — a `PageShell` (`maxWidth="4xl"`) + `PageHeader` ("View Workouts" / the member
> `name` / `backHref="/members"` / an **Export CSV** action) wrapping a controls `GlassCard` (sort field + direction
> `Select`s, a **Filter** button + active-filter summary), the list states (`LoadingState`/`EmptyState`/the row list —
> one `GlassCard` per `MemberRecentItem` with type · date · `formatDuration`, plus per-row **Edit**/**Delete**), a
> **Filter `Modal`** (start/end date, searchable workout-type `Select`, min/max duration hr+min, Clear-all), an **Edit
> `Modal`** (duration-only, type+date disabled), and a delete **`ConfirmDialog`**. **THE ONLY WRITE SUB-ROUTE in the
> `/members` group** — over `fetchMemberRecentWorkouts` (`GET /member-recent`) for the list, `fetchProgramWorkouts`
> (`GET /program-workouts`, LAZY — `enabled` only when the filter modal opens, F4) for the type options, and the two
> mutations `updateWorkoutLog` (`PUT /workout-logs`) + `deleteWorkoutLog` (`DELETE /workout-logs`), both gated by
> `requireDataEntryAllowed`. **KEY ROLE FINDING — `admin_only_data_entry` is LIVE here (the read-vs-write-lock axis,
> runs 31/36/40):** unlike the four read-only sub-routes (list/metrics/history/streaks, where the lock is N/A), this page
> WRITES, so `canDelete = canEdit = !isDataEntryLocked(session, program) && (isGlobalAdmin || admin || logger ||
> memberId === loggedInUserId)` (`page.tsx:46-53`) — the lock hides both action buttons for any locked non-admin; the
> backend `requireDataEntryAllowed` (`routes/logs.js:64, 75`) is the real boundary. **Same `canViewAny` per-member
> redirect** (`page.tsx:70-75`) — staff view any member, a plain member only their own (else `router.push("/members")`).
> **F2 (the run-40/43 MIRROR): the client redirect is STRICTER than the backend read path** — `getMemberRecent` only
> enforces `ensureProgramAccess` + target-enrolled, not which member a non-staff requester may read. **D-SCOPE** = this
> page only — **7th-of-8, does NOT close the group** (`health` remains 8/8). **D-DEPS = NO new dependency** — every
> import already ported across THREE families' modules: `fetchMemberRecentWorkouts`/`MemberRecentItem`
> (`lib/api/members.ts:52, 136`, run 22), `fetchProgramWorkouts` (`lib/api/program-workouts.ts`), `deleteWorkoutLog`/
> `updateWorkoutLog` (`lib/api/logs.ts:94, 105`, run 21), `formatDuration`/`escapeCsv`/`downloadCsv` (`lib/format.ts:48,
> 56, 60` — `formatDuration` hoisted run 22), `isDataEntryLocked` (`lib/permissions.ts:21`), + all chrome incl.
> `ConfirmDialog`/`Modal`/`Select`/`EmptyState`; sized per-FUNCTION (the import path is the source of truth, run 39/40/41).
> The sweep ports only the page file. **Stance = faithful + 3 user-picked cleanups: D-C1** `window.confirm`→`ConfirmDialog`
> (a `deleteTarget` state + the ported danger dialog, mirroring `lifestyle/workouts` run 31 — the rebuild replaced
> `window.confirm` everywhere); **D-C2** reuse the hoisted `formatDuration` from `lib/format.ts` (drop the byte-identical
> page-local copy, run 22 single-sourcing); **D-C3** tokenize the Delete button `bg-red-50 text-red-600` →
> `bg-rf-danger/10 text-rf-danger` (run 39). Faithful otherwise (D-S1 — same `force-dynamic` + `useClientSearchParams`,
> same `useAuthGuard()` + redirect, same React Query keys + `enabled` gates, same sort/filter/export markup + mutation
> payloads incl. the `member_name`-only-for-others quirk F3). **Zero backend work, NO feature bump** — all three routes
> already mounted (`server.js:72, 73, 80`) + every api fn ported. `consumed_by=[web]` (iOS manages per-member workouts
> natively). Flagged F1–F6 (`limit:0`→1000 coercion; client redirect stricter than backend read; `member_name` sent only
> when editing another's log; lazy `program-workouts` filter options; NO list-query error state — only mutation errors
> surface; Edit edits duration only). `npm run build` ✓ (`/members/workouts` prerendered, **5.2 kB** — largest members
> sub-route, the dual-modal + ConfirmDialog write path). **Committed via `git-version` next; lessons run 45 appended.**
> **NEXT = the `/members` group's FINAL sub-route: `health` (1 of 8 remaining — closes the group).**
>
> **On "continue": Phase 3 `web` in progress — the `/members` SUB-ROUTE GROUP IS ADVANCING (5 of 8).** The
> **`members/history` page (29th web page, 5th of the 8 deferred `/members` sub-routes — the per-member Workout History
> timeline behind the `/members` landing's History card) is DONE** (2026-06-29): a faithful 1:1 port of the legacy
> 93-line **per-member history detail** — a `PageShell` + `PageHeader` ("Workout History" / the member `name` from the
> URL / `backHref="/members"`) wrapping a `PeriodSelector` (W/M/Y/P) over one `GlassCard` (Range label + Daily-avg
> header + a single-series workouts `BarChart`), over `fetchMemberHistory` (`GET /member-history`, target from URL
> `memberId`/`name`). **A near-twin of `summary/activity` (run 33 — same PeriodSelector + single-series workouts
> BarChart) but PER-MEMBER (URL `memberId`/`name`, like `lifestyle/timeline` run 32) AND it HAS a role-redirect** —
> the genuine delta from BOTH twins (run-32 `lifestyle/timeline` explicitly had NONE). **KEY ROLE FINDING:**
> `canViewAny = isGlobalAdmin || my_role==="admin" || my_role==="logger"` (`page.tsx:32-33`); a non-staff user whose
> URL `memberId` is **not their own** is `router.push("/members")`'d on mount (`:37-42`) — staff view any member, a
> plain member only their own. **F2 (the run-40 MIRROR): the client redirect is STRICTER than the backend** —
> `getMemberHistory` only enforces `ensureProgramAccess` (403 non-member) + target-enrolled (404), NOT which member a
> non-staff requester may view (`memberAnalyticsService.js:264-270`); any active member could fetch any enrolled
> member's history via the API directly, only the client UI restricts it. **F3 secure characteristic:** unlike the
> `/summary` analytics routes (F2 — `authenticateToken`-only), the service enforces per-program read authz — the
> route carries only `authenticateToken`, the gate lives in the service (run-42 F3, recurs). **Read-only → no write
> path → `admin_only_data_entry` N/A.** **D-SCOPE** = this page only — **5th-of-8, does NOT close the group**
> (`streaks`/`workouts`/`health` still deferred). **D-DEPS = NO new dependency** — `fetchMemberHistory`/
> `MemberHistoryPoint`/`MemberHistoryResponse` already live in `lib/api/members.ts:126` (ported "vestigial-here" with
> the `/members` landing run 22; byte-identical, lines 20–130 verified — its belated consumer; own-family per-function,
> run-41) + `PeriodSelector` ported verbatim with `lifestyle/timeline` (run 32) + every chrome leaf / chart-theme token
> already ported; the sweep ports nothing but the page file. **Stance = faithful + 1 user-picked cleanup: D-C1**
> **all-zero empty-state guard** — when `data.buckets` every `workouts === 0` (a member who logged nothing in the
> range; the backend always returns a FULL window of buckets so `buckets.length` is never 0) render "No workouts logged
> in this range." instead of flat zero bars — matches `summary/activity`'s empty-state (run-33 D-C2) but **keyed off the
> SUM, not `buckets.length`** (the run-34 predicate-vs-shape lesson — re-derived, came back needing the sum form).
> User chose faithful+guard over pure-faithful. **Twin cleanups SUBTRACTED (run-33):** `<Legend>`+series-names NOT
> applied (single counts series — nothing to disambiguate), dual-Y-axis NOT applied (single counts series → one natural
> axis); **NO tokenize cleanup** (already fully `rf-*`). Faithful otherwise (D-S1 — same `force-dynamic` +
> `useClientSearchParams`, same `useAuthGuard()` + `canViewAny` redirect, same React Query key
> `["members","history",programId,memberId,period]` + `enabled` gate, same `PeriodSelector` default `"week"`, same
> Range/Daily-avg header + `BarChart` markup). **Zero backend work, NO feature bump** — `GET /api/member-history`
> already mounted (`server.js:78`, `historyRouter.get("/", authenticateToken)`) + the api fn already ported.
> `consumed_by=[web]` (iOS surfaces member history natively). Flagged F1–F5 (server-driven window not client
> re-bucketing; client redirect stricter than backend; per-program read authz IS enforced — secure; `name` display-only
> defaults "Member"; no-`memberId` direct-nav is a degenerate no-op). `npm run build` ✓ (`/members/history` prerendered,
> **2.95 kB**; Recharts shared; Middleware 27.6 kB active). **Committed via `git-version` next; lessons run 43 appended
> (promoted: "a near-twin can differ from BOTH its twins by ONE structural feature — here a role-redirect neither
> `summary/activity` nor `lifestyle/timeline` had; recognize the twin, then ADD the one delta as a D-S1 line + F-row,
> the mirror of run-33's SUBTRACT").** **NEXT = the `/members` group continues: `streaks`/`workouts`/`health` (3 of 8
> remaining).**
>
> **On "continue": Phase 3 `web` in progress — the `/members` SUB-ROUTE GROUP IS ADVANCING (4 of 8).** The
> **`members/metrics` page (28th web page, 4th of the 8 deferred `/members` sub-routes — the program-wide Member
> Performance Metrics dashboard behind the `/members` landing's metrics card) is DONE** (2026-06-29): a faithful 1:1
> port of the legacy 430-line **metrics dashboard** — a `PageShell` + `PageHeader` ("Member Performance Metrics" /
> `${filtered} members` / `backHref="/members"` / an **Export CSV** action) wrapping a search/controls `GlassCard`
> (member-search input + Sort `Select` (9 fields) + Direction `Select` + Filters button), a grid of
> `MemberMetricsCard`s (avatar · name · active-days · a **sort-coupled hero metric** · a 6-cell mini-grid · an amber
> "Current streak Nd" flame badge), and a `Modal` filter sheet (date-range segmented control + 9 `FilterRange`
> min/max pairs), over `fetchMemberMetrics` (`GET /member-metrics`). **Read + client-side CSV export only — NO write
> path** → `admin_only_data_entry` **N/A**. **KEY ROLE FINDING: no page-level role gate at all** — `useAuthGuard()`
> default, no admin redirect, no role-conditional UI; every role that *reaches* it sees the same program-wide grid.
> **THE F2 ASYMMETRY IS INVERTED vs run-39:** the only link to `/members/metrics` is the landing's metrics card,
> gated `{isProgramAdmin && …}` (`members/page.tsx:281`) — yet the page + backend allow any **active member**, so the
> entry-link is **stricter** than the page/backend (run-39's `members/list` pill was *laxer* than the action). **F3
> secure characteristic:** unlike the `/summary` analytics routes (F2 — `authenticateToken`-only), the service
> `getMemberMetrics` enforces `ensureProgramAccess` → 403 for non-members (`memberAnalyticsService.js:74`); the route
> carries only `authenticateToken`, the gate lives in the service. **D-SCOPE** = this page only — **4th-of-8, does
> NOT close the group** (`history`/`streaks`/`workouts`/`health` still deferred). **D-DEPS = NO new dependency** —
> `fetchMemberMetrics`/`MemberMetrics`/`MemberMetricsResponse` already live in `lib/api/members.ts:102` (ported
> "vestigial-here" with the `/members` landing run 22; byte-identical, lines 1–130 verified) + every chrome leaf /
> icon (`FlameIcon`/`SearchIcon`) / format helper (`initials`/`escapeCsv`/`downloadCsv`) already ported; the sweep
> ports nothing but the page file. **Sized per-FUNCTION** — like run-41, the fn is in this page's **own** members
> family (cf. runs 39/40's cross-family draw from `programs.ts`); the import path is the source of truth. **Stance =
> faithful + 1 user-picked cleanup: D-C1** **full-tokenize** the amber flame badge — `bg-amber-200/70 text-amber-900`
> → `bg-rf-warning/20 text-rf-warning` (the lone non-`rf` color; `rf-warning` exists `#f59e0b`/`#fbbf24`). User chose
> FULL tokenize over keep-faithful (the run-27 amber-chip precedent) and over bg-only — so the flame badge is now
> theme-aware. Faithful otherwise (D-S1 — same `useAuthGuard()` default / React Query key
> `["members","metrics",programId,search,sort,direction,JSON.stringify(filterParams)]` + `enabled` gate /
> **server-driven** sort/filter/search (F1 — not client filtering) / `MemberMetricsCard` hero-metric switch /
> `MetricsFilterModal` + `FilterRange` markup / client-side `handleExport` CSV (F4)). **Zero backend work, NO feature
> bump** — `GET /api/member-metrics` already mounted (`server.js:77`, `metricsRouter.get("/", authenticateToken)`) +
> the api fn already ported. `consumed_by=[web]` (iOS surfaces member metrics natively). Flagged F1–F7 (server-driven
> sort/filter/search not client; entry-link stricter than page/backend; per-program read authz IS enforced — secure;
> client-side CSV export; sort-coupled hero metric; streak filters min-only; no `force-dynamic`/state-local).
> `npm run build` ✓ (`/members/metrics` prerendered, **7.9 kB** — largest members sub-route, the filter modal + 9
> ranges + CSV; no Recharts; Middleware 27.6 kB active). **Committed via `git-version` next; lessons run 42 appended
> (promoted: "the entry-path asymmetry can invert — an entry-link STRICTER than the page/backend, the mirror of
> run-39"; "the tokenize-cleanup spectrum's full-tokenize end is a legit user pick when an `rf-*` token exists, even
> where the run-27 amber-chip precedent kept faithful — the user owns the bg/ink trade-off").** **NEXT = the
> `/members` group continues: `history`/`streaks`/`workouts`/`health` (4 of 8 remaining).**
>
> **On "continue": Phase 3 `web` in progress — the `/members` SUB-ROUTE GROUP IS ADVANCING (3 of 8).** The
> **`members/invite` page (27th web page, 3rd of the 8 deferred `/members` sub-routes — the program-admin
> invite-by-username form behind the `/members` landing's "Invite Member" pill) is DONE** (2026-06-29): a faithful
> 1:1 port of the legacy 97-line **invite form** — a `PageShell` + `PageHeader` ("Invite Member" / "Enter the exact
> username to send a program invitation." / `backHref="/members"`) wrapping a `modal-surface` card with a
> `@`-prefixed username `<input>`, a **privacy info-banner**, error/success lines, and a "Send Invitation" button →
> `sendProgramInvite` (`POST /program-memberships/invite`, body `{program_id, username}`). **program-admin /
> global_admin-only** — every other role is `router.push("/members")`'d on mount; the landing's "Invite Member"
> pill is gated identically (`canInvite = isProgramAdmin`) → **entry path matches the redirect** (consistent,
> unlike run-39's `members/list` asymmetric pill). **D-SCOPE** = this page only — **3rd-of-8, does NOT close the
> group** (`metrics`/`history`/`streaks`/`workouts`/`health` still deferred). **D-DEPS = NO new dependency** —
> `sendProgramInvite` already lives in `lib/api/members.ts:204` (ported "vestigial-here" with the `/members`
> landing run 22; this page is its belated consumer) + all chrome (`PageShell`/`PageHeader`) already ported; the
> sweep ports nothing but the page file. **KEY: the run-39/40 cross-family-dep lesson is sized per-FUNCTION** —
> run-39 found a sub-route's *read* fn in a different family's module; here the fn is in this page's **own** members
> family. The import path is the source of truth either way. **`admin_only_data_entry` N/A** (inviting is
> role-gated, not workout/health logging — the lock gates the `/summary` log forms; run-31/40 read-vs-write-lock
> axis: the lock follows whether the page does *logging*). **Nav already deterministic** (stays on the page after a
> send, showing the success box in place; the only nav off the page is the `PageHeader` back link or the non-admin
> redirect) → **NO nav cleanup** (like run 40). **Stance = faithful + 2 user-picked cleanups: D-C1** tokenize the
> success box `bg-green-50 text-green-600` → `bg-rf-success/10 text-rf-success` (the lone untokenized color; the
> error line already uses `rf-danger` — matches `members/list` run-39 D-C1 / `members/detail` run-40 D-C2
> selective-tokenize), **D-C2** clear the stale `errorMessage` on field edit (the `onChange` cleared `showSuccess`
> but not `errorMessage` — legacy left a prior network error lingering; matches runs 27/28/40). Faithful otherwise
> (D-S1 — same `isProgramAdmin` gate + redirect, same `canSubmit`, same imperative `handleSend` with local state /
> no React Query, same privacy-safe catch). **THE LOAD-BEARING CHARACTERISTIC (F1, kept faithful):** the catch
> block surfaces an error **only** when the message contains "network"; **every other failure** (username not
> found / already invited / blocked / 403) is silently **rendered as "Invitation sent."** with the field cleared —
> deliberate privacy-safety (the page won't confirm whether a username exists; the info-banner says so). **Zero
> backend work, NO feature bump** — `POST /api/program-memberships/invite` already mounted (`server.js:69`,
> `authenticateToken`-only) + the program-admin/global_admin/self authz + the live `program.invite` notification
> emit live in `inviteService.sendInvite`. `consumed_by=[web]` (iOS invites natively). Flagged F1–F5
> (swallow-errors-as-success privacy intent; client redirect is the only client gate, backend 403 is the real
> boundary; no inline username validation/existence check by design; one-shot imperative call no React Query; stays
> on page after success → no nav cleanup). `npm run build` ✓ (`/members/invite` prerendered, **2.29 kB** — no
> Recharts; Middleware active). **Committed via `git-version` next; lessons run 41 appended (promoted: "the
> cross-family-dep lesson is sized per-FUNCTION not per-family — a page's own-family module is just as valid a
> source"; "a port's load-bearing characteristic can be a deliberate error-swallow for privacy — keep faithful,
> flag, never offer to 'fix'").** **NEXT = the `/members` group continues: `metrics`/`history`/`streaks`/`workouts`/
> `health` (5 of 8 remaining).**
>
> **On "continue": Phase 3 `web` in progress — the `/members` SUB-ROUTE GROUP IS ADVANCING (2 of 8).** The
> **`members/detail` page (26th web page, 2nd of the 8 deferred `/members` sub-routes — the editor `members/list`
> links to) is DONE** (2026-06-29): a faithful 1:1 port of the legacy 162-line **global_admin per-member editor** —
> a `PageShell` + `PageHeader` ("Member Details" / `backHref="/members/list"`) wrapping a `GlassCard` identity block
> (avatar · name · `@username` · a "Program Admin" line · gender / account-created) + two editable fields
> (**Joined Program** `<input type=date>` · **Active Membership** checkbox) saved via `updateMembership`
> (`PUT /program-memberships`, **`joined_at`+`is_active` ONLY** — not role/status), plus **Remove from program** →
> `removeMember` (`DELETE`); both success paths → `router.push("/members/list")`. **global_admin-only** — every other
> role is `router.push("/members")`'d on mount. **D-SCOPE** = this page only — **2nd-of-8, does NOT close the group**
> (`invite`/`metrics`/`history`/`streaks`/`workouts`/`health` still deferred); it RESOLVES the forward-nav target of
> `members/list`'s global_admin-only row click (run 39 F1). **KEY: this is the belated consumer of the WRITE fns** —
> `updateMembership`/`removeMembership` live in `lib/api/programs.ts` (ported with the `program` family runs 24/26,
> already used by `program/roles`), NOT the members landing's `lib/api/members.ts`; run 39 was the belated consumer
> of the *read* fn `fetchMembershipDetails` from the same module, this page of the *write* fns → **D-DEPS = NO new
> dependency** (every chrome leaf incl. `ConfirmDialog` already ported; the sweep ported nothing but the page file).
> **`admin_only_data_entry` N/A** (membership editing, not workout/health logging — the lock gates the `/summary` log
> forms, run 31/36 axis). **Nav already deterministic** (legacy uses `router.push("/members/list")`, not
> `router.back()`) → **NO nav cleanup** (unlike runs 36–38). **Stance = faithful + 3 user-picked cleanups: D-C1**
> `window.confirm("Remove … from the program?")` → the already-ported `ui/ConfirmDialog` (a `showRemoveConfirm` state
> + danger/loading dialog; no rebuilt page uses `window.confirm` — keeping it would be the lone divergence, runs
> 27/31), **D-C2** tokenize the Remove button's literal `bg-red-100 text-red-600` → `bg-rf-danger/10 text-rf-danger`
> (matches the sibling `members/list` "Inactive" badge run 39 D-C1 — the only untokenized color on the page),
> **D-C3** clear the stale `errorMessage` on field edit (both `onChange`s — legacy left it lingering until the next
> submit, runs 27/28). Faithful otherwise (D-S1 — same `["members","details",programId]` query + `enabled` gate,
> client-side `member.find(status==="active")`, `joinedAt`/`isActive` seeding, the global_admin redirect, the
> partial PUT payload). **Zero backend work, NO feature bump** — all three `/program-memberships` routes already
> mounted + `authenticateToken` (the PUT already consumed by `program/roles`). `consumed_by=[web]` (iOS edits
> memberships natively). Flagged F1–F7 (**client gate global_admin-only is STRICTER than the backend** — the service
> `updateMembership`/`removeMember` allow program admins too; no not-found empty state; shared query key with the
> list — React-Query dedupe; PUT sends only join-date+active; one shared `isSaving` flag for both buttons; client
> JWT-decode role drives the redirect only; no client throttle). `npm run build` ✓ (`/members/detail` prerendered,
> **3.26 kB** — no Recharts; Middleware active). **Committed via `git-version` next; lessons run 40 appended
> (promoted: "a sub-route's WRITE deps can already live in a different feature family's module — run 39 took the read
> fn, this run the write fns from the SAME `lib/api/programs.ts`; the import path is the source of truth").** **NEXT =
> the `/members` group continues: `invite`/`metrics`/`history`/`streaks`/`workouts`/`health` (6 of 8 remaining).**
>
> **On "continue": Phase 3 `web` in progress — the `/members` SUB-ROUTE GROUP HAS STARTED (1 of 8).** The
> **`members/list` page (25th web page, 1st of the 8 deferred `/members` sub-routes) is DONE** (2026-06-29): a faithful
> 1:1 port of the legacy 113-line **active-member roster** behind the `/members` landing's "View Members" pill — a
> `PageShell` + `PageHeader` ("Members" / program name / `backHref="/members"`) wrapping a search `GlassCard` + a grid
> of `MemberRow` cards (avatar · name · `★` admin star · `@username` · an "Inactive" badge), over `fetchMembershipDetails`
> (`GET /program-memberships/details`), client-filtered to `status==="active"` + a client-side name search. **D-SCOPE** =
> this page only — **1st-of-8, does NOT close the group** (`detail`/`invite`/`metrics`/`history`/`streaks`/`workouts`/
> `health` still deferred). **KEY DEP FINDING: the core api dep came from a DIFFERENT feature family's already-ported
> module** — `fetchMembershipDetails`/`MembershipDetail` live in `lib/api/programs.ts` (ported with the `program` landing
> run 24 / `program/roles` run 26, already consumed by 2 live pages), **not** in the members landing's `lib/api/members.ts`
> (run 22) — so **D-DEPS = NO new dependency** held even though the *members landing never touched this fn* (every chrome
> leaf + `initials` also already ported; the sweep ported nothing but the page file). **Role logic fully code-answered:**
> `useAuthGuard()` default, **no admin redirect** — every role sees the same roster; only `isGlobalAdmin` makes rows
> clickable → the deferred `/members/detail?memberId=…` editor (forward-nav F4); read-only for all other roles.
> **Read-only → `admin_only_data_entry` N/A.** **Stance = faithful + 1 user-picked cleanup: D-C1** tokenize the "Inactive"
> badge's literal `bg-red-100 text-red-600` → theme-aware `bg-rf-danger/10 text-rf-danger` (the only untokenized color;
> avatar/star/text all already `rf-*` → the run-27/28 selective-tokenize with exactly one site). Faithful otherwise
> (D-S1 — same query key `["members","details",programId]`, `enabled` gate, `status==="active"` filter, client name
> search, the `MemberRow` markup). **Zero backend work, NO feature bump** — `GET /program-memberships/details` already
> mounted + `authenticateToken` (already consumed by the `program` landing + `program/roles`). `consumed_by=[web]` (iOS
> roster native). Flagged F1–F5 (global_admin-only clickability + **entry-path asymmetry** — the pill shows for
> `!canViewAs` loggers/members yet only global_admin can act on a row; `status` membership vs `is_active` account; client
> filter/search; forward-nav to deferred `/members/detail`; client JWT-decode role drives display-only clickability).
> `npm run build` ✓ (`/members/list` prerendered, **2.37 kB** — no Recharts; Middleware 27.5 kB active). **Committed via
> `git-version` next; lessons run 39 appended (promoted: "a sub-route's CORE dependency can live in a DIFFERENT feature
> family's already-ported module — grep the legacy file's actual import paths before sizing deps").** **NEXT = the
> `/members` group continues: `detail` (the global_admin per-member editor this list links to), then `invite`/`metrics`/
> `history`/`streaks`/`workouts`/`health` (7 of 8 remaining).**
>
> **On "continue": Phase 3 `web` in progress — the `/summary` SUB-ROUTE GROUP IS NOW COMPLETE (6 of 6).** The
> **`summary/bulk-log-workout` page (24th web page, 6th & LAST of the 6 deferred `/summary` sub-routes — the 3rd & final
> mobile log fallback) is DONE** (2026-06-29): a **near-exact twin of the just-built `summary/log-workout`/`log-health`
> (runs 36/37)** — a faithful 1:1 port of the legacy 68-line standalone Bulk-log-workouts page: a `PageShell` +
> `PageHeader` ("Bulk log workouts" / "Add multiple sessions at once." / `backHref="/summary"`) wrapping the
> **already-built `BulkLogWorkoutForm` in its `variant="page"` branch** (a ≤200-row table on desktop / stacked cards on
> mobile — per-row member `Select` · workout-type `Select` · date · hours+minutes duration → `POST /workout-logs/batch`).
> **The desktop modal counterpart already lives on the `/summary` landing (run 21); the landing routes mobile → this page
> (`summary/page.tsx:211`).** **This is the 3rd & LAST `/summary` sub-route where `admin_only_data_entry` is LIVE** (after
> `log-workout`, `log-health`). **KEY DELTA from the two single-log twins — a TWO-WAY mount redirect** (`page.tsx:25-32`,
> both `router.replace`): (1) locked non-admin → `/summary`; (2) else a plain member (`!canLogForAny`) →
> **`/summary/log-workout`** — **bulk logging is admin/logger-only**, so a member is bounced to the single-log page (the
> backend batch service `logService.js:191-192` is the real 403: "You do not have permission to bulk-log workouts.").
> **D-SCOPE** = this page only — **6th-of-6, the 3rd & final log fallback, and it CLOSES the `/summary` group** (all 3
> chart drill-downs + all 3 log fallbacks now done). **D-DEPS = NO new dependency** (the whole `BulkLogWorkoutForm` incl.
> its `variant="page"` branch, `addWorkoutLogsBatch`/`BulkWorkoutEntry`/`BulkRowError`, `ApiError.details` rowErrors
> transport, `PageShell`/`PageHeader`, `useAuthGuard`, `isDataEntryLocked`, both lookup fns all landed with the summary
> landing run 21 + the `/program/*` chrome; the sweep ported nothing but the page file). **Like `log-workout`, needs BOTH
> the member AND workout-type lookups** (unlike `log-health`'s member-only). **Stance = faithful + 1 user-picked cleanup:
> D-C1** deterministic-nav (match runs 36/37) — swap the 2 legacy `router.back()` calls (post-save success **and** the form
> `onClose`) for `router.push("/summary")`; **both** lock/role `router.replace` redirects unchanged (faithful). **"Reuse
> `refreshSummaryQueries`" re-confirmed REJECTED** (module-private one-liner, not importable). Faithful otherwise (D-S1 —
> incl. the two-way redirect + the per-row `ApiError.details → BulkRowError[]` plumbing; already fully `rf-*` tokenized →
> NO tokenize cleanup). **Zero backend work, NO feature bump** — `POST /api/workout-logs/batch` already mounted + gated
> (`routes/logs.js:49`, `authenticateToken` + `requireDataEntryAllowed`). `consumed_by=[web]` (iOS native log screen).
> Flagged F1–F8 (two-way redirect/member-bounce; client JWT-decode role; dual lock enforcement; no `canSelectAnyMember`/
> `userId` on the bulk form; per-row errors matched by submit order; no throttle; shared single-sourced form; client-only
> 200-row cap). `npm run build` ✓ (`/summary/bulk-log-workout` prerendered, **1.38 kB** — smallest write route, no
> Recharts; Middleware 27.5 kB active). **Committed via `git-version` next; lessons run 38 appended (promoted: "a
> near-exact twin can carry ONE genuinely-new but CODE-DETERMINED behavioral shape → it lands as an F-row + a D-S1 line,
> not a question; the decision shape still transcribes verbatim").** **NEXT = the `/summary` group is COMPLETE (6/6) — the
> SUB-ROUTE layer continues with the 8 deferred `/members` sub-routes (`list`/`detail`/`invite`/`metrics`/`history`/
> `streaks`/`workouts`/`health`).**
>
> **On "continue": Phase 3 `web` in progress — the `/summary` LOG FALLBACKS ARE ADVANCING (5 of 6).** The
> **`summary/log-health` page (23rd web page, 5th of the 6 deferred `/summary` sub-routes — the 2nd of the 3 mobile
> log fallbacks) is DONE** (2026-06-29): a **near-exact twin of the just-built `summary/log-workout` (run 36)** — a
> faithful 1:1 port of the legacy 65-line standalone Log-daily-health page: a `PageShell` + `PageHeader` ("Log daily
> health" / "Track sleep hours and diet quality for the day." / `backHref="/summary"`) wrapping the **already-built
> `LogDailyHealthForm` in its `variant="page"` branch** (member `Select` or "You" panel · date · sleep hours+minutes ·
> diet-quality 1–5 `Select` → `POST /daily-health-logs`). **The desktop modal counterpart already lives on the
> `/summary` landing (run 21); the landing routes mobile → this page (`summary/page.tsx:216`).** **This is the 2nd
> `/summary` sub-route where `admin_only_data_entry` is LIVE** (after `log-workout`): the page
> `router.replace("/summary")`s a locked non-admin on mount (UX), and the backend `requireDataEntryAllowed` is the
> real 403 (`routes/logs.js:91`). **Role logic is live**: `canLogForAny` (global_admin/admin/logger) shows the member
> picker + may log for any member; a plain member gets a static "You" panel forced to own `userId`. **D-SCOPE** = this
> page only — **5th-of-6, 2nd of the 3 log fallbacks, does NOT close the group** (only `bulk-log-workout` still
> deferred). **D-DEPS = NO new dependency** (purest write-page shape — the whole `LogDailyHealthForm` incl. its
> `variant="page"` branch, `addDailyHealthLog`, `PageShell`/`PageHeader`, `useAuthGuard`, `isDataEntryLocked`, the
> member lookup fn all landed with the summary landing run 21 + the `/program/*` chrome; the sweep ported nothing but
> the page file). **Unlike `log-workout`, the health form needs only the member lookup — NO workout-types lookup.**
> **Stance = faithful + 1 user-picked cleanup: D-C1** deterministic-nav (match run 36) — swap the 2 legacy
> `router.back()` calls (post-save success **and** the form `onClose`) for `router.push("/summary")` so all navigation
> off the page is deterministic and matches the header BackButton (which already hardcodes `/summary`). **The lock
> `router.replace("/summary")` is unchanged** (faithful). **"Reuse `refreshSummaryQueries`" re-confirmed REJECTED**
> (same module-private one-liner as run 36 — not importable, nothing to reuse). Faithful otherwise (D-S1 — already
> fully `rf-*` tokenized → NO tokenize cleanup). **Zero backend work, NO feature bump** — `POST /api/daily-health-logs`
> already mounted (`server.js:74`) + gated. `consumed_by=[web]` (iOS has its own native log screen). Flagged F1–F6
> (client JWT-decode role/lock drives the picker + redirect; `admin_only_data_entry` enforced in 2 places; no view-as;
> member forced to own id for non-admins; no client throttle beyond `isPending`; the `LogDailyHealthForm` single-sourced
> across modal + page; client-only at-least-one-metric `hasMetric` submit gate). `npm run build` ✓
> (`/summary/log-health` prerendered, **2.4 kB** — no Recharts; Middleware 27.5 kB active). **Committed via
> `git-version` next; lessons run 37 appended (promoted: "a near-exact twin run is confirm-only — recognize the twin,
> transcribe its decision shape, enumerate only the deltas").** **NEXT = the LAST `/summary` sub-route + last log
> fallback `bulk-log-workout` (the heavier `BulkLogWorkoutForm` ≤200-row page — CLOSES the `/summary` group); and/or
> the 8 deferred `/members` sub-routes.**
>
> **On "continue": Phase 3 `web` in progress — the `/summary` LOG FALLBACKS HAVE STARTED (4 of 6).** The
> **`summary/log-workout` page (22nd web page, 4th of the 6 deferred `/summary` sub-routes — the 1st of the 3 mobile
> log fallbacks) is DONE** (2026-06-29): faithful 1:1 port of the legacy 66-line standalone Log-workout page — a
> `PageShell` + `PageHeader` ("Log workout" / "Pick member, workout, date, and duration." / `backHref="/summary"`)
> wrapping the **already-built `LogWorkoutForm` in its `variant="page"` branch** (member `Select` or "You" panel ·
> workout-type `Select` · date · hours+minutes duration → `POST /workout-logs`). **The desktop modal counterpart
> already lives on the `/summary` landing (run 21); the landing routes mobile → this page (`summary/page.tsx:206`).**
> **KEY: this is the 1st `/summary` sub-route where `admin_only_data_entry` is LIVE, not N/A** — the page
> `router.replace("/summary")`s a locked non-admin on mount (UX), and the backend `requireDataEntryAllowed` is the
> real 403 (`routes/logs.js:17-34`). **Role logic is live** (unlike the read-only chart drill-downs): `canLogForAny`
> (global_admin/admin/logger) shows the member picker + may log for any member; a plain member gets a static "You"
> panel forced to own `userId` (backend 403s "You can only log your own workouts." otherwise). **D-SCOPE** = this
> page only — **4th-of-6, 1st of the 3 log fallbacks, does NOT close the group** (`log-health` + `bulk-log-workout`
> still deferred). **D-DEPS = NO new dependency** (purest write-page shape — the whole `LogWorkoutForm` incl. its
> `variant="page"` branch, `addWorkoutLog`, `PageShell`/`PageHeader`, `useAuthGuard`, `isDataEntryLocked`, the two
> lookup fns all landed with the summary landing run 21 + the `/program/*` chrome; the sweep ported nothing but the
> page file). **Stance = faithful + 1 user-picked cleanup: D-C1** deterministic-nav — swap the 2 legacy
> `router.back()` calls (post-save success **and** the form `onClose`) for `router.push("/summary")` so all
> navigation off the page is deterministic and matches the header BackButton (which already hardcodes `/summary`);
> guards the direct-nav/refresh footgun. **The lock `router.replace("/summary")` is unchanged** (faithful — replace
> deliberately drops the locked page from history). **"Reuse `refreshSummaryQueries`" was considered + REJECTED** —
> it's a module-private one-liner in `summary/page.tsx:310` (`invalidateQueries(["summary"])`), byte-identical to
> the faithful inline call and not importable; nothing to reuse. Faithful otherwise (D-S1 — same `canLogForAny`,
> lock guard, mutation injecting `program_id`, `invalidateQueries(["summary"])`; already fully `rf-*` tokenized →
> NO tokenize cleanup). **Zero backend work, NO feature bump** — `POST /api/workout-logs` already mounted + gated.
> `consumed_by=[web]` (iOS has its own native log screen). Flagged F1–F5 (client JWT-decode role/lock drives the
> picker + redirect; `admin_only_data_entry` enforced in 2 places — client redirect + backend 403; no view-as/
> sessionStorage — member forced to own id for non-admins; no client throttle beyond `isPending`; the
> `LogWorkoutForm` single-sourced across modal + page). `npm run build` ✓ (`/summary/log-workout` prerendered,
> **1.33 kB** — smallest `/summary` route, no Recharts; Middleware 27.5 kB active). **Committed via `git-version`
> next; lessons run 36 appended.** **NEXT = the `/summary` group's last 2 log fallbacks (`log-health` — standalone
> port of the `LogDailyHealthForm` modal; `bulk-log-workout` — the heavier `BulkLogWorkoutForm` ≤200-row page);
> and/or the 8 deferred `/members` sub-routes.**
>
> **On "continue": Phase 3 `web` in progress — the `/summary` CHART DRILL-DOWNS ARE NOW COMPLETE (3 of 6).** The
> **`summary/workout-types` page (21st web page, 3rd of the 6 deferred `/summary` sub-routes — the LAST of the three
> chart drill-downs) is DONE** (2026-06-29): faithful 1:1 port of the legacy **top workout types** detail behind the
> summary landing's Workout Types card — one `GlassCard` with a single-series `BarChart` of session count per workout
> type (`CHART_COLORS[0]`, X-axis labels hidden) **plus a ranked `<ul>` detail list** below (name · sessions · avg
> min), over `workout_logs` via `GET /analytics/workouts/types`. **Same purest shape as `distribution`: no
> `PeriodSelector`, NO `useState`, NO state; program-wide + program-to-date (no period, no `memberId`, no view-as, no
> role logic — the ABSENCE of role-conditional UI is F2).** **Read-only** → `admin_only_data_entry` **N/A**. **D-SCOPE**
> = this page only — **3rd-of-6, does NOT close the group** but **completes all 3 chart drill-downs** (`activity`+
> `distribution`+this); the 3 log fallbacks `log-workout`/`log-health`/`bulk-log-workout` still deferred. **D-DEPS = NO
> new dependency** (every import already ported — `fetchWorkoutTypes`+`WorkoutType` landed with the summary landing run
> 21, all chrome + chart-theme earlier; the sweep ported nothing but the page itself). **Stance = faithful + 1
> user-picked cleanup: D-C1** styled empty-state panel — upgrade the legacy plain `<p>`"No workouts logged yet." to
> `distribution`'s `rf-surface-muted` panel so all 3 drill-downs share one empty-state look. **Run-34 predicate re-check
> applied and came back CLEAN: the legacy `data.length === 0` predicate is ALREADY correct here** (this endpoint
> returns a VARIABLE-LENGTH array, unlike distribution's always-7-keys → an empty array IS the empty case; only the
> panel STYLING is the cleanup, not the predicate). **Run-33 twin cleanups SUBTRACTED: `<Legend>`+series-names NOT
> applied** (single series — nothing to disambiguate); **dual-Y-axis NOT applied** (single counts series → one natural
> axis). Faithful otherwise (D-S1 — same query key `["summary","workoutTypes",programId]`, `enabled` gate, hidden
> X-axis ticks, the ranked list; already fully `rf-*` tokenized → NO tokenize cleanup). **Zero backend work, NO feature
> bump** — `GET /api/analytics/workouts/types` already mounted (`routes/analytics.js:100`, `authenticateToken`-only) +
> the api fn already ported. Flagged F1–F7 (no per-program read authz — analytics F2; no view-as/no `memberId`/no
> period/no role logic — program-wide program-to-date; read-only → `admin_only_data_entry` N/A; route's `memberId`
> branch dead from this client; **F5 — the detail page passes `limit=100` while the landing preview passes `limit=50`
> under the SAME query key, so React Query dedupes them to one cache entry — latent, harmless in practice**; X-axis
> labels hidden; program-to-date window). `npm run build` ✓ (`/summary/workout-types` prerendered, **2.07 kB** —
> between distribution's 2.01 kB and activity's 2.31 kB; Recharts shared 208 kB; Middleware 27.5 kB active).
> **Committed via `git-version` next; lessons run 35 appended.** **NEXT = the `/summary` group's LAST 3 sub-routes are
> the mobile log fallbacks (`log-workout`/`log-health`/`bulk-log-workout` — standalone-page ports of the 3 desktop
> modals already live on the landing); and/or the 8 deferred `/members` sub-routes.**
>
> **On "continue": Phase 3 `web` in progress — the `/summary` SUB-ROUTE GROUP IS ADVANCING (2 of 6).** The
> **`summary/distribution` page (20th web page, 2nd of the 6 deferred `/summary` sub-routes) is DONE** (2026-06-29):
> faithful 1:1 port of the legacy **workout distribution by day-of-week** detail behind the summary landing's
> Distribution chart card — one `GlassCard` with a single `BarChart` plotting the program's total workout count per
> weekday (Sun→Sat) over `workout_logs` via `GET /analytics/distribution/day`. **The PUREST page in the `/summary`
> group — even purer than run-33 `activity`: no `PeriodSelector`, NO `useState`, NO state at all; program-wide +
> ALL-TIME (no period, no `memberId`, no view-as, no role logic — the ABSENCE of role-conditional UI is F2).**
> **Read-only** → `admin_only_data_entry` **N/A**. **D-SCOPE** = this page only — **2nd-of-6, does NOT close the
> group** (sibling `workout-types` + the 3 log fallbacks `log-workout`/`log-health`/`bulk-log-workout` still
> deferred). **D-DEPS = NO new dependency** (every import already ported — `fetchDistributionByDay`+`DistributionByDay`
> landed with the summary landing run 21, all chrome `PageShell`/`PageHeader`/`GlassCard`/`LoadingState`/`ErrorState`
> + chart-theme earlier; the sweep ported nothing but the page itself). **Stance = faithful + 1 user-picked cleanup:
> D-C1** all-zero empty-state guard (when the 7 weekday counts SUM to 0 → "No workouts logged yet." instead of 7
> flat zero-height bars; keys off the sum NOT `data.length` since the backend always returns all 7 keys; adapts
> `activity`'s empty-state intent to the always-7-buckets shape). **Run-33 lesson applied — twin cleanups SUBTRACTED:
> `<Legend>`+series-names NOT applied** (single series — nothing to disambiguate, the subtitle already says
> "Workouts"); **dual-Y-axis NOT applied** (single counts series → one natural axis). Faithful otherwise (D-S1 — same
> query key `["summary","distribution",programId]` shared with the landing preview, `enabled` gate, fixed Sun→Sat
> mapping, single `value` bar `CHART_COLORS[2]`, `h-80`, inline axis ticks; already fully `rf-*` tokenized so NO
> tokenize cleanup). **Zero backend work, NO feature bump** — `GET /api/analytics/distribution/day` already mounted
> (`routes/analytics.js:89`, `authenticateToken`-only; `analytics` D-C3 already bucketed the weekday in explicit UTC)
> + the api fn already ported. Flagged F1–F5 (no per-program read authz on the route — analytics F2; no view-as/no
> `memberId`/no period/no role logic — program-wide all-time; read-only → `admin_only_data_entry` N/A; all-time
> window unlike period-scoped `activity`; hardcoded client weekday labels over UTC-bucketed server keys). `npm run
> build` ✓ (`/summary/distribution` prerendered, **2.01 kB** — smallest `/summary` route, below `activity`'s 2.31 kB;
> Recharts shared 208 kB; Middleware 27.4 kB active). **Committed via `git-version` next; lessons run 34 appended.**
> **NEXT = the `/summary` group continues: `workout-types` (the last chart drill-down), then the 3 mobile log
> fallbacks (`log-workout`/`log-health`/`bulk-log-workout`); and/or the 8 deferred `/members` sub-routes.**
>
> **On "continue": Phase 3 `web` in progress — the `/summary` SUB-ROUTE GROUP HAS STARTED (1 of 6).** The
> **`summary/activity` page (19th web page, 1st of the 6 deferred `/summary` sub-routes) is DONE** (2026-06-29):
> faithful 1:1 port of the legacy **workout activity timeline** detail behind the summary landing's Activity chart
> card — a `PeriodSelector` (W/M/Y/P) over one `GlassCard` (range + daily-average header + a `BarChart` of workouts
> and active-members per bucket, over `workout_logs` via `GET /analytics/timeline`). **A near-twin of
> `lifestyle/timeline` but SIMPLER: no view-as picker, no `memberId` — PROGRAM-WIDE only** (data scope is not
> per-member; `useAuthGuard()` default, **no role logic at all** — the ABSENCE of role-conditional UI is the
> finding F2). **Read-only** → `admin_only_data_entry` **N/A**. **D-SCOPE** = this page only — **1st-of-6, does NOT
> close the group** (`distribution`/`workout-types` + the 3 log fallbacks still deferred). **D-DEPS = NO new
> dependency** (purest shape — every import already ported: `fetchActivityTimeline` landed with the summary landing
> run 21, `PeriodSelector` with `lifestyle/timeline` run 32, all other chrome + chart-theme earlier; the sweep
> ported nothing but the page itself). **Stance = faithful + 2 user-picked chart cleanups: D-C1** add `<Legend>` +
> series names (`name="Workouts"`/`name="Active members"`; tooltip formatter keys off `name`) so the two
> color-only-distinguished bars are labeled (mirrors timeline D-C3), **D-C2** empty-state guard
> (`buckets.length===0` → "No data for this range yet." instead of an empty chart; mirrors timeline). **Dual-axis
> NOT applied** (both series are counts → a single shared Y-axis is correct; deliberately omitted). Faithful
> otherwise (D-S1 — same query key/`enabled` gate/header/inline axis ticks; already fully `rf-*` tokenized so NO
> tokenize cleanup). **Zero backend work, NO feature bump** — `GET /api/analytics/timeline` already mounted
> (`routes/analytics.js:60`, `authenticateToken`-only) + the api fn already ported. Flagged F1–F4 (no per-program
> read authz on the timeline route — analytics F2; no view-as/no `memberId`/no role logic — program-wide; read-only
> → `admin_only_data_entry` N/A; `daily_average` server-derived). `npm run build` ✓ (`/summary/activity`
> prerendered, **2.31 kB** — smallest `/summary` route; Recharts shared 208 kB; Middleware 27.4 kB active).
> **Committed via `git-version` next; lessons run 33 appended.** **NEXT = the `/summary` group continues:
> `distribution` (next chart drill-down), `workout-types`, then the 3 mobile log fallbacks
> (`log-workout`/`log-health`/`bulk-log-workout`); and/or the 8 deferred `/members` sub-routes.**
>
> **On "continue": Phase 3 `web` in progress — the `/lifestyle` SUB-ROUTE GROUP IS NOW COMPLETE (2 of 2).** The
> **`lifestyle/timeline` page (18th web page, 2nd & LAST `/lifestyle` sub-route) is DONE** (2026-06-29): faithful 1:1
> port of the legacy **sleep + diet-quality health timeline** detail behind the lifestyle landing's timeline chart
> card — a `PeriodSelector` (W/M/Y/P) over one `GlassCard` (range + daily-avg-sleep/diet header + a `ComposedChart`
> of sleep hours as bars + diet quality 1–5 as a line, over `daily_health_logs`). **Read-only** → `admin_only_data_entry`
> **N/A**. **KEY SHAPE: no view-as picker on this page** (unlike the `/lifestyle`/`/members` landings) — data scope
> comes purely from the URL `memberId` the landing passes (`resolvedMemberId`: URL `memberId` → that; else admin →
> program-wide; else own id); **no admin redirect**, available to every role (F2). `useAuthGuard()` default
> (`requireProgram: true`). **D-SCOPE** = this page only — **and it CLOSES the `/lifestyle` group** (2nd & last
> sub-route; landing run 23 + `workouts` run 31 + this). **D-DEPS** = ONE new chrome leaf **`ui/PeriodSelector.tsx`**
> ported verbatim (D-C1; the `.segmented-control` CSS class was already in `globals.css`); every other import already
> ported — `fetchHealthTimeline` landed byte-identical with the landing (run 23). **Stance = CHANGE NOW** (user picked
> all 3 offered chart cleanups): **D-C2** dual Y-axis (sleep-hrs on a left axis `[0, sleepMax*1.1]`, diet-1–5 on a
> right axis `[0,5]` — fixes the legacy single-shared-axis scale-mixing F3 where the diet line sat flat under the
> bars), **D-C3** add a `<Legend>` (series carry `name="Sleep"`/`name="Diet"`; tooltip formatter keys off `name`),
> **D-C4** axis unit labels ("hrs" / "/ 5"). Faithful otherwise (D-S1 — same `resolvedMemberId`/query-key/`enabled`
> gate/header/empty-state/`force-dynamic`; already fully `rf-*` tokenized so NO tokenize cleanup). **Zero backend work,
> NO feature bump** — `GET /api/analytics/health/timeline` already mounted (`routes/analytics.js:74`,
> `authenticateToken`-only) + the api fn already ported. Flagged F1–F5 (backend has no per-program read authz on the
> timeline route — analytics F2; no view-as picker; client JWT-decode role gate; `admin_only_data_entry` N/A; diet
> right-axis hard-pinned `[0,5]`). `npm run build` ✓ (`/lifestyle/timeline` prerendered, **2.68 kB**; Recharts shared;
> Middleware 27.4 kB active). **Committed via `git-version` next; lessons run 32 appended.** **NEXT = the SUB-ROUTE layer
> continues elsewhere: the 8 deferred `/members` sub-routes and/or the 6 deferred `/summary` sub-routes (the `/lifestyle`
> group is now done — all 3 of landing + workouts + timeline).**
>
> **On "continue": Phase 3 `web` in progress — the `/lifestyle` SUB-ROUTE GROUP HAS STARTED (1 of 2).** The
> **`lifestyle/workouts` page (17th web page, 1st of the 2 deferred `/lifestyle` sub-routes) is DONE** (2026-06-29):
> faithful 1:1 port of the legacy **workout-TYPE management** screen behind the `/lifestyle` landing's "Manage
> workouts" / "View workouts" pill — a searchable list of the program's workout types (**global** library +
> **custom**) split into **Available** (`!is_hidden`) / **Hidden**, with Add / Edit / Hide-Show / Delete for admins
> and a **read-only** Available list for everyone else. **KEY FINDING (corrects the run-23 forward-inference): this
> is NOT "the write path where `admin_only_data_entry` bites"** — the legacy file never references that flag; gating
> is by **admin ROLE** (`canManage = global_admin || (standard && my_role==="admin")`). The data-entry lock gates
> whether non-admins may *log* workouts on the `/summary` forms, not who curates the workout-type vocabulary (always
> admin-only). Recorded as **F1**. **Second finding (F2): non-admins are NOT redirected** (unlike
> `program/edit`/`program/roles`) — they get a **read-only DEGRADE** (controls + Hidden section hidden via
> `canManage`); the landing's "View workouts" pill routes them here on purpose. `useAuthGuard()` (default
> `requireProgram: true`, no admin redirect). **D-SCOPE** = this page only — the sibling **`/lifestyle/timeline` still
> deferred**; this is **1st-of-2, does NOT close the group**. **D-DEPS = NO new dependency** (purest shape on a full
> CRUD page — the whole `lib/api/program-workouts.ts` module landed "vestigial-here" with `summary` run 21; every
> chrome leaf `PageShell`/`PageHeader`/`GlassCard`/`Modal`/`LoadingState`/`ConfirmDialog` + `useAuthGuard` already
> ported; the sweep ported only the page itself). **D-S1 faithful 1:1** otherwise (same `canManage` gate, Available/
> Hidden split, global-vs-custom control matrix — global types hide/show-only, custom editable/deletable —
> `["lifestyle","workouts",programId]` query + invalidate-on-success, no optimistic update). **Two pinned cleanups:
> D-C1** `window.confirm` → ported `ui/ConfirmDialog` (2 delete sites; no rebuilt page uses `window.confirm` —
> keeping it would be the rebuild's lone divergence; mirrors `program/profile`'s delete), **D-C2** clear the stale
> error on **both** Add and Edit modal open (legacy cleared only on Add). **Zero backend work, NO feature bump** —
> all 6 `/api/program-workouts` routes already mounted + gated (`GET` ungated, 5 writes via `requireProgramAdmin`),
> api module already ported. Flagged F1–F6 (admin-role gate not `admin_only_data_entry`; read-only degrade not
> redirect; client JWT-decode admin gate; client-side search filter; global types hide/show-only; no per-card
> in-flight lock). `npm run build` ✓ (`/lifestyle/workouts` prerendered, **4.82 kB** — no Recharts; Middleware 27.4
> kB active). **Committed via `git-version` next; lessons run 31 appended (promoted: "a landing-run forward-inference
> can be wrong — correct it in the sub-route run as an F-row"; "non-admin handling splits into redirect vs read-only
> degrade — read THIS page's guard"; "swap `window.confirm` for the ported `ConfirmDialog`").** **NEXT = the LAST
> `/lifestyle` sub-route `timeline` (closes the group), the 8 deferred `/members` sub-routes, and/or the 6 deferred
> `/summary` sub-routes.**
>
> **On "continue": Phase 3 `web` in progress — the `/program/*` SUB-ROUTE GROUP IS NOW COMPLETE (6 of 6).** The
> **`program/privacy` page (16th web page, 6th & LAST `/program/*` settings sub-route) is DONE** (2026-06-29): faithful
> 1:1 port of the legacy **Privacy Policy** — a single static `GlassCard` of policy prose (effective date 2026-03-02,
> the nine sections: information collected/used/shared, retention, security, choices, children's privacy, changes,
> contact `geethasankar78@gmail.com`). **The PUREST page in the rebuild — even purer than run-29 `appearance`: fully
> static content with NO state, NO `localStorage`, NO API, NO backend, and NO new dependency** (`appearance` at least
> writes `localStorage`; this reads/writes nothing). **Despite living under `/program/*` it is NOT a program-admin
> setting** — a read-only legal document available to **every** role with **no admin redirect and no role-conditional
> UI at all** (the ABSENCE of role logic is the finding, F4). `useAuthGuard({ requireProgram: false })`. **D-SCOPE** =
> this page only — **and it CLOSES the group** (the 6th & last `/program/*` sub-route; the entire sub-route layer is
> now complete). **D-DEPS = NO new dependency** (`PageShell`/`PageHeader`/`GlassCard` + `useAuthGuard` all already
> ported — not even a chrome leaf). **D-S1 faithful 1:1** — content kept **verbatim** (user decision: "keep all content
> verbatim"), and **already fully `rf-*` tokenized in legacy, so NO tokenize cleanup**. **The single cleanup D-C1** =
> reuse `useAuthGuard` over the legacy inline `useAuth` + `useActiveProgram` + manual redirect `useEffect` (deletes the
> `useRouter`/`useAuth`/`useActiveProgram`/`useEffect` imports; matches siblings `profile`/`password`/`appearance`).
> **Zero backend work, NO feature bump** — no endpoint exists; the page is static markup. Flagged F1–F4 (the shared
> cross-surface policy intentionally describes iOS push/APNs on web; the policy is auth-gated; hardcoded effective
> date + contact email; no role read at all). `npm run build` ✓ (`/program/privacy` prerendered, **2.44 kB** —
> smallest sub-route yet, below `appearance`'s 3.06 kB; Middleware 27.4 kB active). **Committed via `git-version` next;
> lessons run 30 appended (promoted: "the purest shape bottoms out at a fully-static page — no state/storage/API at
> all"; "keep a shared cross-surface legal doc verbatim, flag the surface-mismatch as an F-row not a fork").** **NEXT =
> the SUB-ROUTE layer continues elsewhere: the 8 deferred `/members` sub-routes, the 6 deferred `/summary` sub-routes,
> and/or the 2 deferred `/lifestyle` sub-routes (the `/program/*` group is done).**
>
> **On "continue": Phase 3 `web` in progress — the SUB-ROUTE layer is advancing.** The **`program/appearance` page
> (15th web page, 5th of the 6 deferred `/program/*` settings sub-routes) is DONE** (2026-06-29): faithful 1:1 port
> of the legacy **appearance/theme picker** — a `GlassCard` of three full-width option buttons (System / Light / Dark,
> each an icon-chip + title + description + a ✓ on the active one) → writes `localStorage["rf:appearance"]` via the
> foundation `setStoredTheme` (which `applyTheme`s immediately to `document.documentElement`). **The PUREST sub-route
> yet — pure client-side: NO backend, NO API call at all, NO new dependency.** Despite living under `/program/*` it is
> **NOT a program-admin setting** — it sets the *requester's own* client-side preference, has **no admin redirect, no
> role gate, and no role-conditional UI whatsoever** (the ABSENCE of role logic is the finding, F3). It is the **write
> side** of the contract the `/program` hub's appearance-label only *reads* (run-24 F5). `useAuthGuard({ requireProgram:
> false })`. **D-SCOPE** = this page only (privacy — the 6th & LAST `/program/*` sub-route — still deferred). **D-DEPS =
> NO new dependency** (purest shape — nothing dragged in, not even a chrome leaf: `PageShell`/`PageHeader`/`GlassCard`,
> `IconMonitor`/`IconSun`/`IconMoon`, `lib/theme.ts`, `useAuthGuard` all already ported). **D-S1 faithful 1:1** — and
> **already fully `rf-*` tokenized in legacy, so NO tokenize cleanup** (run-28's all-clean grep, here trivially: nothing
> to tokenize). **The single cleanup D-C1** = reuse `useAuthGuard` over the legacy inline `useAuth` + `useActiveProgram`
> + manual redirect `useEffect` (deletes the `useRouter`/`useAuth`/`useActiveProgram` imports; matches siblings
> `profile`/`password`). **Zero backend work, NO feature bump** — no endpoint exists; the theme contract is wholly
> client-side foundation infra. Flagged F1–F3 (device/browser-local preference, not account-synced; possible first-paint
> theme flash; no role read at all). `npm run build` ✓ (`/program/appearance` prerendered, **3.06 kB** — smallest
> sub-route yet, no Recharts; Middleware active). **Committed via `git-version` next; lessons run 29 appended (promoted:
> "the PUREST shape — client-only page, no backend/API/dep at all"; "already-tokenized → no tokenize cleanup, the
> trivial end of run-28's per-site grep"; "ABSENCE of role logic IS the §7 finding").** **NEXT = the LAST `/program/*`
> sub-route (privacy), then the 8 deferred `/members` sub-routes, the 6 deferred `/summary` sub-routes, and/or the 2
> deferred `/lifestyle` sub-routes.**
>
> **On "continue": Phase 3 `web` in progress — the SUB-ROUTE layer is advancing.** The **`program/password` page
> (14th web page, 4th of the 6 deferred `/program/*` settings sub-routes) is DONE** (2026-06-29): faithful 1:1 port
> of the legacy **change-password page** — a new + confirm password pair (Show/Hide on New only) + a live 5-rule
> policy checklist (≥8 chars · upper · lower · number · match) → `PUT /auth/change-password`. **Despite living under
> `/program/*` it is NOT a program-admin setting** — it changes the *requester's own* password (`req.user.id`), has
> **no admin redirect, no role gate, and no role-conditional UI at all** (byte-identical form for every role).
> A **near-twin of two already-built pages at once**: the public/auth `reset-password` form (same new+confirm+checklist,
> minus the URL-fragment recovery token — here the live session bearer authorizes) + the sibling `profile` (same
> decision shape). `useAuthGuard({ requireProgram: false })`. **D-SCOPE** = this page only (appearance · privacy
> still deferred). **D-DEPS = NO new dependency** (purest shape — `PageShell`/`PageHeader`/`GlassCard`,
> `changePassword`, `useAuthGuard`, `rf-success` token all already ported; the route + the shared `validatePassword`
> policy shipped with `auth`, `reset-password` already proved the shared `changePassword` service fn). **D-S1 faithful
> + 3 user-pinned cleanups: D-C1** tokenize the success/checklist color (`text-emerald-600` → `text-rf-success` at
> **all 6 sites** — the 5 met-rule rows + the success line; the inverse of profile run-27's selective tokenize — no
> literal-amber holdout here, all clean), **D-C2** reuse `useAuthGuard` over the legacy inline `useAuth` + manual
> redirect `useEffect` (matches sibling `profile`; the hook subsumes the redirect + provides `program`/`token`),
> **D-C3** clear the stale success/error message on field edit (legacy left "Password updated successfully." lingering
> with the cleared fields until the next submit). **Zero backend work, NO feature bump** — `PUT /auth/change-password`
> already mounted (`auth` v0.1.0, `authenticateToken` + the single-sourced `changePassword`). Flagged F1–F4 (client
> `validatePassword` mirrors the server policy; no client throttle; Show toggles New only; `changePassword` doesn't
> re-issue the JWT). `npm run build` ✓ (`/program/password` prerendered, **3.5 kB** — smallest sub-route yet, no
> Recharts; Middleware 27.3 kB active). **Committed via `git-version` next; lessons run 28 appended (promoted:
> "near-twin of TWO pages across families"; "all-clean tokenize is run-27's inverse"; "`useAuthGuard`-reuse for any
> legacy inline-redirect page"; "no role-conditional UI → role question is fully code-answered").** **NEXT = the
> remaining 2 `/program/*` sub-routes (appearance · privacy), the 8 deferred `/members` sub-routes, the 6 deferred
> `/summary` sub-routes, and/or the 2 deferred `/lifestyle` sub-routes.**
>
> **On "continue": Phase 3 `web` in progress — the SUB-ROUTE layer is advancing.** The **`program/profile` page
> (13th web page, 3rd of the 6 deferred `/program/*` settings sub-routes) is DONE** (2026-06-29): faithful 1:1
> port of the legacy page that — despite its `/program/*` path — is **NOT a program-admin setting** but the
> signed-in user's **own "My Profile" account page** (identity card + editable first/last name + gender `<select>`
> + Delete Account). **No admin redirect; available to every role** (the only role gate hides Delete Account from
> global_admin); `useAuthGuard({ requireProgram: false })`. Save → `PUT /members/:id` (backend `updateMember`
> enforces the own-profile-or-global_admin 403, partial-updates, returns the new `member_name` → mirrored into the
> profile cache + the auth session); Delete → `ConfirmDialog` → `DELETE /auth/account` (the single-sourced
> member-deletion cascade) → `signOut` → `/login`. **D-SCOPE** = this page only (other 3 `/program/*` sub-routes —
> password/appearance/privacy — still deferred). **D-DEPS = NO new dependency** (the purest shape yet — every dep
> already ported: `PageShell`/`PageHeader`/`GlassCard`/`ConfirmDialog`, `fetchMemberProfile`/`updateMemberProfile`,
> `deleteAccount`, `initials`; the members api fns were ported "vestigial-here" with the `/members` landing page,
> run 22 — this page is their belated consumer). **D-S1 faithful + 2 user-pinned cleanups: D-C1** tokenize the
> success color (`text-emerald-600` → `text-rf-success`, theme-aware + symmetric with the `rf-danger` error line;
> the avatar amber chip has no clean rf token → kept faithful + flagged F2), **D-C2** clear the stale success/error
> message on field edit (legacy left "Profile updated successfully." lingering until the next Save). **Zero backend
> work, NO feature bump** — both endpoints already mounted (`members` v0.2.0 `PUT /members/:id`; `auth` v0.2.0
> `DELETE /auth/account` cascade). Flagged F1–F5 (client JWT-decode role label + delete gate; literal-amber avatar;
> name-split heuristic; client-only delete gate vs `authenticateToken`-only backend route; no client throttle).
> `npm run build` ✓ (`/program/profile` prerendered, 5.4 kB — no Recharts; Middleware active). **Committed via
> `git-version` next; lessons run 27 appended (promoted: "the PATH can lie about OWNERSHIP not just CRUD-ness";
> "no new dependency" as the purest D-DEPS; tokenize SELECTIVELY per-site).** **NEXT = the remaining 3 `/program/*`
> sub-routes (password · appearance · privacy), the 8 deferred `/members` sub-routes, the 6 deferred `/summary`
> sub-routes, and/or the 2 deferred `/lifestyle` sub-routes.**
>
> **On "continue": Phase 3 `web` in progress — the SUB-ROUTE layer is advancing.** The **`program/roles` page
> (12th web page, 2nd of the 6 deferred `/program/*` settings sub-routes) is DONE** (2026-06-29): faithful 1:1
> port of the legacy **admin-only role-management list** — the program's **active** members each rendered as a
> `GlassCard` with Admin/Logger/Member toggle buttons → `PUT /program-memberships` `{program_id, member_id, role}`.
> Non-admins are redirected to `/program`; the backend `updateMembership` independently enforces the 403, the
> **"Cannot remove the last admin" 400**, and fires the live `program.role_changed` emit. **D-SCOPE** = this page
> only (other 4 `/program/*` sub-routes still deferred). **D-DEPS** = ported one new shared-chrome leaf
> **`ui/LoadingState.tsx`** verbatim (9 lines; reused by the remaining sub-routes). **D-S1 faithful + 3 user-pinned
> cleanups: D-C1** tokenize the role-button colors (legacy fixed hexes `#f59e0b`/`#3b82f6`/`#6b7280` →
> theme-aware `rf-warning`/`rf-info`/`rf-text-muted`; admin keeps dark ink on amber, light-mode `--rf-warning` ==
> `#f59e0b` so admin is pixel-identical in light mode), **D-C2** optimistic role update (write the new role into
> the `["program","roles",programId]` cache on click via `onMutate`, reconcile on settle, roll back on error;
> legacy waited for the refetch), **D-C3** disable **all** role buttons while any update is in flight (gate on
> `updateMutation.isPending`, not just the `updatingId` row). **Zero backend work, api modules already ported,
> NO feature bump** — both routes + `fetchMembershipDetails`/`updateMembership` + the `program.role_changed` emit
> all already shipped with `program-memberships`/`notifications`. Flagged F1–F5 (client JWT-decode admin gate;
> client last-admin disable mirroring the backend 400; role-only PUT payload; raw name / default role label; no
> client throttle beyond the in-flight lock). `npm run build` ✓ (`/program/roles` prerendered, 4.23 kB — no
> Recharts; Middleware 27.3 kB active). **Committed via `git-version` next; lessons run 26 appended.** **NEXT =
> the remaining 4 `/program/*` sub-routes (profile · password · appearance · privacy), the 8 deferred `/members`
> sub-routes, the 6 deferred `/summary` sub-routes, and/or the 2 deferred `/lifestyle` sub-routes.**
>
> **On "continue": Phase 3 `web` in progress — the SUB-ROUTE layer has STARTED.** The **`program/edit` page
> (11th web page, 1st of the 6 deferred `/program/*` settings sub-routes) is DONE** (2026-06-29): faithful 1:1
> port of the legacy **admin-only edit-program-details form** (name · status `Select` · start/end date · the
> `admin_only_data_entry` toggle → `PUT /programs/:id` → back to `/program`). Non-admins are redirected to
> `/program`; the backend `updateProgram` independently enforces a 403 + fires the live `program.updated` emit.
> **D-SCOPE** = this page only (other 5 `/program/*` sub-routes still deferred). **D-DEPS** = ported the two new
> shared-chrome leaf components **`ui/PageHeader.tsx` + `BackButton.tsx`** verbatim (single-sourced for all 6
> `/program/*` sub-routes). **D-S1 faithful + 3 user-pinned cleanups: D-C1** client-side date-range validation
> (block Save when `start >= end` — legacy saved a backwards range silently → 0% progress), **D-C2** hydrate the
> active-program cache from the server `ProgramResponse` (not optimistic form state; carries `my_role`/`my_status`
> over), **D-C3** skip a no-op PUT (short-circuit to `/program` when nothing changed). **Zero backend work, no
> new api modules, NO feature bump** — `updateProgram` + the route + the emit all already shipped with
> `programs`/`notifications`. Flagged F1–F4 (client JWT-decode admin gate; vestigial `status` default; date-shape
> trust; no client throttle). `npm run build` ✓ (`/program/edit` prerendered, 5.7 kB — no Recharts; Middleware
> 27.3 kB active). **Committed via `git-version` next; lessons run 25 appended.** **NEXT = the remaining 5
> `/program/*` sub-routes (roles · profile · password · appearance · privacy), the 8 deferred `/members`
> sub-routes, the 6 deferred `/summary` sub-routes, and/or the 2 deferred `/lifestyle` sub-routes.**
>
> **On "continue": Phase 3 `web` in progress — public/auth path + the first protected route + ALL FOUR
> WORKSPACE TABS done (2026-06-29): `splash` + `login` + `forgot-password` + `reset-password` + `create-account`
> + `programs` + `summary` + `members` + `lifestyle` + `program`.** The auth-recovery path is END-TO-END (forgot → email → reset → login).
> **The `program` page (10th web page, 4th & LAST WORKSPACE TAB `/program`) is DONE** (2026-06-29): faithful 1:1 port of
> the legacy **program settings hub** — a role-gated menu (program info/edit · members/invite · role management · workout
> types · leave · my account) for admins, or a **read-only** program-info card (name/status/duration/client-computed
> progress/active-count) + switch/leave for non-admins. Only **Leave Program** (`PUT /program-memberships/leave`) +
> **Sign Out** are live actions on the landing; everything else is forward-nav. **`admin_only_data_entry` N/A** (no data
> entry — it's settings). **D-SCOPE** = landing only (6 `/program/*` sub-routes `edit/roles/profile/password/appearance/
> privacy` deferred as their own rows). **D-S1** faithful + 2 pinned cleanups: **D-C1** appearance label via the
> foundation's `getStoredTheme()` (was raw `localStorage`), **D-C2** extract the byte-identical duplicated
> `LeaveProgramButton`; **D-C3** keep `computeProgramProgress` local (client-computed, distinct from summary's
> server-derived progress — run-11). **Zero new deps, zero backend work, NO feature bump** — all api modules / 5 `ui/`
> components / 11 icons / format-storage-theme helpers already ported, both endpoints already mounted. The bottom-nav
> `/program` tab (already wired in `shell.tsx`) now resolves — **all 4 workspace tabs are live.** Flagged F1–F6 (client
> JWT-decode role; forward-nav to unbuilt routes; global_admin can't leave; client-computed progress; raw `rf:appearance`
> write contract owned by the appearance sub-route; no client throttle). `npm run build` ✓ (`/program` prerendered,
> 4.36 kB — no Recharts; Middleware 27.3 kB active). **All this session's work committed via `git-version` next; lessons
> run 24 appended.** **NEXT = the SUB-ROUTE layer — the workspace landing layer is now complete:** the 6 deferred
> `/program/*` sub-routes, the 8 deferred `/members` sub-routes, the 6 deferred `/summary` sub-routes, and/or the 2
> deferred `/lifestyle` sub-routes.
> **The `lifestyle` page (9th web page, 3rd WORKSPACE TAB `/lifestyle`) is DONE** (2026-06-29): faithful 1:1 port of
> the legacy lifestyle dashboard — NOT a sleep/diet logging screen but a **read-only** workout-type-analytics +
> health-timeline overview with the same role-gated **"view as"** picker as Members (admin/global-admin view-as any
> member or program-wide "None"; logger/member own data, no picker). 4 workout-type stat cards (total / most-popular /
> longest-duration / highest-participation) + a sleep/diet `ComposedChart` timeline card (→ deferred `/lifestyle/timeline`)
> + a sortable workout-type popularity list (count/total-min/avg toggle + top-10/show-all). The header pill flips
> "Manage workouts"/"View workouts" by `canAddWorkouts` but both nav to the deferred `/lifestyle/workouts` (the write path
> where `admin_only_data_entry` actually bites). **Read-only** → `admin_only_data_entry` **N/A** here. **D-SCOPE** =
> landing page only (the 2 sub-routes `/lifestyle/{workouts,timeline}` deferred as their own rows). **D-S1** faithful 1:1
> + **D-C1** port whole `lib/api/lifestyle.ts` verbatim (6 fns over already-mounted `analytics`/`analytics-v2` routes) +
> **D-C2** port `ui/EmptyState.tsx` verbatim (new 10-line primitive). **Zero backend work, no feature bump** — all 6
> endpoints already mounted (`server.js:74-76`). The page-local `MemberPickerModal` is a near-dup of the Members one;
> the user chose port-local-copy + flag (F6) over extracting a shared component (the Members picker was de-dup'd into a
> 2-variant `activePicker` form, so sharing would add branches). Flagged F1–F7 (client JWT-decode role; forward-nav to
> unbuilt routes; `sessionStorage` view-as + 2 effects; highest-participation always program-wide; over-fetched
> client-sorted popularity; duplicated picker; no client throttle). `npm run build` ✓ (`/lifestyle` prerendered, 13.6 kB
> — Recharts; Middleware 27.3 kB active). **All this session's work committed via `git-version` next; lessons run 23
> appended.** **NEXT = the last workspace tab `/program` (settings), the 8 deferred `/members` sub-routes, the 6 deferred
> `/summary` sub-routes, and/or the 2 deferred `/lifestyle` sub-routes (`workouts`/`timeline`).**
> **NEXT = the 8 deferred `/members` sub-routes** (`list` / `detail` / `invite` / `metrics` / `history` /
> `streaks` / `workouts` / `health`), **the 6 deferred `/summary` sub-routes** (3 detail: `activity` /
> `distribution` / `workout-types`; 3 mobile log fallbacks: `log-workout` / `log-health` / `bulk-log-workout`),
> **and/or the remaining sibling tabs** (`/lifestyle`, `/program` settings). The **`members` page (8th web page,
> 2nd WORKSPACE TAB) is DONE** (2026-06-29): faithful 1:1 port of the legacy member-overview dashboard — **NOT a
> roster-management screen** but a per-member performance view with a role-gated **"view as"** picker
> (admin/global-admin view-as any member with an optional "None"; logger own cards + a logs-scoped view-as;
> member own cards incl. a Metrics-single card). **Read-only** → `admin_only_data_entry` is **N/A** here; every
> non-card control is forward-nav to a deferred sub-route (F2). **D-SCOPE** = landing page only (8 sub-routes
> deferred as their own rows). **D-S1** faithful + **2 pinned cleanups**: **D-C1** ported the one new dep
> `lib/api/members.ts` whole (verbatim; the 3 unused fns — `fetchMemberProfile`/`updateMemberProfile`/
> `sendProgramInvite` — serve the deferred detail/invite sub-routes), **D-C2** hoisted page-local `formatDuration`
> → `lib/format.ts` (single-sources it for the deferred `/workouts`+`/history`), **D-C3** de-dup'd the two
> `MemberPickerModal` render blocks into one `activePicker`-discriminant render (behavior-preserving — the admin +
> logger pickers are mutually exclusive, with the admin path's `allowNone`/`"none"`-storage nuance kept). All
> backend endpoints already mounted (member-{metrics,history,streaks,recent} + daily-health-logs +
> program-memberships) — **zero backend work, no feature bump**. The page corrected an Explore agent's "roster
> management" inference (verified the landing file myself — the CRUD lives in the deferred sub-routes). Flagged
> F1–F7 (client JWT-decode role; forward-nav to unbuilt routes; `sessionStorage` view-as + 4 parallel effects;
> vestigial-here api fns; over-fetched metrics preview; two near-duplicate metric renderers; no client throttle).
> `npm run build` ✓ (`/members` prerendered, 7.78 kB — Recharts; Middleware 27.3 kB active). **All this session's
> work committed via `git-version` next; lessons run 22 appended.** The **`summary` page (7th web page, first
> WORKSPACE TAB) is DONE** (2026-06-29): faithful 1:1 port of the legacy program-overview dashboard — program-progress gauge,
> activity-timeline chart, 4 MTD stat cards (participation/total-workouts/total-duration/avg-duration),
> distribution chart, workout-types list — **plus the desktop write path**: the 3 log-form modals (Add workout
> / Bulk add / Log daily health). **D-SCOPE** = landing + 3 forms this run; the 6 sub-route pages deferred
> (links to them are forward-nav, F2). **D-S1** faithful + **D-C1** one typed cleanup (`ProgramProgressCard`
> `any`→`AnalyticsSummary`). Reached via the hub's `saveActiveProgram` → `/summary`; `useAuthGuard()` (default
> `requireProgram:true`) bounces to `/programs` with no active program; the `shell.tsx` bottom-nav (Summary/
> Members/Lifestyle/Program) is now active. Role gating: global_admin/admin/logger see Bulk-add + may log for
> any member; a member sees Add+Health only + logs for self; `admin_only_data_entry` → lock banner + disabled
> cards (backend `requireDataEntryAllowed` is the real guard). Ported deps verbatim: `lib/api/{summary,logs,
> program-workouts}.ts` + `components/ui/{ErrorState,Input,Button}.tsx` + `components/forms/{LogWorkoutForm,
> BulkLogWorkoutForm,LogDailyHealthForm}.tsx`. All 11 backend endpoints already mounted (`server.js:73-76`).
> Flagged F1–F7 (client JWT-decode role; forward-nav to unbuilt routes; vestigial-here api fns; week-only
> landing period; over-fetched summary fields; dead form `variant="page"`; no client rate-limit). `npm run
> build` ✓ (`/summary` prerendered, 107 kB — Recharts; Middleware 27.2 kB active). **All this session's work
> committed via `git-version` next; lessons run 21 appended.** The **`programs` hub (6th web page, first
> PROTECTED route) is DONE**: faithful 1:1 port of the legacy post-login hub — `My Programs` list of
> `ProgramCard`s (status/progress/member-counts + invite Accept/Decline + admin Edit/Delete), the Program
> Actions modal (Invites + Create tabs), the Account modal (5 rows), and the Edit/Delete/SignOut/Decline
> confirm modals. **Resolved the standing `middleware.ts` HS256→ES256 open question (D-C1): edge = decode +
> expiry only** (UX redirect gate; the Express backend JWKS-verifies ES256 on every API call + owns all authz,
> so dropping edge signature-verify doesn't weaken security and avoids a per-nav JWKS fetch; `JWT_SECRET`
> dependency dropped). **D-C2** ported the dragged-in deps verbatim — whole `lib/api/{programs,invites}.ts`
> api modules + the 5 `ui/{PageShell,GlassCard,Modal,ConfirmDialog,StatusBadge}` components this page needs
> (first `components/ui/` in the rebuild). **D-C3** reused the foundation's `useAuthGuard({requireProgram:false})`
> for the inline login-redirect. Faithful otherwise; F1–F6 (client JWT-decode role; forward-nav to unbuilt
> `/summary` + `/program/*`; dual invite mechanisms; edge gate doesn't verify signatures; vestigial-here api
> fns + `enrollments_closed`; no client rate-limit). `npm run build` ✓ (`/programs` prerendered, 11.3 kB;
> Middleware 27.2 kB active). The **`create-account` page (5th web page) is DONE**: faithful port of the legacy
> sign-up screen (first/last name + username + email + optional gender via the newly-ported
> `Select`/`SelectMobile` + password + confirm; **register-then-auto-login → `/programs`**, since
> `POST /auth/register` returns no token) **+ 5 deviations** — **D-C1** inline email-format validation (the
> D-PLAN item-3 mandate; `register` already requires + format-validates email server-side, so forward-only;
> reuses forgot-password's `EMAIL_RE`), **D-C2** already-authed → `/programs` redirect (legacy had none; matches
> the sibling auth pages), **D-C3** live password-policy checklist (✓/○ per rule, mirrors `validatePassword`)
> replacing the static hint, **D-C4** muted confirm-mismatch hint, **D-C5** autoFocus First Name. No auth-feature
> bump (the `register` route + `registerAccount()` client fn already existed). `npm run build` ✓
> (`/create-account` prerendered, 6.25 kB). The `reset-password` page (recovery step 2 of 2) is DONE: reads the Supabase recovery `access_token`
> from the email-link **URL fragment** (implicit flow — `config/supabase.js` `flowType: "implicit"` pinned,
> D-C5/D-C4), a **new-password + confirm form with an inline policy hint** (mirrors server `validatePassword`),
> forwards the token as **Bearer** to the **NET-NEW `POST /auth/reset-password`** (auth bumped **0.3.0→0.4.0**,
> D-C5 — reuses `authenticateToken` + the existing `changePassword`, single-sourced, no bespoke service fn),
> then **in-page success → `/login?reason=password-reset`** (a new green banner on login, login SPEC →
> v0.1.1). 401 → "request a new link"; clients never embed Supabase (R1). Still outstanding from Phase 1/2:
> provision the Vercel `rasifiters-web` project (deferred — needed before a web deploy, and the reset-link
> `redirectTo` `https://rasifiters.com/reset-password` won't have a live target until then); the **batched
> pre-cutover runtime smoke-test pass** of all ported backend features (needs a live admin JWT the user
> supplies) + a final pre-cutover migrator re-run.
>
> **On "continue": BACKEND FEATURE COVERAGE IS COMPLETE (14 features, 2026-06-29).** Every legacy backend
> route group is now SPEC'd + ported + mounted in `server.js`; `COVERAGE.md`'s backend section is fully
> ticked. **The next phase is `web`** (Build-sequence step 5): feature/page by feature/page via
> `question-asker` → spec (page/screen kind) → port code → `deploy` to a Vercel temp domain — starting with
> the public/auth path (splash → login → create-account) to prove auth end-to-end, then the programs hub.
> Before starting web, provision the Vercel `rasifiters-web` project (deferred until now — no web code
> existed). Also still outstanding: the **batched pre-cutover runtime smoke-test pass** of all ported backend
> features (needs a live admin JWT the user supplies) + a final pre-cutover migrator re-run.
>
> **`app-config` is DONE (ported 2026-06-29)** — the **last backend feature**, closing backend coverage.
> Documentation-only base: all the code was already ported (`GET /api/app-config` inline in `server.js`; the
> push/APNs device lifecycle + `pushNotifications` util landed with `notifications`; `upsert/removePushToken`
> + `member_push_tokens` + login push-capture landed with `auth`). **Scope = own app-config, reference push**
> (D-C1) — the SPEC owns the inline `GET /api/app-config` route + `MIN_IOS_VERSION` env (the iOS version gate);
> push is the §6 cross-reference index pointing to the `notifications`/`auth` SPECs (no duplication, SSOT).
> `consumed_by = [ios]` for **both** app-config and push (web ignores both — it uses SSE, not APNs, and has no
> version to check). Route kept **inline** in `server.js` (D-C1, faithful — legacy is inline). **The user
> chose "change now": 2 cleanups applied to `server.js`** — **D-C2** add `Cache-Control: public, max-age=300`
> (iOS polls the gate on every launch/foreground/widget-open) + **D-C3** trim + semver-validate
> `MIN_IOS_VERSION` via a new `normalizeMinIosVersion` (`^\d+(\.\d+)*$`, else `null`) so a malformed env yields
> no gate instead of a broken client comparison. Faithful otherwise; F1–F5 (`device_id` sent-but-always-nil by
> iOS; no logout `DELETE /device`; public route; operator-managed env; web ignores both). Syntax check + helper
> behavior verified. **Runtime smoke-test deferred to the batched pre-cutover pass.**
>
> **`member-analytics` is DONE (ported 2026-06-29)** — the per-member analytics surface, **its own file pair**
> `routes/memberAnalytics.js` (4 separate routers) + `services/memberAnalyticsService.js` (4 fns + helpers),
> distinct from the analytics/analytics-v2 pair. 4 routes at `/api/member-{metrics,history,streaks,recent}`
> (`getMemberMetrics` = per-program leaderboard with in-memory rollup → search/16-filter/sort; history =
> single-member timeline; streaks = streak + milestones; recent = the workout-history read both clients use).
> `consumed_by = [web, ios]` **all 4 routes 1:1, no divergence** (cleanest yet, like daily-health-logs).
> **Enforces per-program read authz** (`ensureProgramAccess` — unlike v1/v2 which lacked it; now F1). Faithful
> verbatim except **D-C2** (re-export the 3 timeline helpers `resolveTimelineWindow`/`buildBuckets`/`bucketKey`
> from `analyticsService.js` — restores the legacy export surface our v1/v2 port omitted; single-sourced, not
> duplicated; **touches the built `analytics` feature** → patch bump at commit) + 2 user-pinned cleanups:
> **D-C3** (extract the shared requester-access + target-enrolled prelude shared by history/streaks/recent into
> `assertMemberAccess` — 400/403/404 statuses preserved 1:1) + **D-C4** (guard null `program.start_date` in
> `getMemberStreaks`, mirroring `getMemberMetrics`' guard; only the null-start_date 500 edge changes). **No UTC
> cleanup** — dates already UTC-correct. F1–F7. Boot check passes (analyticsService re-exports the 3 helpers, 4
> service fns export, 4 routers each `GET /` = `[authenticateToken, handler]`, server loads). **Runtime
> smoke-test deferred to the batched pre-cutover pass.**
>
> **`analytics-v2` is DONE (ported 2026-06-29)** — the `v2Router` half (`/api/analytics-v2`) of the shared
> `routes/analytics.js`/`analyticsService.js`, **appended to the same files `analytics` (v1) created** (both
> halves reunited; reuses the date/bucket helpers + the 2 utils landed with v1 — no new files). **`GET /summary`
> (v2) dropped** (D-C2 — the mirror of v1's D-C2: both clients call the v1 summary `/api/analytics/summary`,
> so `getSummaryV2` is dead; it was also the only UTC-bucketing site in the v2 half, so no UTC cleanup needed).
> 5 live routes ported (participation/mtd + workouts/types/{total,most-popular,longest-duration,highest-
> participation}); `consumed_by = [web, ios]` all 1:1, no divergence. Faithful verbatim aggregation otherwise
> (D-S1). Flagged: **F1** `getParticipationMTDV2` is byte-identical to the v1 `getParticipationMTD` v1 dropped
> (now the live participation card), **F4** `getHighestParticipationWorkoutType`'s member-scoped branch is dead
> (both clients always call it program-wide), + inherited F2/F5/F6 (no per-program read authz; MTD server-local
> boundaries; `COUNT('*')`/raw-`DISTINCT` idioms). Mounted `/api/analytics-v2`. Boot check passes (v2 5-route
> stack no `/summary`, all `authenticateToken`, 5 service fns export + `getSummaryV2` absent, v1 unchanged,
> server loads). **Runtime smoke-test deferred to the batched pre-cutover pass.**
>
> **`analytics` (v1) is DONE (ported 2026-06-29)** — the `v1Router` half (`/api/analytics`) of the shared
> `routes/analytics.js`/`analyticsService.js` + the 2 analytics-only utils (`dateRange.js`/`queryHelpers.js`).
> Read-only aggregation (date-bucketing + `COUNT`/`SUM`/`GROUP BY` over the now-ported `workout_logs` +
> `daily_health_logs`, inner-joined to active memberships). **`participation/mtd` v1 dropped** (D-C2 — both
> clients use the v2 variant); 8 live routes. `consumed_by = [web, ios]` all 1:1, no divergence. Faithful
> verbatim except 2 UTC cleanups: **D-C3** distribution weekday bucketing + **D-C4** timeline labels (both
> add `timeZone:"UTC"`; unchanged on Render-UTC, just deterministic). Faithful otherwise (F1–F7: the MTD-vs-
> `period` dual window, no per-program read authz, the plain-`Error`→500 paths, `COUNT('*')` idiom). Mounted.
> Boot check passes. **Runtime smoke-test deferred to the batched pre-cutover pass.**
>
> **`daily-health-logs` is DONE (ported 2026-06-29)** — the `dailyHealthLogRouter` half
> (`/api/daily-health-logs`) of the shared `routes/logs.js`/`services/logService.js`, **appended to the same
> files `workout-logs` created** (both halves reunited). 4 routes (POST/GET/PUT/DELETE) + the 4 daily-health
> fns + `parseOptionalNumber`. `consumed_by = [web, ios]` — **all 4 routes 1:1, no divergence, no batch
> route** (cleaner than workout-logs). Faithful except 2 changes: **D-C2** reuse `workout-logs`'
> `requireDataEntryAllowed` middleware on the 3 write routes (both halves enforce the `admin_only_data_entry`
> lock identically; GET ungated; one accepted ordering nuance F4), **D-C3** tidy `updateDailyHealthLog` to a
> single `body` param (behavior identical). Faithful otherwise (one-row-per-day PK + 409-on-dup, sleep+diet
> validation, partial-update absent-vs-null, synthetic GET id; F1–F6). Mounted. Boot check passes. **Runtime
> smoke-test deferred to the batched pre-cutover pass.**
>
> **`workout-logs` is DONE (ported 2026-06-29)** — the `workoutLogRouter` half (`/api/workout-logs`) of the
> shared `routes/logs.js`/`services/logService.js`. **2 dead GET routes dropped** (`GET /` + `GET
> /member/:memberName` — called by neither client; both read history via `/api/member-recent`); the 4 live
> routes (`POST /`, `POST /batch`, `PUT /`, `DELETE /`) ported. `consumed_by = [web, ios]` — the trio
> (add/edit/delete) 1:1, **`POST /batch` web-only** (iOS loops single POSTs in its widget). **Four
> user-chosen cleanups** on the faithful base: **D-C2** positive-int single-log duration (was isNaN-only),
> **D-C3** collapse `addWorkoutLog`'s member-auth double-check, **D-C4** de-dup the membership lookups
> (incl. `deleteWorkoutLog`'s double `resolveLogPermissions`), **D-C5** hoist the `admin_only_data_entry`
> lock into a co-located `requireDataEntryAllowed` resolve-or-pass-through middleware (403 preserved; one
> accepted ordering nuance, F6/F9). Faithful otherwise (lazy `program_workouts` materialization, the batch
> summing-upsert + `rowErrors` + 200-cap, no-dup-handling single add). Mounted. Boot check passes. **Runtime
> smoke-test deferred to the batched pre-cutover pass.**
>
> **Per-feature runtime smoke-tests are DEFERRED to a single pre-cutover pass (user decision 2026-06-29)** —
> do NOT re-offer them after each port. Every ported backend feature carries a "runtime smoke-test pending"
> note; they're batched and run together near cutover (needs a live admin JWT — can't be minted, the user
> supplies it then). Boot checks (module-load + route-stack) stay the per-port gate. See Open questions.
>
> **`program-workouts` is DONE (ported + DEPLOYED 2026-06-28)** — 6 `/api/program-workouts` routes + the 6
> program-scoped fns appended to the shared `workoutService.js` (both halves reunited; D-C1). The one
> deliberate change (**D-C2**): the per-action program-admin authz was **hoisted out of the service into a
> resolve-or-pass-through `requireProgramAdmin` route guard** (status codes preserved 1:1; `GET` ungated).
> `consumed_by = [web, ios]`, all 6 routes 1:1 (no divergence); `GET` also feeds the log forms + iOS widget.
> Faithful otherwise (merge/dual-id/lazy-materialization/dedup/in-use-guard kept + flagged F1–F7). Mounted +
> auto-deployed (Render); route confirmed live (`GET` no-token → 401, was 404 pre-mount). **Runtime
> smoke-test deferred to the batched pre-cutover pass.**
>
> **`workouts` (the library) is DONE (ported 2026-06-28)** — 4 `/api/workouts` routes + the 4 library fns
> split out of the shared service; `POST /mobile` dropped (byte-dup, D-C2); `consumed_by = [ios]` (GET-only
> live — web's `fetchWorkouts` is dead, admin CRUD called by neither client, D-REF). Faithful otherwise
> (bare unguarded delete kept + flagged F2). Mounted. **Pending:** runtime smoke-test vs live Supabase.
>
> **The two deferred 501 delete cascades are DONE (wired 2026-06-28)** — `members DELETE /:id` + auth
> `DELETE /account` now run the shared `utils/programMemberships.cascadeMemberDeletion` (destroy outbound
> invites + actored notifications, `handleMemberExit` per active membership/created program, notify remaining
> members, destroy the member) + best-effort Supabase `admin.deleteUser` after commit. Single-sourced, shared
> verbatim by both callers; live notification emits fire (notifications + invites ported). Both SPECs bumped
> 0.1.0→0.2.0. **Pending:** runtime smoke-test vs live Supabase (Render auto-deploy on push).
>
> **`invites` is DONE (ported 2026-06-28)** — 4 routes co-mounted at `/api/program-memberships`; the first
> feature with **live** emits (no deferred stub — the keystone realized). Faithful except two cleanups
> (dropped `target_member_id` D-C3a; batched `getAllInvites` N+1 D-C3b). Pending: runtime smoke-test vs live
> Supabase (Render auto-deploy on push).

**Phase 2 — backend.** Point the Express app at Supabase + swap auth to verify Supabase JWTs:
1. ~~Spec the backend **`auth`** feature via `question-asker`.~~ **DONE 2026-06-28** — see
   [`specs/features/auth/SPEC.md`](specs/features/auth/SPEC.md) v0.1.0 (decisions D-C1 whole-module scope /
   D-C2 JWKS+per-request DB-lookup verify / D-C3 clients-unchanged proxy / D-S1 faithful; flagged F1–F7).
   Registry + COVERAGE ticked.
2. ~~Port the backend foundation + `auth` feature into `apps/backend/`.~~ **DONE 2026-06-28** — data
   layer (13 models + index, `config/database.js`→`DATABASE_URL`, response/errorHandler) + auth slice
   (`config/supabase.js`, JWKS-verify `middleware/auth.js`, `services/authService.js`, `routes/auth.js`,
   `server.js` mounting only `/api/auth`). `npm install` + boot-check pass. **Two follow-ups carried**
   below (`/account` 501; asymmetric JWT keys).
3. ~~Provision Render + deploy the auth backend + smoke-test login→verify→refresh→logout.~~ **DONE +
   VERIFIED 2026-06-28** — live at `https://rasifiters-api.onrender.com` (`srv-d90tgmv7f7vs73cudptg`);
   full round-trip green against migrated data (see auth SPEC §12 / session log). Service id recorded in
   `CONTEXT.md` + the `deploy-scope-guard.sh` allow-list; auth status flipped 🏗️→🚀.
4. ~~Spec + port `members`.~~ **DONE 2026-06-28** — see [`specs/features/members/SPEC.md`](specs/features/members/SPEC.md)
   v0.1.0 (📄→🏗️). Ported `services/memberService.js` + `routes/members.js`, mounted `/api/members`. Faithful
   except the one deliberate change **D-C2** (`createMember` now creates a loginable member via Supabase
   `admin.createUser` + requires `email`); `DELETE /:id` deferred → 501 (**D-C1**, the auth `/account`
   pattern); `getAllMembers` excludes the migration-added `auth_user_id`. `POST`+`DELETE` are vestigial
   (called by neither client — **D-REF**). Boot check passes; **runtime smoke-test vs live Supabase pending**.
5. ~~Spec + port `programs`.~~ **DONE 2026-06-28** — see [`specs/features/programs/SPEC.md`](specs/features/programs/SPEC.md)
   v0.1.0 (🏗️ built — SPEC + ported). Four `/api/programs` routes; ported `services/programService.js` +
   `routes/programs.js`, mounted `/api/programs`. Faithful except the one deliberate cleanup **D-C2**
   (`createProgram` drops the vestigial `description` field — sent by no client, unupdatable, never returned);
   the `program.updated`/`program.deleted` notification emit is **deferred** → guarded `emitProgramNotification`
   no-op (**D-C1**, wired when `notifications` lands — CRUD fully functional); `getPrograms` keeps its two raw
   SQL branches verbatim (**D-S2**); `admin_only_data_entry` is web-only (**D-REF**). Boot check passes;
   **runtime smoke-test vs live Supabase pending** (the Render auto-deploy on push).
6. ~~Spec + port `program-memberships`.~~ **DONE 2026-06-28** — see
   [`specs/features/program-memberships/SPEC.md`](specs/features/program-memberships/SPEC.md) v0.1.0 (🏗️ built).
   6 of 8 routes ported (`createMemberAndEnroll` fixed→loginable **D-C2**; `getAvailableMembers`+`enrollMember`
   dropped as dead routes **D-C3**); `handleMemberExit` cascade ported (`utils/programMemberships.js`);
   notification emits deferred via a **deferred stub** `utils/notifications.js` (**D-C4**); invite-table writes
   ported. Mounted `/api/program-memberships`. Boot check passes. **Runtime smoke-test vs live Supabase pending.**
7. ~~Spec + port `notifications`.~~ **DONE 2026-06-28** — see [`specs/features/notifications/SPEC.md`](specs/features/notifications/SPEC.md)
   v0.1.0 (🏗️ built). 6 `/api/notifications` routes + the emit engine; **replaced the deferred
   `utils/notifications.js` stub** with the real `createNotification` (DB write + transactional SSE/APNs
   dispatch) + ported `utils/{notificationStreams,pushNotifications}.js` (added `apn` dep). Faithful except
   **D-C2** (the one migration delta — SSE stream auth migrated symmetric `jwt.verify` → Supabase JWKS via a
   shared `resolveReqUser` in `middleware/auth.js`, keeping the `?token=` query path) and **D-C4** (APNs creds
   deferred → `APNS_*` declared `sync:false` in `render.yaml`, push no-ops gracefully). `POST /broadcast` kept
   vestigial (no client, F1). Mounted `/api/notifications`. Boot check passes. **The keystone unblock:** the
   programs/program-memberships emit call sites now fire unchanged. **Runtime smoke-test vs live Supabase pending.**
8. ~~Spec + port `invites`.~~ **DONE 2026-06-28** — see [`specs/features/invites/SPEC.md`](specs/features/invites/SPEC.md)
   v0.1.0 (🏗️ built). 4 routes (`POST /invite`, `GET /my-invites`, `GET /all-invites`, `PUT /invite-response`)
   **co-mounted at `/api/program-memberships`** (`server.js` — `inviteRoutes` alongside `membershipRoutes`,
   mirroring legacy `server.js:50`); ported `services/inviteService.js` + `routes/invites.js`. The
   `ProgramInvite`/`ProgramInviteBlock` models + associations were already ported (with program-memberships).
   **The keystone realized:** `program.invite_received`/`program.member_joined` emits wired **live** (D-C2,
   no stub — notifications is ported). Faithful except two cleanups: dropped vestigial `target_member_id`
   (D-C3a) + batched `getAllInvites`' N+1 into one query (D-C3b); accept-path `ProgramMembership` write stays
   inline (D-C1). Boot check (4-route stack, emit engine wired, `InvitedByMember` assoc) passes.
   **Runtime smoke-test vs live Supabase pending.**
9. ~~Wire the two deferred 501 delete cascades.~~ **DONE 2026-06-28** — `members DELETE /:id` (members SPEC
   v0.2.0) + auth `DELETE /account` (auth SPEC v0.2.0) now run the shared
   `utils/programMemberships.cascadeMemberDeletion` + best-effort Supabase `admin.deleteUser` after commit.
   The cascade is single-sourced (owned by program-memberships, it drives `handleMemberExit`) and shared
   verbatim by both callers; the global-admin guard, 404, transaction, and success message stay per-caller.
   Boot check passes. **Runtime smoke-test vs live Supabase pending** (Render auto-deploy on push).
10. ~~Spec + port `program-workouts`.~~ **DONE 2026-06-28** — see
    [`specs/features/program-workouts/SPEC.md`](specs/features/program-workouts/SPEC.md) v0.1.0 (🏗️ built).
    6 `/api/program-workouts` routes + the 6 program-scoped fns appended to the shared `workoutService.js`
    (both halves reunited, D-C1). One deliberate change **D-C2** (per-action admin authz hoisted into a
    resolve-or-pass-through `requireProgramAdmin` route guard; service authz-free; status codes preserved;
    `GET` ungated). `consumed_by = [web, ios]` all 6 routes 1:1 (D-REF). Faithful otherwise (D-S1, F1–F7).
    Mounted. Boot check passes. **Runtime smoke-test vs live Supabase pending.**
11. ~~Spec + port `workout-logs`.~~ **DONE 2026-06-29** — see
    [`specs/features/workout-logs/SPEC.md`](specs/features/workout-logs/SPEC.md) v0.1.0 (🏗️ built). The
    `workoutLogRouter` half of the shared `routes/logs.js`/`services/logService.js`; **2 dead GET routes
    dropped** (called by neither client, D-C1); the 4 live routes mounted `/api/workout-logs`. Four
    user-chosen cleanups (D-C2 positive-int duration / D-C3 collapse double-check / D-C4 de-dup membership
    lookups / D-C5 hoist the `admin_only_data_entry` lock to a `requireDataEntryAllowed` middleware);
    `consumed_by = [web, ios]`, `POST /batch` web-only. Faithful otherwise (F1–F9). Boot check passes.
    **Runtime smoke-test pending.**
12. ~~Spec + port `daily-health-logs`.~~ **DONE 2026-06-29** — see
    [`specs/features/daily-health-logs/SPEC.md`](specs/features/daily-health-logs/SPEC.md) v0.1.0 (🏗️ built).
    The `dailyHealthLogRouter` half of the shared `logs.js`/`logService.js`, appended to the file pair
    `workout-logs` created (both halves reunited). 4 routes at `/api/daily-health-logs`; `consumed_by =
    [web, ios]` all 4 routes 1:1, no divergence. Two changes (D-C2 reuse `requireDataEntryAllowed` on the 3
    writes; D-C3 single-`body` PUT signature); faithful otherwise (F1–F6). Boot check passes. **Runtime
    smoke-test pending.**
13. ~~Spec + port `analytics` (v1).~~ **DONE 2026-06-29** — see
    [`specs/features/analytics/SPEC.md`](specs/features/analytics/SPEC.md) v0.1.0 (🏗️ built). The `v1Router`
    half of the shared `routes/analytics.js`/`analyticsService.js` + the 2 analytics-only utils
    (`dateRange.js`/`queryHelpers.js`). 8 routes at `/api/analytics` (dead `participation/mtd` dropped per
    D-C2 — both clients use the v2 variant); `consumed_by = [web, ios]` all 1:1. Read-only verbatim except 2
    UTC cleanups (D-C3 distribution bucketing + D-C4 timeline labels). Faithful otherwise (F1–F7). Boot check
    passes. **Runtime smoke-test pending.**
14. ~~Spec + port `analytics-v2`.~~ **DONE 2026-06-29** — see
    [`specs/features/analytics-v2/SPEC.md`](specs/features/analytics-v2/SPEC.md) v0.1.0 (🏗️ built). The
    `v2Router` half of the shared `routes/analytics.js`/`analyticsService.js`, appended to the v1 files (both
    halves reunited; reuses the helpers + 2 utils landed with v1). **`GET /summary` (v2) dropped** (D-C2 — the
    mirror of v1's D-C2: both clients use the v1 summary; `getSummaryV2` dead). 5 live routes at
    `/api/analytics-v2`; `consumed_by = [web, ios]` all 1:1, no divergence. Faithful verbatim (D-S1); F1–F6.
    Boot check passes. **Runtime smoke-test pending.**
15. ~~Spec + port `member-analytics`.~~ **DONE 2026-06-29** — see
    [`specs/features/member-analytics/SPEC.md`](specs/features/member-analytics/SPEC.md) v0.1.0 (🏗️ built). Its
    **own file pair** — `routes/memberAnalytics.js` (4 separate routers) + `services/memberAnalyticsService.js`
    (4 fns + helpers), distinct from analytics/analytics-v2. 4 routes at `/api/member-{metrics,history,streaks,
    recent}`; `consumed_by = [web, ios]` all 4 routes 1:1, **no divergence**. **Enforces per-program read authz**
    (`ensureProgramAccess`, F1 — unlike v1/v2). Faithful verbatim except **D-C2** (re-export the 3 timeline
    helpers from `analyticsService.js` — restores the legacy export surface; touches the built `analytics`
    feature → patch bump) + 2 cleanups **D-C3** (extract the shared access prelude) + **D-C4** (guard null
    `start_date` in streaks). No UTC cleanup. Boot check passes. **Runtime smoke-test pending.**
16. ~~Spec + port `app-config` + push.~~ **DONE 2026-06-29** — see
    [`specs/features/app-config/SPEC.md`](specs/features/app-config/SPEC.md) v0.1.0 (🏗️ built). The **last
    backend feature** — owns the inline `GET /api/app-config` (`min_ios_version`, the iOS version gate) +
    `MIN_IOS_VERSION` env; push (APNs) is the §6 cross-reference index (already owned by `notifications`/`auth`,
    not re-documented). `consumed_by = [ios]` (web ignores both). Route kept inline (D-C1); 2 user-pinned
    cleanups applied to `server.js` — D-C2 `Cache-Control: public, max-age=300` + D-C3 trim/semver-validate
    `MIN_IOS_VERSION` (malformed → `null`). F1–F5. Syntax + helper verified. **Backend feature coverage complete
    (14 features).** Runtime smoke-test deferred to the batched pre-cutover pass.
17. **NEXT — Phase 3: `web`.** Provision the Vercel `rasifiters-web` project, then spec (page/screen kind via
    `question-asker`) + port the web app feature/page by feature/page → `deploy` to a Vercel temp domain.
    Start with the public/auth path (splash → login → create-account) to prove auth end-to-end, then the
    programs hub. See Build sequence step 5.

Re-run `tools/migrator/ → npm run migrate` right before cutover to sync any rows that changed on the legacy
app in the meantime (it's the pre-cutover sync, idempotent).

## Build sequence (the locked plan — see `METHODOLOGY.md`)

1. [x] **Scaffold the ICM repo** (L1–L5 + skills + hooks). _DONE 2026-06-28._
2. [~] **Provision infra** — Supabase DONE 2026-06-28. **Render `rasifiters-api` PROVISIONED + LIVE
       2026-06-28** (`srv-d90tgmv7f7vs73cudptg`, Blueprint `apps/backend/render.yaml`, id recorded in
       `CONTEXT.md` + the deploy-scope hook). Vercel `rasifiters-web` deferred until the web app has code.
3. [x] **Migrator** (`tools/migrator/`) — BUILT + EXECUTED against Supabase 2026-06-28. Preserved
       `members.id` UUIDs, imported bcrypt hashes → `auth.users` (48/48), backfilled `members.auth_user_id`,
       idempotent re-runnable sync. Schema in `apps/backend/sql/001_schema.sql` (applied). _DONE._
4. [~] **`backend`** — point Express at Supabase, swap auth middleware to verify Supabase JWTs (proxy
       login/refresh/logout), deploy to Render (Blueprint). Spec features as we go. _Auth feature SPEC'd
       (v0.1.0) + PORTED + **DEPLOYED to Render + verified live 2026-06-28** (`/api/auth` 🚀). `members`
       SPEC'd + ported (🏗️); `programs` SPEC'd + ported (📄, `/api/programs` mounted). Remaining backend
       features (program-memberships, invites, logs, workouts, notifications, analytics…) pending._
5. [~] **`web`** — feature/page by feature/page (`question-asker` → spec → port code → `deploy` to Vercel
       temp domain). Proves the auth path end-to-end. _Foundation scaffold ported + builds green 2026-06-29
       (`apps/web`); **10 pages done** — public/auth path (splash → login → forgot → reset → create-account)
       + the `programs` hub (first protected route; resolved the middleware HS256→ES256 decision) + ALL FOUR
       workspace tabs: `summary` (read overview + desktop log-form modals) + `members` (per-member overview +
       role-gated "view as" picker, read-only) + `lifestyle` (read-only workout-type analytics + health-timeline
       overview) + `program` (4th & last tab — the settings hub: role-gated menu / non-admin read-only card +
       Leave + Sign Out; all 4 bottom-nav tabs now resolve). **The workspace landing layer is complete + the
       SUB-ROUTE layer is advancing** — `program/edit` (admin-only details form → `PUT /programs/:id`; faithful +
       3 cleanups; ported shared chrome `ui/PageHeader.tsx` + `BackButton.tsx`) + `program/roles` (admin-only
       role-management list → `PUT /program-memberships`; faithful + 3 cleanups: tokenize colors / optimistic
       update / disable-all-while-pending; ported shared chrome `ui/LoadingState.tsx`) + `program/profile` (the
       user's own "My Profile" account page — NOT admin-gated; first/last name + gender + Delete Account → `PUT
       /members/:id` + `DELETE /auth/account`; faithful + 2 cleanups: tokenize success color / clear stale message
       on edit; **no new deps — purest shape**) done. Next: the remaining 3 `/program/*` sub-routes (password ·
       appearance · privacy), the 8 deferred `/members` sub-routes, the 6 deferred `/summary` sub-routes, and/or
       the 2 deferred `/lifestyle` sub-routes._
6. [ ] **`ios`** — feature/screen by feature/screen.
7. [ ] **Cutover** — switch `rasifiters.com` (Vercel) + ship the iOS build.

## Coverage snapshot

- Shared features documented: **14** — `auth` (🚀 v0.4.0), `members` (🏗️ v0.2.0), `programs` (🏗️), `program-memberships` (🏗️ v0.2.0), `notifications` (🏗️), `invites` (🏗️), `workouts` (🏗️ `[ios]`), `program-workouts` (🏗️ `[web, ios]`), `workout-logs` (🏗️ `[web, ios]`), `daily-health-logs` (🏗️ `[web, ios]`), `analytics` (🏗️ `[web, ios]`), `analytics-v2` (🏗️ `[web, ios]`), `member-analytics` (🏗️ `[web, ios]`), `app-config` (🏗️ `[ios]`) — **backend feature coverage complete** (see `specs/features/REGISTRY.md`)
- Web page specs: **13** — `splash` (🏗️ v0.1.0 `[web]`), `login` (🏗️ v0.1.1 `[web]` — faithful + ONE
  addition: "Forgot password?" link → `/forgot-password`; + the `password-reset` confirmation banner),
  `forgot-password` (🏗️ v0.1.0 `[web]` — **net-new**: always-send + always-visible `mailto:` fallback +
  inline email validation; calls `POST /auth/forgot-password`, auth v0.3.0), `reset-password` (🏗️ v0.1.0
  `[web]` — **net-new** recovery step 2: implicit-flow fragment token → new+confirm form → `POST
  /auth/reset-password`, auth v0.4.0; the recovery path is now end-to-end), `create-account` (🏗️ v0.1.0
  `[web]` — faithful port + 5 deviations: inline email validation D-C1 (D-PLAN item 3), authed → `/programs`
  redirect D-C2, live password checklist D-C3, muted mismatch hint D-C4, autoFocus D-C5; register-then-auto-login
  → `/programs`; ported the `Select`/`SelectMobile` dependency; no auth-feature bump), `programs` (🏗️ v0.1.0
  `[web]` — **first PROTECTED route**: faithful 1:1 hub port + D-C1 middleware = decode+expiry only (resolves
  HS256→ES256), D-C2 deps ported verbatim (`lib/api/{programs,invites}.ts` + `ui/{PageShell,GlassCard,Modal,
  ConfirmDialog,StatusBadge}`), D-C3 reuse `useAuthGuard`), `summary` (🏗️ v0.1.0 `[web]` — **first WORKSPACE
  TAB** `/summary`: faithful 1:1 program-overview dashboard (progress gauge + activity-timeline + 4 MTD stat
  cards + distribution + workout-types) + the 3 desktop log-form modals; D-SCOPE = landing + 3 forms (6
  sub-routes deferred), D-S1 faithful, D-C1 one typed cleanup (`ProgramProgressCard` `any`→`AnalyticsSummary`);
  consumes `analytics`/`analytics-v2` (8 reads) + `workout-logs`/`daily-health-logs` (3 writes); ported deps
  `lib/api/{summary,logs,program-workouts}.ts` + `ui/{ErrorState,Input,Button}` + `forms/{LogWorkoutForm,
  BulkLogWorkoutForm,LogDailyHealthForm}`), `members` (🏗️ v0.1.0 `[web]` — **2nd WORKSPACE TAB** `/members`:
  NOT roster-management — a per-member overview with a role-gated **"view as"** picker (admin/global-admin
  view-as any member + optional "None"; logger own + logs-scoped view-as; member own + Metrics-single card);
  **read-only** so `admin_only_data_entry` N/A; D-SCOPE = landing only (8 sub-routes deferred), D-S1 faithful +
  D-C1 port whole `lib/api/members.ts` verbatim + D-C2 hoist `formatDuration`→`lib/format.ts` + D-C3 de-dup the
  two `MemberPickerModal` blocks; consumes `member-analytics`/`daily-health-logs`/`program-memberships`/`auth`;
  no feature bump), `lifestyle` (🏗️ v0.1.0 `[web]` — **3rd WORKSPACE TAB** `/lifestyle`: NOT a sleep/diet
  logging screen — a **read-only** workout-type-analytics + health-timeline overview with the same role-gated
  **"view as"** picker as Members (admin/global-admin view-as any member or program-wide "None"; logger/member
  own data, no picker); 4 workout-type stat cards + a sleep/diet `ComposedChart` timeline card + a sortable
  popularity list; **read-only** so `admin_only_data_entry` N/A; D-SCOPE = landing only (2 sub-routes
  `/lifestyle/{workouts,timeline}` deferred), D-S1 faithful + D-C1 port whole `lib/api/lifestyle.ts` verbatim +
  D-C2 port `ui/EmptyState.tsx` verbatim; consumes `analytics`/`analytics-v2`/`program-memberships`/`auth`, all
  endpoints already mounted, no feature bump), `program` (🏗️ v0.1.0 `[web]` — **4th & LAST WORKSPACE TAB**
  `/program`: the **settings hub** — role-gated menu (program info/edit · members/invite · role management · workout
  types · leave · my account) for admins, or a **read-only** program-info card + switch/leave for non-admins; only
  **Leave Program** + **Sign Out** are live, all else forward-nav; **read-only-ish** so `admin_only_data_entry` N/A;
  D-SCOPE = landing only (6 `/program/*` sub-routes deferred), D-S1 faithful + D-C1 appearance label via
  `getStoredTheme()` + D-C2 extract duplicated `LeaveProgramButton` + D-C3 keep `computeProgramProgress` local;
  consumes `program-memberships`/`program-workouts`/`auth`, all endpoints already mounted, **no new deps, no feature
  bump**), `program/edit` (🏗️ v0.1.0 `[web]` — **SUB-ROUTE 1/6** of `/program/*`: the **admin-only**
  edit-program-details form (name · status · start/end date · `admin_only_data_entry` toggle → `PUT /programs/:id`
  → back to `/program`); non-admins redirected, backend 403 + live `program.updated` emit; D-SCOPE this page only,
  D-DEPS port `ui/PageHeader.tsx` + `BackButton.tsx` verbatim (shared chrome for all 6 sub-routes), D-S1 faithful +
  D-C1 client date-range validation + D-C2 hydrate active-program from server response + D-C3 skip no-op PUT;
  consumes `programs`/`auth`, **no new api modules, no feature bump**), `program/roles` (🏗️ v0.1.0 `[web]` —
  **SUB-ROUTE 2/6** of `/program/*`: the **admin-only** role-management list (active members → Admin/Logger/Member
  buttons → `PUT /program-memberships`); non-admins redirected, backend 403 + "last admin" 400 + live
  `program.role_changed` emit; D-SCOPE this page only, D-DEPS port `ui/LoadingState.tsx` verbatim (shared chrome),
  D-S1 faithful + D-C1 tokenize role-button colors (`rf-warning`/`rf-info`/`rf-text-muted`) + D-C2 optimistic role
  update + D-C3 disable all buttons while in flight; consumes `program-memberships`/`auth`, **api modules already
  ported, no feature bump**), `program/profile` (🏗️ v0.1.0 `[web]` — **SUB-ROUTE 3/6** of `/program/*`: NOT a
  program-admin setting but the signed-in user's **own "My Profile" account page** (first/last name + gender +
  Delete Account) — no admin redirect, all roles, only Delete hidden from global_admin; Save → `PUT /members/:id`,
  Delete → `DELETE /auth/account` cascade → `signOut` → `/login`; D-SCOPE this page only, **D-DEPS = no new
  dependency** (purest shape — every dep already ported; members api fns were ported "vestigial-here" with
  `/members`, run 22), D-S1 faithful + D-C1 tokenize success color → `rf-success` (avatar amber kept, F2) + D-C2
  clear stale success/error on field edit; consumes `members`/`auth`, **no feature bump**) · iOS screen specs: **0**
  (see `specs/pages/REGISTRY.md`) — _public/auth path COMPLETE + first protected route + ALL FOUR workspace tabs done
  (workspace landing layer complete); the SUB-ROUTE layer is advancing (`program/edit` · `roles` · `profile` done);
  next = the remaining 3 `/program/*` (password · appearance · privacy), the 8 deferred `/members`, the 6 deferred
  `/summary`, and/or the 2 deferred `/lifestyle` sub-routes; see Next action_
- Legacy surface coverage: see `COVERAGE.md` (all unchecked)

## Open questions (carry until resolved)

- **Runtime smoke-tests of ported backend features are BATCHED to a pre-cutover pass (decided 2026-06-29).**
  Don't re-offer a smoke-test after each feature port — every "🏗️ built" feature carries a standing
  "runtime smoke-test pending" note and they're verified together near cutover (Build-sequence step 7).
  Needs a live admin JWT (ES256/Supabase-signed — can't be minted by Claude; the user supplies a token or
  admin credentials at that time). Boot checks (module-load + route-stack) remain the per-port gate. Live
  routes confirmed mounted via unauthenticated probes as they deploy (`program-workouts`: `GET` no-token →
  401, 2026-06-28).
- ~~**Migrator — members without a primary email:** placeholder vs skip?~~ **RESOLVED 2026-06-28** —
  placeholder (`<username>@no-email.rasifiters.com`). Affects exactly 1 row (the `admin` account); keeps
  admin able to sign in. **Gap found + fixed during deploy verify:** the migrator wrote the placeholder to
  `auth.users` but NOT to `member_emails`, so admin 401'd at login (no email to resolve) → backfilled via
  `apps/backend/sql/002_*.sql` (user ran it) + patched `tools/migrator/src/importAuth.js` to write the row.
- **iOS auth approach:** backend-proxy (clients ~unchanged) vs embed `supabase-swift`. Leaning proxy.
- ~~**Web edge middleware vs Supabase ES256 (NEW 2026-06-29):** `apps/web/src/middleware.ts` ported faithfully
  but verifies HS256; auth migrated to Supabase ES256, so it would mark every real session invalid → redirect
  loop.~~ **RESOLVED 2026-06-29 (option b)** with the `programs` page port (its D-C1): the edge middleware is
  now **decode + expiry only** — a UX redirect gate, not the security boundary. The Express backend
  JWKS-verifies (ES256) **every** API call + owns all authz (CLAUDE.md auth model — not RLS), so dropping edge
  signature-verify doesn't weaken security and avoids a per-navigation JWKS fetch; the `JWT_SECRET` dependency
  is gone. `npm run build` ✓ (Middleware 27.2 kB active). See `apps/web/CONTEXT.md` §Foundation port +
  `specs/pages/web/programs/SPEC.md` D-C1.
- ~~**Two deferred delete cascades return 501** — `DELETE /api/auth/account` and `DELETE /api/members/:id`.~~
  **RESOLVED 2026-06-28** — both wired now that program-memberships/invites/notifications are ported. The
  faithful cross-feature cascade is single-sourced as `utils/programMemberships.cascadeMemberDeletion` and
  shared verbatim, + best-effort Supabase `admin.deleteUser` after commit. Both SPECs bumped 0.1.0→0.2.0.
- ~~**Supabase JWT signing keys must be asymmetric (ECC P-256/ES256)** for the JWKS verify path (D-C2).~~
  **RESOLVED 2026-06-28** — the project's JWKS endpoint (`/auth/v1/.well-known/jwks.json`) serves a live
  `ES256`/P-256 key (`kid 0f6cd324…`), so JWKS verify finds a key. No further action needed at deploy.
- ~~**`SUPABASE_ANON_KEY` not stored locally**~~ **OBTAINED 2026-06-28** — the user supplied the anon key
  (a public anon JWT). Kept OUT of git per policy; paste it into Render as the `SUPABASE_ANON_KEY`
  `sync: false` Blueprint secret at provisioning (alongside `DATABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`,
  both in `tools/migrator/.env`). All four backend env values are now in hand for the Render deploy.

## Session log (newest first)

- **2026-06-29 (pm-10)** — **Specced + ported the `program` page (10th web page) — the FOURTH & LAST WORKSPACE
  TAB (`/program`), the program settings hub. All 4 workspace tabs now live; the landing layer is complete.**
  `question-asker` run 24. User picked `/program` (last tab) over the deferred sub-routes. The page is small, so
  I read the 541-line landing `page.tsx` in full myself and verified every dep with greps over our ported
  foundation (no Explore fan-out needed). **Key findings:** (1) a **third "name could mislead"** page (runs 22/23
  recur) — `/program` is the settings/account hub, not program-CRUD; the real editors are 6 deferred sub-routes
  (`edit/roles/profile/password/appearance/privacy`). (2) Two **role variants**: admin menu vs non-admin read-only
  Program Info card; only **Leave Program** (`PUT /program-memberships/leave`) + **Sign Out** are live on the
  landing, all else forward-nav. (3) `canLeaveProgram = !isGlobalAdmin` — a global admin is treated as
  program-admin but can't Leave (intentional). (4) **run-11 client-vs-server recurred**: the landing's
  `computeProgramProgress` is client-computed from `start_date`/`end_date`, distinct from summary's server-derived
  `progress_percent` → keep local, not a shared helper. (5) `MyAccountSection` read `rf:appearance` raw from
  `localStorage`, duplicating the foundation's `getStoredTheme()`. **Stance = faithful + 2 pinned cleanups** (user
  picked change-now → the run-6/14/22 pinning multiSelect): **D-C1** appearance label via `getStoredTheme()`,
  **D-C2** extract the byte-identical duplicated `LeaveProgramButton`; **D-C3** keep `computeProgramProgress` local
  (confirm). **Zero new deps, zero backend work, NO feature bump** — all api modules / 5 `ui/` components / 11
  icons / format-storage-theme helpers already ported, both endpoints already mounted. Ported
  `apps/web/src/app/program/page.tsx` (verbatim + D-C1/D-C2). The bottom-nav `/program` tab (already wired in
  `shell.tsx`) now resolves — **all 4 workspace tabs live.** SPEC v0.1.0 (D-REF `[web]` / D-SCOPE / D-S1 / D-C1 /
  D-C2 / D-C3; F1–F6). Page REGISTRY ticked; lessons run 24 appended. `npm run build` ✓ (`/program` prerendered,
  4.36 kB — no Recharts; Middleware 27.3 kB active). **Committed via `git-version` next. Next:** the SUB-ROUTE
  layer (6 `/program/*`, 8 `/members`, 6 `/summary`, 2 `/lifestyle`).
- **2026-06-29 (pm-9)** — **Specced + ported the `lifestyle` page (9th web page) — the THIRD WORKSPACE TAB
  (`/lifestyle`), the workout-type-analytics / health-timeline overview.** `question-asker` run 23. User picked
  `/lifestyle` (3rd tab) over the deferred sub-routes / `/program` tab. Opening sweep fanned 3 `Explore` agents
  (legacy lifestyle cluster · our ported web foundation+deps · backend API contract), and I verified the
  load-bearing files myself: the full 625-line landing `page.tsx` + the new `lib/api/lifestyle.ts` + our
  foundation's ported deps. **Key findings:** (1) **the name lies again** (run-22 pattern recurs) — `/lifestyle`
  is NOT a sleep/diet *logging* screen but a **read-only** workout-type-analytics + health-timeline dashboard,
  a near-twin of the Members tab (same view-as picker, same `MemberPickerModal` with `allowNone`, same role
  gating). The actual data-entry (workout-type CRUD) lives in the deferred `/lifestyle/workouts` sub-route. (2)
  **2** new deps — `lib/api/lifestyle.ts` (6 fns over already-mounted `analytics`/`analytics-v2` routes) +
  `ui/EmptyState.tsx` (new 10-line primitive); everything else already ported (incl. the shell `/lifestyle`
  nav tab, all 5 chart tokens, `IconDumbbell`, `fetchProgramMembers`). (3) **all 6 endpoints already mounted**
  (`server.js:74-76`) — zero backend work, no feature bump. (4) 2 forward-nav sub-routes deferred (`workouts`/
  `timeline`, F2). (5) read-only → `admin_only_data_entry` **N/A**. **Tight 2-Q round** (both user-answered):
  **D-SCOPE** = landing page only · stance = **faithful, port local `MemberPickerModal` verbatim + flag the dup**
  with Members (F6) — user declined extracting a shared picker component (I recommended against: the Members
  picker was de-dup'd into a 2-variant `activePicker` form, so sharing would add branches, not remove them).
  Ported `apps/web/src/app/lifestyle/page.tsx` + `lib/api/lifestyle.ts` + `ui/EmptyState.tsx` verbatim. `npm run
  build` ✓ (`/lifestyle` prerendered, 13.6 kB — Recharts; Middleware 27.3 kB active). Wrote
  `specs/pages/web/lifestyle/SPEC.md` v0.1.0 (D-REF `[web]` / D-SCOPE / D-S1 / D-C1 / D-C2; F1–F7: client
  JWT-decode role, forward-nav to unbuilt routes, `sessionStorage` view-as + 2 effects, highest-participation
  always program-wide, over-fetched client-sorted popularity, duplicated picker, no client throttle). Page
  REGISTRY + COVERAGE ticked (lifestyle ✓). **All this session's work committed via `git-version` next; lessons
  run 23 appended.** **NEXT = the last tab `/program` (settings), the 8 deferred `/members` sub-routes, the 6
  deferred `/summary` sub-routes, and/or the 2 deferred `/lifestyle` sub-routes.**

- **2026-06-29 (pm-8)** — **Specced + ported the `members` page (8th web page) — the SECOND WORKSPACE TAB
  (`/members`), the per-member overview / "view as" dashboard.** `question-asker` run 22. Opening sweep fanned
  3 `Explore` agents (legacy members cluster · our ported web foundation+deps · backend members/analytics API
  contract), then I verified the load-bearing files myself: the full 833-line landing `page.tsx`, the legacy
  `lib/api/members.ts`, and our foundation (`programs.ts` `fetchProgramMembers`, `format.ts`, icons,
  `chart-theme`, `useAuthGuard`, session/Program shapes). **Key findings:** (1) **the name lies** — `/members`
  is NOT a roster-management screen but a per-member overview with a role-gated **"view as"** picker; the
  roster/CRUD lives in deferred sub-routes (`/list`+`/detail`). One Explore agent *inferred* "roster management"
  + listed `fetchMembershipDetails`/`update`/`remove` as the page's deps — **my own read of the landing file
  corrected it** (the landing uses only `fetchProgramMembers` for the picker + 5 read-only member-analytics
  calls). (2) **one** new dep — `lib/api/members.ts`; everything else already ported (incl. the shell `/members`
  nav tab). (3) **all endpoints already mounted** — zero backend work, no feature bump. (4) 8 forward-nav
  sub-routes deferred (F2). (5) read-only → `admin_only_data_entry` **N/A**. **Tight 3-Q round + a pinning
  multiSelect** (all user-answered): **D-SCOPE** = landing page only · **D-C1** = port whole `lib/api/members.ts`
  verbatim · stance = *faithful + small cleanups* → the pinning multiSelect surfaced **D-C2** (hoist
  `formatDuration` → `lib/format.ts`, recommended) + **D-C3** (de-dup the two `MemberPickerModal` blocks, I
  recommended *against* — structural); user picked **both**. Implemented D-C3 behavior-preserving via an
  `activePicker` discriminant (the admin + logger pickers are mutually exclusive; kept the admin path's
  `allowNone`/`"none"`-storage nuance). Ported `apps/web/src/app/members/page.tsx` + `lib/api/members.ts`; added
  `formatDuration` to `lib/format.ts`. `npm run build` ✓ (`/members` prerendered, 7.78 kB — Recharts; Middleware
  27.3 kB active). Wrote `specs/pages/web/members/SPEC.md` v0.1.0 (D-REF `[web]` / D-SCOPE / D-S1 / D-C1 / D-C2 /
  D-C3; F1–F7: client JWT-decode role, forward-nav to unbuilt routes, `sessionStorage` view-as + 4 parallel
  effects, vestigial-here api fns, over-fetched metrics preview, two near-duplicate metric renderers, no client
  throttle). Page REGISTRY + COVERAGE ticked (members ✓). **All this session's work committed via `git-version`
  next; lessons run 22 appended** (promoted the durable "a page named like a CRUD screen may be a read-only
  dashboard — verify the landing file yourself" pattern). **NEXT = the 8 deferred `/members` sub-routes, the 6
  deferred `/summary` sub-routes, and/or the remaining tabs (`/lifestyle`, `/program` settings).**

- **2026-06-29 (pm-7)** — **Specced + ported the `summary` page (7th web page) — the FIRST WORKSPACE TAB
  (`/summary`), the program-overview dashboard + the desktop log-form write path.** `question-asker` run 21.
  Opening sweep fanned 3 `Explore` agents (legacy web summary cluster · our ported web foundation · backend
  API contract for summary), then I verified the load-bearing files myself: the legacy 606-line
  `summary/page.tsx`, `lib/api/{summary,logs}.ts`, the 3 `forms/*`, `Input`/`Button`/`program-workouts.ts`, and
  our foundation's `shell.tsx`/`permissions.ts`/`storage.ts`/`chart-theme.ts`/`client.ts`. **Key findings:**
  (1) selecting a program on the hub does `saveActiveProgram` → `router.push("/summary")` — **`/summary` is a
  top-level route** reading the active program from `localStorage`, NOT a `[id]` route; (2) the charts are
  **inline Recharts** (no chart components to port) and our `chart-theme.ts` already exports all 5 tokens the
  page imports; (3) `shell.tsx` already activates the bottom-nav for `/summary`; (4) **all 11 backend endpoints
  the page consumes are already ported + mounted** (`server.js:73-76`); (5) the page drags in 4 not-yet-ported
  deps (`lib/api/{summary,logs,program-workouts}.ts`, `ui/{ErrorState,Input,Button}`, the 3 `forms/*`), whose
  transitive deps (`cn`, `useIsMobile`, `Select`, `fetchProgramMembers`, `apiRequest`) are all present. **Tight
  3-Q round (all user-answered):** **D-SCOPE** = *landing + the 3 log-form modals this run* (desktop write path
  end-to-end; the 6 sibling sub-route pages — 3 detail + 3 mobile log fallbacks — deferred as their own rows,
  links to them are forward-nav F2); **D-S1** = *faithful 1:1*; **D-C1** = *one typed cleanup*
  (`ProgramProgressCard` `summary?: any` → `AnalyticsSummary`, the type already in `summary.ts`); role-based
  view rules confirmed faithful (canLogForAny + dataEntryLocked). Ported (verbatim `cp`) the 9 dep files +
  `src/app/summary/page.tsx`, then applied the D-C1 edit. `npm run build` ✓ (`/summary` prerendered, 107 kB —
  Recharts; Middleware 27.2 kB active). Wrote `specs/pages/web/summary/SPEC.md` v0.1.0 (D-REF `[web]` / D-SCOPE
  / D-S1 / D-C1; F1–F7: client JWT-decode role, forward-nav to unbuilt routes, vestigial-here api fns, week-only
  landing period, over-fetched summary fields, dead form `variant="page"` branch, no client rate-limit). Page
  REGISTRY + COVERAGE ticked (summary ✓; logging forms ✓ as modals). **All this session's work committed via
  `git-version` next; lessons run 21 appended. NEXT = the 6 deferred `/summary` sub-routes and/or the sibling
  workspace tabs (`/members`, `/lifestyle`, `/program` settings).**

- **2026-06-29 (pm-6)** — **Specced + ported the `programs` hub (6th web page) — the FIRST PROTECTED route —
  and RESOLVED the standing `middleware.ts` HS256→ES256 open question.** `question-asker` run 20. Opening sweep
  fanned 3 `Explore` agents (legacy web programs hub · our ported web foundation + `middleware.ts` · backend
  programs/memberships/invites API contract), then I verified the load-bearing files myself
  (`apps/web/src/middleware.ts`, the legacy 1022-line `programs/page.tsx`, the legacy `api/{programs,invites}.ts`,
  `useAuthGuard`). **Key findings:** (1) `GET /api/programs` already returns the exact per-user shape the hub
  needs (`my_role`/`my_status`/`total_members`/`active_members`/`progress_percent`/`admin_only_data_entry`),
  global-admins all programs / members only their own; (2) the page drags in **2 api modules + 5 `ui/` components**
  not yet in the foundation (the run-19 "page pulls in shared deps" pattern), but their transitive deps (`cn`,
  `formatInviteDate`) are already ported. **Tight 3-Q decision round (all user-answered):** **D-C1** middleware =
  *decode + expiry only* (the faithful HS256 verify is non-viable against Supabase ES256; the backend
  JWKS-verifies every API call + owns authz, so the edge is just a UX redirect gate — no per-nav JWKS fetch,
  `JWT_SECRET` dropped); **D-C2** dependency port = *verbatim* (whole `lib/api/{programs,invites}.ts` modules +
  the 5 `ui/` components the page uses, not all 12 legacy `ui/` files); **D-C3** stance = *faithful + reuse
  `useAuthGuard({requireProgram:false})`* (replacing the inline login-redirect `useEffect`). Ported (verbatim
  `cp`): `apps/web/src/lib/api/{programs,invites}.ts`, `src/components/ui/{PageShell,GlassCard,Modal,ConfirmDialog,
  StatusBadge}.tsx`, `src/app/programs/page.tsx` (+ the D-C3 edit); rewrote `src/middleware.ts` (decode+expiry,
  removed the HS256/secret path). `npm run build` ✓ (`/programs` prerendered, 11.3 kB; Middleware 27.2 kB —
  now active, was inert). Wrote `specs/pages/web/programs/SPEC.md` v0.1.0 (D-REF `[web]` / D-S1 / D-C1 / D-C2 /
  D-C3; F1–F6: client JWT-decode role, forward-nav to unbuilt `/summary`+`/program/*`, dual invite mechanisms,
  edge gate no signature-verify, vestigial-here api fns + `enrollments_closed`, no client rate-limit). Page
  REGISTRY + COVERAGE ticked (programs ✓); `apps/web/CONTEXT.md` §Foundation-port middleware note flipped to
  RESOLVED; the open question marked resolved. **All this session's work committed via `git-version` next;
  lessons run 20 appended. NEXT page = `program` overview / the first workspace tab `/summary`** (where a
  selected program lands).

- **2026-06-29 (pm-5)** — **Specced + ported the `create-account` page (5th web page) — the public/auth path
  (splash → login → forgot → reset → create-account) is now COMPLETE.** `question-asker` run 19. Opening sweep
  fanned 3 `Explore` agents (legacy web create-account · our ported web foundation+sibling pages · backend
  register route). **Key code-grounded findings:** (1) the backend `register` (`authService.register`) **already
  requires + normalizes + format-validates email** + enforces the password policy + creates the Supabase Auth
  user — so D-PLAN item 3 ("sign-up email mandatory + format-validated") was already satisfied *server-side*;
  the only delta was the *client* page; (2) `register` returns **no token**, so the legacy page (faithfully)
  **register-then-auto-logs-in** via `login()`; (3) `registerAccount()` already existed in our `api/auth.ts`;
  (4) the gender dropdown needs `Select` (+ `SelectMobile`), **neither ported yet** → ported both verbatim as
  the dependency; (5) legacy create-account had **no already-authed redirect**, unlike all 3 sibling auth pages.
  Tight **3-Q round** then a scope-pinning multiSelect. Decisions (all user-answered): **D-S1** faithful port +
  **D-C1** inline email-format validation (D-PLAN item 3; reuses forgot-password's `EMAIL_RE`; forward-only) +
  **D-C2** already-authed → `/programs` redirect (matches siblings; legacy had none) + **D-C3** live
  password-policy checklist (✓/○ per rule, mirrors `validatePassword`) replacing the static hint — *merges the
  two password-hint cleanups the user selected* (the live checklist subsumes the conditional-hint behavior by
  appearing on first keystroke) + **D-C4** muted confirm-mismatch hint + **D-C5** autoFocus First Name. **No
  auth-feature bump** (the `register` route + client fn pre-existed — this run added only the page + the
  `Select` components). Ported `apps/web/src/app/create-account/page.tsx` + `src/components/{Select,SelectMobile}.tsx`;
  `npm run build` ✓ (`/create-account` prerendered, 6.25 kB). Wrote `specs/pages/web/create-account/SPEC.md`
  v0.1.0 (D-REF `[web]` / D-S1 / D-C1–C5; F1–F6: client JWT decode, register-then-login no-rollback, bootstrap
  form flash, no client rate-limit, no client username rules, cleanups web-first/iOS gap). Page REGISTRY +
  COVERAGE ticked (create-account ✓). **All this session's work committed via `git-version` next; lessons run 19
  appended. NEXT page = the `programs` hub** (first protected route — resolve the `middleware.ts` HS256→ES256
  decision first; see Open questions).

- **2026-06-29 (pm-4)** — **Specced + ported the `reset-password` page (4th web page, 2nd net-new) + the
  NET-NEW backend `POST /auth/reset-password` (auth 0.3.0→0.4.0); the auth-recovery path is now END-TO-END.**
  `question-asker` run 18. Opening sweep verified the sibling `forgot-password` page/SPEC, the auth SPEC
  (0.3.0), the backend `authService.js`/`routes/auth.js` (confirmed `changePassword` already does the
  Supabase admin update + the password policy; `authenticateToken` JWKS-verifies any Supabase access token),
  and the web `api/client.ts`/`api/auth.ts`. **Key code-grounded finding:** supabase-js 2.108.2 defaults to
  the **implicit** flow, so `resetPasswordForEmail` lands the recovery session in the **URL fragment**
  (`#access_token=…&type=recovery`) — and PKCE is architecturally unusable here (backend initiates, an
  arbitrary browser completes; the verifier would be stranded server-side). Tight **3-Q** round on the
  genuinely-open decisions (user picked all the recommended/lead options): **Backend design** = *Bearer +
  reuse `changePassword`* (page sends the recovery token as the Bearer; route = `authenticateToken` + the
  existing `changePassword(req.user.id, new_password)` — single-sourced, no bespoke service fn); **Post-reset
  dest** = *in-page success → `/login?reason=password-reset`* (recovery stays separate from login; no Supabase
  session embedded — clean R1; auto-login rejected); **Form fields** = *new + confirm + inline policy hint*
  (mirrors server `validatePassword`; consistent with forgot's D-C2 inline-validation divergence). **Ported:**
  backend `POST /auth/reset-password` (`routes/auth.js`) reusing `authenticateToken` + `changePassword`;
  pinned `flowType: "implicit"` on the Supabase clients (`config/supabase.js`, defensive — already the
  default). Web: `resetPassword(accessToken, newPassword)` (`api/auth.ts`), `app/reset-password/page.tsx`
  (BrandMark + new/confirm fields + Show/Hide + inline policy + match hints + success banner →
  `/login?reason=password-reset` redirect; reads + scrubs the fragment token; 401 → "request a new link"
  invalid-link state → `/forgot-password`; already-authed-without-token → `/programs`), and a new green
  `password-reset` banner case on the login page (login SPEC → v0.1.1). Boot check passes (`POST
  /reset-password` mounted, `authenticateToken` + handler, mw=2); `npm run build` ✓ (`/reset-password`
  prerendered, 4.28 kB). Wrote `specs/pages/web/reset-password/SPEC.md` v0.1.0 (D-REF net-new / D-SCOPE /
  D-C1 Bearer-reuse / D-C2 success→login / D-C3 confirm+policy / D-C4 implicit-fragment / D-S1 sibling
  chrome; F1–F6: bootstrap flash, no client rate-limit, iOS recovery gap, authed-with-token may reset, token
  in fragment, fixed redirect timing). Bumped auth SPEC → **0.4.0** (route #10, §4 behavior, §6 flowType
  note, **D-C5**, changelog) + registry.json/REGISTRY.md; bumped login page SPEC → v0.1.1 (banner); page
  REGISTRY + COVERAGE ticked (reset-password ✓). **All this session's work committed via `git-version` next.
  NEXT page = `create-account`** (+ sign-up-email-mandatory, D-PLAN item 3).

- **2026-06-29 (pm-3)** — **Specced + ported the `forgot-password` page (3rd web page, the FIRST net-new
  one) + the NET-NEW backend `POST /auth/forgot-password` (auth 0.2.0→0.3.0).** `question-asker` run 17.
  Opening sweep verified the link source ([login/page.tsx:156-163](apps/web/src/app/login/page.tsx#L156)
  already renders the D-C1 "Forgot your password?" → `/forgot-password` link), the web config/API/client
  patterns, and the ported auth stack — confirming `resetPasswordForEmail` is **unused** and the reset must
  proxy through Express (R1; `changePassword` already uses `supabaseAdmin.updateUserById`). Most behavior was
  pre-locked by login's D-PLAN, so a tight **2-Q** round on the genuinely-open decisions: **Scope** = *"Page +
  forgot route only"* (user — build the page + the one route it calls this run; **`reset-password` page +
  `POST /auth/reset-password` = next run**, another auth MINOR bump → 0.4.0); **Email field** = *add inline
  email-format validation* (user — the field is email-only, unlike login's username-or-email identifier; a
  deliberate divergence from login's no-validation F5). **Ported:** backend `requestPasswordReset`
  (`services/authService.js` — always-200 generic message, no enumeration; calls Supabase
  `resetPasswordForEmail(email, { redirectTo: PASSWORD_RESET_REDIRECT_URL })` only when email is format-valid;
  swallows errors) + public `POST /forgot-password` (`routes/auth.js`) + `PASSWORD_RESET_REDIRECT_URL` in
  `render.yaml` (=`https://rasifiters.com/reset-password`, forward dep). Web: `SUPPORT_EMAIL` (`config.ts`,
  `vinay.sankara@gmail.com` placeholder), `requestPasswordReset()` (`api/auth.ts`), and
  `app/forgot-password/page.tsx` — BrandMark + email field + inline format hint + "Send reset link", generic
  green success replacing the form, an **always-visible `mailto:` "Contact us" fallback** (both states) for
  no-email accounts, "Back to login", already-authed → `/programs`. Boot check passes (route mounted public,
  1 handler; `requestPasswordReset` exported); `npm run build` ✓ (`/forgot-password` prerendered, 3.94 kB).
  Wrote `specs/pages/web/forgot-password/SPEC.md` v0.1.0 (D-REF net-new / D-SCOPE / D-C1 always-send+fallback
  / D-C2 inline validation / D-C3 reset-via-Express R1 / D-S1 faithful chrome; F1–F5: form flash, no client
  rate-limit, iOS recovery gap, reset-page forward dependency, placeholder support email). Bumped auth SPEC →
  **0.3.0** (route #9, §4 behavior, §6 env, **D-C4**, changelog) + registry.json/REGISTRY.md; page REGISTRY +
  COVERAGE ticked (forgot-password ✓; reset-password = planned next); lessons run 17 appended next.
  **All this session's work committed via `git-version` next. NEXT page = `reset-password`.**

- **2026-06-29 (pm-2)** — **Specced + ported the `login` page (2nd web page spec) + established the
  auth-recovery path plan.** User opened by mandating the auth follow-up set: Supabase Auth was chosen for
  easy self-service recovery, so login/sign-up/account pages must GAIN forgot/reset-password (web first, then
  iOS), with a **dual** forgot-password (emailed reset when an email exists; a `mailto:` "contact us" fallback
  for the placeholder no-email accounts), and **sign-up email must become mandatory + validated for new
  members** (forward-only). Saved this as a durable memory. `question-asker` run 16 (page mode): fanned 3
  `Explore` agents (legacy web login · legacy iOS auth · our ported web+backend auth) — **confirmed
  forgot-password/reset/email-verification exist on NEITHER client** (100% net-new), our `register` already
  creates a loginable Supabase user w/ email (members D-C2), and Supabase `resetPasswordForEmail` exists but
  **no backend route calls it**. Verified the legacy login file + ported foundation myself. **4-Q decision
  round (all user-answered):** **Scope** = *login page only + plan rest* (forgot/reset/signup-changes +
  backend bump are their own follow-ups); **Reset trigger** = *always-send + always-visible contact link*
  (privacy-safe, supersedes the earlier "detect then branch" idea); **Reset path** = *through Express backend*
  (R1); **Support email** = `vinay.sankara@gmail.com` (placeholder, may change). Updated the memory to match.
  Ported `apps/web/src/app/login/page.tsx` — **faithful 1:1** (identifier+password, Show/Hide, `?reason`
  banner, JWT decode → `setSession` → `/programs`, already-authed redirect, create-account + Privacy links)
  **+ ONE addition (D-C1): a "Forgot your password?" link → `/forgot-password`**. `npm run build` ✓ (`/login`
  prerendered, 4.04 kB). Wrote `specs/pages/web/login/SPEC.md` v0.1.0 (D-REF/D-S1/D-C1/D-PLAN; F1–F5: client
  JWT decode, no bootstrap gate/form flash, iOS recovery gap, no client rate-limit, no inline validation);
  page REGISTRY + COVERAGE (public row, login ✓) ticked; lessons run 16 appended. **NEXT page =
  `forgot-password`** (build the link's destination; needs the new backend `auth` routes + a MINOR auth bump —
  see Next action / D-PLAN). All this session's work committed via `git-version` next.
- **2026-06-29 (pm)** — **Phase 3 (`web`) STARTED — ported the web foundation scaffold + it builds green.**
  Backend feature coverage having closed (14 features), began the web phase. On "continue" the user chose
  **"scaffold + spec first page"** (vs provision-Vercel-first / spec-whole-auth-path-first). Mapped the
  legacy web foundation (`../rasifiters-webapp`: config + full `src/lib` + root `src/app` + `src/middleware`
  + components), then ported the **page-independent infrastructure directly** (NOT via `question-asker` —
  that loop is for pages; this mirrors the backend foundation port). Files into `apps/web`: 8 config files
  (`package.json` renamed `rasifiters-web` + dropped `@netlify/plugin-nextjs`; `tsconfig`, `next.config.mjs`,
  `postcss`, `tailwind.config.ts`, `next-env.d.ts`, `.npmrc`, `.gitignore`), all of `src/lib/*` (config,
  `api/{client,auth}`, `auth/{session,jwt,auth-provider}`, theme + theme-provider, storage, permissions,
  format, chart-theme, use-active-program, use-client-search-params, hooks/{use-auth-guard,use-is-mobile}),
  `src/app/{globals.css,layout,providers,shell,page}`, `src/components/icons`, brand assets. **4 deliberate
  deviations (all migration-justified, logged in `apps/web/CONTEXT.md` §Foundation port):** host
  Netlify→Vercel (dropped plugin+`netlify.toml`, default APP_URL→`rasifiters.com`); prod API default →
  `https://rasifiters-api.onrender.com/api` (our Render service); **`NotificationsGate` = deferred stub**
  (returns null — drags in the unported web notifications/SSE+programs stack otherwise; backend
  deferred-stub pattern, replaced when that feature lands); **`src/middleware.ts` faithfully ported but
  INERT + incompatible with Supabase ES256** (HS256/shared-secret verify → would reject every ES256 token;
  no protected routes exist yet; **open decision for the auth-path SPEC** — ES256/JWKS-at-edge vs
  decode+expiry-only — see Open questions). `npm install` (463 pkgs) + `npm run build` both ✓ (TS strict +
  lint + edge middleware + Manrope font all compile). PROGRESS + CONTEXT updated. **Then specced + ported the
  FIRST web page — `splash`** (the public welcome screen; `question-asker` run 15, the first page/screen
  spec). Public leaf page: typewriter intro + `BrandMark` logo + Sign-in CTA → `/login`, authenticated→
  `/programs` redirect; consumes only the foundation `useAuth` (no API). Tight 2-Q round — **D-S1** faithful
  1:1 + **D-REF** (`consumed_by=[web]`; the iOS `SplashView` divergence — placeholder icon + no redirect; web
  keeps the real logo, **iOS placeholder flagged as a defect** to fix at the iOS splash port). Role rules N/A
  (pre-auth). F1–F4 (web-only auth redirect; no loading gate / splash flash; iOS-placeholder defect;
  type-speed). Wrote `specs/pages/web/splash/SPEC.md` + ported `src/app/splash/page.tsx` +
  `src/components/BrandMark.tsx`; `npm run build` ✓ (`/splash` prerendered); page REGISTRY + COVERAGE (public
  row `[~]`, splash ✓) ticked; lessons run 15 appended. **All Phase-3 work this session (foundation + splash)
  is UNCOMMITTED** — commit via `git-version` next. Next page: **`login`** — where the real auth round-trip +
  the auth-path middleware (HS256→ES256) decision get exercised.
- **2026-06-29 (am-6)** — **Specced + ported `app-config` — the 14th and LAST backend feature; backend
  feature coverage is now COMPLETE.** First confirmed (per the carried Next-action) what remained of
  `app-config`/push: **nothing to port** — `GET /api/app-config` was already inline + byte-identical in
  `server.js`; the push/APNs device lifecycle (`PUT`/`DELETE /api/notifications/device`, `pushNotifications`
  util, APNs dispatch, `member_push_tokens` table, `APNS_*` env) landed with `notifications`;
  `upsert/removePushToken` + the login push-capture landed with `auth`. So this was a **documentation-only**
  SPEC to close `COVERAGE.md` L26. `question-asker`: fanned 2 `Explore` agents over web + iOS — **both
  app-config AND push are `consumed_by = [ios]` only** (iOS version-gate → force-update modal
  `ProgramContext+VersionCheck.swift`; iOS APNs token via login body + `PUT/DELETE /device`); **web consumes
  neither** (no `/api/app-config`, no device registration — it uses SSE for notifications). Tight 3-Q round:
  **D-C1** scope = **own app-config, reference push** (push is already documented in `notifications`/`auth`;
  §6 of the SPEC is a cross-reference index, not a re-doc — avoids the SSOT/duplication a re-doc would create)
  + **keep the route inline** in `server.js` (faithful — legacy is inline). **Stance = the user chose "change
  now"**; a scope-pinning follow-up locked exactly **2 cleanups** (3rd option — extract to a route file —
  unselected): **D-C2** add `Cache-Control: public, max-age=300` (iOS polls the gate on every
  launch/foreground/widget-open) + **D-C3** trim + semver-validate `MIN_IOS_VERSION` via a new
  `normalizeMinIosVersion` (`^\d+(\.\d+)*$`, else `null`) so a malformed env yields no gate rather than a
  broken client comparison. Faithful otherwise; F1–F5 (`device_id` sent-but-always-nil by iOS; no logout
  `DELETE /device`; public no-auth route; operator-managed env not in `render.yaml`; web ignores both).
  **Applied the 2 changes to `server.js`** (`normalizeMinIosVersion` + Cache-Control). Wrote SPEC v0.1.0;
  registered in registry.json (`app-config`, `consumed_by:[ios]`, `depends_on:[]`) + REGISTRY.md + COVERAGE
  (L26 ticked — **backend section fully covered**). Boot/syntax check (`node --check server.js` OK;
  `normalizeMinIosVersion` verified: trims, accepts `1.2.3`/`2`, rejects `v1.2`/`latest`/empty → `null`)
  passes. **Runtime smoke-test deferred to the batched pre-cutover pass.** Next phase: **`web`** (provision
  Vercel `rasifiters-web`, then page-by-page via `question-asker` page/screen specs).
- **2026-06-29 (am-5)** — **Specced + ported the `member-analytics` feature** (13th feature — the per-member
  analytics surface; **its own file pair**, not the analytics/analytics-v2 pair). `question-asker`: read the
  full legacy `routes/memberAnalytics.js` (4 routers) + `services/memberAnalyticsService.js` (4 fns + helpers)
  in full; confirmed all 6 models pre-ported + the WorkoutLog↔ProgramWorkout default-alias association; found
  the **one porting wrinkle** — the service imports `resolveTimelineWindow`/`buildBuckets`/`bucketKey` from
  `analyticsService`, which legacy exported but our v1/v2 port left un-exported (no consumer yet). Fanned 2
  `Explore` agents over web + iOS consumption — **they agree exactly:** all 4 endpoints live on BOTH clients
  1:1, **no divergence, no dead routes** (`member-recent` is the shared workout-history read — why workout-logs
  dropped its 2 GETs; metrics is dual-use leaderboard + member card on both). Noted this feature **enforces
  per-program read authz** (`ensureProgramAccess`) — the very thing v1/v2 flagged absent (their F2). 6 decisions:
  **D-C1** scope = its own file pair; **D-C2** (user chose faithful) **re-export the 3 timeline helpers from
  `analyticsService.js`** (restore the legacy export surface; single-sourced, not duplicated — `depends_on:
  analytics`); **D-C3 + D-C4** (user pinned both cleanups) **C1** extract the shared requester-access +
  target-enrolled prelude shared by history/streaks/recent into `assertMemberAccess` (400/403/404 statuses
  preserved 1:1; metrics keeps its own inline checks/distinct message) + **C2** guard a null
  `program.start_date` in `getMemberStreaks` (mirrors `getMemberMetrics`' guard; only the null-start_date 500
  edge changes); **D-REF** `[web, ios]` 4 routes 1:1; **D-S1** faithful verbatim otherwise — **no UTC cleanup**
  (dates already UTC-correct, `T00:00:00Z` + `getUTC*`, unlike v1). Flagged F1–F7 (per-program read authz
  enforced; `current` streak not anchored to today; in-memory metrics filter/sort/no-pagination; possibly-unused
  rich fields; null sleep/food coerced to 0; synthetic recent id; MTD-within-range/UTC). Wrote SPEC v0.1.0;
  registered in registry.json (`depends_on:[auth, analytics, members, programs, program-memberships,
  program-workouts, workout-logs, daily-health-logs]`) + REGISTRY.md + COVERAGE. Then **ported**: re-added the
  3 helpers to `analyticsService.js`'s `module.exports` (D-C2), `services/memberAnalyticsService.js` (4 fns +
  helpers + `assertMemberAccess`, the start_date guard), `routes/memberAnalytics.js` (4 routers, verbatim),
  mounted the 4 `/api/member-*` routers in `server.js` (removed the placeholder comment). Boot check
  (analyticsService re-exports the 3 helpers, 4 service fns export, 4 routers each `GET /` =
  `[authenticateToken, handler]`, server loads; syntax clean) passes. **The D-C2 re-export touches the built
  `analytics` feature → patch bump at commit** (git-version detects analyticsService.js touched). **Runtime
  smoke-test deferred to the batched pre-cutover pass.** Next: `app-config`/push.
- **2026-06-29 (am-4)** — **Specced + ported the `analytics-v2` feature** (12th feature — the v2 half of the
  shared `routes/analytics.js`/`analyticsService.js` file pair; the file pair is now whole, like the logs +
  workout services). `question-asker`: read the full legacy v2 half of `analyticsService.js` (`getSummaryV2` +
  the 5 workout-type/participation fns, 471–692) + the `v2Router` route handlers (`analytics.js:124-195`) +
  the already-ported v1 service/routes (to confirm the shared helpers + utils + module-top imports are all
  present from v1 — they are). Verified the `Member.member_name` VIRTUAL exists. Fanned 2 `Explore` agents over
  web + iOS v2 consumption — **they agree exactly:** 5 of 6 v2 routes live on BOTH clients 1:1 (participation/mtd
  → summary MTD card; workouts/types/{total,most-popular,longest-duration,highest-participation} → the
  Lifestyle/Workout-Types tiles), and **`GET /summary` (v2) is dead on BOTH** — both call the v1 summary
  `/api/analytics/summary` instead. 4 decisions: **D-C1** scope = the v2 half appended to the shared files
  (reuse helpers/utils — no new files; `member-analytics` separate); **D-C2** (user chose drop) **drop the dead
  `GET /summary` (v2) + `getSummaryV2`** — the mirror of v1's D-C2 (each version dropped the half-route its
  clients abandoned); distinct-but-superseded (not a byte-dup: optional `programId`/global agg, `member_name`,
  no `program_progress`); it was also the only UTC-bucketing site in the v2 half, so **no UTC cleanup needed**;
  **D-REF** `[web, ios]` 5 routes 1:1, no divergence; **D-S1** faithful verbatim otherwise. Flagged F1–F6
  (**F1** `getParticipationMTDV2` byte-identical to the v1 `getParticipationMTD` v1 dropped — now the live
  participation card; **F4** `getHighestParticipationWorkoutType`'s member-scoped branch is dead, both clients
  call it program-wide; inherited F2/F5/F6 = no per-program read authz / MTD server-local boundaries /
  `COUNT('*')`+raw-`DISTINCT` idioms). Wrote SPEC v0.1.0; registered in registry.json
  (`depends_on:[auth, analytics, program-memberships, program-workouts, workout-logs]`) + REGISTRY.md +
  COVERAGE. Then **ported**: appended the 5 v2 fns to `services/analyticsService.js` (`getSummaryV2` omitted)
  + extended exports, appended the `v2Router` (5 routes, no `/summary`) to `routes/analytics.js` (now exports
  `{ v1Router, v2Router }`), mounted `/api/analytics-v2` in `server.js` (removed the placeholder comment). Boot
  check (v2 5-route stack no `/summary`, all `authenticateToken`, 5 service fns export + `getSummaryV2` absent,
  v1 8-route stack + fns unchanged, server loads) passes. **The analytics file pair is now whole.** **Runtime
  smoke-test deferred to the batched pre-cutover pass.** Next: `member-analytics`.
- **2026-06-29 (am-3)** — **Specced + ported the `analytics` (v1) feature** (11th feature — the program-level
  read-aggregation API; the `v1Router` half of the shared `routes/analytics.js`/`analyticsService.js`).
  `question-asker`: read the full v1 half of `analyticsService.js` (shared date/bucket helpers + 9 v1 fns,
  1–472) + the v1 route handlers + both analytics-only utils (`dateRange.js`, `queryHelpers.js`); confirmed
  the utils are used by no other service (analytics-only) and all 6 models are pre-ported. Fanned 2 `Explore`
  agents over web + iOS. **Findings:** 8 of 9 v1 endpoints live on BOTH clients 1:1 (summary, workouts/total,
  duration/total, duration/average, timeline, health/timeline, distribution/day, workouts/types); the 9th,
  **`participation/mtd` (v1), is dead on both** — both call the v2 variant (`/api/analytics-v2/participation/mtd`).
  No divergence. 6 decisions: **D-C1** scope = v1 half + the 2 utils (v2 = next feature, same file pair;
  member-analytics separate); **D-C2** (user chose drop) drop the dead `participation/mtd` v1 route +
  `getParticipationMTD`; **D-C3 + D-C4** (user chose both cleanups via a pinning multiSelect) UTC-fix the
  server-local-TZ date formatting — D-C3 the distribution weekday bucketing (`getDistributionByDay` +
  `getSummary.distribution_by_day`, numeric) + D-C4 the timeline labels (`bucketLabel`, display); both add
  `timeZone:"UTC"` (unchanged on Render-UTC, just deterministic); **D-REF** `[web, ios]` 8 routes 1:1;
  **D-S1** faithful verbatim otherwise (every aggregation query + bucketing + response shape ported exactly).
  Flagged F1–F7 (MTD-vs-`period` dual window; no per-program read authz; `resolveTimelineWindow` plain-`Error`
  →500; `buildMTDDateRanges`/`getPeriodRange` server-local boundaries — out of cleanup scope; `COUNT('*')`
  idiom). Wrote SPEC v0.1.0; registered in registry.json
  (`depends_on:[auth, members, programs, program-memberships, program-workouts, workout-logs, daily-health-logs]`)
  + REGISTRY.md + COVERAGE. Then **ported**: `utils/dateRange.js` + `utils/queryHelpers.js` (verbatim),
  `services/analyticsService.js` (helpers + 8 v1 fns, the 2 UTC fixes; `getParticipationMTD` + v2 fns
  omitted), `routes/analytics.js` (`v1Router` 8 routes, exports `{ v1Router }`), mounted `/api/analytics`.
  Boot check (8-route stack no `participation/mtd`, all `authenticateToken`, 8 service fns export, both utils
  load, 4 `timeZone:"UTC"` fixes present, server loads) passes. **Runtime smoke-test deferred to the batched
  pre-cutover pass.** Next: `analytics-v2` (the other half).
- **2026-06-29 (am-2)** — **Specced + ported the `daily-health-logs` feature** (10th feature — the OTHER
  half of the shared `routes/logs.js`/`services/logService.js` file pair). `question-asker`: reused the
  full read of `logService.js` (daily-health half) + `routes/logs.js` from the workout-logs run; verified
  the `DailyHealthLog` model + associations are pre-ported (composite PK `program_id+member_id+log_date` =
  one row/day; `food_quality`→DB `diet_quality`). Fanned 2 `Explore` agents over web + iOS. **Cleaner than
  workout-logs:** all 4 routes (POST/GET/PUT/DELETE) live on BOTH clients, **no dead routes, no divergence,
  no batch route** (`consumed_by = [web, ios]`): web `lib/api/{logs,members}.ts` (log-health form + member
  health dashboard/detail), iOS `APIClient+Health.swift` + the quick-add health widget +
  `MemberHealthDetail`/`DailyHealthEditSheet`. 5 decisions: **D-C1** scope = daily-health half, append the
  4 fns + `parseOptionalNumber` to the file pair (helpers + `requireDataEntryAllowed` middleware already
  there from workout-logs — reused, not re-created); **D-C2** (user chose consistency) reuse `workout-logs`'
  `requireDataEntryAllowed` middleware on the 3 write routes so both halves enforce the lock identically
  (GET ungated; the write fns drop inline `assertDataEntryAllowed`; same accepted ordering nuance F4);
  **D-C3** tidy `updateDailyHealthLog`'s 3-arg `(parsed, requester, rawBody)` signature → single `(body,
  requester)` (legacy passed `req.body` twice; behavior identical — derive destructure + `hasOwnProperty`
  presence from one object); **D-REF** `[web, ios]` all 4 1:1; **D-S1** faithful otherwise. Flagged F1–F6
  (one-row-per-day PK + 409-on-dup; partial-update absent-vs-null; synthetic GET id; `food_quality↔diet_quality`;
  the 2 changed legacy shapes). Wrote SPEC v0.1.0; registered in registry.json
  (`depends_on:[auth, programs, program-memberships, workout-logs]`) + REGISTRY.md + COVERAGE. Then
  **ported**: appended `parseOptionalNumber` + the 4 daily-health fns to `services/logService.js` (added
  `Op` + `DailyHealthLog` imports), the `dailyHealthLogRouter` (4 routes, lock on writes) to `routes/logs.js`
  (now exports both routers), mounted `/api/daily-health-logs` in `server.js`. Boot check (9 service fns
  export, daily POST/PUT/DELETE guarded + GET ungated, workout router unchanged, server loads) passes.
  **The logs file pair is now whole** (both halves reunited, like workoutService). **Runtime smoke-test
  deferred to the batched pre-cutover pass.** Next: `analytics` (aggregates both fact tables).
- **2026-06-29 (am)** — **Specced + ported the `workout-logs` feature** (9th feature — the workout-logging
  write surface, and the `workoutLogRouter` half of the shared `routes/logs.js`/`services/logService.js`).
  `question-asker`: read the legacy `routes/logs.js` + the workout-log half of `logService.js` + the
  `WorkoutLog` model in full, fanned 2 `Explore` agents over web + iOS consumption. **Key findings:** the
  file pair holds TWO COVERAGE rows (workout-logs + daily-health-logs — pre-drawn split, like workoutService);
  **both GET routes are called by NEITHER client** (`GET /` by date + `GET /member/:memberName` — web + iOS
  both read history via `/api/member-recent`); `POST /batch` is **web-only** (iOS bulk-logs by looping single
  `POST /` in its widget); the add/edit/delete trio is 1:1 across clients. Confirmed `req.user.role` is
  preserved 1:1 (legacy + new both set `role = global_role==='global_admin' ? 'admin' : 'member'`). 6
  decisions: **D-C1** scope = workout-log half + shared helpers; daily-health → next feature, same files
  reunited; **drop the 2 dead GETs**; **D-C2/D-C3/D-C4/D-C5** = the four user-chosen cleanups (the user
  selected ALL four via a scope-pinning multiSelect): positive-int single-log duration / collapse
  `addWorkoutLog`'s member-auth double-check / de-dup the membership lookups (incl. `deleteWorkoutLog`'s
  double `resolveLogPermissions`) / **hoist the `admin_only_data_entry` lock** out of the service into a
  co-located `requireDataEntryAllowed` **resolve-or-pass-through** middleware (403 + message preserved 1:1;
  one accepted ordering nuance — locked+non-admin+invalid-body → 403 before 400, F6; and delete's not-enrolled
  403 may precede a 404, F9). `resolveLogPermissions` stays inline (returns a boolean driving per-member
  branching — not a hoistable gate). **D-REF** `consumed_by = [web, ios]`. **D-S1** faithful otherwise.
  Flagged F1–F9 (dead GETs; single-add no-dup-handling PK-collision 500 vs batch summing; lazy
  `program_workouts` materialization; web-only batch; `member_id`-path skips member-exists; the 2 ordering
  nuances; + the 3 legacy shapes the cleanups changed). Wrote SPEC v0.1.0; registered in registry.json
  (`depends_on:[auth, members, programs, program-memberships, workouts, program-workouts]`) + REGISTRY.md +
  COVERAGE. Then **ported**: `services/logService.js` (4 live fns + shared helpers, cleanups applied; 2 GET
  fns + `parseOptionalNumber`/`assertDataEntryAllowed` omitted — daily-health adds them later),
  `routes/logs.js` (`workoutLogRouter` 4 routes + the middleware; exports `{ workoutLogRouter }` only),
  mounted `/api/workout-logs`. Boot check (4-route stack, no GET, every route =
  `[authenticateToken, requireDataEntryAllowed, handler]`, 5 service fns export, server loads) passes.
  **Runtime smoke-test deferred to the batched pre-cutover pass.** Next: `daily-health-logs` (the other half
  of the file pair).
- **2026-06-28 (pm-15)** — **Specced + ported the `program-workouts` feature** (8th feature — the
  program-scoped other half of the shared `workoutService.js`). `question-asker`: read the legacy
  `routes/programWorkouts.js` + the program-scoped half of `services/workoutService.js` + the `ProgramWorkout`
  model in full, fanned 2 `Explore` agents over web + iOS consumption. **Both clients call all 6 routes 1:1,
  no divergence** (`consumed_by = [web, ios]`): web's `lifestyle/workouts/page.tsx` (Workout Types mgmt) +
  iOS's `WorkoutTypesSection.swift` (`ViewWorkoutTypesListView`) drive the toggles + custom CRUD; `GET` is
  also read by the log forms (`LogWorkoutForm`/`BulkLogWorkoutForm`, which filter `is_hidden` client-side),
  the program dashboard, member-workout filters, and the iOS quick-add widget. 4 decisions: **D-C1** scope =
  the 6 program-scoped routes + fns split from `workoutService.js` (library half already → `workouts`);
  **D-C2** (the one change — user chose it) **hoist the per-action admin authz out of the service into a
  route guard** — a local **resolve-or-pass-through `requireProgramAdmin(resolveProgramId)`** factory whose
  per-route resolvers mirror each legacy fn's pre-admin-check guards, so 403 fires exactly where legacy's
  inline check did and the service still emits its native 400/404 first (status codes 1:1, CLAUDE.md
  non-breaking); `GET` stays ungated; **D-REF** `[web, ios]`, no divergence; **D-S1** faithful otherwise.
  Flagged F1–F7 (dual-meaning GET id `pw?.id || gw.id`; hidden rows included; lazy `program_workouts`
  materialization on first hide; the friendly in-use delete 400 vs the library's bare destroy; add/edit
  dedup vs program+global; unscoped `GET` read). Wrote SPEC v0.1.0 (no migration delta — models + schema
  pre-ported); registered in registry.json (`depends_on:[auth, workouts, program-memberships, programs]`) +
  REGISTRY.md + COVERAGE. Then **ported**: appended the 6 program-scoped fns to `services/workoutService.js`
  (inline admin checks removed, `requester` param dropped), `routes/programWorkouts.js` (6 routes + the guard
  factory), mounted `/api/program-workouts`. Boot check (6-route stack w/ correct ordering, `GET` ungated vs
  curation routes guarded, all 10 service fns export, server loads) passes. **Pending:** runtime smoke-test
  (Render auto-deploy on push). Next: `workout-logs` (consumes the `program_workouts` join target).
- **2026-06-28 (pm-14)** — **Specced + ported the `workouts` feature** (7th feature — the global workout
  library). `question-asker`: read the legacy `routes/workouts.js` + `services/workoutService.js` + `Workout`
  model in full, fanned 2 `Explore` agents over web + iOS consumption. **Decisive reframe:** web calls
  **none** of the 5 `/api/workouts` routes (its `fetchWorkouts` wrapper is defined-but-dead), and iOS calls
  **only `GET`** (the "Add Workout" picker reference). So the admin CRUD (`POST`/`PUT`/`DELETE`) is called by
  **neither client**, and `POST /mobile` is a byte-identical dup of `POST /`. 4 decisions: **D-C1** scope =
  the global library only (the program-scoped half of the shared `workoutService.js` → the next
  `program-workouts` feature, per COVERAGE lines 18 vs 19); **D-C2** (the one change) **drop the dead
  byte-dup `POST /mobile`**; **D-REF** `consumed_by = [ios]` (GET-only live), flag web's dead `fetchWorkouts`
  + the unused admin CRUD; **D-S1** faithful otherwise — **keep the bare unguarded `deleteWorkout`** (the
  un-cascaded `program_workouts.library_workout_id` FK → 500 when in use, flagged F2) + the no-dedup-precheck
  create (unique-500, F5). Wrote SPEC v0.1.0 (no migration delta — model + schema already ported); registered
  in registry.json (`depends_on:[auth]`) + REGISTRY.md + COVERAGE. Then **ported**: `services/workoutService.js`
  (library half only — 4 fns), `routes/workouts.js` (4 routes, no `/mobile`), mounted `/api/workouts`. Boot
  check (4 fns, 4 routes, `/mobile` absent, server loads) passes. Also fixed COVERAGE's stale members line
  (cascade now wired v0.2.0). **Pending:** runtime smoke-test (Render auto-deploy on push). Next:
  `program-workouts` (the other half of the split service).
- **2026-06-28 (pm-13)** — **Wired the two deferred 501 delete cascades** (`members DELETE /:id` + auth
  `DELETE /account`) now that program-memberships/invites/notifications are ported. Read both legacy bodies
  (`memberService.deleteMember` + `authService.deleteAccount`) — they are byte-identical — so **single-sourced**
  the cascade as `utils/programMemberships.cascadeMemberDeletion` (the util that already owns
  `handleMemberExit`): destroy outbound `program_invites` (by `invited_by`/`invited_username`/`invited_email ∈
  member emails`) + `notifications` where `actor_member_id = member.id`, run `handleMemberExit` (`updateCreatedBy:true`,
  `includeExitingMemberInRecipients:false`, `notificationActorId:null`) for every active membership + created
  program, emit `program.member_left` to remaining members, destroy the member. Each caller keeps its own
  transaction + global-admin guard + 404 + success message; the **migration delta** is best-effort
  `supabaseAdmin.auth.admin.deleteUser(auth_user_id)` **after commit** (an orphaned `auth.users` row maps to
  no member → safe ordering). Updated both SPECs (route table, §4 prose, D-C1, F1, changelog) + bumped
  0.1.0→0.2.0; fixed the auth SPEC status (was "not yet deployed" → 🚀). Boot check (services + routes load,
  `cascadeMemberDeletion` exported, no circular dep) passes. **Pending:** runtime smoke-test (Render
  auto-deploy on push). Next: spec + port `workouts`/`program-workouts` → logs → analytics.
- **2026-06-28 (pm-12)** — **Specced + ported the `invites` feature** (6th feature — the co-mounted other
  half of `/api/program-memberships`). `question-asker`: read the legacy `routes/invites.js` +
  `inviteService.js` + the 2 models in full, fanned 2 `Explore` agents over web + iOS. `consumed_by =
  [web, ios]` — **all 4 routes 1:1 across clients, no divergence** (web `lib/api/{invites,members}.ts` +
  `/members/invite` + `/programs` modal; iOS `APIClient+Invites.swift` + `InvitesTabView` + `InviteMemberView`;
  matching DTOs). 6 decisions: **D-C1** scope = the 4 routes + `inviteService` + the `ProgramInvite`/
  `ProgramInviteBlock` tables, accept-path `ProgramMembership` write stays **inline** (faithful); **D-C2** the
  `program.invite_received`/`program.member_joined` emits wired **LIVE** (no stub — the keystone is ported);
  **D-C3a** drop the vestigial `target_member_id` (sent by neither client, read by no path); **D-C3b** fix
  `getAllInvites`' N+1 (one batched `Member.findAll` + map vs `Promise.all(findOne)` per invite); **D-REF**
  `[web, ios]` gates match; **D-S1** faithful otherwise. Flagged F1–F7 (privacy-safe `sendInvite` swallows
  throws to 200; global-admin accept-on-behalf+revoke; web's *second* accept path via `updateMembership`;
  `member_name` VIRTUAL dep; unused `invited_email`; hardcoded 30-day expiry/`max_uses:1`). Wrote SPEC v0.1.0;
  updated registry.json + REGISTRY.md + COVERAGE. Then **ported**: `services/inviteService.js` (4 fns, the two
  cleanups, live emits via the ported `utils/notifications`), `routes/invites.js` (4 routes, faithful), mounted
  `inviteRoutes` at `/api/program-memberships` in `server.js` (alongside `membershipRoutes`). Boot check
  (4-route stack, emit engine wired, `InvitedByMember` assoc, server loads) passes. **The keystone realized:**
  first feature with **live** emits — the deferred-stub seam (programs/program-memberships) isn't needed.
  **Pending:** runtime smoke-test (Render auto-deploy on push). Next: wire the two 501 delete cascades to
  `handleMemberExit`, or port `workouts`.
- **2026-06-28 (pm-11)** — **Specced + ported the `notifications` feature** (5th feature — **the keystone**).
  `question-asker`: read the legacy `routes/notifications.js` + `utils/{notifications,notificationStreams,
  pushNotifications}.js` + the 3 models in full, fanned 2 `Explore` agents over web + iOS consumption.
  `consumed_by = [web, ios]`: **both** clients open the SSE stream (web `EventSource` `?token=`
  `NotificationsGate.tsx:144`; iOS `NotificationStreamClient.swift:12`) + call `GET /unacknowledged` +
  `POST /:id/acknowledge` + render a single-notification modal queue; **iOS-only** the APNs device lifecycle
  (`PUT/DELETE /device`); **`POST /broadcast` called by neither client** (vestigial, F1). 4 decisions (all the
  faithful lead): **D-C1** scope = the module only (replaces the deferred stub; cross-feature emits/cascades
  stay their features' follow-ups); **D-C2** (the one migration delta) the SSE stream auth swaps symmetric
  `jwt.verify(JWT_SECRET)` → Supabase JWKS verify (`verifySupabaseJwt` + `sub`→member), keeping the `?token=`
  query path for `EventSource`; **D-C4** defer APNs creds (`getProvider()→null` ⇒ push no-ops, SSE+DB live);
  **D-S1** faithful, keep broadcast vestigial. Wrote SPEC v0.1.0; updated registry.json + REGISTRY.md +
  COVERAGE. Then **ported**: **replaced** `utils/notifications.js` (DEFERRED STUB → real `createNotification`
  DB write + transactional `afterCommit` SSE/APNs dispatch + `getMemberIdsWithPushTokens`), added
  `utils/notificationStreams.js` (SSE registry) + `utils/pushNotifications.js` (APNs, `apn@^2.2.0`,
  graceful-null), refactored `middleware/auth.js` to share `resolveReqUser` between `authenticateToken` +
  the new `authenticateStream` (D-C2), `routes/notifications.js` (6 routes), mounted `/api/notifications`,
  added `APNS_*` `sync:false` to `render.yaml`. `npm install` + syntax + boot check (6-route stack,
  `authenticateStream` exported, `getProvider()→null`) pass. **Key unblock:** the deferred emits across
  programs/program-memberships now fire **unchanged** (the stub is gone). **Pending:** runtime smoke-test
  (Render auto-deploy on push). Next: `invites` (the co-mounted membership half) or wire the two 501 delete
  cascades to `handleMemberExit`.
- **2026-06-28 (pm-10)** — **Specced + ported the `program-memberships` feature** (4th feature). `question-asker`:
  read `routes/memberships.js` + `membershipService.js` + `utils/programMemberships.js` (`handleMemberExit`) +
  the model in full, fanned 2 `Explore` agents over web + iOS. `consumed_by = [web, ios]`; gates match across
  clients (no divergence). Decisions: **D-C1** scope = the 6 membership routes + `handleMemberExit`; the
  co-mounted invite routes (`server.js:50`) → the separate `invites` feature; **D-C2** (change) fix
  `createMemberAndEnroll` → loginable (Supabase `createUser` + require `email`, mirroring members D-C2) — same
  latent password bug; **D-C3** (change) drop the 2 dead routes `GET /available` + `POST /enroll` (called by
  neither client — iOS methods dormant, web absent); **D-C4** defer the notification emits (role_changed/
  member_removed/member_left + the cascade emits) via a **deferred stub** `utils/notifications.js` (real
  `getActiveProgramMemberIds`, no-op `createNotification`). Stance "change/clean up" pinned by a scope follow-up
  to exactly D-C2 + D-C3. Flagged F1–F7 (handleMemberExit's caller-specific params for the deferred members/auth
  cascades; self-service status matrix; last-admin guard; the cross-feature invite-table writes ported since the
  models exist). Wrote the SPEC v0.1.0; updated registry.json + REGISTRY.md + COVERAGE. Then **ported**:
  `utils/notifications.js` (stub), `utils/programMemberships.js` (faithful cascade), `services/membershipService.js`
  (6 fns, createMemberAndEnroll fixed), `routes/memberships.js` (6 routes), mounted `/api/program-memberships`.
  Boot check (6 service fns + handleMemberExit + 6-route stack + 6 models) passes. **Key unblock:** porting
  `handleMemberExit` here gives the deferred members `DELETE /:id` + auth `/account` their cascade dependency —
  wiring those is the members/auth follow-up. **Pending:** runtime smoke-test (Render auto-deploy on push).
  Next: `notifications` (replaces the stub + unblocks every deferred emit).
- **2026-06-28 (pm-9)** — **Specced + ported the `programs` feature** (3rd feature). `question-asker`: read
  the legacy `routes/programs.js` + `services/programService.js` + `Program` model in full, fanned 2
  `Explore` agents over web + iOS consumption (`consumed_by = [web, ios]`, all four routes). Decisions:
  **D-C1** the `program.updated`/`program.deleted` notification emit is **deferred** (it drags in SSE streams
  + APNs push = the undocumented `notifications` feature) → guarded `emitProgramNotification` no-op, CRUD
  ports fully functional (a side-effect deferral, vs the members whole-route 501); **D-C2** (the one
  deliberate change, user chose clean-up) `createProgram` **drops the vestigial `description` field** — sent
  by neither client, unupdatable, never returned (the create-field analog of members' dead routes), with a
  scope-pinning follow-up confirming drop-only; **D-S2** `getPrograms` keeps both raw `sequelize.query`
  branches verbatim; **D-REF** `admin_only_data_entry` is web-only (web edit-page toggle; iOS `ProgramDTO`
  never decodes/sets it) — backend serves/accepts it for both faithfully. Flagged F1–F7 (incl. always-equal
  total/active counts, decoded-but-never-served `enrollments_closed`). Wrote `specs/features/programs/SPEC.md`
  v0.1.0; updated registry.json + REGISTRY.md + COVERAGE (`[~]`). Then **ported**: `services/programService.js`
  (faithful raw-SQL list, create w/o description, update/soft-delete with deferred emit), `routes/programs.js`
  (faithful 1:1), mounted `/api/programs` in `server.js`. Boot check (4 service fns + GET/POST/PUT/DELETE
  route stack + models resolve) passes. **Pending:** runtime smoke-test vs live Supabase (the Render
  auto-deploy on push). Next: `program-memberships` (owns the `ProgramMembership` join + the deferred
  cascades).
- **2026-06-28 (pm-8)** — **Specced + ported the `members` feature** (2nd feature). `question-asker`: read
  the legacy `routes/members.js` + `services/memberService.js` in full, fanned 2 `Explore` agents over web +
  iOS consumption. Key finding — **`POST`/`DELETE /api/members` are called by neither client** (both use
  `/auth/register` + `/program-memberships`), reframing it as read + self-profile-update with two vestigial
  admin routes. User chose to **fix** the latent bug in `createMember` (legacy destructured `password` but
  never persisted it → unloggable member): D-C2 wires it to Supabase `admin.createUser` + requires `email`.
  Wrote `specs/features/members/SPEC.md` v0.1.0 (D-C1/D-C2/D-REF/D-S1, F1–F6); committed
  (`docs(members)` + `chore(skills)`) + tagged `feature/members@v0.1.0` + pushed. Then **ported**:
  `services/memberService.js` (faithful reads/update; `createMember` change reusing
  `authService.validatePassword`/`normalizeEmail`; `getAllMembers` excludes `auth_user_id`;
  `deleteMember`→501 per D-C1), `routes/members.js` (faithful 1:1), mounted `/api/members` in `server.js`.
  Boot check (module load + 5-route stack) passes. Status 📄→🏗️. **Pending:** runtime smoke-test vs live
  Supabase (the auto-deploy to Render on push). Next: the remaining backend features.
- **2026-06-28 (pm-7)** — **Deployed the auth backend to Render + verified it live.** User provisioned the
  Blueprint (`apps/backend/render.yaml`) and connected GitHub auto-deploy; service `rasifiters-api`
  (`srv-d90tgmv7f7vs73cudptg`) live at `https://rasifiters-api.onrender.com`. Smoke test: `GET /`→200
  (DB connected), `/api/app-config`+`/api/test`→200, guarded route no-token→401, bogus login→401. Full
  signed-in round-trip against migrated `admin`: login→200 (**imported bcrypt password verified**, ES256
  JWT `kid 0f6cd324…`); guarded route w/ valid token→200 (`authenticateToken` JWKS verify +
  `sub`→`members.auth_user_id`, the D-C2 path); garbage token→401; refresh→200; logout→200. **Found + fixed
  a migration gap:** placeholder (no-email) members had no `member_emails` row → `admin` 401'd before the
  password check; shipped `apps/backend/sql/002_backfill_placeholder_member_emails.sql` (user ran it) +
  patched `tools/migrator/src/importAuth.js` (writes the placeholder row on create/link/re-run). Recorded
  the deploy: `CONTEXT.md` + `apps/backend/CONTEXT.md` (URL + service id), filled the
  `deploy-scope-guard.sh` allow-list (+ a real render-srv guard, tested), flipped `auth` 🏗️→🚀 in
  registry/REGISTRY/SPEC §12. Next: spec + port the remaining backend features.
- **2026-06-28 (pm-6)** — **Switched the backend host Railway → Render** (user decision; METHODOLOGY R7).
  Researched Render's mechanics (Blueprint spec, monorepo `rootDir`+`buildFilter`, env-var model, hosted
  MCP, health checks, PORT/host). Authored **`apps/backend/render.yaml`** (Blueprint: `type: web`,
  `rootDir: apps/backend`, `npm ci`/`npm start`, `healthCheckPath: /`, `autoDeployTrigger: commit`,
  `buildFilter.paths: [apps/backend/**]`; non-secret vars inline, the 3 secrets as `sync: false`).
  `server.js` now binds `0.0.0.0` (Render injects `PORT`, default 10000). Swept every Railway reference →
  Render across the repo: `.mcp.json` (`railway`→`render` MCP `https://mcp.render.com/mcp`),
  `.env.mcp.example`, the `deploy-scope-guard.sh` hook, the **`deploy` skill** (prereqs, workflow §2,
  git→deploy pipeline §B, smoke test, converged lessons, frontmatter), `ENV_RUNBOOK.md` (§1/§2 Render
  inspect+change mechanics, §3/§6 host delta), `METHODOLOGY.md` (R4 amended + new **R7**), `ICM.md`,
  `CLAUDE.md`, `CONTEXT.md`, `SETUP.md`, `README.md`, `apps/{web,backend}/CONTEXT.md`, the `supabase` +
  `health-check` skills, the auth SPEC changelog, `package.json`. Also **verified the asymmetric Supabase
  JWT keys are already live** (JWKS serves an ES256/P-256 key) — that open blocker is resolved. NOT
  committed yet (use `git-version`). Next: provision the Render Blueprint + deploy (needs the user's
  `SUPABASE_ANON_KEY`), then smoke-test the auth path.
- **2026-06-28 (pm-5)** — **Ported the backend foundation + `auth` feature** into `apps/backend/`. Data
  layer (faithful 1:1 via a subagent): `config/database.js` (`DB_URL`→`DATABASE_URL`, kept
  `rejectUnauthorized:false` per F6), 13 models + `models/index.js` with the R1 deltas
  (`Member.auth_user_id` added; `member_credentials`/`refresh_tokens` models + associations dropped),
  `utils/response.js`, `middleware/errorHandler.js`. Auth slice (hand-written per SPEC §7):
  `config/supabase.js` (anon + service clients + `verifySupabaseJwt` via jose JWKS), `middleware/auth.js`
  (Supabase-JWT verify + `sub`→`auth_user_id` member lookup rebuilding the legacy `req.user`; authz gates
  unchanged), `services/authService.js` (proxy login/refresh/logout via Supabase, register/change-password
  via admin API; `/account` deferred → 501), `routes/auth.js` (faithful), `server.js` (mounts only
  `/api/auth`). `package.json` drops `jsonwebtoken`/`bcrypt`, adds `@supabase/supabase-js`+`jose`+`uuid`.
  `npm install` + boot-check pass (syntax, module load, models wired, jose JWKS wire reached). Next:
  Railway deploy (needs asymmetric Supabase JWT keys + env) and the remaining backend features.
- **2026-06-28 (pm-4)** — **Specced the backend `auth` feature** (first SPEC in the repo) via
  `question-asker`. 3 parallel Explore agents mapped the legacy auth (route+service · middleware+authz ·
  models+config); re-read `authService.js`/`middleware/auth.js`/`routes/auth.js` in full to verify every
  `file:line`. 4 decisions confirmed (all faithful): **D-C1** scope = whole `middleware/auth.js` module
  (authN + authZ gates) as one unit; **D-C2** verify Supabase JWTs via **JWKS (ES256) + per-request
  `sub`→`members.auth_user_id` lookup** to rebuild `req.user` (deliberate change from legacy's
  lookup-free token); **D-C3** clients unchanged, `consumed_by=[web,ios]`, login proxies Supabase sign-in
  via username→primary-email resolution, refresh/logout proxy Supabase, `refresh_tokens` retires;
  **D-S1** faithful 1:1 (flagged F1–F7: dual payloads, no rate-limit, unused auth_identities/
  email_verification_tokens, rejectUnauthorized:false, two JWT verifiers, vestigial `userId`). Wrote
  `specs/features/auth/SPEC.md` v0.1.0; updated REGISTRY.md + registry.json + COVERAGE (auth ticked `[x]`).
  Not committed yet (use `git-version`). Next: port the backend per §7.
- **2026-06-28 (pm-3)** — **Ran the migration against live Supabase.** User applied
  `apps/backend/sql/001_schema.sql` + reset the DB password + handed over creds; filled
  `tools/migrator/.env`. Dry-run → `npm run migrate`: all 13 tables copied + reconciled vs legacy, **48
  `auth.users` created (bcrypt imported) and 48/48 members linked**, admin on the placeholder email
  (confirmed via `auth.users` join). Idempotency re-run = 48 skips, `auth.users` still 48. Migration done;
  next is Phase 2 (backend). Fixed two migrator bugs found while wiring it (auth/verify modes need the
  legacy DSN; added `sslmode=disable` escape hatch).
- **2026-06-28 (pm-2)** — **Built the migrator + faithful schema.** Mapped the live legacy schema via
  `pg_dump --schema-only` (richer than the Sequelize models: real CHECKs, `programs.created_by NOT NULL`,
  composite FKs, partial unique index; found `auth_identities`/`email_verification_tokens` empty +
  `legacy_*` cruft). Wrote `apps/backend/sql/001_schema.sql` (13 canonical tables, idempotent
  `IF NOT EXISTS`, the `members.auth_user_id`→`auth.users` delta; retired
  member_credentials/refresh_tokens/auth_identities/email_verification_tokens) and `tools/migrator/` (Node:
  generic FK-ordered upsert copy + bcrypt→Supabase-Auth import + backfill + reconciliation report).
  Resolved the no-email question → placeholder for `admin`. **Validated locally** against the real Render
  data into a throwaway Postgres: schema applies + is idempotent; all 13 tables row-count match
  (members 48 … notification_recipients 1304); auth dry-run = 48/48 with bcrypt hash, 1 placeholder.
  Awaits the user to apply the schema + run against Supabase.
- **2026-06-28 (pm)** — **Provisioned Supabase.** Created a new org `RaSi Fiters` (`lxehyprifvuozciizlem`)
  + project `rasifiters` (ref `kpadxjekpiwfkqcxtrio`, `us-east-1`, ACTIVE_HEALTHY) via the Supabase CLI
  (upgraded 2.67→2.108 to fix the broken `--region` enum; trusted the `supabase/tap`). DB password generated
  with `openssl rand -hex 24`; captured all keys (anon/service_role + new publishable/secret) + the three
  DATABASE_URL forms (direct IPv6 / session-pooler `aws-1-us-east-1` :5432 / txn-pooler :6543, all verified
  with `psql select`) into the gitignored scratchpad secrets file for the user's password manager. Repointed
  `.mcp.json` `supabase-rasifiters` to the real ref; updated `ICM.md` + `CONTEXT.md`. Railway/Vercel
  deferred (no app code yet). Next: build `tools/migrator/`.
- **2026-06-28** — Scaffolded the ICM repo from higgins-master; then restructured to fit RaSi: dropped
  `companies/` → `apps/`; split specs into `specs/features/` + `specs/pages/` (with role-based view rules);
  removed the `stitch` skill (faithful direct port instead); repurposed `audit` as a web↔iOS parity check;
  dropped per-feature version folders; made features client-specific-capable; added this `PROGRESS.md`.
